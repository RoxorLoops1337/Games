// LoopDoku level generator: graded puzzle packs, every puzzle with exactly one solution and solvable by logic (no guessing).
// Usage: node tools/gen_levels.mjs [seed] > tools/levels.json      (then node tools/build.mjs)
// Techniques, in the order a human reaches for them (the hardest one a puzzle needs sets its tier):
//   A single      a row, column or region with one open square must take the performer
//   B blocker     a square is out when a performer there would leave another row, column or region with no open square
//   C squeeze     k regions that only live inside k rows (or columns) own those rows: everything else there is out; and the reverse
//   D what-if     a square is out when assuming a performer there leads (with A to C) to a dead end
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLAN = [
  // id, name, count, sizes, needs (highest technique), extra filter. Packs play in this order.
  { id: 'easy', name: 'Easy', count: 40, sizes: [5, 5, 6], top: 'B', maxB: 3 },
  { id: 'normal', name: 'Normal', count: 40, sizes: [6, 7, 7], top: 'B', minB: 3 },
  { id: 'chill', name: 'Chill XL', count: 30, sizes: [8, 9, 10], top: 'B', maxB: 8 },
  { id: 'hard', name: 'Hard', count: 40, sizes: [7, 8, 8], top: 'C', minC: 1 },
  { id: 'expert', name: 'Expert', count: 40, sizes: [8, 9, 9], top: 'C', minC: 3, minK: 2 },
  { id: 'terror', name: 'Terror', count: 30, sizes: [7, 8, 8], top: 'D', minD: 2 },
  { id: 'extreme', name: 'Extreme', count: 30, sizes: [9, 10, 10], top: 'D', minD: 2 },
  { id: 'melt', name: 'Meltdown', count: 20, sizes: [8, 8, 9], top: 'D', minD: 4 },
  { id: 'nightmare', name: 'Nightmare', count: 12, sizes: [10], top: 'D', minD: 3 },
];

// sfc32 seeded through splitmix32: independent streams per seed (the old additive generator made workers repeat each other)
function rng(seed) {
  let z = (seed ^ 0x9e3779b9) >>> 0;
  const mix = () => { z = (z + 0x9e3779b9) >>> 0; let t = z; t = Math.imul(t ^ (t >>> 16), 0x85ebca6b); t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35); return (t ^ (t >>> 16)) >>> 0; };
  let a = mix(), b = mix(), c = mix(), d = mix();
  return () => { const t = (((a + b) >>> 0) + d) >>> 0; d = (d + 1) >>> 0; a = b ^ (b >>> 9); b = (c + (c << 3)) >>> 0; c = (c << 21) | (c >>> 11); c = (c + t) >>> 0; return t / 4294967296; };
}

function makeTools(n, rnd) {
  const ri = (k) => Math.floor(rnd() * k);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function solution() {
    const p = [], used = new Array(n).fill(false);
    (function go(r) {
      if (r === n) return true;
      for (const c of shuffle([...Array(n).keys()])) {
        if (used[c] || (r > 0 && Math.abs(c - p[r - 1]) < 2)) continue;
        used[c] = true; p[r] = c;
        if (go(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return p;
  }
  function regions(sol) {
    const N = n * n, reg = new Array(N).fill(-1);
    for (let r = 0; r < n; r++) reg[r * n + sol[r]] = r;
    const w = [...Array(n)].map(() => 0.15 + rnd() * rnd() * 3);
    let left = N - n;
    while (left > 0) {
      const tot = w.reduce((a, b) => a + b, 0);
      let x = rnd() * tot, k = 0;
      while (k < n - 1 && x > w[k]) { x -= w[k]; k++; }
      const front = [];
      for (let i = 0; i < N; i++) {
        if (reg[i] !== k) continue;
        const r = (i / n) | 0, c = i % n;
        if (r > 0 && reg[i - n] < 0) front.push(i - n);
        if (r < n - 1 && reg[i + n] < 0) front.push(i + n);
        if (c > 0 && reg[i - 1] < 0) front.push(i - 1);
        if (c < n - 1 && reg[i + 1] < 0) front.push(i + 1);
      }
      if (!front.length) { w[k] = 0; if (w.every((v) => v === 0)) return null; continue; }
      reg[front[ri(front.length)]] = k; left--;
    }
    return reg;
  }
  return { solution, regions };
}

function countSolutions(n, reg, cap) {
  let count = 0;
  const colU = new Array(n).fill(false), regU = new Array(n).fill(false), p = [];
  (function go(r) {
    if (count >= cap) return;
    if (r === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      const k = reg[r * n + c];
      if (colU[c] || regU[k] || (r > 0 && Math.abs(c - p[r - 1]) < 2)) continue;
      colU[c] = regU[k] = true; p[r] = c;
      go(r + 1);
      colU[c] = regU[k] = false;
    }
  })(0);
  return count;
}

// ---- the graded logic solver ----
function solver(n, reg) {
  const N = n * n;
  const units = [];
  for (let r = 0; r < n; r++) units.push([...Array(n)].map((_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push([...Array(n)].map((_, r) => r * n + c));
  const regCells = [...Array(n)].map(() => []);
  for (let i = 0; i < N; i++) regCells[reg[i]].push(i);
  for (const rc of regCells) units.push(rc);
  const att = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) continue;
    const a = (i / n) | 0, b = i % n, c = (j / n) | 0, d = j % n;
    if (a === c || b === d || reg[i] === reg[j] || (Math.abs(a - c) <= 1 && Math.abs(b - d) <= 1)) att[i * N + j] = 1;
  }
  const combos = (arr, k) => { const out = []; (function go(s, acc) { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = s; i < arr.length; i++) { acc.push(arr[i]); go(i + 1, acc); acc.pop(); } })(0, []); return out; };
  // st: 0 open, 1 out, 2 performer. Returns false on contradiction.
  function place(st, i) { st[i] = 2; for (let j = 0; j < N; j++) if (st[j] === 0 && att[i * N + j]) st[j] = 1; }
  function dead(st) {
    for (const u of units) { let has = false, open = 0; for (const i of u) { if (st[i] === 2) { if (has) return true; has = true; } else if (st[i] === 0) open++; } if (!has && !open) return true; }
    return false;
  }
  function stepA(st) { for (const u of units) { let has = false, open = -1, cnt = 0; for (const i of u) { if (st[i] === 2) has = true; else if (st[i] === 0) { cnt++; open = i; } } if (!has && cnt === 1) { place(st, open); return true; } } return false; }
  function stepB(st) {
    for (let i = 0; i < N; i++) {
      if (st[i] !== 0) continue;
      for (const u of units) {
        let has = false, ok = false;
        for (const j of u) { if (st[j] === 2) { has = true; break; } if (st[j] === 0 && j !== i && !att[i * N + j]) { ok = true; break; } }
        if (!has && !ok && !u.includes(i)) { st[i] = 1; return true; }
      }
    }
    return false;
  }
  // C: k open regions confined to k rows/cols (and k rows/cols confined to k regions)
  function stepC(st, maxK) {
    const openRegs = [], openRows = [], openCols = [];
    const rowsOf = [], colsOf = [], regsOfRow = [], regsOfCol = [];
    for (let k = 0; k < n; k++) {
      const cells = regCells[k].filter((i) => st[i] === 0);
      if (regCells[k].some((i) => st[i] === 2)) continue;
      openRegs.push(k); rowsOf[k] = new Set(cells.map((i) => (i / n) | 0)); colsOf[k] = new Set(cells.map((i) => i % n));
    }
    for (let r = 0; r < n; r++) { const u = units[r]; if (u.some((i) => st[i] === 2)) continue; openRows.push(r); regsOfRow[r] = new Set(u.filter((i) => st[i] === 0).map((i) => reg[i])); }
    for (let c = 0; c < n; c++) { const u = units[n + c]; if (u.some((i) => st[i] === 2)) continue; openCols.push(c); regsOfCol[c] = new Set(u.filter((i) => st[i] === 0).map((i) => reg[i])); }
    for (let k = 1; k <= maxK; k++) {
      for (const set of combos(openRegs, k)) {
        for (const [of, lineCells] of [[rowsOf, (r) => units[r]], [colsOf, (c) => units[n + c]]]) {
          const lines = new Set(); for (const g of set) for (const x of of[g]) lines.add(x);
          if (lines.size !== k) continue;
          let changed = false;
          for (const L of lines) for (const i of lineCells(L)) if (st[i] === 0 && !set.includes(reg[i])) { st[i] = 1; changed = true; }
          if (changed) return k;
        }
      }
      for (const [open, regsOf, lineCells] of [[openRows, regsOfRow, (r) => units[r]], [openCols, regsOfCol, (c) => units[n + c]]]) {
        for (const set of combos(open, k)) {
          const rs = new Set(); for (const L of set) for (const g of regsOf[L]) rs.add(g);
          if (rs.size !== k) continue;
          const inLines = new Set(); for (const L of set) for (const i of lineCells(L)) inLines.add(i);
          let changed = false;
          for (const g of rs) for (const i of regCells[g]) if (st[i] === 0 && !inLines.has(i)) { st[i] = 1; changed = true; }
          if (changed) return k;
        }
      }
    }
    return 0;
  }
  function propagate(st, useC) {
    for (;;) {
      if (dead(st)) return false;
      if (stepA(st)) continue;
      if (stepB(st)) continue;
      if (useC && stepC(st, 4)) continue;
      return true;
    }
  }
  function stepD(st) {
    for (let i = 0; i < N; i++) {
      if (st[i] !== 0) continue;
      const t = st.slice(); place(t, i);
      if (!propagate(t, true)) { st[i] = 1; return true; }
    }
    return false;
  }
  // E: a what-if whose own reasoning may use what-ifs (two levels deep): only for the Brain Melt tier
  function propagateD(st) {
    for (;;) {
      if (!propagate(st, true)) return false;
      if (stepD(st)) continue;
      return true;
    }
  }
  function stepE(st) {
    for (let i = 0; i < N; i++) {
      if (st[i] !== 0) continue;
      const t = st.slice(); place(t, i);
      if (!propagateD(t)) { st[i] = 1; return true; }
    }
    return false;
  }
  function grade(useE) {
    const st = new Uint8Array(N);
    const g = { A: 0, B: 0, C: 0, D: 0, E: 0, maxK: 0, solved: false };
    for (;;) {
      if (dead(st)) return g;
      if (stepA(st)) { g.A++; continue; }
      if (stepB(st)) { g.B++; continue; }
      const k = stepC(st, 4);
      if (k) { g.C++; g.maxK = Math.max(g.maxK, k); continue; }
      if (stepD(st)) { g.D++; continue; }
      if (useE && stepE(st)) { g.E++; continue; }
      break;
    }
    g.solved = st.filter((v) => v === 2).length === n;
    return g;
  }
  return { grade };
}

function fits(g, t) {
  if (!g.solved) return false;
  const top = g.E ? 'E' : g.D ? 'D' : g.C ? 'C' : g.B ? 'B' : 'A';
  const order = 'ABCDE';
  if (order.indexOf(top) !== order.indexOf(t.top) && !(t.top === 'B' && top === 'A' && t.maxB !== undefined)) return false;
  if (t.maxB !== undefined && g.B > t.maxB) return false;
  if (t.minB !== undefined && g.B < t.minB) return false;
  if (t.minC !== undefined && g.C < t.minC) return false;
  if (t.minK !== undefined && g.maxK < t.minK) return false;
  if (t.minD !== undefined && g.D < t.minD) return false;
  if (t.minE !== undefined && g.E < t.minE) return false;
  if (t.minN !== undefined && g.B + g.C + g.D < t.minN) return false;
  return true;
}

function search(tier, n, seed, budgetMs) {
  const rnd = rng(seed), T = makeTools(n, rnd), t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const sol = T.solution(), reg = T.regions(sol);
    if (!reg || countSolutions(n, reg, 2) !== 1) continue;
    const g = solver(n, reg).grade(tier.top === 'E');
    if (!fits(g, tier)) continue;
    const map = new Map(); for (const k of reg) if (!map.has(k)) map.set(k, map.size);
    const rows = []; for (let r = 0; r < n; r++) rows.push(reg.slice(r * n, r * n + n).map((k) => 'ABCDEFGHIJ'[map.get(k)]).join(''));
    return { n, rows, sol, grade: g };
  }
  return null;
}

if (!isMainThread) {
  const { tier, n, seed, budgetMs } = workerData;
  parentPort.postMessage(search(tier, n, seed, budgetMs));
} else if (process.argv.includes('--race')) {
  // race mode: many workers hunt one tier at once and stream finds to a .jsonl file (node tools/gen_levels.mjs --race extreme 20 out.jsonl)
  const a = process.argv.slice(process.argv.indexOf('--race') + 1);
  const tier = PLAN.find((t) => t.id === a[0]), want = +a[1] || 20, file = a[2] || tier.id + '.jsonl';
  const seen = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).rows.join('')) : []);
  let attempt = Date.now() % 100000, live = 0;
  const cpus = +process.env.RACE_WORKERS || Math.max(2, os.cpus().length - 4);
  const spawn = () => {
    if (seen.size >= want) { if (!live) process.exit(0); return; }
    live++;
    const n = tier.sizes[attempt % tier.sizes.length];
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { tier, n, seed: (Math.random() * 4294967296) >>> 0 ^ (PLAN.indexOf(tier) * 2654435761 + (attempt++) * 40503), budgetMs: 120000 } });
    w.on('message', (res) => { live--; if (res && !seen.has(res.rows.join('')) && seen.size < want) { seen.add(res.rows.join('')); fs.appendFileSync(file, JSON.stringify({ n: res.n, rows: res.rows, sol: res.sol, g: [res.grade.A, res.grade.B, res.grade.C, res.grade.D, res.grade.maxK, res.grade.E] }) + String.fromCharCode(10)); process.stderr.write('found ' + seen.size + '/' + want + ' n=' + res.n + String.fromCharCode(10)); } spawn(); });
    w.on('error', () => { live--; spawn(); });
  };
  for (let c = 0; c < cpus; c++) spawn();
} else {
  const base = /^d+$/.test(process.argv[2] || '') ? +process.argv[2] : 20261008;
  const cpus = Math.max(2, os.cpus().length - 1);
  const jobs = [];
  const skip = process.argv.includes('--skip') ? process.argv[process.argv.indexOf('--skip') + 1].split(',') : [];
  for (const t of PLAN) if (!skip.includes(t.id)) for (let k = 0; k < t.count; k++) jobs.push({ t, k, n: t.sizes[k % t.sizes.length] });
  const out = Object.fromEntries(PLAN.map((t) => [t.id, []]));
  let next = 0, done = 0, attempt = 0;
  const seen = new Set();
  await new Promise((resolve) => {
    const launch = () => {
      if (next >= jobs.length) { if (done >= jobs.length) resolve(); return; }
      const job = jobs[next++];
      const run = () => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { tier: job.t, n: job.n, seed: base + (attempt++) * 7919, budgetMs: 90000 } });
        w.on('message', (res) => {
          const key = res && res.rows.join('');
          if (!res || seen.has(key)) { run(); return; }
          seen.add(key);
          out[job.t.id].push({ n: res.n, rows: res.rows, sol: res.sol, g: [res.grade.A, res.grade.B, res.grade.C, res.grade.D, res.grade.maxK] });
          done++;
          process.stderr.write(`${job.t.id} ${out[job.t.id].length}/${job.t.count} n=${res.n} g=${JSON.stringify(res.grade)}\n`);
          launch();
        });
        w.on('error', (e) => { process.stderr.write('worker error ' + e.message + '\n'); run(); });
      };
      run();
    };
    for (let c = 0; c < cpus; c++) launch();
  });
  for (const t of PLAN) out[t.id].sort((a, b) => a.n - b.n || (a.g[1] + a.g[2] * 3 + a.g[3] * 9) - (b.g[1] + b.g[2] * 3 + b.g[3] * 9));
  console.log(JSON.stringify({ plan: PLAN.map(({ id, name }) => ({ id, name })), packs: out }));
}
