// Route planning for "go there, digging as needed" (double click): a cheapest-path search over feet cells where
// solid blocks can be dug through at a cost based on how long they take with the best tool in the hotbar.
import { BLOCKS, ITEMS, H, W, L_LAVA } from '../shared/data.js';

export function bestTool(inv, kind) {
  let best = null, bi = -1;
  for (let i = 0; i < 10; i++) { const s = inv[i], d = s && ITEMS[s.id]; if (d && d.tool === kind && (!best || d.tier > best.tier)) { best = d; bi = i; } }
  return { def: best, slot: bi };
}
// seconds to dig a block (Infinity if it cannot be dug with what we carry)
export function digCost(cw, inv, x, y) {
  const id = cw.fgAt(x, y);
  if (!id) return 0;
  const bd = BLOCKS[id];
  if (!bd.solid) return 0;
  if (bd.hard >= 1e8) return Infinity;
  const lq = cw.liqAt(x, y);
  if (lq && (lq >> 4) === L_LAVA) return Infinity;
  const t = bestTool(inv, bd.tool === 'any' ? 'pick' : bd.tool).def;
  const tier = t ? t.tier : 0, power = t ? t.power : 1;
  if (tier < (bd.need || 0)) return Infinity;
  return 0.6 + bd.hard / power;
}
const liqPenalty = (cw, x, y) => { const l = cw.liqAt(x, y); return l ? ((l >> 4) === L_LAVA ? Infinity : 2) : 0; };

class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; if (!a.length) return null; const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

// start/target are feet cells. Returns [[x,y],...] or null.
export function planDig(cw, inv, sx, sy, tx, ty, limit = 6000) {
  const x0 = Math.min(sx, tx) - 30, x1 = Math.max(sx, tx) + 30, y0 = Math.max(2, Math.min(sy, ty) - 30), y1 = Math.min(H - 3, Math.max(sy, ty) + 30);
  const key = (x, y) => y * W + x;
  const dist = new Map([[key(sx, sy), 0]]), prev = new Map([[key(sx, sy), -1]]);
  const heap = new Heap(); heap.push(0, [sx, sy]);
  const dc = (x, y) => digCost(cw, inv, x, y) + liqPenalty(cw, x, y);
  let n = 0;
  while (heap.size && n++ < limit) {
    const [d, [x, y]] = heap.pop();
    if (d > (dist.get(key(x, y)) ?? Infinity)) continue;
    if (x === tx && y === ty) {
      const out = [];
      let k = key(x, y);
      while (k !== -1) { out.push([k % W, (k / W) | 0]); k = prev.get(k); }
      return out.reverse();
    }
    const relax = (nx, ny, c) => {
      if (!(c < Infinity) || nx < x0 || nx > x1 || ny < y0 || ny > y1) return;
      const nd = d + c, kk = key(nx, ny);
      if (nd < (dist.get(kk) ?? Infinity)) { dist.set(kk, nd); prev.set(kk, key(x, y)); heap.push(nd, [nx, ny]); }
    };
    const floor = cw.solidAt(x, y + 1);
    if (!floor && !cw.solidAt(x, y)) { relax(x, y + 1, 0.3 + liqPenalty(cw, x, y + 1) * 0.2); continue; } // falling
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      relax(nx, y, 1 + dc(nx, y) + dc(nx, y - 1));                    // walk or tunnel sideways
      relax(nx, y - 1, 2.5 + dc(nx, y - 1) + dc(nx, y - 2) + dc(x, y - 2)); // climb a step
    }
    relax(x, y + 1, 0.8 + dc(x, y + 1)); // dig down (the shaft is one wide: you drop in)
  }
  return null;
}

// the solid cells that must go before stepping from feet cell a to b, nearest first
export function blockers(cw, a, b) {
  const [ax, ay] = a, [bx, by] = b, out = [];
  const add = (x, y) => { if (cw.solidAt(x, y)) out.push([x, y]); };
  if (bx === ax && by === ay + 1) add(bx, by);                    // down
  else if (by === ay - 1) { add(ax, ay - 2); add(bx, by - 1); add(bx, by); } // up a step: headroom, then the step
  else { add(bx, by - 1); add(bx, by); }                          // sideways: head first
  return out;
}
