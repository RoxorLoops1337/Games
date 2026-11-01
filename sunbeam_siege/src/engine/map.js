/* SUNBEAM SIEGE: map generation (agent C2).
 * Classic script. Attaches SB.map (generator) and SB.run.generateMap / SB.run.availableNodes.
 * Seeded exactly per A07 section 5 pseudocode: 8 rows x 5 columns per act, 4 paths, boss at row 8 centre.
 * Rows are 0 indexed here: row 0 Evening, row 2 Night A, row 5 Night B, row 6 pre boss rest, row 7 boss.
 * Interpretation notes:
 *  - Placement rule 1 ("cannot appear on two nodes joined by an edge") is read as: no two joined nodes share the
 *    same type when that type is elite, shop, nook, post or event (the Slay the Spire style rule).
 *  - Treasure is placed by guarantee only, never rolled.
 *  - Everything is deterministic: the map for act N depends only on (seed, N, rank).
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  SB.run = SB.run || {};
  SB.data = SB.data || {};

  /* ------------------------------------------------------------------ seeded rng (meta.seed spec) */
  // fnv1a 32 bit over a string
  function fnv1a(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    var s = a >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // rngFor(seed, stream, index): independent stream, mulberry32(fnv1a(seed:stream:index)).
  function rngFor(seed, stream, index) {
    var f = mulberry32(fnv1a(seed + ':' + stream + ':' + (index === undefined ? 0 : index)));
    var r = {
      draws: 0,
      next: function () { r.draws++; return f(); },
      // integer in [0, n)
      below: function (n) { return n < 2 ? 0 : Math.floor(r.next() * n); },
      // integer in [lo, hi] inclusive
      int: function (lo, hi) { return lo + (hi <= lo ? 0 : Math.floor(r.next() * (hi - lo + 1))); },
      chance: function (p) { return r.next() < p; },
      pick: function (list) { return (list && list.length) ? list[list.length === 1 ? 0 : Math.floor(r.next() * list.length)] : undefined; },
      shuffle: function (list) {
        for (var i = list.length - 1; i > 0; i--) {
          var j = Math.floor(r.next() * (i + 1));
          var t = list[i]; list[i] = list[j]; list[j] = t;
        }
        return list;
      },
      // weighted pick: items array, wf(item) -> weight >= 0. Returns undefined when all weights are 0.
      weighted: function (items, wf) {
        var total = 0, i, w, ws = [];
        for (i = 0; i < items.length; i++) { w = Math.max(0, wf ? wf(items[i], i) : 1); ws.push(w); total += w; }
        if (total <= 0) return undefined;
        var x = r.next() * total;
        for (i = 0; i < items.length; i++) { x -= ws[i]; if (x < 0) return items[i]; }
        return items[items.length - 1];
      }
    };
    return r;
  }
  SB.run.fnv1a = fnv1a;
  SB.run.mulberry32 = mulberry32;
  SB.run.rngFor = rngFor;

  /* ------------------------------------------------------------------ config */
  var ROWS = 8, COLS = 5, PATHS = 4, BOSS_ROW = 7, BOSS_COL = 2, PRE_BOSS = 6;
  var FIGHTS = { battle: 1, night: 1, elite: 1, boss: 1 };
  var SPECIAL = { elite: 1, shop: 1, nook: 1, post: 1, event: 1 };
  var FREE_W = [
    { battle: 38, mystery: 20, event: 14, shop: 8, post: 8, nook: 6, elite: 6 },
    { battle: 34, mystery: 20, event: 14, shop: 8, post: 8, nook: 8, elite: 8 },
    { battle: 30, mystery: 20, event: 14, shop: 8, post: 8, nook: 10, elite: 10 }
  ];
  var ROW_SIX_ELITE = 0.35;

  function cfg() {
    var R = (SB.data && SB.data.rules) || {};
    return {
      freeRowWeights: [
        mk(R.free_row_weight_battle, R.free_row_weight_mystery, R.free_row_weight_event, R.free_row_weight_shop,
          R.free_row_weight_post, R.free_row_weight_nook, R.free_row_weight_elite, 0),
        mk(R.free_row_weight_battle, R.free_row_weight_mystery, R.free_row_weight_event, R.free_row_weight_shop,
          R.free_row_weight_post, R.free_row_weight_nook, R.free_row_weight_elite, 1),
        mk(R.free_row_weight_battle, R.free_row_weight_mystery, R.free_row_weight_event, R.free_row_weight_shop,
          R.free_row_weight_post, R.free_row_weight_nook, R.free_row_weight_elite, 2)
      ],
      rowSixEliteChance: typeof R.row_six_elite_chance === 'number' ? R.row_six_elite_chance : ROW_SIX_ELITE
    };
    function mk(b, m, e, s, p, n, el, i) {
      var d = FREE_W[i];
      return {
        battle: b ? b[i] : d.battle, mystery: m ? m[i] : d.mystery, event: e ? e[i] : d.event, shop: s ? s[i] : d.shop,
        post: p ? p[i] : d.post, nook: n ? n[i] : d.nook, elite: el ? el[i] : d.elite
      };
    }
  }

  function nodeId(act, r, c) { return 'a' + act + 'r' + r + 'c' + c; }

  /* ------------------------------------------------------------------ graph building */
  function newGraph() {
    var g = { grid: [], edges: {}, edgeList: [] };
    for (var r = 0; r < ROWS; r++) g.grid.push(new Array(COLS).fill(null));
    return g;
  }
  function touch(g, r, c) {
    if (!g.grid[r][c]) g.grid[r][c] = { r: r, c: c, type: null };
    return g.grid[r][c];
  }
  function ekey(r, c, nc) { return r + ':' + c + ':' + nc; }
  function hasEdge(g, r, c, nc) { return !!g.edges[ekey(r, c, nc)]; }
  function addEdge(g, r, c, nc) {
    var k = ekey(r, c, nc);
    if (g.edges[k]) return;
    g.edges[k] = true;
    g.edgeList.push([r, c, nc]);
  }
  // an edge going right-down crosses an edge going left-down from the neighbour
  function crosses(g, r, c, nc) {
    if (nc > c) return hasEdge(g, r, c + 1, c);
    if (nc < c) return hasEdge(g, r, c - 1, c);
    return false;
  }
  function rowNodes(g, r) {
    var out = [];
    for (var c = 0; c < COLS; c++) if (g.grid[r][c]) out.push(g.grid[r][c]);
    return out;
  }
  function allNodes(g, r0, r1) {
    var out = [];
    for (var r = (r0 === undefined ? 0 : r0); r <= (r1 === undefined ? ROWS - 1 : r1); r++) out = out.concat(rowNodes(g, r));
    return out;
  }
  function childrenOf(g, n) {
    var out = [];
    if (n.r >= ROWS - 1) return out;
    for (var c = 0; c < COLS; c++) if (hasEdge(g, n.r, n.c, c) && g.grid[n.r + 1][c]) out.push(g.grid[n.r + 1][c]);
    return out;
  }
  function parentsOf(g, n) {
    var out = [];
    if (n.r <= 0) return out;
    for (var c = 0; c < COLS; c++) if (hasEdge(g, n.r - 1, c, n.c) && g.grid[n.r - 1][c]) out.push(g.grid[n.r - 1][c]);
    return out;
  }
  function childCount(g, n) { return childrenOf(g, n).length; }

  function buildGraph(rng) {
    var g = newGraph();
    var starts, i, c, r;
    do {
      starts = [];
      for (i = 0; i < PATHS; i++) starts.push(rng.int(0, COLS - 1));
    } while (distinct(starts) < 3);
    for (i = 0; i < starts.length; i++) {
      c = starts[i];
      touch(g, 0, c);
      for (r = 0; r < BOSS_ROW - 1; r++) {
        var opts = [c - 1, c, c + 1].filter(function (x) { return x >= 0 && x < COLS && !crosses(g, r, c, x); });
        var nc = opts.length ? rng.weighted(opts, function (x) { return x === c ? 4 : 3; }) : c;
        // a stay edge can still cross nothing; if the only option set was empty we stay (never crosses)
        addEdge(g, r, c, nc);
        touch(g, r + 1, nc);
        c = nc;
      }
    }
    // extra branches: a node with one child gets a second child 30 percent of the time
    allNodes(g, 0, BOSS_ROW - 2).forEach(function (n) {
      if (childCount(g, n) === 1 && rng.chance(0.30)) {
        var opts2 = [n.c - 1, n.c + 1].filter(function (x) {
          return x >= 0 && x < COLS && !crosses(g, n.r, n.c, x) && !hasEdge(g, n.r, n.c, x);
        });
        if (opts2.length) {
          var nc2 = rng.pick(opts2);
          addEdge(g, n.r, n.c, nc2);
          touch(g, n.r + 1, nc2);
          extendPath(g, n.r + 1, nc2, rng);
        }
      }
    });
    // pre boss row must hold at least 2 nodes
    if (!ensureMinNodes(g, PRE_BOSS, 2, rng)) return null;
    touch(g, BOSS_ROW, BOSS_COL);
    rowNodes(g, PRE_BOSS).forEach(function (n) { addEdge(g, PRE_BOSS, n.c, BOSS_COL); });
    return g;
  }
  // a node created by a branch needs its own way up to the pre boss row
  function extendPath(g, r, c, rng) {
    while (r < PRE_BOSS) {
      if (childCount(g, g.grid[r][c]) > 0) return;
      var opts = [c - 1, c, c + 1].filter(function (x) { return x >= 0 && x < COLS && !crosses(g, r, c, x); });
      var nc = opts.length ? rng.weighted(opts, function (x) { return x === c ? 4 : 3; }) : c;
      addEdge(g, r, c, nc);
      touch(g, r + 1, nc);
      c = nc; r++;
    }
  }
  function distinct(arr) { var s = {}, n = 0; arr.forEach(function (x) { if (!s[x]) { s[x] = 1; n++; } }); return n; }

  // widen a row by hanging a new node off a row above parent that has a free adjacent column
  function ensureMinNodes(g, row, min, rng) {
    var guard = 0;
    while (rowNodes(g, row).length < min && guard++ < 12) {
      var cands = [];
      rowNodes(g, row - 1).forEach(function (p) {
        [p.c - 1, p.c + 1].forEach(function (x) {
          if (x >= 0 && x < COLS && !g.grid[row][x] && !crosses(g, p.r, p.c, x) && !hasEdge(g, p.r, p.c, x)) cands.push([p, x]);
        });
      });
      if (!cands.length) return false;
      var pick = rng.pick(cands);
      addEdge(g, pick[0].r, pick[0].c, pick[1]);
      touch(g, row, pick[1]);
    }
    return rowNodes(g, row).length >= min;
  }

  /* ------------------------------------------------------------------ type assignment */
  function eligibleTypes(r, act) {
    // rows (0 indexed): 1 = row 2, 3 = row 4, 4 = row 5
    if (r === 1) return ['battle', 'mystery', 'event', 'shop'];
    if (r === 3) return act === 1 ? ['battle', 'mystery', 'event', 'shop', 'post', 'nook']
      : ['battle', 'mystery', 'event', 'shop', 'post', 'nook', 'elite'];
    if (r === 4) return ['battle', 'mystery', 'event', 'post', 'nook', 'elite'];
    return ['battle'];
  }
  function sameSpecialAdjacent(g, n, type) {
    if (!SPECIAL[type]) return false;
    var nb = parentsOf(g, n).concat(childrenOf(g, n));
    for (var i = 0; i < nb.length; i++) if (nb[i].type === type) return true;
    return false;
  }
  function siblingClash(g, n, type) {
    var ps = parentsOf(g, n);
    for (var i = 0; i < ps.length; i++) {
      var sibs = childrenOf(g, ps[i]);
      for (var j = 0; j < sibs.length; j++) if (sibs[j] !== n && sibs[j].type === type) return true;
    }
    return false;
  }

  function assignTypes(g, rng, act, conf) {
    var W = conf.freeRowWeights[act - 1];
    allNodes(g).forEach(function (n) {
      if (n.r === 0) n.type = 'battle';
      else if (n.r === 2) n.type = 'night';
      else if (n.r === 5) n.type = rng.chance(conf.rowSixEliteChance) ? 'elite' : 'night';
      else if (n.r === BOSS_ROW) n.type = 'boss';
      else n.type = null;
    });
    // fix row 5 so that no elite sits next to an elite parent later: handled by free row legality
    assignPreBossRow(g, rng);
    [1, 3, 4].forEach(function (r) {
      rowNodes(g, r).forEach(function (n) {
        var el = eligibleTypes(r, act), chosen = null;
        for (var t = 0; t < 10; t++) {
          var cand = rng.weighted(el, function (k) { return W[k]; });
          if (!cand) cand = 'battle';
          if (!sameSpecialAdjacent(g, n, cand) && !siblingClash(g, n, cand)) { chosen = cand; break; }
          if (!sameSpecialAdjacent(g, n, cand) && t === 9) chosen = cand;
        }
        n.type = chosen || 'battle';
      });
    });
    applyGuarantees(g, rng, act);
  }

  function assignPreBossRow(g, rng) {
    var ns = rowNodes(g, PRE_BOSS).slice();
    rng.shuffle(ns);
    var pool = ['nook', 'post'];
    ns[0].type = 'nook';
    ns[1].type = 'post';
    for (var i = 2; i < ns.length; i++) ns[i].type = rng.chance(0.5) ? 'shop' : rng.pick(pool);
  }

  function countType(g, rows, type) {
    var n = 0;
    rows.forEach(function (r) { rowNodes(g, r).forEach(function (x) { if (x.type === type) n++; }); });
    return n;
  }
  function canSet(g, n, type) { return !sameSpecialAdjacent(g, n, type); }

  function applyGuarantees(g, rng, act) {
    var cands;
    // elites in rows 3 and 4 (0 indexed): act 1 needs 1, others 2
    var needElite = act === 1 ? 1 : 2;
    var guard = 0;
    while (countType(g, [3, 4], 'elite') < needElite && guard++ < 8) {
      cands = [];
      (act === 1 ? [4] : [3, 4]).forEach(function (r) {
        rowNodes(g, r).forEach(function (n) {
          if ((n.type === 'battle' || n.type === 'mystery') && canSet(g, n, 'elite')) cands.push(n);
        });
      });
      if (!cands.length) break;
      rng.pick(cands).type = 'elite';
    }
    // at least one shop in rows 1..4 or the pre boss row
    if (countType(g, [1, 2, 3, 4, 6], 'shop') < 1) {
      cands = [];
      [1, 3].forEach(function (r) {
        rowNodes(g, r).forEach(function (n) {
          if ((n.type === 'battle' || n.type === 'mystery' || n.type === 'event') && canSet(g, n, 'shop')) cands.push(n);
        });
      });
      if (cands.length) rng.pick(cands).type = 'shop';
    }
    // at least one post in rows 1..4
    if (countType(g, [1, 2, 3, 4], 'post') < 1) {
      cands = [];
      [3, 4].forEach(function (r) {
        rowNodes(g, r).forEach(function (n) {
          if ((n.type === 'battle' || n.type === 'mystery') && canSet(g, n, 'post')) cands.push(n);
        });
      });
      if (cands.length) rng.pick(cands).type = 'post';
    }
    // exactly one treasure in row 4 (0 indexed), replacing a battle or mystery
    cands = rowNodes(g, 4).filter(function (n) { return n.type === 'battle' || n.type === 'mystery'; });
    if (!cands.length) cands = rowNodes(g, 4).filter(function (n) { return n.type === 'event' || n.type === 'post' || n.type === 'nook'; });
    // keep one battle child safety: prefer nodes that are not the only non-elite path
    if (cands.length) rng.pick(cands).type = 'treasure';
    // row 5: at least one elite and one night; no elite under an elite
    var r5 = rowNodes(g, 5);
    r5.forEach(function (n) {
      if (n.type === 'elite' && parentsOf(g, n).some(function (p) { return p.type === 'elite'; })) n.type = 'night';
    });
    // every row 4 node needs a night child
    rowNodes(g, 4).forEach(function (n) {
      var ch = childrenOf(g, n);
      if (ch.length && !ch.some(function (x) { return x.type === 'night'; })) {
        var conv = ch.filter(function (x) { return x.type === 'elite'; });
        if (conv.length) rng.pick(conv).type = 'night';
      }
    });
    if (!r5.some(function (n) { return n.type === 'elite'; })) {
      var okc = r5.filter(function (n) {
        return !parentsOf(g, n).some(function (p) { return p.type === 'elite'; }) &&
          parentsOf(g, n).every(function (p) { return childrenOf(g, p).some(function (x) { return x !== n && x.type === 'night'; }); });
      });
      if (okc.length) rng.pick(okc).type = 'elite';
    }
    if (!r5.some(function (n) { return n.type === 'night'; })) {
      var conv2 = r5.filter(function (n) { return n.type === 'elite'; });
      if (conv2.length) rng.pick(conv2).type = 'night';
    }
  }

  function labelNights(g, act) {
    var base = (act - 1) * 3;
    rowNodes(g, 2).forEach(function (n) { n.nightNo = base + 1; });
    rowNodes(g, 5).forEach(function (n) { n.nightNo = base + 2; });
    rowNodes(g, BOSS_ROW).forEach(function (n) { n.nightNo = base + 3; });
  }

  /* ------------------------------------------------------------------ validation */
  function fightRange(g) {
    // DP over rows: min and max fights on any path from row 0 to the boss
    var lo = {}, hi = {};
    for (var r = 0; r < ROWS; r++) {
      rowNodes(g, r).forEach(function (n) {
        var f = FIGHTS[n.type] ? 1 : 0, key = n.r + ':' + n.c;
        var ps = parentsOf(g, n);
        if (r === 0 || !ps.length) { lo[key] = f; hi[key] = f; return; }
        var mn = Infinity, mx = -Infinity;
        ps.forEach(function (p) { var k = p.r + ':' + p.c; mn = Math.min(mn, lo[k]); mx = Math.max(mx, hi[k]); });
        lo[key] = mn + f; hi[key] = mx + f;
      });
    }
    var b = rowNodes(g, BOSS_ROW)[0];
    return b ? [lo[b.r + ':' + b.c], hi[b.r + ':' + b.c]] : [0, 99];
  }
  function maxConsecutiveNonFights(g) {
    // longest chain of consecutive non fight nodes along any path
    var memo = {};
    function chain(n) {
      var key = n.r + ':' + n.c;
      if (memo[key] !== undefined) return memo[key];
      var v = 0;
      if (!FIGHTS[n.type]) {
        var best = 0;
        childrenOf(g, n).forEach(function (ch) { best = Math.max(best, chain(ch)); });
        v = 1 + best;
      }
      memo[key] = v;
      return v;
    }
    var worst = 0;
    allNodes(g).forEach(function (n) { worst = Math.max(worst, chain(n)); });
    return worst;
  }

  function validate(g, act) {
    var errs = [];
    if (!g) return { ok: false, errors: ['no graph'] };
    var fr = fightRange(g);
    if (fr[0] < 4) errs.push('minFights ' + fr[0]);
    if (fr[1] > 7) errs.push('maxFights ' + fr[1]);
    if (maxConsecutiveNonFights(g) > 2) errs.push('nonFightRun');
    for (var r = 0; r <= PRE_BOSS; r++) {
      var cnt = rowNodes(g, r).length;
      if (r === 0 && cnt < 3) errs.push('row0 count ' + cnt);
      if (cnt < 2) errs.push('row ' + r + ' count ' + cnt);
    }
    if (rowNodes(g, BOSS_ROW).length !== 1) errs.push('boss count');
    allNodes(g).forEach(function (n) { if (!n.type) errs.push('untyped ' + n.r + ':' + n.c); });
    // edges: every non boss node has a child, every non start node has a parent
    allNodes(g, 0, PRE_BOSS).forEach(function (n) { if (!childrenOf(g, n).length) errs.push('dead end ' + n.r + ':' + n.c); });
    allNodes(g, 1).forEach(function (n) { if (!parentsOf(g, n).length) errs.push('orphan ' + n.r + ':' + n.c); });
    // rule 1
    allNodes(g, 0, PRE_BOSS).forEach(function (n) {
      if (SPECIAL[n.type]) childrenOf(g, n).forEach(function (ch) { if (ch.type === n.type) errs.push('rule1 ' + n.type + ' ' + n.r + ':' + n.c); });
    });
    // guarantees
    var elites = countType(g, [3, 4], 'elite');
    if (elites < (act === 1 ? 1 : 2)) errs.push('elites ' + elites);
    if (act === 1 && countType(g, [3], 'elite') > 0) errs.push('act1 row4 elite');
    if (countType(g, [1, 2, 3, 4, 6], 'shop') < 1) errs.push('no shop');
    if (countType(g, [4], 'treasure') !== 1) errs.push('treasure count ' + countType(g, [4], 'treasure'));
    if (countType(g, [1, 2, 3, 4], 'post') < 1) errs.push('no free post');
    if (countType(g, [4], 'shop') > 0) errs.push('shop in row 5');
    if (countType(g, [1], 'elite') > 0 || countType(g, [1], 'post') > 0 || countType(g, [1], 'nook') > 0) errs.push('row2 illegal');
    if (countType(g, [PRE_BOSS], 'nook') < 1 || countType(g, [PRE_BOSS], 'post') < 1) errs.push('pre boss row');
    rowNodes(g, 4).forEach(function (n) {
      if (!childrenOf(g, n).some(function (ch) { return ch.type === 'night'; })) errs.push('forced elite ' + n.c);
    });
    var r5 = rowNodes(g, 5);
    if (!r5.some(function (n) { return n.type === 'elite'; })) errs.push('row6 no elite');
    if (!r5.some(function (n) { return n.type === 'night'; })) errs.push('row6 no night');
    r5.forEach(function (n) { if (n.type !== 'elite' && n.type !== 'night') errs.push('row6 type'); });
    return { ok: errs.length === 0, errors: errs };
  }

  /* ------------------------------------------------------------------ hand authored fallback */
  function templateGraph(act) {
    var g = newGraph();
    var layout = [
      [[1, 'battle'], [2, 'battle'], [3, 'battle']],
      [[0, 'battle'], [2, 'event'], [4, 'mystery']],
      [[0, 'night'], [2, 'night'], [4, 'night']],
      [[1, 'shop'], [2, 'battle'], [3, 'post']],
      [[1, 'elite'], [2, 'treasure'], [3, 'elite']],
      [[1, 'night'], [2, 'elite'], [3, 'night']],
      [[1, 'nook'], [2, 'shop'], [3, 'post']],
      [[2, 'boss']]
    ];
    layout.forEach(function (row, r) { row.forEach(function (cell) { touch(g, r, cell[0]).type = cell[1]; }); });
    var edges = [
      [0, 1, 0], [0, 2, 2], [0, 3, 4],
      [1, 0, 0], [1, 2, 2], [1, 4, 4],
      [2, 0, 1], [2, 2, 2], [2, 4, 3],
      [3, 1, 1], [3, 2, 2], [3, 3, 3],
      [4, 1, 1], [4, 2, 2], [4, 2, 1], [4, 3, 3],
      [5, 1, 1], [5, 2, 2], [5, 3, 3],
      [6, 1, 2], [6, 2, 2], [6, 3, 2]
    ];
    edges.forEach(function (e) { addEdge(g, e[0], e[1], e[2]); });
    if (act === 1) { g.grid[4][3].type = 'event'; }  // act 1 keeps just one elite in rows 4 and 5
    if (act === 1) { g.grid[4][1].type = 'elite'; }
    return g;
  }

  /* ------------------------------------------------------------------ boss and omens */
  function pickBoss(rng, act, rank) {
    var br = SB.data.bossRules || {};
    var pools = br.pools || { 1: ['pest_boss_rat_king', 'pest_boss_garden_hose'], 2: ['pest_boss_vacuum_mk9', 'pest_boss_spray_duelist'], 3: ['pest_boss_vet_carrier', 'pest_boss_red_dot', 'pest_boss_great_bath'] };
    var pool = (pools[act] || pools[String(act)] || []).slice();
    if (act === 3) {
      var final = (br.night9 && br.night9.finalId) || 'pest_boss_great_bath';
      var base = pool.filter(function (id) { return id !== final; });
      var pick = rng.pick(base);
      var r2 = rng.next();
      if (pool.indexOf(final) >= 0 && ((rank || 0) >= 5 || r2 < 1 / 3)) pick = final;
      return pick;
    }
    return rng.pick(pool);
  }
  function omenPool() { return (SB.data.meta && SB.data.meta.omens) || []; }
  function assignOmens(g, seed, act, bossless) {
    var used = {}, omens = omenPool(), idx = 0;
    allNodes(g).forEach(function (n) {
      idx++;
      if (n.type !== 'night' && n.type !== 'elite') return;
      var kind = n.type;
      var rng = rngFor(seed, 'omen', nodeId(act, n.r, n.c));
      var el = omens.filter(function (o) { return o.kinds.indexOf(kind) >= 0 && (o.minAct || 1) <= act; });
      if (kind === 'elite' && !rng.chance(0.3)) return;   // elites carry Hunter's Moon one time in three
      var fresh = el.filter(function (o) { return !used[o.id]; });
      var o = rng.weighted(fresh.length ? fresh : el, function (x) { return x.weight || 1; });
      if (o) { n.omen = o.id; used[o.id] = true; }
    });
  }

  /* ------------------------------------------------------------------ public: generateAct */
  function toPlain(g, seed, act, bossId) {
    var map = { act: act, rows: [], nodes: {}, edges: [], boss: bossId, bossNode: nodeId(act, BOSS_ROW, BOSS_COL), cols: COLS };
    for (var r = 0; r < ROWS; r++) {
      var ids = [];
      rowNodes(g, r).forEach(function (n) {
        var id = nodeId(act, n.r, n.c);
        ids.push(id);
        var node = { id: id, act: act, r: n.r, c: n.c, row: n.r, col: n.c, type: n.type };
        if (n.nightNo) node.nightNo = n.nightNo;
        if (n.omen) node.omen = n.omen;
        if (act === 1 && n.r === 0) node.soft = true;
        if (n.type === 'boss') node.bossId = bossId;
        node.children = childrenOf(g, n).map(function (x) { return nodeId(act, x.r, x.c); });
        node.parents = parentsOf(g, n).map(function (x) { return nodeId(act, x.r, x.c); });
        map.nodes[id] = node;
      });
      map.rows.push(ids);
    }
    g.edgeList.forEach(function (e) { map.edges.push([nodeId(act, e[0], e[1]), nodeId(act, e[0] + 1, e[2])]); });
    return map;
  }

  function generateAct(seed, act, opts) {
    opts = opts || {};
    var conf = cfg();
    var rank = opts.rank || 0;
    var attemptsUsed = 0, g = null, ok = false;
    for (var attempt = 0; attempt < 60; attempt++) {
      attemptsUsed = attempt + 1;
      var rng = rngFor(seed, 'map', act + ':' + attempt);
      g = buildGraph(rng);
      if (!g) continue;
      assignTypes(g, rng, act, conf);
      labelNights(g, act);
      if (validate(g, act).ok) { ok = true; break; }
    }
    var fallback = false;
    if (!ok) {
      g = templateGraph(act);
      labelNights(g, act);
      fallback = true;
    }
    var bossRng = rngFor(seed, 'map', act + ':boss');
    var bossId = pickBoss(bossRng, act, rank);
    assignOmens(g, seed, act);
    var map = toPlain(g, seed, act, bossId);
    map.attempts = attemptsUsed;
    map.fallback = fallback;
    return map;
  }

  // validates a plain map (as stored in run.map); used by tests and by the save loader
  function validatePlain(map) {
    var g = newGraph();
    var errs = [];
    Object.keys(map.nodes).forEach(function (id) {
      var n = map.nodes[id];
      touch(g, n.r, n.c).type = n.type;
    });
    map.edges.forEach(function (e) {
      var a = map.nodes[e[0]], b = map.nodes[e[1]];
      if (!a || !b) { errs.push('edge to unknown node'); return; }
      if (b.r !== a.r + 1 || (b.r !== BOSS_ROW && Math.abs(b.c - a.c) > 1)) errs.push('bad edge ' + e.join('>'));
      addEdge(g, a.r, a.c, b.c);
    });
    var v = validate(g, map.act);
    return { ok: v.ok && !errs.length, errors: errs.concat(v.errors) };
  }

  SB.map = {
    ROWS: ROWS, COLS: COLS, PATHS: PATHS,
    nodeId: nodeId,
    generateAct: generateAct,
    validate: validatePlain,
    fightRange: function (map) {
      var g = newGraph();
      Object.keys(map.nodes).forEach(function (id) { var n = map.nodes[id]; touch(g, n.r, n.c).type = n.type; });
      map.edges.forEach(function (e) { var a = map.nodes[e[0]], b = map.nodes[e[1]]; addEdge(g, a.r, a.c, b.c); });
      return fightRange(g);
    },
    templateAct: function (act) { var g = templateGraph(act); labelNights(g, act); return toPlain(g, 'template', act, pickBoss(rngFor('template', 'map', act), act, 0)); },
    countType: function (map, type) { var n = 0; Object.keys(map.nodes).forEach(function (id) { if (map.nodes[id].type === type) n++; }); return n; }
  };

  /* ------------------------------------------------------------------ run level plumbing */
  SB.run.generateMap = function (run) {
    run.map = generateAct(run.seed, run.act, { rank: run.rank });
    run.pos = null;
    run.bosses = run.bosses || {};
    run.bosses[run.act] = run.map.boss;
    return run.map;
  };
  // nodes the player may move to now
  SB.run.availableNodes = function (run) {
    if (!run || !run.map || run.status === 'over') return [];
    if (run.pos == null) return run.map.rows[0].slice();
    var cur = run.map.nodes[run.pos];
    return cur ? cur.children.slice() : [];
  };
})();
