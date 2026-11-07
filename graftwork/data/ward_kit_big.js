// THE WARD, modular kit: recipes for rooms that cover more than one cell (design/WARD.md "Room sizes and Expand"). Pure data, no imports.
// A footprint of w x h cells is a (4w) x (4h) grid of sub-tiles in the same u (right-down) and v (left-down) axes as data/ward_kit.js; every
// cell boundary inside the room is open floor. Keys are '<w>x<h>': '2x1' is two cells along u, '1x2' two cells along v (derived from the 2x1
// plan by mirroring it, so both orientations look alike), '2x2' the Theatre. A room type with no entry here cannot Expand ("norecipe").
// Each list is best first like RECIPES; the last variant needs no planned prop. House rules (tests/graftwork_ward_big.test.mjs):
//   - the lane cells of every outer cell edge (rows or columns 1 to 2 of a cell) and of every inner cell boundary stay free,
//   - props stay in the grid and never overlap, every free sub-tile is reachable from every other,
//   - tall props hug a back wall (u = 0 or v = 0), nothing tall stands on the front edges.
const P = (id, u, v, flip = 0) => ({ id, u, v, flip });
const Wp = (id, wall, s) => ({ id, wall, s });

// ---- 2 x 1 plans (u 0..7, v 0..3) ----
const PLAN_2x1 = {
  rm_ward: [{
    floor: 'tile', wall: 'tile',
    pieces: [Wp('window', 'L', 0.5), Wp('sconce', 'L', 0.14), Wp('notice', 'R', 0.5), Wp('window', 'R', 0.2), Wp('sconce', 'R', 0.95), Wp('sconce', 'R', 0.05)],
    props: [P('bed', 2, 0), P('bed', 6, 0), P('bed', 0, 2, 1), P('bed', 2, 3), P('bed', 6, 3), P('bedside_table', 2, 1), P('bedside_table', 7, 2), P('iv_stand', 0, 0), P('screen', 3, 2)],
  }],
  rm_chapel: [{
    floor: 'stone', wall: 'plaster',
    pieces: [Wp('stainedglass', 'L', 0.5), Wp('stainedglass', 'R', 0.25), Wp('stainedglass', 'R', 0.75), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.5)],
    props: [P('altar', 3, 0), P('pew', 2, 2), P('pew', 2, 3), P('pew', 5, 2), P('pew', 5, 3), P('candle_stand', 0, 0), P('candle_stand', 7, 0), P('lectern', 0, 2), P('candle_stand', 0, 3)],
  }],
  rm_workshop: [{
    floor: 'stone', wall: 'wood',
    pieces: [Wp('sconce', 'L', 0.18), Wp('window', 'R', 0.25), Wp('window', 'R', 0.75), Wp('sconce', 'R', 0.5)],
    props: [P('workbench', 2, 2), P('workbench', 5, 2), P('anvil', 0, 2), P('tool_chest', 0, 3), P('toolrack', 0, 0), P('toolrack', 3, 0), P('toolrack', 6, 0), P('work_lamp', 7, 3), P('bucket', 7, 2)],
  }],
  rm_library: [{
    floor: 'carpet', wall: 'wood',
    pieces: [Wp('window', 'L', 0.5), Wp('chalkboard', 'R', 0.5), Wp('sconce', 'L', 0.12), Wp('sconce', 'R', 0.05), Wp('sconce', 'R', 0.95)],
    props: [P('bookcase', 2, 0), P('bookcase', 6, 0), P('bookcase', 0, 2, 1), P('reading_desk', 2, 2), P('reading_desk', 5, 2), P('library_ladder', 0, 0), P('globe', 7, 3)],
  }],
  rm_kitchen: [{
    floor: 'brick', wall: 'tile',
    pieces: [Wp('vent', 'L', 0.5), Wp('pipes', 'R', 0.5), Wp('sconce', 'L', 0.14), Wp('sconce', 'R', 0.05), Wp('sconce', 'R', 0.95)],
    props: [P('stove', 2, 0), P('stove', 6, 0), P('prep_table', 2, 2), P('prep_table', 5, 2), P('hanging_pots', 0, 0), P('cauldron', 0, 2), P('stool', 0, 3), P('crate', 7, 3), P('crate', 7, 2)],
  }],
  rm_generator: [{
    floor: 'darkstone', wall: 'wood',
    pieces: [Wp('pipes', 'L', 0.5), Wp('notice', 'R', 0.5), Wp('pipes', 'R', 0.2), Wp('sconce', 'L', 0.16), Wp('sconce', 'R', 0.86)],
    props: [P('generator', 2, 2), P('generator', 5, 2), P('fuse_box', 2, 0), P('fuse_box', 6, 0), P('cable_coil', 0, 0), P('cable_coil', 7, 3), P('crate', 0, 3)],
  }],
  rm_boiler: [{
    floor: 'darkstone', wall: 'brick',
    pieces: [Wp('pipes', 'L', 0.5), Wp('pipes', 'R', 0.25), Wp('pipes', 'R', 0.75), Wp('vent', 'R', 0.5), Wp('sconce', 'L', 0.15)],
    props: [P('boiler_tank', 2, 2), P('boiler_tank', 5, 2), P('coal_pile', 2, 0), P('coal_pile', 6, 0), P('valve_wheel', 0, 0), P('crate', 7, 3), P('bucket', 0, 3)],
  }],
};

// ---- 2 x 2 plan (u 0..7, v 0..7): the Operating Theatre ----
const PLAN_2x2 = {
  rm_theatre: [{
    floor: 'stage', wall: 'velvet', door: 'archdoor',
    pieces: [Wp('curtain', 'L', 0.25), Wp('curtain', 'L', 0.75), Wp('curtain', 'R', 0.25), Wp('curtain', 'R', 0.75), Wp('sconce', 'L', 0.05), Wp('sconce', 'L', 0.5), Wp('sconce', 'R', 0.5), Wp('sconce', 'R', 0.95)],
    props: [P('operating_table', 3, 3), P('instrument_tray', 2, 3), P('instrument_tray', 5, 3), P('throne', 7, 0), P('footlights', 3, 6), P('footlights', 3, 7), P('lamp', 0, 0), P('lamp', 0, 7), P('iv_stand', 0, 4), P('gurney', 5, 5)],
  }],
};

// mirror a plan across the diagonal (u <-> v): a 2 x 1 plan becomes the 1 x 2 plan. Props swap their u / v and flip, wall pieces swap sides (s runs the other way on the L wall).
const flipV = (v) => ({ ...v, pieces: v.pieces.map((p) => ({ ...p, wall: p.wall === 'L' ? 'R' : 'L', s: Math.round((1 - p.s) * 1000) / 1000 })), props: v.props.map((p) => ({ ...p, u: p.v, v: p.u, flip: p.flip ? 0 : 1 })) });
export const BIG_RECIPES = {};
for (const [t, list] of Object.entries(PLAN_2x1)) BIG_RECIPES[t] = { '2x1': list, '1x2': list.map(flipV) };
for (const [t, list] of Object.entries(PLAN_2x2)) BIG_RECIPES[t] = { '2x2': list };
export const hasBigRecipe = (type, w, h) => !!(BIG_RECIPES[type] && BIG_RECIPES[type][w + 'x' + h]);
