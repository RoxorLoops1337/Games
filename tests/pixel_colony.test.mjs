// Pixel Colony: headless suite.
//
// pixel_colony/index.html is one self-contained file. This harness pulls the
// inline script, stubs a DOM plus a no-op 2d context, injects a test-only
// expose hook before the boot call and evals it, then drives the real rules,
// level generator, boosters, save and render code.
// Run: node tests/pixel_colony.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'pixel_colony', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.stack || e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }

const BOOT = '\nboot();\n';
const EXPOSE = `
__out.api = {
  PAL, ART, SAVE_KEY, MAX_SLOTS, PRICE, HINTS, parseArt, newBoard, avail, pickCell, doCell, runSquad, availCounts,
  artIndex, levelParams, makeLevel, snapshot, restore, resolve, tapStack, levelStatus, starsFor, isHidden,
  loadSave, writeSave, defaultSave, startLevel, onTapStack, update, draw, act, toTitle, openGallery, layout, fit,
  useUndo, useSlot, usePeek, winLevel, loseLevel, drawThumb, V, LAY,
  get L(){ return L; }, get phase(){ return phase; }, get SAVE(){ return SAVE; }, set SAVE(v){ SAVE = v; },
};
`;

function makeSandbox(opts){
  opts = opts || {};
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, {
    get(t, p){
      if (p === 'measureText') return () => ({ width: 30 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      if (typeof p === 'string' && p !== 'then' && !(p in t)) return () => {};
      return t[p];
    },
    set(t, p, v){ t[p] = v; return true; },
  });
  const mkEl = () => ({
    style: {}, textContent: '', innerHTML: '', width: 64, height: 64, className: '', dataset: {}, disabled: false,
    getContext: () => ctxStub,
    addEventListener(){}, removeEventListener(){}, appendChild(){},
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
  });
  const nodes = {};
  const store = Object.assign({}, opts.store || {});
  const sandbox = {
    document: {
      getElementById: (id) => (nodes[id] || (nodes[id] = mkEl())),
      createElement: () => mkEl(),
      addEventListener(){},
    },
    window: { innerWidth: 390, innerHeight: 800, devicePixelRatio: 2, addEventListener(){} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    requestAnimationFrame: () => {},
    __out: {},
  };
  return { sandbox, store, nodes };
}

let SRC = null;
function source(){
  if (SRC) return SRC;
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error('no inline script found');
  const src = blocks.join('\n');
  if (!src.includes(BOOT)) throw new Error('boot anchor missing from game script');
  SRC = src.replace(BOOT, EXPOSE + BOOT);
  return SRC;
}
function boot(opts){
  const { sandbox, store, nodes } = makeSandbox(opts);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', 'setTimeout', '__out', source())(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined, sandbox.requestAnimationFrame,
    (fn) => fn(), sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store; api._nodes = nodes;
  return api;
}
const step = (api, secs) => { for (let t = 0; t < secs; t += 1 / 60) { api.update(1 / 60); api.draw(); } };

/* Replays the solution the generator recorded: ids were handed out in solution order. */
function replay(api, L){
  let guard = 0;
  while (L.B.total > 0 && guard++ < 500){
    let best = -1, bestId = Infinity;
    L.stacks.forEach((s, k) => { if (s.length && s[0].id < bestId){ bestId = s[0].id; best = k; } });
    assert(best >= 0, 'ran out of colonies with pixels left');
    const r = api.tapStack(L, best);
    assert(r.ok, 'tap refused: ' + r.why);
    assert(L.slots.every((q) => !q), `solution move left ants waiting (level ${L.n} ${L.mode})`);
  }
  return api.levelStatus(L);
}

const api = boot();

test('every picture is well formed', () => {
  const ids = new Set();
  for (const a of api.ART){
    assert(!ids.has(a.id), 'duplicate id ' + a.id); ids.add(a.id);
    const w = a.rows[0].length;
    a.rows.forEach((r, y) => {
      assert(r.length === w, `${a.id} row ${y} is ${r.length} wide, expected ${w}`);
      for (const ch of r) assert(ch === '.' || (a.pal || api.PAL)[ch], `${a.id} uses unknown colour '${ch}'`);
    });
    const P = api.parseArt(a);
    assert(P.keys.length >= 2, a.id + ' needs at least two colours');
    assert(P.w <= 40 && P.h <= 40, a.id + ' too big');
    assert(P.keys.length <= 12, a.id + ' has too many colours for the colonies');
    assert(P.cell.some((c) => c >= 0), a.id + ' is empty');
  }
  assert(api.ART.length >= 24, 'expected a full gallery');
  const big = api.ART.slice(4);
  assert(big.every((a) => { const P = api.parseArt(a); return P.w >= 24 || P.h >= 24; }), 'after the tutorial every picture is big');
});

test('feast: only pixels touching open air are reachable', () => {
  const P = api.parseArt(api.ART.find((a) => a.id === 'avocado'));
  const B = api.newBoard(P, 'feast');
  const mid = 22 * P.w + 13, pit = P.cell[mid];
  assert(!api.avail(B, mid), 'the pit is buried at the start');
  for (let prog = true; prog;){
    prog = false;
    for (let c = 0; c < P.keys.length; c++) if (c !== pit && api.runSquad(B, c, 999).length) prog = true;
  }
  assert(api.availCounts(B)[pit] > 0, 'the pit is reachable once the flesh around it is eaten');
  const fresh = api.newBoard(P, 'feast');
  for (let i = 0; i < P.cell.length; i++){
    if (P.cell[i] < 0) continue;
    const x = i % P.w, y = (i / P.w) | 0;
    const air = (j) => P.cell[j] < 0 && !!fresh.open[j];
    const expect = x === 0 || y === 0 || x === P.w - 1 || y === P.h - 1 || air(i - 1) || air(i + 1) || air(i - P.w) || air(i + P.w);
    assert(api.avail(fresh, i) === expect, `feast cell ${i}: reachable only next to open air`);
  }
});

test('build: blocks need ground, air below, or a placed neighbour', () => {
  const P = api.parseArt(api.ART.find((a) => a.id === 'mushroom'));
  const B = api.newBoard(P, 'build');
  const w = P.w, h = P.h;
  for (let i = 0; i < P.cell.length; i++){
    if (P.cell[i] < 0) continue;
    const y = (i / w) | 0;
    const below = i + w;
    const expect = y === h - 1 || P.cell[below] < 0;
    assert(api.avail(B, i) === expect, `cell ${i} availability wrong at start`);
  }
  // the cap top can't be placed until the stalk and cap are up
  assert(!api.avail(B, P.w * 0 + 5), 'top of cap floats at the start');
});

test('every generated level replays to a win with zero waiting (both modes, levels 1-80)', () => {
  for (const mode of ['feast', 'build']){
    for (let n = 1; n <= 80; n++){
      const L = api.makeLevel(n, mode);
      const total = L.B.total;
      const sum = L.stacks.flat().reduce((s, q) => s + q.n, 0);
      assert(sum === total, `level ${n} ${mode}: colonies carry ${sum} for ${total} pixels`);
      for (const c of L.P.keys.keys()){
        const need = L.B.left[c];
        const have = L.stacks.flat().filter((q) => q.c === c).reduce((s, q) => s + q.n, 0);
        assert(need === have, `level ${n} ${mode}: colour ${c} mismatch`);
      }
      assert(replay(api, L) === 'won', `level ${n} ${mode} did not clear`);
    }
  }
});

test('levels are deterministic', () => {
  const a = api.makeLevel(17, 'feast'), b = api.makeLevel(17, 'feast');
  assert(JSON.stringify(a.stacks.map((s) => s.map((q) => [q.c, q.n]))) === JSON.stringify(b.stacks.map((s) => s.map((q) => [q.c, q.n]))), 'same stacks');
  assert(api.artIndex(24) !== api.artIndex(23), 'no back-to-back repeats after the tour');
});

test('any tap order clears the board when spots are unlimited', () => {
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const mode of ['feast', 'build']){
    for (const n of [1, 5, 12, 23, 40]){
      const L = api.makeLevel(n, mode);
      L.slots = new Array(200).fill(null);
      let guard = 0;
      while (L.stacks.some((s) => s.length) && guard++ < 500){
        const opts = L.stacks.map((s, k) => (s.length ? k : -1)).filter((k) => k >= 0);
        api.tapStack(L, opts[Math.floor(rnd() * opts.length)]);
      }
      assert(L.B.total === 0, `level ${n} ${mode}: ${L.B.total} pixels left`);
      assert(L.slots.every((q) => !q), 'no ants left waiting');
    }
  }
});

test('greedy play wins most levels (difficulty sanity)', () => {
  const rate = {};
  for (const mode of ['feast', 'build']){
    let wins = 0, total = 0;
    for (let n = 1; n <= 40; n++){
      const L = api.makeLevel(n, mode);
      let st = 'play', guard = 0;
      while (st === 'play' && guard++ < 500){
        const av = api.availCounts(L.B);
        let best = -1, bestScore = -Infinity;
        L.stacks.forEach((s, k) => { if (s.length){ const sc = Math.min(av[s[0].c], s[0].n) - s[0].n * 0.01; if (sc > bestScore){ bestScore = sc; best = k; } } });
        if (best < 0) break;
        api.tapStack(L, best);
        st = api.levelStatus(L);
      }
      total++; if (st === 'won') wins++;
    }
    rate[mode] = wins / total;
    assert(wins / total >= 0.6, `${mode}: greedy only wins ${wins}/${total}`);
  }
  console.log(`  greedy win rate: feast ${(rate.feast * 100) | 0}%, build ${(rate.build * 100) | 0}%`);
});

test('jam, rescue with an extra spot, undo', () => {
  const g = boot();
  // tap colonies that can't reach anything until the colony jams
  let L = null, before = 0;
  for (let n = 3; n <= 40 && !(L && g.levelStatus(L) === 'lost'); n++){
    g.startLevel('feast', n);
    L = g.L; before = L.B.total;
    let guard = 0;
    while (g.levelStatus(L) === 'play' && guard++ < 200){
      const av = g.availCounts(L.B);
      let k = L.stacks.findIndex((s) => s.length && av[s[0].c] === 0);
      if (k < 0) k = L.stacks.findIndex((s) => s.length);
      g.onTapStack(k);
    }
  }
  assert(g.levelStatus(L) === 'lost', 'forced a jam');
  step(g, 3);
  assert(g.phase === 'lost', 'lose screen after ants settle, got ' + g.phase);
  const slots = L.slots.length, inv = g.SAVE.inv.slot;
  g.act('rescue');
  assert(g.phase === 'play' && L.slots.length === slots + 1 && L.continued, 'extra spot continues the level');
  assert(g.SAVE.inv.slot === inv - 1, 'spent a spot booster');
  assert(g.starsFor(L) === 1, 'a rescued level is worth one star');
  // undo walks all the way back
  g.SAVE.inv.undo = 999;
  while (L.history.length) g.useUndo();
  assert(L.B.total === before, 'undo restores every pixel');
  assert(L.slots.length === slots + 1, 'the bought spot survives undo');
  assert(L.slots.every((q) => !q), 'no ants waiting after full undo');
});

test('boosters buy with coins when the stock runs out', () => {
  const g = boot();
  g.startLevel('build', 3);
  g.SAVE.inv.peek = 0; g.SAVE.coins = 5;
  assert(!g.usePeek(), 'too poor to peek');
  g.SAVE.coins = 100;
  assert(g.usePeek() && g.L.peek && g.SAVE.coins === 100 - g.PRICE.peek, 'peek bought with coins');
  assert(!g.isHidden(g.L, 0, 5), 'peek reveals deep colonies');
});

test('full run through the UI: win, rewards, save, gallery, render every phase', () => {
  const g = boot();
  g.toTitle(); step(g, 0.5);
  for (const mode of ['feast', 'build']){
    g.act(mode);
    const L = g.L;
    assert(g.phase === 'play' && L.n === 1, 'level 1 started');
    let guard = 0;
    while (L.B.total > 0 && guard++ < 300){
      let best = -1, bestId = Infinity;
      L.stacks.forEach((s, k) => { if (s.length && s[0].id < bestId){ bestId = s[0].id; best = k; } });
      g.onTapStack(best);
      step(g, 0.1);
    }
    assert(L.B.total === 0, 'board cleared');
    step(g, 4);
    assert(g.V.ants.length === 0, 'all ants went home');
    assert(g.phase === 'won', 'won, got ' + g.phase);
    assert(g.SAVE.lvl[mode] === 2, 'progress saved');
    assert(g.SAVE.coins > 0, 'coins awarded');
    assert(g.SAVE.done.heart[mode] === 3, 'perfect replay earns three stars');
    g.act('next');
    assert(g.L.n === 2 && g.L.mode === mode, 'next level');
    step(g, 0.3);
    g.act('home');
  }
  g.act('gallery'); step(g, 0.2);
  const saved = JSON.parse(g._store[g.SAVE_KEY]);
  assert(saved.lvl.feast === 2 && saved.lvl.build === 2, 'save written');
  // reload from the save
  const h = boot({ store: g._store });
  assert(h.SAVE.lvl.feast === 2 && h.SAVE.done.heart, 'save loads back');
});

test('corrupt save falls back to defaults', () => {
  const g = boot({ store: { pixelcolony_v1: '{nope' } });
  assert(g.SAVE.lvl.feast === 1 && g.SAVE.inv.undo === 3, 'defaults');
  const h = boot({ store: { pixelcolony_v1: JSON.stringify({ lvl: { build: 9 } }) } });
  assert(h.SAVE.lvl.build === 9 && h.SAVE.lvl.feast === 1 && h.SAVE.inv.slot === 2, 'partial save merges');
});

test('layout fits every level on a phone and a desktop', () => {
  const g = boot();
  for (const mode of ['feast', 'build']){
    for (let n = 1; n <= 30; n++){
      g.startLevel(mode, n);
      const { LAY } = g;
      assert(LAY.cs >= 6, 'cells readable');
      assert(LAY.bx >= 0 && LAY.bx + LAY.bw <= 390, `board fits width (level ${n})`);
      assert(LAY.by + LAY.bh < LAY.slots[0].y, 'board above the spots');
      assert(LAY.slots[LAY.slots.length - 1].x + LAY.slots[0].s <= 390, 'spots fit');
      const last = LAY.stacks[LAY.stacks.length - 1];
      assert(last.x + last.w <= 390 && LAY.stacks[0].x >= 0, 'stacks fit');
      g.draw();
    }
  }
});

console.log(`pixel_colony: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
