// THE WARD, modular room kit: data-driven recipes + the pure geometry the renderer (ui/ward_kit_iso.js) and the tests share.
// No DOM, no engine import. A recipe says how one room type (rm_*) is built from KIT pieces (assets/ward_kit/manifest.json):
//   { floor, wall, pieces:[{id, wall:'L'|'R', s}], props:[{id, u, v, flip, fp?}], need?:[prop ids], clear?:[[u,v]] }
// A room is a SUB x SUB (4 x 4) grid of sub-tiles. u runs along the right-down edge (the L wall stands on the u = 0 edge), v along the
// left-down edge (the R wall stands on the v = 0 edge). A prop covers footprint [cols along u, rows along v] sub-tiles from (u, v); flip swaps them.
// `s` is the position along a wall base, 0 to 1 (L wall: s 0 is the left corner, R wall: s 0 is the top corner).
// Several variants per room type are listed best first; the first whose floor and wall exist in the manifest wins, a prop or piece whose id
// is missing is skipped, and a room with no usable variant keeps its painted sprite. So art can arrive progressively: add the ids to the
// manifest and the planned recipes switch on by themselves (design/WARD.md "Modular kit renderer").
//
// House rules every recipe obeys (enforced by resolveRecipe, checked by tests/graftwork_ui_ward.test.mjs):
//   - props stay inside the grid and never overlap each other,
//   - the four LANE cells (0,1) (3,1) (1,0) (1,3) stay free: they are where a door leads out of the room (rows 1 to 2 of a wall are the door),
//   - every free sub-tile is reachable from every other, so monsters and the hero can always walk.
export const SUB = 4;
export const WALL_FULL = 46, WALL_LOW = 15;
export const LANES = [[0, 1], [3, 1], [1, 0], [1, 3]];

// ids the art pipeline has not delivered yet. Footprints are what the recipes below were laid out for (the manifest's own footprint wins once it exists).
export const PLANNED = {
  floors: ['tile', 'darkstone', 'carpet', 'brick', 'slab', 'stage'],
  walls: ['tile', 'brick', 'plaster', 'velvet', 'slab'],
  pieces: ['archdoor', 'clock', 'pipes', 'curtain', 'chalkboard', 'stainedglass', 'vent', 'notice'],
  props: {
    pew: [2, 1], altar: [2, 1], font: [1, 1], candelabra: [1, 1], desk: [2, 1], bookcase: [1, 1], table: [2, 1], stove: [2, 1], cauldron: [1, 1],
    sink: [1, 1], washtub: [1, 1], gurney: [2, 1], mortuary_slab: [2, 1], cabinet: [1, 1], boiler_tank: [2, 1], coal: [1, 1], optable: [2, 1],
    lamp_stand: [1, 1], chair: [1, 1], cage: [2, 1], barrel: [1, 1], bench: [2, 1], linen_stack: [1, 1], reception: [2, 1],
  },
};
// animated props: an overlay the renderer draws over the sprite (never with reduced motion)
export const PROP_ANIM = { generator: 'spark', sawbench: 'saw', candelabra: 'flame', stove: 'flame', boiler_tank: 'spark', cauldron: 'flame' };

const P = (id, u, v, flip = 0) => ({ id, u, v, flip });
const Wp = (id, wall, s) => ({ id, wall, s });

export const RECIPES = {
  // ---- the current kit (wood / stone floors and walls, 10 props, 4 pieces) ----
  rm_sawmill: [{
    floor: 'wood', wall: 'wood',
    pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('banner', 'R', 0.47), Wp('sconce', 'R', 0.84)],
    props: [P('crate', 0, 0), P('toolrack', 3, 0), P('shelf', 0, 2), P('sawbench', 2, 2), P('planks', 2, 3), P('stool', 0, 3)],
  }],
  rm_quarry: [{
    floor: 'stone', wall: 'stone',
    pieces: [Wp('sconce', 'L', 0.3), Wp('sconce', 'R', 0.7), Wp('banner', 'L', 0.75)],
    props: [P('rocks', 2, 0), P('crate', 0, 0), P('rocks', 2, 2), P('rocks', 2, 3), P('bucket', 0, 2), P('bucket', 0, 3)],
  }],
  rm_generator: [{
    floor: 'stone', wall: 'wood',
    pieces: [Wp('sconce', 'L', 0.2), Wp('window', 'R', 0.5), Wp('sconce', 'R', 0.85)],
    props: [P('generator', 2, 2), P('crate', 0, 0), P('crate', 3, 0), P('bucket', 3, 3), P('crate', 0, 3)],
  }],
  rm_boiler: [
    { floor: 'darkstone', wall: 'brick', pieces: [Wp('pipes', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('vent', 'R', 0.82), Wp('sconce', 'L', 0.15)], need: ['boiler_tank'],
      props: [P('boiler_tank', 2, 2), P('coal', 0, 0), P('coal', 3, 0), P('barrel', 3, 3), P('bucket', 0, 3)] },
    { floor: 'stone', wall: 'stone', pieces: [Wp('sconce', 'L', 0.2), Wp('sconce', 'R', 0.8)],
      props: [P('generator', 2, 2), P('rocks', 2, 3), P('bucket', 0, 3), P('crate', 3, 0), P('crate', 0, 0)] },
  ],
  rm_ward: [
    { floor: 'tile', wall: 'plaster', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('notice', 'R', 0.3), Wp('clock', 'R', 0.62), Wp('sconce', 'R', 0.86)],
      props: [P('bed', 2, 0), P('bed', 0, 2, 1), P('bed', 2, 3), P('stool', 2, 2), P('cabinet', 0, 0)] },
    { floor: 'wood', wall: 'wood', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('banner', 'R', 0.5), Wp('sconce', 'R', 0.86)],
      props: [P('bed', 2, 0), P('bed', 0, 2, 1), P('bed', 2, 3), P('stool', 2, 2), P('shelf', 0, 0)] },
  ],
  rm_dispensary: [{
    floor: 'wood', wall: 'stone', pieces: [Wp('sconce', 'L', 0.2), Wp('banner', 'R', 0.5), Wp('window', 'L', 0.55), Wp('sconce', 'R', 0.85)],
    props: [P('shelf', 0, 0), P('shelf', 2, 0), P('shelf', 3, 0), P('shelf', 0, 2), P('crate', 3, 3), P('crate', 3, 2), P('stool', 2, 2)],
  }],
  rm_pharmacy: [{
    floor: 'wood', wall: 'stone', pieces: [Wp('window', 'R', 0.5), Wp('sconce', 'L', 0.25), Wp('sconce', 'R', 0.86)],
    props: [P('shelf', 0, 0), P('shelf', 2, 0), P('shelf', 0, 3), P('crate', 3, 3), P('stool', 2, 2), P('bucket', 3, 2)],
  }],
  rm_corridor: [
    { floor: 'tile', wall: 'plaster', pieces: [Wp('sconce', 'L', 0.2), Wp('clock', 'R', 0.5), Wp('sconce', 'R', 0.82)], props: [P('bench', 2, 3), P('lamp_stand', 3, 0)] },
    { floor: 'stone', wall: 'wood', pieces: [Wp('sconce', 'L', 0.2), Wp('banner', 'R', 0.5), Wp('sconce', 'R', 0.82)], props: [P('bucket', 0, 0), P('stool', 3, 3)] },
  ],
  rm_workshop: [{
    floor: 'stone', wall: 'wood', pieces: [Wp('sconce', 'L', 0.18), Wp('window', 'R', 0.5), Wp('sconce', 'R', 0.84)],
    props: [P('sawbench', 2, 2), P('toolrack', 0, 0), P('toolrack', 3, 0), P('crate', 0, 3), P('planks', 2, 3), P('bucket', 2, 0)],
  }],
  rm_isolation: [{
    floor: 'stone', wall: 'stone', pieces: [Wp('sconce', 'L', 0.3), Wp('sconce', 'R', 0.7)],
    props: [P('bed', 0, 2, 1), P('stool', 2, 2), P('bucket', 3, 3), P('crate', 3, 0), P('crate', 0, 0)],
  }],
  rm_isolation2: [{
    floor: 'stone', wall: 'stone', pieces: [Wp('sconce', 'L', 0.2), Wp('banner', 'R', 0.5), Wp('sconce', 'R', 0.8)],
    props: [P('bed', 0, 2, 1), P('bed', 2, 3), P('stool', 2, 2), P('rocks', 2, 0), P('crate', 0, 0)],
  }],
  rm_linen: [{
    floor: 'wood', wall: 'wood', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'R', 0.3), Wp('banner', 'R', 0.7)],
    props: [P('bed', 2, 0), P('bed', 0, 2, 1), P('shelf', 0, 0), P('shelf', 3, 3), P('stool', 2, 2)],
  }],
  rm_laundry: [{
    floor: 'stone', wall: 'wood', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'R', 0.2), Wp('sconce', 'R', 0.82)],
    props: [P('bucket', 0, 0), P('bucket', 3, 0), P('crate', 0, 2), P('planks', 2, 3), P('bucket', 3, 2), P('stool', 2, 2)],
  }],
  rm_morgue: [{
    floor: 'stone', wall: 'stone', pieces: [Wp('sconce', 'L', 0.25), Wp('sconce', 'R', 0.75)],
    props: [P('bed', 2, 0), P('bed', 0, 2, 1), P('bed', 2, 3), P('bucket', 3, 2), P('crate', 0, 0)],
  }],

  // ---- planned: these rooms need art the kit does not have yet; they stay painted until the ids arrive ----
  rm_entrance: [{
    floor: 'tile', wall: 'plaster', pieces: [Wp('archdoor', 'L', 0.5), Wp('clock', 'R', 0.5), Wp('notice', 'R', 0.2), Wp('sconce', 'R', 0.86), Wp('sconce', 'L', 0.14)],
    props: [P('reception', 2, 0), P('bench', 2, 3), P('lamp_stand', 0, 0), P('chair', 3, 2), P('barrel', 0, 3)], need: ['reception'],
  }],
  rm_theatre: [{
    floor: 'stage', wall: 'velvet', pieces: [Wp('curtain', 'L', 0.5), Wp('curtain', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
    props: [P('optable', 2, 2), P('lamp_stand', 0, 0), P('lamp_stand', 3, 0), P('cabinet', 3, 3), P('chair', 0, 3)], need: ['optable'],
  }],
  rm_chapel: [{
    floor: 'carpet', wall: 'plaster', pieces: [Wp('stainedglass', 'L', 0.5), Wp('stainedglass', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
    props: [P('altar', 2, 0), P('pew', 2, 2), P('pew', 2, 3), P('candelabra', 0, 0), P('font', 0, 2), P('candelabra', 0, 3)], need: ['altar'],
  }],
  rm_counting: [{
    floor: 'carpet', wall: 'plaster', pieces: [Wp('clock', 'L', 0.5), Wp('window', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
    props: [P('desk', 2, 0), P('desk', 2, 2), P('bookcase', 0, 0), P('cabinet', 0, 3), P('chair', 3, 3), P('chair', 2, 3)], need: ['desk'],
  }],
  rm_kitchen: [{
    floor: 'tile', wall: 'brick', pieces: [Wp('vent', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
    props: [P('stove', 2, 0), P('table', 2, 2), P('sink', 0, 0), P('barrel', 3, 3), P('stool', 0, 3)], need: ['stove'],
  }],
  rm_library: [{
    floor: 'carpet', wall: 'plaster', pieces: [Wp('window', 'L', 0.5), Wp('chalkboard', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
    props: [P('bookcase', 0, 0), P('bookcase', 3, 0), P('bookcase', 0, 2), P('desk', 2, 2), P('chair', 3, 3)], need: ['bookcase'],
  }],
};
// a room type may also borrow the recipe of another (the same kit room, different plan)
export const ROOM_ALIAS = {};

// ---------------- helpers ----------------
export const hasId = (kit, group, id) => !!(kit && kit[group] && kit[group][id]);
export function footprintOf(kit, id, flip) {
  const d = kit && kit.props && kit.props[id];
  const f = d && Array.isArray(d.footprint) ? d.footprint : PLANNED.props[id] || [1, 1];
  return flip ? [f[1], f[0]] : [f[0], f[1]];
}
export const newGrid = (v = false) => Array.from({ length: SUB }, () => Array(SUB).fill(v));
export function doorPieceId(kit) { for (const id of ['archdoor', 'door']) if (hasId(kit, 'pieces', id)) return id; return null; }

const CACHE = new WeakMap();
// the usable recipe of a room type for this kit manifest: { type, variant, key, floor, wall, pieces, props, occ, free, stand, doorPiece } or null (paint it)
export function resolveRecipe(type, kit) {
  if (!kit || !kit.floors || !kit.walls) return null;
  let per = CACHE.get(kit); if (!per) { per = new Map(); CACHE.set(kit, per); }
  if (per.has(type)) return per.get(type);
  const out = build(type, kit); per.set(type, out); return out;
}
function build(type, kit) {
  const list = RECIPES[ROOM_ALIAS[type] || type]; if (!list) return null;
  for (let vi = 0; vi < list.length; vi++) {
    const v = list[vi];
    if (!hasId(kit, 'floors', v.floor) || !hasId(kit, 'walls', v.wall)) continue;
    if ((v.need || []).some((id) => !hasId(kit, 'props', id))) continue;
    const occ = newGrid(false), props = [];
    for (const c of LANES) occ[c[0]][c[1]] = 'lane';
    for (const c of v.clear || []) occ[c[0]][c[1]] = 'lane';
    for (const p of v.props) {
      if (!hasId(kit, 'props', p.id)) continue;
      const [c, r] = footprintOf(kit, p.id, p.flip);
      if (p.u < 0 || p.v < 0 || p.u + c > SUB || p.v + r > SUB) continue;
      let ok = true; for (let i = 0; i < c && ok; i++) for (let j = 0; j < r; j++) if (occ[p.u + i][p.v + j]) { ok = false; break; }
      if (!ok) continue;
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) occ[p.u + i][p.v + j] = true;
      props.push({ id: p.id, u: p.u, v: p.v, flip: !!p.flip, c, r, anim: PROP_ANIM[p.id] || '' });
    }
    // lanes are free ground, not props
    const solid = newGrid(false); for (let u = 0; u < SUB; u++) for (let w = 0; w < SUB; w++) solid[u][w] = occ[u][w] === true;
    const free = []; for (let u = 0; u < SUB; u++) for (let w = 0; w < SUB; w++) if (!solid[u][w]) free.push([u, w]);
    const pieces = v.pieces.filter((p) => hasId(kit, 'pieces', p.id));
    let stand = free[0]; let bd = 1e9; for (const f of free) { const d = Math.hypot(f[0] - 1.5, f[1] - 1.5) + (f[0] + f[1]) * 0.001; if (d < bd) { bd = d; stand = f; } }
    return { type, variant: vi, key: type + '#' + vi, floor: v.floor, wall: v.wall, pieces, props, occ: solid, free, stand, doorPiece: doorPieceId(kit), planned: vi > 0 || !!(list.length === 1 && isPlannedRecipe(v)) };
  }
  return null;
}
function isPlannedRecipe(v) { return PLANNED.floors.includes(v.floor) || PLANNED.walls.includes(v.wall); }
// every free sub-tile reachable from every other through 4-neighbours
export function freeConnected(rc) {
  if (!rc.free.length) return false;
  const seen = newGrid(false), q = [rc.free[0]]; seen[q[0][0]][q[0][1]] = true; let n = 0;
  while (q.length) { const [u, v] = q.pop(); n++; for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = u + du, b = v + dv; if (a < 0 || b < 0 || a >= SUB || b >= SUB || seen[a][b] || rc.occ[a][b]) continue; seen[a][b] = true; q.push([a, b]); } }
  return n === rc.free.length;
}
// a prop covers (u, v)?
export function propAt(rc, u, v) { for (const p of rc.props) if (u >= p.u && u < p.u + p.c && v >= p.v && v < p.v + p.r) return p; return null; }
// the wall height of a side for a mode. 'full' | 'low' | 'cutaway' (cutaway: walls shared with a room behind stay low, outer walls stay tall)
export function wallHeight(mode, shared) { return mode === 'full' ? WALL_FULL : mode === 'low' ? WALL_LOW : shared ? WALL_LOW : WALL_FULL; }
// the default wall mode by density: one room stands tall, a few rooms are cut away at the shared walls, a built floor is low
export function defaultWallMode(nRooms) { return nRooms <= 1 ? 'full' : nRooms <= 5 ? 'cutaway' : 'low'; }
export const WALL_MODES = ['auto', 'full', 'low', 'cutaway'];

// ---------------- doors and shared walls (the engine's neighbours are the single source of truth) ----------------
// rooms: the list of { id, x, y }; nbrs(id) -> ids of the rooms connected to it (engine/ward.js neighbors). The wall between two connected rooms
// belongs to the one in front (the larger x or y): the L wall of (x, y) borders (x - 1, y), the R wall borders (x, y - 1). Each shared edge is
// drawn once, with a door in it. Returns Map id -> { L: bool door, R: bool door, sharedL: bool, sharedR: bool, slabL, slabR }.
export function wallPlan(rooms, nbrs, roomAtXY) {
  const out = new Map(), byId = new Map(rooms.map((q) => [q.id, q]));
  for (const r of rooms) {
    const ns = nbrs(r.id).map((id) => byId.get(id)).filter(Boolean);
    const doorL = ns.some((n) => n.x === r.x - 1 && n.y === r.y), doorR = ns.some((n) => n.y === r.y - 1 && n.x === r.x);
    const sharedL = !!roomAtXY(r.x - 1, r.y), sharedR = !!roomAtXY(r.x, r.y - 1);
    out.set(r.id, { L: doorL, R: doorR, sharedL, sharedR, slabL: !roomAtXY(r.x, r.y + 1), slabR: !roomAtXY(r.x + 1, r.y) });
  }
  return out;
}
// the unique wall segments of a floor: one per (room, side); `shared` marks an edge two rooms meet at
export function wallSegments(rooms, plan) {
  const segs = [];
  for (const r of rooms) { const p = plan.get(r.id); segs.push({ room: r.id, side: 'L', door: p.L, shared: p.sharedL }, { room: r.id, side: 'R', door: p.R, shared: p.sharedR }); }
  return segs;
}

// ---------------- walking on the sub-tile grid ----------------
// global cell = [gu, gv] = [x * SUB + u, y * SUB + v]. cellInfo(gx, gy) -> { room: bool, solid: bool }; stepping between two rooms needs the door lane (rows or columns 1 to 2).
export function pathOnGrid(from, to, cellInfo, maxN = 4000) {
  const key = (c) => c[0] + ',' + c[1], seen = new Map([[key(from), null]]), q = [from];
  const lane = (a, b) => { // a -> b between different rooms
    if (b[0] !== a[0]) { const row = ((a[1] % SUB) + SUB) % SUB; return row >= 1 && row <= 2; }
    const col = ((a[0] % SUB) + SUB) % SUB; return col >= 1 && col <= 2;
  };
  const roomOf = (c) => Math.floor(c[0] / SUB) + ',' + Math.floor(c[1] / SUB);
  for (let qi = 0; qi < q.length && qi < maxN; qi++) {
    const c = q[qi]; if (key(c) === key(to)) break;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [c[0] + du, c[1] + dv], k = key(n); if (seen.has(k)) continue;
      const info = cellInfo(n[0], n[1]); if (!info || !info.room || info.solid) continue;
      if (roomOf(n) !== roomOf(c) && !lane(c, n)) continue;
      seen.set(k, c); q.push(n);
    }
  }
  if (!seen.has(key(to))) return null;
  const path = []; let c = to; while (c) { path.push(c); c = seen.get(key(c)); }
  return path.reverse();
}
// walk inside one room's free cells (monsters): the path from one free sub-tile to another, or null
export function pathInRoom(rc, from, to) {
  return pathOnGrid([from[0], from[1]], [to[0], to[1]], (u, v) => (u < 0 || v < 0 || u >= SUB || v >= SUB ? null : { room: true, solid: rc.occ[u][v] }));
}
