// THE WARD, modular room kit: data-driven recipes + the pure geometry the renderer (ui/ward_kit_iso.js) and the tests share.
// No DOM, no engine import. A recipe says how one room type (rm_*) is built from KIT pieces (assets/ward_kit/manifest.json):
//   { floor, wall, pieces:[{id, wall:'L'|'R', s}], props:[{id, u, v, flip, fp?}], need?:[prop ids], door?:piece id, clear?:[[u,v]] }
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
import { BIG_RECIPES, hasBigRecipe } from './ward_kit_big.js';
export { hasBigRecipe };
export const SUB = 4;
export const WALL_FULL = 46, WALL_LOW = 15;
export const LANES = [[0, 1], [3, 1], [1, 0], [1, 3]];

// ids the art pipeline has not delivered yet. Batches 3 and 4 delivered every floor, wall, wall piece and prop, so nothing is planned today. A future batch
// adds its ids here (with the footprints its recipe variants were laid out for) and gates the variant by `need`: it switches on by itself the day the
// prop reaches the manifest. The manifest's own footprint wins once it exists.
export const PLANNED = { floors: [], walls: [], pieces: [], props: {} };
// animated props: an overlay the renderer draws over the sprite (never with reduced motion)
export const PROP_ANIM = { generator: 'spark', sawbench: 'saw', candle_stand: 'flame', stove: 'flame', boiler_tank: 'spark', cauldron: 'flame', footlights: 'flame', work_lamp: 'flame' };

const P = (id, u, v, flip = 0) => ({ id, u, v, flip });
const Wp = (id, wall, s) => ({ id, wall, s });

// How the rooms are laid out (u runs along the right-down edge = the back-right wall, v along the left-down edge = the back-left wall):
//   - the L wall is the column u = 0, the R wall the row v = 0; the lanes (0,1) (3,1) (1,0) (1,3) stay free (doors), so a 2 x 1 prop on a wall edge sits in the
//     cells 2 and 3 of its row (or 2 and 3 of its column, flipped); the far edges (row 3, column 3) take only low things, so nobody hides behind them.
//   - TALL props (shelf, toolrack, lamp, iv stand, coat stand, candle stand) stand in the corners (0,0) and (0,3), never in the middle of a wall edge
//     under a window (a window on the L wall covers rows 1 to 2, on the R wall columns 1 to 2).
//   - windows only where daylight makes sense (wards, workshops, laundry, library, kitchen), never in the morgue, cells, boiler, chapel (stained glass instead), theatre.
//   - every room has its own floor + wall pair or its own prop mix: no two rooms look alike (tests/graftwork_ui_ward_kit.test.mjs).
// Each room lists its signature variant first (gated by `need`: the batch 4 props), then a fallback built from the older art that needs nothing (a kit without batch 4 still works).
export const RECIPES = {
  rm_entrance: [{
    floor: 'tile', wall: 'wood', door: 'archdoor',
    pieces: [Wp('archdoor', 'L', 0.5), Wp('notice', 'R', 0.22), Wp('clock', 'R', 0.62), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.88)],
    props: [P('reception_desk', 2, 0), P('waiting_bench', 0, 2, 1), P('coat_stand', 0, 0), P('plant', 3, 3), P('lamp', 3, 2)],
  }],
  rm_corridor: [{
    floor: 'tile', wall: 'plaster',
    pieces: [Wp('sconce', 'L', 0.18), Wp('window', 'L', 0.5), Wp('clock', 'R', 0.5), Wp('sconce', 'R', 0.84)],
    props: [P('gurney', 2, 3), P('wheelchair', 0, 3), P('plant', 0, 0), P('lamp', 3, 0)],
  }],
  rm_ward: [{
    floor: 'tile', wall: 'tile',
    pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('notice', 'R', 0.3), Wp('sconce', 'R', 0.86)],
    props: [P('bed', 2, 0), P('bed', 0, 2, 1), P('bed', 2, 3), P('bedside_table', 2, 1), P('iv_stand', 0, 0)],
  }],
  rm_isolation: [
    { floor: 'darkstone', wall: 'stone', need: ['restraint_chair'], pieces: [Wp('sconce', 'L', 0.3), Wp('sconce', 'R', 0.7)],
      props: [P('padded_cot', 0, 2, 1), P('restraint_chair', 2, 1), P('bucket', 3, 3), P('crate', 3, 0)] },
    { floor: 'darkstone', wall: 'stone', pieces: [Wp('sconce', 'L', 0.3), Wp('sconce', 'R', 0.7)],
      props: [P('bed', 0, 2, 1), P('stool', 2, 2), P('bucket', 3, 3), P('crate', 3, 0)] },
  ],
  rm_isolation2: [
    { floor: 'stone', wall: 'brick', need: ['padded_cot'], pieces: [Wp('vent', 'R', 0.5), Wp('sconce', 'L', 0.2), Wp('sconce', 'R', 0.84)],
      props: [P('padded_cot', 0, 2, 1), P('padded_cot', 2, 3), P('restraint_chair', 3, 2), P('iv_stand', 0, 0), P('bucket', 2, 0)] },
    { floor: 'stone', wall: 'brick', pieces: [Wp('vent', 'R', 0.5), Wp('sconce', 'L', 0.2), Wp('sconce', 'R', 0.84)],
      props: [P('bed', 0, 2, 1), P('bed', 2, 3), P('screen', 2, 0), P('iv_stand', 0, 0), P('bucket', 3, 2)] },
  ],
  rm_chapel: [{
    floor: 'stone', wall: 'plaster',
    pieces: [Wp('stainedglass', 'L', 0.5), Wp('stainedglass', 'R', 0.5), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.88)],
    props: [P('altar', 2, 0), P('pew', 2, 2), P('pew', 2, 3), P('candle_stand', 0, 0), P('candle_stand', 0, 3), P('lectern', 0, 2)],
  }],
  rm_dispensary: [{
    floor: 'wood', wall: 'stone',
    pieces: [Wp('sconce', 'L', 0.2), Wp('window', 'L', 0.55), Wp('banner', 'R', 0.5), Wp('sconce', 'R', 0.85)],
    props: [P('shelf', 0, 0), P('shelf', 2, 0), P('shelf', 3, 0), P('shelf', 0, 3), P('crate', 3, 3), P('crate', 3, 2), P('stool', 2, 2)],
  }],
  rm_pharmacy: [
    { floor: 'wood', wall: 'tile', need: ['pharmacy_counter'], pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.16), Wp('sconce', 'R', 0.86)],
      props: [P('pharmacy_counter', 2, 2), P('pill_jars', 3, 3), P('shelf', 0, 0), P('shelf', 2, 0), P('shelf', 3, 0), P('stool', 0, 2), P('plant', 0, 3)] },
    { floor: 'wood', wall: 'tile', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.16), Wp('sconce', 'R', 0.86)],
      props: [P('reception_desk', 2, 2), P('shelf', 0, 0), P('shelf', 2, 0), P('shelf', 3, 0), P('stool', 0, 2), P('plant', 0, 3)] },
  ],
  rm_workshop: [
    { floor: 'stone', wall: 'wood', need: ['workbench'], pieces: [Wp('sconce', 'L', 0.18), Wp('window', 'R', 0.5), Wp('sconce', 'R', 0.84)],
      props: [P('workbench', 2, 2), P('anvil', 0, 2), P('tool_chest', 0, 3), P('toolrack', 0, 0), P('toolrack', 3, 0), P('work_lamp', 3, 3), P('bucket', 2, 0)] },
    { floor: 'stone', wall: 'wood', pieces: [Wp('sconce', 'L', 0.18), Wp('window', 'R', 0.5), Wp('sconce', 'R', 0.84)],
      props: [P('sawbench', 2, 2), P('toolrack', 0, 0), P('toolrack', 3, 0), P('crate', 0, 3), P('bucket', 3, 3), P('bucket', 2, 0)] },
  ],
  rm_sawmill: [{
    floor: 'wood', wall: 'wood',
    pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('banner', 'R', 0.47), Wp('sconce', 'R', 0.84)],
    props: [P('crate', 0, 0), P('toolrack', 3, 0), P('shelf', 0, 3), P('sawbench', 2, 2), P('planks', 2, 3), P('stool', 0, 2)],
  }],
  rm_quarry: [
    { floor: 'stone', wall: 'stone', need: ['ore_cart'], pieces: [Wp('sconce', 'L', 0.3), Wp('sconce', 'R', 0.7), Wp('banner', 'L', 0.75)],
      props: [P('ore_cart', 2, 2), P('rocks', 2, 0), P('pickaxe_rack', 0, 0), P('work_lamp', 3, 3), P('bucket', 0, 3), P('crate', 0, 2)] },
    { floor: 'stone', wall: 'stone', pieces: [Wp('sconce', 'L', 0.3), Wp('sconce', 'R', 0.7), Wp('banner', 'L', 0.75)],
      props: [P('rocks', 2, 0), P('crate', 0, 0), P('rocks', 2, 2), P('rocks', 2, 3), P('bucket', 0, 2), P('bucket', 0, 3)] },
  ],
  rm_counting: [
    { floor: 'carpet', wall: 'brick', need: ['counting_desk'], pieces: [Wp('clock', 'L', 0.5), Wp('chalkboard', 'R', 0.5), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.88)],
      props: [P('counting_desk', 2, 2), P('coin_chest', 0, 0), P('coin_chest', 3, 0), P('abacus', 0, 3), P('stool', 0, 2), P('plant', 3, 3)] },
    { floor: 'carpet', wall: 'brick', pieces: [Wp('clock', 'L', 0.5), Wp('chalkboard', 'R', 0.5), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.88)],
      props: [P('reception_desk', 2, 2), P('shelf', 0, 0), P('lectern', 0, 3), P('stool', 0, 2), P('plant', 3, 3), P('crate', 3, 0)] },
  ],
  rm_generator: [
    { floor: 'darkstone', wall: 'wood', need: ['cable_coil'], pieces: [Wp('pipes', 'L', 0.5), Wp('notice', 'R', 0.5), Wp('sconce', 'L', 0.16), Wp('sconce', 'R', 0.86)],
      props: [P('generator', 2, 2), P('fuse_box', 2, 0), P('cable_coil', 0, 0), P('cable_coil', 3, 3), P('crate', 0, 3)] },
    { floor: 'darkstone', wall: 'wood', pieces: [Wp('pipes', 'L', 0.5), Wp('notice', 'R', 0.5), Wp('sconce', 'L', 0.16), Wp('sconce', 'R', 0.86)],
      props: [P('generator', 2, 2), P('crate', 0, 0), P('crate', 3, 0), P('bucket', 3, 3), P('crate', 0, 3)] },
  ],
  rm_boiler: [
    { floor: 'darkstone', wall: 'brick', need: ['boiler_tank'], pieces: [Wp('pipes', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('vent', 'R', 0.82), Wp('sconce', 'L', 0.15)],
      props: [P('boiler_tank', 2, 2), P('coal_pile', 2, 0), P('valve_wheel', 0, 0), P('crate', 0, 2), P('bucket', 0, 3)] },
    { floor: 'darkstone', wall: 'brick', pieces: [Wp('pipes', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('vent', 'R', 0.82), Wp('sconce', 'L', 0.15)],
      props: [P('generator', 2, 2), P('rocks', 2, 0), P('bucket', 0, 3), P('crate', 0, 0), P('bucket', 3, 3)] },
  ],
  rm_laundry: [
    { floor: 'tile', wall: 'wood', need: ['wash_tub'], pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'R', 0.2), Wp('sconce', 'R', 0.84)],
      props: [P('wash_tub', 0, 0), P('wash_tub', 3, 3), P('mangle', 2, 2), P('drying_rack', 2, 0), P('bucket', 0, 3), P('crate', 0, 2)] },
    { floor: 'tile', wall: 'wood', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'R', 0.2), Wp('sconce', 'R', 0.84)],
      props: [P('bucket', 0, 0), P('bucket', 3, 0), P('screen', 2, 2), P('crate', 0, 3), P('bucket', 3, 3), P('toolrack', 2, 0)] },
  ],
  rm_linen: [
    { floor: 'wood', wall: 'plaster', need: ['linen_shelf'], pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'R', 0.3), Wp('banner', 'R', 0.7)],
      props: [P('bed', 2, 0), P('linen_shelf', 0, 0), P('linen_cart', 0, 3), P('screen', 2, 3), P('stool', 2, 2)] },
    { floor: 'wood', wall: 'plaster', pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'R', 0.3), Wp('banner', 'R', 0.7)],
      props: [P('bed', 2, 0), P('shelf', 0, 0), P('screen', 0, 2, 1), P('bedside_table', 3, 3), P('plant', 2, 3)] },
  ],
  rm_morgue: [
    { floor: 'slab', wall: 'slab', need: ['slab_table'], pieces: [Wp('vent', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('notice', 'R', 0.3), Wp('sconce', 'R', 0.86)],
      props: [P('slab_table', 2, 0), P('slab_table', 2, 2), P('locker_wall', 0, 2, 1), P('sheet_body', 2, 3), P('bucket', 0, 0)] },
    { floor: 'slab', wall: 'slab', pieces: [Wp('vent', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('notice', 'R', 0.3), Wp('sconce', 'R', 0.86)],
      props: [P('gurney', 2, 0), P('gurney', 0, 2, 1), P('gurney', 2, 3), P('bucket', 3, 2), P('lamp', 0, 0)] },
  ],
  rm_kitchen: [
    { floor: 'brick', wall: 'tile', need: ['stove'], pieces: [Wp('vent', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
      props: [P('stove', 2, 0), P('prep_table', 2, 2), P('hanging_pots', 0, 0), P('cauldron', 0, 2), P('crate', 3, 3), P('stool', 0, 3)] },
    { floor: 'brick', wall: 'tile', pieces: [Wp('vent', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.86)],
      props: [P('shelf', 0, 0), P('shelf', 0, 3), P('planks', 2, 3), P('bucket', 3, 0), P('stool', 2, 0), P('plant', 3, 2)] },
  ],
  rm_library: [
    { floor: 'carpet', wall: 'wood', need: ['bookcase'], pieces: [Wp('window', 'L', 0.68), Wp('chalkboard', 'R', 0.5), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.88)],
      props: [P('bookcase', 2, 0), P('bookcase', 0, 2, 1), P('reading_desk', 2, 2), P('library_ladder', 0, 0), P('globe', 3, 3)] },
    { floor: 'carpet', wall: 'wood', pieces: [Wp('window', 'L', 0.5), Wp('chalkboard', 'R', 0.5), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.88)],
      props: [P('shelf', 0, 0), P('shelf', 0, 3), P('lectern', 2, 0), P('waiting_bench', 2, 3), P('lamp', 3, 2), P('plant', 3, 0)] },
  ],
  rm_theatre: [
    { floor: 'stage', wall: 'velvet', need: ['operating_table'], door: 'archdoor', pieces: [Wp('curtain', 'L', 0.5), Wp('curtain', 'R', 0.5), Wp('sconce', 'L', 0.1), Wp('sconce', 'R', 0.9)],
      props: [P('operating_table', 2, 2), P('instrument_tray', 1, 2), P('throne', 3, 0), P('footlights', 2, 3), P('lamp', 0, 0)] },
    { floor: 'stage', wall: 'velvet', door: 'archdoor', pieces: [Wp('curtain', 'L', 0.5), Wp('curtain', 'R', 0.5), Wp('sconce', 'L', 0.1), Wp('sconce', 'R', 0.9)],
      props: [P('gurney', 2, 2), P('bedside_table', 1, 2), P('iv_stand', 3, 0), P('lamp', 0, 0), P('plant', 3, 3)] },
  ],
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
export const newGrid = (v = false, cu = SUB, cv = SUB) => Array.from({ length: cu }, () => Array(cv).fill(v));
// the lane cells of a w x h cell room: rows or columns 1 of every outer cell edge, and of every inner cell boundary (so a big room is one open floor)
export function lanesFor(w = 1, h = 1) {
  const out = [];
  for (let j = 0; j < h; j++) { out.push([0, j * SUB + 1], [w * SUB - 1, j * SUB + 1]); if (w > 1) for (let i = 1; i < w; i++) out.push([i * SUB - 1, j * SUB + 1], [i * SUB, j * SUB + 1]); }
  for (let i = 0; i < w; i++) { out.push([i * SUB + 1, 0], [i * SUB + 1, h * SUB - 1]); if (h > 1) for (let j = 1; j < h; j++) out.push([i * SUB + 1, j * SUB - 1], [i * SUB + 1, j * SUB]); }
  return out;
}
export function doorPieceId(kit, want) { for (const id of [want, 'door', 'archdoor']) if (id && hasId(kit, 'pieces', id)) return id; return null; }

const CACHE = new WeakMap();
// the usable recipe of a room type for this kit manifest: { type, variant, key, floor, wall, pieces, props, occ, free, stand, doorPiece } or null (paint it)
export function resolveRecipe(type, kit, fw = 1, fh = 1) {
  if (!kit || !kit.floors || !kit.walls) return null;
  let per = CACHE.get(kit); if (!per) { per = new Map(); CACHE.set(kit, per); }
  const ck = fw * fh > 1 ? type + '@' + fw + 'x' + fh : type;
  if (per.has(ck)) return per.get(ck);
  const out = build(type, kit, fw, fh); per.set(ck, out); return out;
}
function build(type, kit, fw = 1, fh = 1) {
  const big = fw * fh > 1, cu = SUB * fw, cv = SUB * fh;
  const list = big ? (BIG_RECIPES[type] || {})[fw + 'x' + fh] : RECIPES[ROOM_ALIAS[type] || type]; if (!list) return null;
  for (let vi = 0; vi < list.length; vi++) {
    const v = list[vi];
    if (!hasId(kit, 'floors', v.floor) || !hasId(kit, 'walls', v.wall)) continue;
    if ((v.need || []).some((id) => !hasId(kit, 'props', id))) continue;
    const occ = newGrid(false, cu, cv), props = [];
    for (const c of big ? lanesFor(fw, fh) : LANES) occ[c[0]][c[1]] = 'lane';
    for (const c of v.clear || []) occ[c[0]][c[1]] = 'lane';
    for (const p of v.props) {
      if (!hasId(kit, 'props', p.id)) continue;
      const [c, r] = footprintOf(kit, p.id, p.flip);
      if (p.u < 0 || p.v < 0 || p.u + c > cu || p.v + r > cv) continue;
      let ok = true; for (let i = 0; i < c && ok; i++) for (let j = 0; j < r; j++) if (occ[p.u + i][p.v + j]) { ok = false; break; }
      if (!ok) continue;
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) occ[p.u + i][p.v + j] = true;
      props.push({ id: p.id, u: p.u, v: p.v, flip: !!p.flip, c, r, anim: PROP_ANIM[p.id] || '' });
    }
    // lanes are free ground, not props
    const solid = newGrid(false, cu, cv); for (let u = 0; u < cu; u++) for (let w = 0; w < cv; w++) solid[u][w] = occ[u][w] === true;
    const free = []; for (let u = 0; u < cu; u++) for (let w = 0; w < cv; w++) if (!solid[u][w]) free.push([u, w]);
    const pieces = v.pieces.filter((p) => hasId(kit, 'pieces', p.id));
    let stand = free[0]; let bd = 1e9; for (const f of free) { const d = Math.hypot(f[0] - (cu - 1) / 2, f[1] - (cv - 1) / 2) + (f[0] + f[1]) * 0.001; if (d < bd) { bd = d; stand = f; } }
    return { type, variant: vi, key: type + '#' + vi + (big ? '@' + fw + 'x' + fh : ''), fw, fh, cu, cv, floor: v.floor, wall: v.wall, pieces, props, occ: solid, free, stand, doorPiece: doorPieceId(kit, v.door), planned: (v.need || []).length > 0 };
  }
  return null;
}
// every free sub-tile reachable from every other through 4-neighbours
export function freeConnected(rc) {
  if (!rc.free.length) return false;
  const cu = rc.cu || SUB, cv = rc.cv || SUB, seen = newGrid(false, cu, cv), q = [rc.free[0]]; seen[q[0][0]][q[0][1]] = true; let n = 0;
  while (q.length) { const [u, v] = q.pop(); n++; for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = u + du, b = v + dv; if (a < 0 || b < 0 || a >= cu || b >= cv || seen[a][b] || rc.occ[a][b]) continue; seen[a][b] = true; q.push([a, b]); } }
  return n === rc.free.length;
}
// a prop covers (u, v)?
export function propAt(rc, u, v) { for (const p of rc.props) if (u >= p.u && u < p.u + p.c && v >= p.v && v < p.v + p.r) return p; return null; }
// the wall height of a side for a mode. 'full' | 'low' | 'cutaway' (cutaway: walls shared with a room behind stay low, outer walls stay tall)
export function wallHeight(mode, shared) { return mode === 'full' ? WALL_FULL : mode === 'low' ? WALL_LOW : shared ? WALL_LOW : WALL_FULL; }
// the default wall mode by density: one room stands tall, a few rooms are cut away at the shared walls, a built floor is low
export function defaultWallMode(nRooms) { return nRooms <= 1 ? 'full' : nRooms <= 5 ? 'cutaway' : 'low'; }

// ---------------- doors and shared walls (the engine's neighbours are the single source of truth) ----------------
// rooms: the list of { id, x, y, w?, h? }; nbrs(id) -> ids of the rooms connected to it (engine/ward.js neighbors). The wall between two connected rooms
// belongs to the one in front (the larger x or y): the L wall of (x, y) borders (x - 1, y), the R wall borders (x, y - 1). Each shared edge is
// drawn once, with a door in it. A room w cells wide has w segments on its R wall and h on its L wall, each with its own door. Returns Map id ->
// { L, R (any door), sharedL, sharedR, slabL, slabR (any), Ls[h], Rs[w] doors per segment, sharedLs[h], sharedRs[w], slabLs[w], slabRs[h] }.
export function wallPlan(rooms, nbrs, roomAtXY) {
  const out = new Map();
  for (const r of rooms) {
    const ns = new Set(nbrs(r.id)), w = r.w || 1, h = r.h || 1;
    const Ls = [], Rs = [], sharedLs = [], sharedRs = [], slabLs = [], slabRs = [];
    for (let j = 0; j < h; j++) { const n = roomAtXY(r.x - 1, r.y + j); Ls.push(!!n && ns.has(n)); sharedLs.push(!!n); slabRs.push(!roomAtXY(r.x + w, r.y + j)); }
    for (let i = 0; i < w; i++) { const n = roomAtXY(r.x + i, r.y - 1); Rs.push(!!n && ns.has(n)); sharedRs.push(!!n); slabLs.push(!roomAtXY(r.x + i, r.y + h)); }
    const any = (a) => a.some(Boolean);
    out.set(r.id, { L: any(Ls), R: any(Rs), sharedL: any(sharedLs), sharedR: any(sharedRs), slabL: any(slabLs), slabR: any(slabRs), Ls, Rs, sharedLs, sharedRs, slabLs, slabRs, w, h });
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
  const roomOf = (c) => { const i = cellInfo(c[0], c[1]); return i && i.rid !== undefined ? i.rid : Math.floor(c[0] / SUB) + ',' + Math.floor(c[1] / SUB); }; // a big room is one room: its inner cell boundaries are open
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
  return pathOnGrid([from[0], from[1]], [to[0], to[1]], (u, v) => (u < 0 || v < 0 || u >= (rc.cu || SUB) || v >= (rc.cv || SUB) ? null : { room: true, solid: rc.occ[u][v], rid: 0 }));
}
