// Water and lava as a small cellular automaton: each cell holds a level 1..8, liquids fall first, then level out sideways.
import { B, BLOCKS, H, W, L_WATER, L_LAVA } from '../shared/data.js';

const solid = (id) => id && BLOCKS[id].solid;

export function activate(world, x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  world.liqActive.add(y * W + x);
}
export function activateAround(world, x, y) {
  activate(world, x, y); activate(world, x - 1, y); activate(world, x + 1, y); activate(world, x, y - 1); activate(world, x, y + 1);
}

// returns number of cells processed
export function stepLiquids(world, budget = 500) {
  if (!world.liqActive.size) return 0;
  const cells = [...world.liqActive];
  world.liqActive.clear();
  let done = 0;
  for (const key of cells) {
    if (done++ >= budget) { world.liqActive.add(key); continue; }
    const x = key % W, y = (key / W) | 0;
    stepCell(world, x, y);
  }
  return done;
}

function lvlOf(v) { return v & 15; }
function typeOf(v) { return v >> 4; }

function react(world, x, y, a, b) {
  // water met lava: lava turns to obsidian (source) or cobble (flowing)
  const lavaAt = typeOf(a) === L_LAVA ? a : b;
  world.setTile(x, y, 2, 0);
  world.setTile(x, y, 0, lvlOf(lavaAt) >= 8 ? B.obsidian : B.stone);
  world.event('hiss', x + 0.5, y + 0.5);
  activateAround(world, x, y);
}

function stepCell(world, x, y) {
  let v = world.liqAt(x, y);
  if (!v) return;
  const t = typeOf(v);
  let lvl = lvlOf(v);
  if (solid(world.fgAt(x, y))) { world.setTile(x, y, 2, 0); return; }
  // fall
  if (y + 1 < H) {
    const f = world.fgAt(x, y + 1);
    if (!solid(f)) {
      const bv = world.liqAt(x, y + 1);
      if (bv && typeOf(bv) !== t) { react(world, x, y + 1, v, bv); return; }
      const bl = bv ? lvlOf(bv) : 0;
      if (bl < 8) {
        const mv = Math.min(lvl, 8 - bl);
        world.setTile(x, y + 1, 2, (t << 4) | (bl + mv));
        lvl -= mv;
        world.setTile(x, y, 2, lvl ? (t << 4) | lvl : 0);
        activateAround(world, x, y + 1);
        if (lvl) activate(world, x, y);
        activate(world, x, y - 1);
        if (lvl === 0) return;
        v = (t << 4) | lvl;
      }
    }
  }
  // spread
  const dirs = world.rng() < 0.5 ? [-1, 1] : [1, -1];
  for (const d of dirs) {
    const nx = x + d;
    if (nx < 0 || nx >= W) continue;
    if (solid(world.fgAt(nx, y))) continue;
    const nv = world.liqAt(nx, y);
    if (nv && typeOf(nv) !== t) { react(world, nx, y, v, nv); return; }
    const nl = nv ? lvlOf(nv) : 0;
    if (lvl > nl + 1) {
      const mv = Math.max(1, (lvl - nl) >> 1);
      world.setTile(nx, y, 2, (t << 4) | (nl + mv));
      lvl -= mv;
      world.setTile(x, y, 2, lvl ? (t << 4) | lvl : 0);
      activateAround(world, nx, y);
      activate(world, x, y);
      v = (t << 4) | lvl;
      if (!lvl) return;
    }
  }
  // water refills from two full neighbours (the sea and lakes never run dry)
  if (t === L_WATER && lvl < 8) {
    const l = world.liqAt(x - 1, y), r = world.liqAt(x + 1, y);
    if (l === ((L_WATER << 4) | 8) && r === ((L_WATER << 4) | 8)) {
      const supported = solid(world.fgAt(x, y + 1)) || world.liqAt(x, y + 1) === ((L_WATER << 4) | 8);
      if (supported) { world.setTile(x, y, 2, (L_WATER << 4) | 8); activateAround(world, x, y); }
    }
  }
}
