// Flow-field pathfinding for MAZEKEEP.
// Enemies don't run individual A* searches. Instead we compute a single
// Dijkstra/BFS distance field from the core(s) outward across all walkable
// tiles, plus a "next step" vector per tile. Every grounded enemy just reads
// the field under its feet and walks toward the core — this makes re-pathing
// after the player rebuilds the maze essentially free, and scales to hundreds
// of enemies. Flying enemies ignore the field and fly straight to the core.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});

  // 4-directional neighbours (no diagonals → cleaner mazes, no corner cutting).
  const DIRS = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  // grid: { cols, rows, blocked:Uint8Array } where blocked[i]=1 means a tower /
  // wall / rock occupies the tile and grounded enemies cannot enter it.
  // goals: array of {x,y} core tiles (usually one).
  // Returns { dist:Float32Array, next:Int32Array, cols, rows } where dist is the
  // step distance to the nearest goal (Infinity if unreachable) and next holds
  // the index of the neighbour tile to move into (-1 if none / is goal).
  function computeField(grid, goals) {
    const { cols, rows, blocked } = grid;
    const n = cols * rows;
    const dist = new Float32Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    // Simple BFS queue (uniform cost) — fast enough for our grid sizes.
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (const g of goals) {
      if (g.x < 0 || g.y < 0 || g.x >= cols || g.y >= rows) continue;
      const gi = g.y * cols + g.x;
      if (dist[gi] !== 0) {
        dist[gi] = 0;
        queue[tail++] = gi;
      }
    }
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      const nd = dist[cur] + 1;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d].dx;
        const ny = cy + DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni]) continue; // can't path through occupied tiles
        if (dist[ni] > nd) {
          dist[ni] = nd;
          next[ni] = cur; // step from ni toward cur (closer to goal)
          queue[tail++] = ni;
        }
      }
    }
    return { dist, next, cols, rows };
  }

  // Would blocking `tile` cut off any of the `spawns` from a goal? We answer by
  // recomputing the field with the tile temporarily blocked and checking every
  // spawn still has a finite distance. Used to forbid the player from fully
  // walling the maze shut.
  function wouldBlockPath(grid, goals, spawns, tile) {
    const i = tile.y * grid.cols + tile.x;
    const wasBlocked = grid.blocked[i];
    grid.blocked[i] = 1;
    const field = computeField(grid, goals);
    grid.blocked[i] = wasBlocked;
    for (const s of spawns) {
      if (!isFinite(field.dist[s.y * grid.cols + s.x])) return true;
    }
    return false;
  }

  TD.path = { computeField, wouldBlockPath, DIRS };
})();
