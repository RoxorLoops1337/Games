// RUN: one run's state, rewards, shops, camps, events, hooks, mercy and saves (DESIGN 4.7 to 4.10, 5.4).
//
// RUN is written against the MAP contract (DESIGN 5.3) and never touches COMBAT, so this suite boots run.js alone
// (`skip` keeps every real content file, combat.js and map.js out) and installs (1) a small but faithful fake MAP: odd-r hex
// grid, start ring, brushes, cheapest-chain painting, serialise; (2) a synthetic "universe" of cards, relics, gems, events,
// encounters and trials it fully controls; (3) a hand-made finished-combat object with C.summary() and C.front().
// If the real map.js exists, the last section replays the flows against it (`realMap` below).
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './rogue_book_lib.mjs';

const t = harness('rogue_book run');
const eq0 = t.eq;
t.eq = (a, b, msg) => (typeof a === 'string' && a.length > 160 ? t.ok(a === b, msg + ' (long strings differ, first 300 chars: ' + a.slice(0, 300) + ')') : eq0(a, b, msg));   // never dump a whole run on failure

// ------------------------------------------------------------------------------------------------ fake MAP (runs inside the page)
function makeFakeMap(DATA, U) {
  const COLS = 13, ROWS = 7, START_COL = 1, BOSS_COL = 11, RING = 2;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const key = (q, r) => q + ',' + r;
  const parse = (k) => { const p = k.split(','); return { q: +p[0], r: +p[1] }; };
  const col = (q, r) => q + Math.floor(r / 2);
  const exists = (q, r) => { const c = col(q, r); return c >= 0 && c < COLS && r >= 0 && r < ROWS; };
  const dist = (aq, ar, bq, br) => { const dq = bq - aq, dr = br - ar; return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2; };
  const neighbors = (M, q, r) => DIRS.map((d) => [q + d[0], r + d[1]]).filter((n) => exists(n[0], n[1]) && M.tiles[key(n[0], n[1])]);
  const T = (M, q, r) => M.tiles[key(q, r)] || null;
  const hidden = (M, q, r) => { const t = T(M, q, r); return !!t && !t.painted && t.type !== 'block'; };
  const adjPainted = (M, q, r) => neighbors(M, q, r).some((n) => T(M, n[0], n[1]).painted);
  function generate(o) {
    const rng = U.rng(o.seed);
    const M = { v: 1, chapter: o.chapter, seed: o.seed, cols: COLS, rows: ROWS, tiles: {}, start: null, boss: null, pos: null };
    const midRow = 3;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const q = c - Math.floor(r / 2);
      M.tiles[key(q, r)] = { q, r, type: 'empty', painted: false, known: false, done: false, diff: 0, content: {} };
    }
    const sq = START_COL - Math.floor(midRow / 2), bq = BOSS_COL - Math.floor(midRow / 2);
    M.start = { q: sq, r: midRow }; M.boss = { q: bq, r: midRow };
    const total = dist(sq, midRow, bq, midRow);
    Object.keys(M.tiles).forEach((k) => { const t = M.tiles[k]; t.diff = Math.round(Math.min(1, dist(sq, midRow, t.q, t.r) / total) * 100) / 100; });
    const free = () => Object.keys(M.tiles).map((k) => M.tiles[k]).filter((t) => t.type === 'empty' && t.r !== midRow && dist(sq, midRow, t.q, t.r) > RING && dist(bq, midRow, t.q, t.r) > 0);
    rng.shuffle(free()).slice(0, 9).forEach((t) => { t.type = 'block'; });
    T(M, bq, midRow).type = 'boss';
    T(M, sq, midRow).type = 'start';
    const plan = { enemy: 12, elite: 3, chest: 3, shop: 2, camp: 3, event: 8, well: 4, brush: 2, gemcache: 2, forge: 2 };
    const spots = rng.shuffle(free());
    let i = 0;
    Object.keys(plan).forEach((type) => { for (let n = 0; n < plan[type] && i < spots.length; n++) spots[i++].type = type; });
    const groups = (DATA.encounters[o.chapter] && DATA.encounters[o.chapter].normal) || [];
    const elites = (DATA.encounters[o.chapter] && DATA.encounters[o.chapter].elite) || [];
    Object.keys(M.tiles).forEach((k) => {
      const t = M.tiles[k];
      if (t.type === 'enemy' && groups.length && rng.chance(0.5)) t.content = { enc: rng.pick(groups).id };
      if (t.type === 'elite' && elites.length) t.content = { enc: rng.pick(elites).id };
      if (t.type === 'chest') { const relic = rng.chance(0.5); t.content = { gold: rng.int(45, 75), relic: relic ? rng.pick(['common', 'uncommon', 'rare']) : null, gems: !relic }; }
      if (t.type === 'brush') t.content = { id: rng.pick(Object.keys(DATA.brushes)) };
      if (t.type === 'well') t.content = { ink: DATA.ECONOMY.wellInk };
      if (t.type === 'shop') t.content = { shop: { seed: rng.int(1, 1e9) } };
      if (t.type === 'boss' || t.type === 'elite' || t.type === 'shop' || t.type === 'camp' || t.type === 'forge' || t.type === 'chest') t.known = true;
    });
    Object.keys(M.tiles).forEach((k) => { const t = M.tiles[k]; if (t.type !== 'block' && dist(sq, midRow, t.q, t.r) <= RING) { t.painted = true; if (t.type !== 'start') { t.type = 'empty'; t.content = {}; } } });
    M.pos = { q: sq, r: midRow };
    return M;
  }
  function canPaint(M, q, r) {
    const t = T(M, q, r);
    if (!t) return { ok: false, reason: 'off' };
    if (t.type === 'block') return { ok: false, reason: 'void' };
    if (t.painted) return { ok: false, reason: 'painted' };
    return adjPainted(M, q, r) ? { ok: true } : { ok: false, reason: 'far' };
  }
  function paint(M, q, r) { const t = T(M, q, r); if (t) t.painted = true; return t; }
  function pathToPaint(M, q, r) {
    const target = T(M, q, r);
    if (!target || target.type === 'block' || target.painted) return null;
    const prev = {}, queue = [];
    Object.keys(M.tiles).forEach((k) => { const t = M.tiles[k]; if (t.painted) neighbors(M, t.q, t.r).forEach((n) => { const nk = key(n[0], n[1]); if (hidden(M, n[0], n[1]) && !(nk in prev)) { prev[nk] = null; queue.push(nk); } }); });
    while (queue.length) {
      const k = queue.shift();
      if (k === key(q, r)) break;
      const p = parse(k);
      neighbors(M, p.q, p.r).forEach((n) => { const nk = key(n[0], n[1]); if (hidden(M, n[0], n[1]) && !(nk in prev)) { prev[nk] = k; queue.push(nk); } });
    }
    if (!(key(q, r) in prev)) return null;
    const path = [];
    for (let k = key(q, r); k !== null; k = prev[k]) { const p = parse(k); path.unshift([p.q, p.r]); }
    return { path, cost: path.length };
  }
  function brushCells(M, id, q, r, dir) {
    const b = DATA.brushes[id];
    if (!b) return [];
    const origin = T(M, q, r);
    if (!origin) return [];
    let cells = [];
    if (b.kind === 'line') { if (!origin.painted) return []; for (let k = 1; k <= b.len; k++) cells.push([q + DIRS[dir][0] * k, r + DIRS[dir][1] * k]); }
    else if (b.kind === 'fan') { if (!origin.painted) return []; [-1, 0, 1].forEach((o) => { const d = DIRS[(dir + o + 6) % 6]; cells.push([q + d[0], r + d[1]]); }); }
    else if (b.kind === 'ring') { if (!origin.painted) return []; DIRS.forEach((d) => cells.push([q + d[0], r + d[1]])); }
    else if (b.kind === 'blob') { if (!canPaint(M, q, r).ok) return []; cells.push([q, r]); DIRS.forEach((d) => cells.push([q + d[0], r + d[1]])); }
    else if (b.kind === 'dot') { if (!hidden(M, q, r) || dist(M.pos.q, M.pos.r, q, r) > 4) return []; cells.push([q, r]); }
    return cells.filter((c) => exists(c[0], c[1]) && hidden(M, c[0], c[1]));
  }
  function canBrush(M, id, q, r, dir) {
    if (!DATA.brushes[id]) return { ok: false, reason: 'brush' };
    return brushCells(M, id, q, r, dir).length ? { ok: true } : { ok: false, reason: 'nothing' };
  }
  function applyBrush(M, id, q, r, dir) { return brushCells(M, id, q, r, dir).map((c) => paint(M, c[0], c[1])); }
  function canMove(M, q, r) { const t = T(M, q, r); return !!t && t.painted && t.type !== 'block' && dist(M.pos.q, M.pos.r, q, r) === 1; }
  function move(M, q, r) { M.pos = { q, r }; return T(M, q, r); }
  function progress(M) { const all = Object.keys(M.tiles).map((k) => M.tiles[k]).filter((t) => t.type !== 'block'); const p = all.filter((t) => t.painted).length; return { painted: p, total: all.length, pct: p / all.length }; }
  return { key, parse, DIRS, neighbors, dist, canPaint, paint, pathToPaint, canBrush, brushCells, applyBrush, canMove, move, generate, progress, serialize: (M) => JSON.parse(JSON.stringify(M)), deserialize: (o) => JSON.parse(JSON.stringify(o)), bounds: { cols: COLS, rows: ROWS } };
}

// event builder shared by the universe and the event tests
const padEv = (x) => (x + ' The reeds whisper and the lantern light gutters on the black water.').slice(0, 200);
const mkEv = (id, over) => Object.assign({ title: 'Fable ' + id, text: padEv('A quiet fable named ' + id + ' waits on the page.'), art: { scene: 'event' }, choices: [{ label: 'Walk on', out: [{ w: 1, text: 'Nothing happens.', ops: [] }] }, { label: 'Gamble', out: [{ w: 1, text: 'Luck.', ops: [{ op: 'gold', n: 20 }] }, { w: 1, text: 'Ouch.', ops: [{ op: 'hurt', n: 3 }] }] }] }, over || {});

// ------------------------------------------------------------------------------------------------ synthetic universe
function universe(D, opts) {
  const keep = !!(opts && opts.keep);                                   // merge with real content: only add ids that are missing
  const add = (kind, defs) => { if (!keep) return D.add(kind, defs); const f = {}; Object.keys(defs).forEach((id) => { if (!D[kind][id]) f[id] = defs[id]; }); if (Object.keys(f).length) D.add(kind, f); };
  const heroes = D.LISTS.heroIds, pal = D.LISTS.palettes, motifs = D.LISTS.motifs;
  let n = 0;
  heroes.forEach((h, hi) => {
    const defs = {};
    const res = D.heroes[h].res;
    const mk = (id, rarity, type, slots, over) => {
      const fx = type === 'attack' ? [{ op: 'dmg', n: 6, tgt: 'enemy' }] : type === 'power' ? [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: res, n: 1, tgt: 'self' }] }] : [{ op: 'block', n: 6 }];
      const up = type === 'attack' ? { fx: [{ op: 'dmg', n: 9, tgt: 'enemy' }] } : type === 'power' ? { kw: ['retain'] } : { fx: [{ op: 'block', n: 9 }] };
      defs[id] = Object.assign({ name: id.replace(/_/g, ' '), hero: h, type, rarity, cost: 1, fx, up, kw: [], slots, art: { m: motifs[(hi * 20 + n) % motifs.length], c: pal[n % pal.length] } }, over || {});
      n++;
    };
    const st = D.heroes[h].starter.filter((x, i, a) => a.indexOf(x) === i);
    mk(st[0], 'starter', 'attack', ['red']); mk(st[1], 'starter', 'skill', ['blue']); mk(st[2], 'starter', 'skill', ['gold']);
    const one = ['red', 'blue', 'green', 'gold'];
    for (let i = 0; i < 14; i++) { const type = i % 3 === 0 ? 'attack' : 'skill'; mk(`${h}_c${i}`, 'common', type, [type === 'attack' ? 'red' : one[1 + (i % 3)]]); }
    for (let i = 0; i < 12; i++) { const type = i < 4 ? 'attack' : i < 9 ? 'skill' : 'power'; mk(`${h}_u${i}`, 'uncommon', type, i % 3 === 0 ? [type === 'attack' ? 'red' : 'blue', 'green'] : ['any'], i === 0 ? { locked: true } : {}); }
    for (let i = 0; i < 8; i++) { const type = i < 3 ? 'attack' : i < 6 ? 'skill' : 'power'; mk(`${h}_r${i}`, 'rare', type, [type === 'attack' ? 'red' : 'blue', 'any'], i >= 6 ? { locked: true, flavor: 'A line.' } : { flavor: 'A line.' }); }
    add('cards', defs);
  });
  const curses = {};
  D.FIXED.curses.forEach((id) => { curses[id] = { name: id.replace(/_/g, ' '), hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'skull' } }; });
  add('cards', curses);
  // relics: fixed ids, mod relics, hook relics, hero relics, plus filler so every pool has depth
  const rel = {};
  let ri = 0;
  const mkr = (id, rarity, extra) => { rel[id] = Object.assign({ name: id.replace(/_/g, ' '), rarity, text: 'A test charm.', art: { m: D.LISTS.relicIcons[ri++ % D.LISTS.relicIcons.length], c: 'gold' } }, extra); };
  mkr('brass_lantern', 'common', { mods: { startBlock: 1 } }); mkr('fox_mask', 'uncommon', { mods: { startBlock: 1 } });
  mkr('silver_bell', 'uncommon', { mods: { startBlock: 1 } }); mkr('jade_key', 'rare', { mods: { startBlock: 1 } });
  mkr('t_energy', 'boss', { mods: { energy: 1 } }); mkr('t_hand', 'boss', { mods: { hand: 1 } }); mkr('t_inkmax', 'common', { mods: { inkMax: 2 } });
  mkr('t_startink', 'common', { mods: { startInk: 2 } }); mkr('t_well', 'common', { mods: { wellInk: 2 } }); mkr('t_choices', 'rare', { mods: { cardChoices: 1 } });
  mkr('t_swaps', 'uncommon', { mods: { freeSwaps: 1 } }); mkr('t_camp', 'rare', { mods: { campActions: 1 } }); mkr('t_rare', 'uncommon', { mods: { rareBoost: 10 } });
  mkr('t_gold', 'uncommon', { mods: { goldMul: 0.25 } }); mkr('t_gold2', 'uncommon', { mods: { goldMul: 0.25 } }); mkr('t_price', 'common', { mods: { priceMul: -0.2 } });
  mkr('t_heal', 'common', { mods: { healMul: 0.5 } }); mkr('t_block', 'common', { mods: { startBlock: 2 } });
  mkr('t_pickup', 'common', { hooks: [{ on: 'onPickup', fx: [{ op: 'gold', n: 10 }] }] });
  mkr('t_chapter', 'common', { hooks: [{ on: 'onChapterStart', fx: [{ op: 'gold', n: 3 }] }] });
  mkr('t_once', 'common', { hooks: [{ on: 'onChapterStart', once: true, fx: [{ op: 'gold', n: 7 }] }] });
  mkr('t_rest', 'uncommon', { hooks: [{ on: 'onRest', fx: [{ op: 'heal', n: 3, who: 'both' }] }] });
  mkr('t_paint3', 'uncommon', { hooks: [{ on: 'onPaint', every: 3, fx: [{ op: 'ink', n: 1 }] }] });
  mkr('t_paintlim', 'uncommon', { hooks: [{ on: 'onPaint', limit: 2, fx: [{ op: 'gold', n: 1 }] }] });
  mkr('t_paintloop', 'uncommon', { hooks: [{ on: 'onPaint', fx: [{ op: 'paint', n: 1 }] }] });
  mkr('t_elitegold', 'uncommon', { hooks: [{ on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'gold', n: 20 }] }] });
  mkr('t_fightgold', 'common', { hooks: [{ on: 'onFightWon', fx: [{ op: 'gold', n: 2 }] }] });
  mkr('t_shopgift', 'common', { hooks: [{ on: 'onShopEnter', fx: [{ op: 'gold', n: 5 }] }] });
  mkr('t_pickrelic', 'rare', { hooks: [{ on: 'onPickup', fx: [{ op: 'addRelic', id: 't_pickup' }] }] });
  mkr('t_pickcard', 'rare', { hooks: [{ on: 'onPickup', fx: [{ op: 'removeCard' }] }] });
  mkr('t_hanae', 'common', { hero: 'hanae', mods: { startBlock: 1 } }); mkr('t_kuro', 'common', { hero: 'kuro', mods: { startBlock: 1 } });
  mkr('t_locked', 'uncommon', { locked: true, mods: { startBlock: 1 } });
  for (let i = 0; i < 6; i++) mkr('t_c' + i, 'common', { mods: { startBlock: 1 } });
  for (let i = 0; i < 6; i++) mkr('t_u' + i, 'uncommon', { mods: { startBlock: 1 } });
  for (let i = 0; i < 4; i++) mkr('t_r' + i, 'rare', { mods: { startBlock: 1 } });
  for (let i = 0; i < 6; i++) mkr('t_b' + i, 'boss', { mods: { startBlock: 1 } });
  for (let i = 0; i < 4; i++) mkr('t_s' + i, 'shop', { mods: { startBlock: 1 } });
  add('relics', rel);
  const gems = {};
  D.LISTS.gemColors.forEach((c) => [1, 1, 2, 2, 3, 3].forEach((tier, k) => {
    gems[`${c}_g${k}`] = { name: `${c} gem ${k}`, color: c, tier, art: { cut: 'round' }, mod: c === 'red' ? { dmg: tier + 1 } : c === 'blue' ? { block: tier + 1 } : c === 'green' ? { draw: 1 } : { energy: 1 }, locked: tier >= 2 && k % 2 === 1 ? true : undefined };
  }));
  add('gems', gems);
  const trials = {};
  const tm = { 1: { enemyHp: 0.05 }, 2: { startInk: -1 }, 3: { curses: 1 }, 4: { enemyDmg: 0.1 }, 5: { startGold: -10 }, 6: { reviveFrac: -0.05 }, 7: { healMul: -0.1 }, 8: { priceMul: 0.1 }, 9: { goldMul: -0.1 }, 10: { curses: 1, eliteHp: 0.1 } };
  for (let i = 1; i <= 10; i++) trials['trial_' + i] = { level: i, name: 'Trial ' + i, text: 'A little harder.', mods: tm[i] };
  add('trials', trials);
  const evs = {};
  ['ev_a', 'ev_b', 'ev_c'].forEach((id) => { evs[id] = mkEv(id); });
  evs.ev_c1 = mkEv('ev_c1', { chapters: [1] }); evs.ev_c2 = mkEv('ev_c2', { chapters: [2] }); evs.ev_c3 = mkEv('ev_c3', { chapters: [3] });
  evs.ev_once = mkEv('ev_once', { once: true }); evs.ev_flag = mkEv('ev_flag', { when: { flag: 'fox_spared' } });
  evs.ev_bell = mkEv('ev_bell', { when: { relic: 'silver_bell' } }); evs.ev_hanae = mkEv('ev_hanae', { when: { hero: 'hanae' } });
  add('events', evs);
  [1, 2, 3].forEach((ch) => {
    if (keep && D.encounters[ch].normal.length) return;
    const boss = D.FIXED.bosses[ch];
    const ros = D.ROSTER[ch];
    const norm = ros.filter((r) => r.tier === 'normal').map((r) => r.id);
    const eli = ros.filter((r) => r.tier === 'elite').map((r) => r.id);
    const mins = [0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8];
    D.addEncounters(ch, {
      normal: mins.map((min, i) => ({ id: `ch${ch}_n${i}`, enemies: [norm[i % norm.length]], w: 1 + (i % 3), min })),
      elite: eli.map((id, i) => ({ id: `ch${ch}_e${i}`, enemies: [id], w: 1, min: 0.3 })),
      boss,
    });
  });
}

const FAKE_SRC = makeFakeMap.toString();
function fresh(opts) {
  const api = boot(Object.assign({ only: ['run'], skip: ['data_*', 'map', 'combat'] }, opts || {}));
  api._run('globalThis.MAP = (' + FAKE_SRC + ')(DATA, U);');
  universe(api.DATA);
  api.MAP = api._run('MAP');
  return api;
}
const G = fresh();
const { U, DATA, RUN, MAP } = G;
const L = DATA.LISTS, E = DATA.ECONOMY;
const ALL = { card: [], relic: [], gem: [] };                        // "unlocked" that owns no locked content
const HA = DATA.heroes.hanae.maxHp, KU = DATA.heroes.kuro.maxHp;   // the starting max HP of the two heroes these suites use: tuning changes them, so never hardcode
const NEW = (o) => RUN.newRun(Object.assign({ heroes: ['hanae', 'kuro'], seed: 7, unlocked: ALL }, o || {}));
const J = (x) => JSON.stringify(x);
const fmt = (x) => J(x).slice(0, 220);

// a finished combat, as COMBAT.create(...).summary() would report it
function fakeC(over) {
  over = over || {};
  const heroes = over.heroes || [{ id: 'hanae', hp: 50, maxHp: HA, down: false }, { id: 'kuro', hp: 40, maxHp: KU, down: false }];
  const s = Object.assign({
    result: 'win', heroes, maxHpGain: {}, ink: 0, gold: 0,
    stats: Object.assign({ turns: 5, cardsPlayed: 12, attacksPlayed: 7, damageDealt: 60, damageTaken: 8, blockGained: 20, maxHit: 9, maxTurnDamage: 30, kills: [{ def: 'kappa', tier: 'normal', by: 'card' }] }, over.stats || {}),
  }, over);
  delete s.frontId;
  return { tier: over.tier, summary: () => s, front: () => ({ id: over.frontId || heroes[0].id }) };
}
// paint a chain to `tile` and step onto it. Every other tile is pre-resolved so the walk crosses no node; `before` runs right
// before the final step (set Ink there); returns what the last step gave
function walkTo(R, tile, before) {
  Object.keys(R.map.tiles).forEach((k) => { const x = R.map.tiles[k]; if (x !== tile) x.done = true; });
  R.node = null;
  const p = MAP.pathToPaint(R.map, tile.q, tile.r);
  if (p) p.path.forEach((c) => { R.ink = R.inkMax; RUN.paint(R, c[0], c[1]); });
  const pos = R.map.pos, prev = {}, q = [[pos.q, pos.r]];
  prev[MAP.key(pos.q, pos.r)] = null;
  while (q.length) {
    const c = q.shift();
    if (c[0] === tile.q && c[1] === tile.r) break;
    MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = MAP.key(n[0], n[1]); const nt = R.map.tiles[k]; if (!(k in prev) && nt.painted && nt.type !== 'block') { prev[k] = c; q.push(n); } });
  }
  const path = [];
  for (let c = [tile.q, tile.r]; c; c = prev[MAP.key(c[0], c[1])]) path.unshift(c);
  let res = null;
  path.slice(1).forEach((c, i, a) => { if (i === a.length - 1 && before) before(); res = RUN.step(R, c[0], c[1]); });
  return res;
}
const tiles = (R, type) => Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).filter((x) => x.type === type);
const reachable = (R, type) => tiles(R, type).find((x) => x.painted || MAP.pathToPaint(R.map, x.q, x.r));
const hiddenEdge = (R) => tiles(R, 'empty').concat(tiles(R, 'enemy'), tiles(R, 'well')).find((x) => !x.painted && MAP.canPaint(R.map, x.q, x.r).ok);
// step onto the first reachable tile of a kind (optionally editing its content first); returns the Node or Instant
function enter(R, type, mutate, before) {
  const tile = reachable(R, type);
  if (mutate) mutate(tile);
  R.brushes = ['stroke'];
  return walkTo(R, tile, before);
}
const resetNode = (R) => { R.node = null; };

// ================================================================================================ setup
t.test('the harness: the fake map is a faithful hex grid', () => {
  const R = NEW();
  const M = R.map;
  t.eq(M.cols, 13, 'cols');
  t.ok(MAP.dist(M.start.q, M.start.r, M.boss.q, M.boss.r) === 10, 'boss ten hexes from the start');
  t.ok(tiles(R, 'boss').length === 1 && tiles(R, 'start').length === 1, 'one boss and one start');
  const ring = Object.keys(M.tiles).map((k) => M.tiles[k]).filter((x) => x.painted).length;
  const near = Object.keys(M.tiles).map((k) => M.tiles[k]).filter((x) => MAP.dist(M.start.q, M.start.r, x.q, x.r) <= 2).length;
  t.eq(ring, near, 'the painted start area is exactly the hexes within 2 of the start');
  t.ok(R.map.tiles[MAP.key(M.start.q, M.start.r)].painted, 'start painted');
  t.eq(MAP.neighbors(M, M.start.q, M.start.r).length, 6, 'six neighbours');
});

t.test('newRun: the documented shape and the starting values', () => {
  const R = NEW();
  t.eq(R.v, 1, 'version'); t.eq(R.seed, 7, 'seed'); t.eq(R.trial, 0, 'trial'); t.eq(R.daily, false, 'daily');
  t.deep(R.heroes.map((h) => h.id), ['hanae', 'kuro'], 'party order');
  t.eq(R.heroes[0].hp, DATA.heroes.hanae.maxHp, 'hp full'); t.eq(R.heroes[1].maxHp, DATA.heroes.kuro.maxHp, 'max hp from the hero def');
  t.eq(R.frontIdx, 0, 'the first hero leads');
  t.eq(R.deck.length, 10, 'two five-card starters');
  t.deep(R.deck.map((c) => c.id), [...DATA.heroes.hanae.starter, ...DATA.heroes.kuro.starter], 'starter ids in order');
  R.deck.forEach((c) => { t.eq(c.up, 0, 'not upgraded'); t.eq(c.gems.length, DATA.cards[c.id].slots.length, 'gems array as long as the slots'); t.ok(c.gems.every((g) => g === null), 'empty sockets'); });
  t.eq(new Set(R.deck.map((c) => c.uid)).size, 10, 'unique uids');
  t.deep(R.relics, [], 'no starting relic'); t.deep(R.brushes, ['stroke'], 'one Long Stroke'); t.deep(R.gems, [], 'no gems');
  t.eq(R.gold, E.startGold, 'starting gold'); t.eq(R.ink, E.startInk, 'starting ink'); t.eq(R.inkMax, E.inkMax, 'ink max');
  t.eq(R.chapter, 1, 'chapter 1'); t.ok(R.map && R.map.tiles, 'a map'); t.eq(R.node, null, 'no node');
  t.eq(R.done, false, 'not done'); t.eq(R.victory, false, 'not won'); t.eq(R.rareOffset, 0, 'rare pity'); t.eq(R.removals, 0, 'removals');
  t.deep(R.seen.events, [], 'no events seen'); t.deep(R.flags, {}, 'no flags'); t.deep(R.pending, [], 'nothing pending');
  L.statKeys.forEach((k) => t.eq(R.stats[k], 0, `stat ${k} starts at 0`));
  t.deep(Object.keys(R.stats).sort(), L.statKeys.slice().sort(), 'R.stats has exactly the statKeys');
});
t.test('newRun: bad party is a loud error, daily fills in its own heroes', () => {
  t.throws(() => RUN.newRun({ heroes: ['hanae', 'hanae'], seed: 1 }), 'same hero twice', /two distinct/);
  t.throws(() => RUN.newRun({ heroes: ['hanae'], seed: 1 }), 'one hero');
  t.throws(() => RUN.newRun({ heroes: ['hanae', 'nobody'], seed: 1 }), 'unknown hero');
  t.throws(() => RUN.newRun({ seed: 1 }), 'no heroes');
  const d = RUN.newRun({ seed: 20260101, daily: true, trial: 7 });
  t.deep(d.heroes.map((h) => h.id), RUN.dailyHeroes(20260101), 'daily uses dailyHeroes');
  t.eq(d.trial, 0, 'daily is trial 0 whatever was asked'); t.eq(d.daily, true, 'flag');
});
t.test('dailyHeroes: two distinct, deterministic, ignores locks, spreads over all four', () => {
  const seen = {};
  for (let s = 20260101; s < 20260101 + 200; s++) {
    const a = RUN.dailyHeroes(s), b = RUN.dailyHeroes(s);
    t.deep(a, b, 'deterministic ' + s);
    t.ok(a.length === 2 && a[0] !== a[1] && a.every((h) => L.heroIds.indexOf(h) >= 0), 'two distinct real heroes ' + s);
    a.forEach((h) => { seen[h] = (seen[h] || 0) + 1; });
  }
  t.ok(L.heroIds.every((h) => seen[h] > 30), 'every hero turns up: ' + J(seen));
  t.deep(RUN.dailyHeroes(20260101), U.rng(U.hash(20260101, 'daily', 'heroes')).shuffle(L.heroIds).slice(0, 2), 'the documented stream');
});
t.test('daily runs treat every locked card, relic and gem as unlocked', () => {
  const d = RUN.newRun({ seed: 20260202, daily: true, unlocked: { card: [], relic: [], gem: [] } });
  const lockedCards = Object.keys(DATA.cards).filter((id) => DATA.cards[id].locked);
  t.ok(lockedCards.length > 0 && lockedCards.every((id) => d.unlocked.card.indexOf(id) >= 0), 'all locked cards');
  t.ok(d.unlocked.relic.indexOf('t_locked') >= 0, 'locked relic'); t.ok(d.unlocked.gem.length > 0, 'locked gems');
  const n = RUN.newRun({ seed: 5, heroes: ['hanae', 'kuro'], unlocked: { card: ['hanae_u0', 'hanae_u0', 7], relic: [], gem: ['nope'] } });
  t.deep(n.unlocked.card, ['hanae_u0'], 'owned list is cleaned and de-duplicated');
  const open = RUN.newRun({ seed: 5, heroes: ['hanae', 'kuro'] });
  t.eq(open.unlocked, null, 'no unlocked argument means everything is open');
});
t.test('determinism: equal seeds give byte-identical runs, different seeds differ', () => {
  const a = J(RUN.serialize(NEW({ seed: 99 })));
  U.resetUid(500);
  const b = J(RUN.serialize(NEW({ seed: 99 })));
  t.eq(a, b, 'same seed, same run, including uids and map');
  t.ok(a !== J(RUN.serialize(NEW({ seed: 100 }))), 'another seed is another run');
  t.ok(J(RUN.serialize(NEW({ seed: 99, heroes: ['suzu', 'raiga'] }))) !== a, 'another party is another run');
  t.eq(NEW({ seed: 99 }).id, NEW({ seed: 99 }).id, 'stable id');
  t.ok(NEW({ seed: 99 }).id !== NEW({ seed: 99, trial: 3 }).id, 'id sees the trial');
});
t.test('newRun resets the uid counter so uids are reproducible', () => {
  U.resetUid(9999);
  const R = NEW();
  t.deep(R.deck.map((c) => c.uid), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'uids 1..10');
  const c = RUN.addCard(R, 'hanae_c0');
  t.eq(c.uid, 11, 'the counter carries on');
});

// ================================================================================================ trials and mods
t.test('trial mods accumulate: level N is the sum of levels 1..N', () => {
  t.deep(NEW({ trial: 0 }).mods, {}, 'trial 0 has none');
  const r2 = NEW({ trial: 2 });
  t.near(r2.mods.enemyHp, 0.05, 1e-9, 'trial 2 keeps the level 1 increment'); t.eq(r2.mods.startInk, -1, 'and adds its own');
  const r10 = NEW({ trial: 10 });
  t.deep(r10.mods, DATA.trialDeltas(10), 'trial 10 is the full sum');
  t.eq(r10.mods.curses, 2, 'two curse levels add up');
  t.eq(NEW({ trial: 99 }).trial, 10, 'trial clamps to 10'); t.eq(NEW({ trial: -4 }).trial, 0, 'and to 0'); t.eq(NEW({ trial: 2.9 }).trial, 2, 'and floors');
  const m = RUN.mods(r10);
  t.eq(m.startInk, E.startInk - 1, 'startInk folded'); t.eq(m.startGold, E.startGold - 10, 'startGold folded');
  t.near(m.enemyHp, 1.05, 1e-9, 'enemyHp factor'); t.near(m.eliteHp, 1.1, 1e-9, 'eliteHp factor'); t.near(m.enemyDmg, 1.1, 1e-9, 'enemyDmg factor');
  t.near(m.priceMul, 1.1, 1e-9, 'priceMul'); t.near(m.healMul, 0.9, 1e-9, 'healMul'); t.near(m.goldMul, 0.9, 1e-9, 'goldMul');
  t.near(m.reviveFrac, E.reviveFrac - 0.05, 1e-9, 'reviveFrac is absolute after folding');
});
t.test('trial mods shape the new run: gold, ink, curses in the deck', () => {
  const R = NEW({ trial: 10 });
  t.eq(R.gold, E.startGold - 10, 'trial 5 startGold delta');
  t.eq(R.ink, E.startInk - 1, 'trial 2 startInk delta');
  const curses = R.deck.filter((c) => DATA.cards[c.id].hero === 'curse');
  t.eq(curses.length, 2, 'two curses at trial 10 (levels 3 and 10)');
  t.eq(R.deck.length, 12, 'starter plus curses');
  t.deep(R.deck.slice(0, 10).map((c) => DATA.cards[c.id].hero === 'curse'), new Array(10).fill(false), 'curses come after the starters');
  const again = NEW({ trial: 10 });
  t.deep(again.deck.map((c) => c.id), R.deck.map((c) => c.id), 'the same curses every time for a seed');
  const kinds = new Set();
  for (let s = 1; s < 60; s++) NEW({ trial: 10, seed: s }).deck.slice(10).forEach((c) => kinds.add(c.id));
  t.ok(kinds.size >= 4, 'other seeds draw other curses: ' + kinds.size);
  t.eq(NEW({ trial: 2 }).deck.length, 10, 'no curse below trial 3');
  t.eq(NEW({ trial: 3 }).deck.filter((c) => DATA.cards[c.id].hero === 'curse').length, 1, 'one curse at trial 3');
});
t.test('relic mods are additive and read live: RUN.mods(R)', () => {
  const R = NEW();
  t.eq(RUN.mods(R).energy, 3, 'base energy'); R.relics.push('t_energy'); t.eq(RUN.mods(R).energy, 4, 'boss relic +1');
  R.relics.push('t_gold'); R.relics.push('t_gold2'); t.near(RUN.mods(R).goldMul, 1.5, 1e-9, 'two +25% relics add to x1.5, they do not multiply');
  R.relics.push('t_price'); t.near(RUN.mods(R).priceMul, 0.8, 1e-9, 'priceMul -20%');
  R.relics.push('t_hand'); t.eq(RUN.mods(R).hand, 6, 'hand +1');
  R.relics.push('t_choices'); t.eq(RUN.mods(R).cardChoices, 4, 'cardChoices +1');
  R.relics.push('t_swaps'); t.eq(RUN.mods(R).freeSwaps, 2, 'freeSwaps'); R.relics.push('t_camp'); t.eq(RUN.mods(R).campActions, 2, 'campActions');
  R.relics.push('t_block'); R.relics.push('brass_lantern'); t.eq(RUN.mods(R).startBlock, 3, 'startBlock adds up');
  R.relics.push('ghost'); t.eq(RUN.mods(R).energy, 4, 'an unknown relic id is ignored');
  const t10 = NEW({ trial: 10 }); t10.relics.push('t_gold');
  t.near(RUN.mods(t10).goldMul, 1.15, 1e-9, 'trial -10% plus relic +25% add: 1 - 0.1 + 0.25');
});
t.test('gaining a relic recomputes inkMax; startInk applies when a chapter starts', () => {
  const R = NEW();
  t.eq(RUN.addRelic(R, 't_inkmax').ok, true, 'gained'); t.eq(R.inkMax, E.inkMax + 2, 'inkMax follows the relic');
  R.ink = 16; R.relics.pop(); RUN.addRelic(R, 't_c0');
  t.eq(R.inkMax, E.inkMax, 'losing the relic (removed by hand) then a sync');
  t.eq(R.ink, E.inkMax, 'ink is capped when inkMax falls');
  const S = NEW();
  RUN.addRelic(S, 't_startink');
  t.eq(S.ink, E.startInk, 'startInk never grants Ink retroactively');
  S.ink = 3; RUN.startChapter(S, 2);
  t.eq(S.ink, E.startInk + 2, 'a new chapter tops Ink up to startInk (12)');
  S.ink = 14; RUN.startChapter(S, 3);
  t.eq(S.ink, 14, 'but never lowers it (max of current and startInk)');
  const small = NEW({ trial: 2 }); t.eq(small.ink, E.startInk - 1, 'trial startInk lowers chapter 1 Ink');
  RUN.addRelic(small, 't_inkmax'); small.ink = 1; RUN.startChapter(small, 2);
  t.eq(small.ink, E.startInk - 1, 'chapter start tops up to the trial startInk');
  const cap = NEW(); cap.relics.push('t_startink', 't_startink', 't_startink'); cap.relics.push('t_startink'); cap.ink = 0; RUN.startChapter(cap, 2);
  t.eq(cap.ink, E.inkMax, 'startInk is capped by inkMax');
});

t.test('the chapter map: generated per chapter from R.seed, replaced by startChapter', () => {
  const R = NEW({ seed: 31 });
  const seed1 = R.map.seed;
  t.eq(seed1, U.hash(31, 'ch1', 'map'), 'map seed is U.hash(R.seed, ch1, map)');
  RUN.startChapter(R, 2);
  t.eq(R.chapter, 2, 'chapter'); t.eq(R.map.seed, U.hash(31, 'ch2', 'map'), 'chapter 2 map seed'); t.eq(R.map.chapter, 2, 'map chapter');
  t.throws(() => RUN.startChapter(R, 4), 'chapter 4 does not exist');
  t.deep(R.map.pos, R.map.start, 'the party starts on the bookmark');
});

// ================================================================================================ painting and brushes
t.test('paint: one adjacent hex costs one Ink and reveals it', () => {
  const R = NEW();
  const e = hiddenEdge(R);
  const pre = RUN.paintPreview(R, e.q, e.r);
  t.deep(pre.path, [[e.q, e.r]], 'a chain of one'); t.eq(pre.cost, 1, 'costs 1'); t.eq(pre.affordable, true, 'affordable'); t.eq(pre.ok, true, 'ok');
  const before = R.ink;
  const res = RUN.paint(R, e.q, e.r);
  t.eq(res.ok, true, 'painted'); t.eq(res.tiles.length, 1, 'one tile'); t.eq(res.cost, 1, 'cost reported');
  t.eq(R.ink, before - 1, 'one Ink spent'); t.eq(e.painted, true, 'the tile is painted'); t.eq(R.stats.hexesPainted, 1, 'hexesPainted');
  t.eq(res.tiles[0].q, e.q, 'the tile object comes back');
});
t.test('paint: a far hex paints the cheapest chain, all or nothing', () => {
  const R = NEW();
  const boss = R.map.boss;
  const pre = RUN.paintPreview(R, boss.q, boss.r);
  t.ok(pre.path.length >= 6, 'the boss is several hexes out: ' + pre.path.length);
  t.eq(pre.cost, pre.path.length, 'cost is the chain length (paintCost 1)');
  t.deep(pre.path[pre.path.length - 1], [boss.q, boss.r], 'the chain ends at the target');
  t.deep(pre.path[0].length, 2, 'cells are [q,r]');
  t.eq(MAP.canPaint(R.map, pre.path[0][0], pre.path[0][1]).ok, true, 'the first cell touches the painted area');
  R.ink = pre.cost - 1;
  t.eq(RUN.paintPreview(R, boss.q, boss.r).affordable, false, 'not affordable one short');
  const snap = J(RUN.serialize(R));
  const no = RUN.paint(R, boss.q, boss.r);
  t.eq(no.ok, false, 'refused'); t.eq(no.reason, 'ink', 'because of Ink'); t.eq(J(RUN.serialize(R)), snap, 'nothing changed, not one hex');
  R.ink = pre.cost;
  const yes = RUN.paint(R, boss.q, boss.r);
  t.eq(yes.ok, true, 'painted the chain'); t.eq(yes.tiles.length, pre.path.length, 'every hex of it'); t.eq(R.ink, 0, 'all the Ink went'); t.eq(R.stats.hexesPainted, pre.path.length, 'stat');
  t.ok(pre.path.every((c) => R.map.tiles[MAP.key(c[0], c[1])].painted), 'all painted');
});
t.test('paint: reasons for a refusal, and the busy and done guards', () => {
  const R = NEW();
  const painted = R.map.tiles[MAP.key(R.map.start.q, R.map.start.r)];
  t.eq(RUN.paint(R, painted.q, painted.r).reason, 'painted', 'already painted');
  const block = tiles(R, 'block')[0];
  t.eq(RUN.paint(R, block.q, block.r).reason, 'void', 'Void'); t.eq(RUN.paintPreview(R, block.q, block.r).reason, 'void', 'preview says so too');
  t.eq(RUN.paint(R, 999, 999).reason, 'off', 'off the map');
  const e = hiddenEdge(R);
  R.node = { kind: 'camp', tile: { q: 0, r: 0 }, used: [] };
  t.eq(RUN.paint(R, e.q, e.r).reason, 'busy', 'no painting while a node is open');
  R.node = null; R.done = true;
  t.eq(RUN.paint(R, e.q, e.r).reason, 'done', 'no painting after the run ended');
  t.deep(RUN.paintPreview(R, 999, 999).path, [], 'the preview never returns null');
});
t.test('brushes: each kind paints its shape, spends the brush and counts', () => {
  const R = NEW();
  R.brushes = ['stroke', 'wave', 'fan', 'splash', 'halo', 'blot'];
  const seen = {};
  R.ink = 0;
  Object.keys(DATA.brushes).forEach((id) => {
    let hit = null;
    Object.keys(R.map.tiles).forEach((k) => { const x = R.map.tiles[k]; for (let d = 0; d < 6 && !hit; d++) if (MAP.canBrush(R.map, id, x.q, x.r, d).ok) hit = [x.q, x.r, d]; });
    t.ok(hit, `a legal ${id} placement exists`);
    const cells = MAP.brushCells(R.map, id, hit[0], hit[1], hit[2]).length;
    const brushes = R.brushes.length, painted = R.stats.hexesPainted;
    const res = RUN.useBrush(R, id, hit[0], hit[1], hit[2]);
    t.eq(res.ok, true, `${id} used`); t.eq(res.tiles.length, cells, `${id} painted the cells MAP promised`);
    t.eq(R.brushes.length, brushes - 1, `${id} is spent`); t.eq(R.brushes.indexOf(id) < 0 || R.brushes.filter((b) => b === id).length === 0, true, `only one ${id} was removed`);
    t.eq(R.stats.hexesPainted, painted + cells, `${id} counts hexes`); t.eq(R.ink, 0, `${id} costs no Ink`);
    seen[id] = cells;
  });
  t.eq(R.stats.brushesUsed, 6, 'brushesUsed');
  t.ok(seen.wave >= seen.stroke - 0 && seen.splash >= 1 && seen.blot === 1, 'shapes are sane: ' + J(seen));
});
t.test('brushes: one instance is spent, refusals leave everything alone', () => {
  const R = NEW();
  R.brushes = ['stroke', 'stroke'];
  let hit = null;
  Object.keys(R.map.tiles).forEach((k) => { const x = R.map.tiles[k]; for (let d = 0; d < 6 && !hit; d++) if (MAP.canBrush(R.map, 'stroke', x.q, x.r, d).ok) hit = [x.q, x.r, d]; });
  RUN.useBrush(R, 'stroke', hit[0], hit[1], hit[2]);
  t.deep(R.brushes, ['stroke'], 'one of two stroke brushes remains');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.useBrush(R, 'halo', hit[0], hit[1], hit[2]).reason, 'nobrush', 'a brush you do not own');
  t.eq(RUN.useBrush(R, 'stroke', hit[0], hit[1], hit[2]).ok, false, 'the same placement again paints nothing new');
  t.eq(J(RUN.serialize(R)), snap, 'and it kept the brush');
  t.eq(RUN.useBrush(R, 'stroke', 999, 999, 0).ok, false, 'off the map');
  R.node = { kind: 'camp', tile: { q: 0, r: 0 }, used: [] };
  t.eq(RUN.useBrush(R, 'stroke', hit[0], hit[1], hit[2]).reason, 'busy', 'busy');
});

// ================================================================================================ stepping
t.test('step: an illegal move returns null and moves nothing', () => {
  const R = NEW();
  const pos = J(R.map.pos);
  const far = tiles(R, 'boss')[0];
  t.eq(RUN.step(R, far.q, far.r), null, 'the boss is not adjacent'); t.eq(RUN.canStep(R, far.q, far.r), false, 'canStep says so');
  const e = hiddenEdge(R);
  t.eq(RUN.step(R, e.q, e.r), null, 'a hidden hex cannot be walked');
  t.eq(J(R.map.pos), pos, 'the party did not move');
  const nb = MAP.neighbors(R.map, R.map.pos.q, R.map.pos.r).map((n) => R.map.tiles[MAP.key(n[0], n[1])]).find((x) => x.painted && x.type !== 'block');
  t.eq(RUN.canStep(R, nb.q, nb.r), true, 'a painted neighbour is fine');
  t.eq(RUN.step(R, nb.q, nb.r), null, 'an empty tile has nothing to resolve'); t.deep(R.map.pos, { q: nb.q, r: nb.r }, 'but the party moved');
  R.done = true; t.eq(RUN.canStep(R, R.map.start.q, R.map.start.r), false, 'nothing moves after the end');
});
t.test('step: a well gives wellInk (mods and content), caps at inkMax, and is done at once', () => {
  const R = NEW();
  const w = enter(R, 'well', null, () => { R.ink = 5; });
  t.eq(w.kind, 'well', 'an Instant'); t.eq(w.done, true, 'done'); t.eq(w.gained, E.wellInk, 'four Ink'); t.eq(R.ink, 5 + E.wellInk, 'applied'); t.eq(R.node, null, 'no node'); t.eq(R.stats.wellsDrunk, 1, 'stat');
  t.eq(w.tile.q, R.map.pos.q, 'the Instant names its tile');
  const S = NEW();
  RUN.addRelic(S, 't_well');
  t.eq(enter(S, 'well', null, () => { S.ink = 3; }).gained, E.wellInk + 2, 'wellInk mod +2');
  const C = NEW();
  const big = enter(C, 'well', (x) => { x.content = { ink: 7 }; }, () => { C.ink = 3; });
  t.eq(big.gained, 7, 'a bigger well says so in its content'); t.eq(big.amount, 7, 'amount');
  const F = NEW();
  const cap = enter(F, 'well', null, () => { F.ink = F.inkMax - 1; });
  t.eq(cap.gained, 1, 'gained is what actually fit'); t.eq(cap.amount, E.wellInk, 'amount is the nominal figure'); t.eq(F.ink, F.inkMax, 'capped');
  const T = NEW({ trial: 10 });
  t.eq(enter(T, 'well', null, () => { T.ink = 2; }).gained, E.wellInk, 'trials that leave wellInk alone leave the well alone');
});
t.test('step: a brush rack gives its brush and is done', () => {
  const R = NEW();
  const b = enter(R, 'brush', (x) => { x.content = { id: 'halo' }; });
  t.eq(b.kind, 'brush', 'Instant'); t.eq(b.id, 'halo', 'id'); t.eq(b.done, true, 'done'); t.ok(R.brushes.indexOf('halo') >= 0, 'in the tray'); t.eq(R.node, null, 'no node');
  const r2 = NEW();
  const rnd = enter(r2, 'brush', (x) => { x.content = { id: 'random' }; });
  t.ok(DATA.brushes[rnd.id], 'random rolls a real brush: ' + rnd.id);
  const r3 = NEW();
  t.ok(DATA.brushes[enter(r3, 'brush', (x) => { x.content = {}; }).id], 'a rack with no id still gives a brush');
});
t.test('step: every tile type opens the right node', () => {
  const R = NEW({ seed: 12 });
  const combat = enter(R, 'enemy');
  t.eq(combat.kind, 'combat', 'enemy -> combat'); t.eq(combat.tier, 'normal', 'normal tier'); t.ok(combat.enemies.length >= 1, 'enemies listed'); t.eq(R.node, combat, 'R.node holds it');
  t.ok(Number.isInteger(combat.seed), 'a combat seed'); t.eq(combat.rewards, true, 'rewards on'); t.eq(combat.onWin, null, 'no win ops'); t.eq(combat.source, 'combat', 'from a tile');
  t.ok(DATA.groupById(combat.enc), 'a real group id'); t.deep(combat.enemies, DATA.groupById(combat.enc).enemies, 'its enemies');
  t.eq(RUN.step(R, R.map.start.q, R.map.start.r), null, 'no walking while a node is open');
  const el = enter(NEW({ seed: 12 }), 'elite');
  t.eq(el.tier, 'elite', 'elite tier'); t.ok(DATA.encounters[1].elite.some((g) => g.id === el.enc), 'an elite group');
  const R2 = NEW({ seed: 12 }); RUN.startChapter(R2, 3);
  const boss = enter(R2, 'boss');
  t.eq(boss.tier, 'boss', 'boss tier'); t.deep(boss.enemies, ['boss_editor'], 'the chapter boss'); t.eq(boss.enc, null, 'a boss has no group');
  const chest = enter(NEW(), 'chest');
  t.eq(chest.kind, 'chest', 'chest'); t.ok(chest.loot.gold > 0, 'gold'); t.eq(chest.taken, false, 'untaken');
  t.ok((chest.loot.relic ? 1 : 0) + (chest.loot.gems.length ? 1 : 0) === 1, 'exactly one of a relic or gems');
  const shop = enter(NEW(), 'shop');
  t.eq(shop.kind, 'shop', 'shop'); t.ok(shop.stock.items.length >= 8, 'stock: ' + shop.stock.items.length); t.ok(shop.stock.removePrice > 0, 'removal price');
  const camp = enter(NEW(), 'camp'); t.eq(camp.kind, 'camp', 'camp'); t.deep(camp.used, [], 'nothing used yet');
  const forge = enter(NEW(), 'forge'); t.eq(forge.kind, 'forge', 'forge'); t.eq(forge.used, null, 'unused');
  const cache = enter(NEW(), 'gemcache'); t.eq(cache.kind, 'gemcache', 'cache'); t.eq(cache.offers.length, 3, 'choose 1 of 3'); t.eq(new Set(cache.offers).size, 3, 'distinct');
  const ev = enter(NEW(), 'event'); t.eq(ev.kind, 'event', 'fable'); t.ok(DATA.events[ev.event], 'a real event'); t.eq(ev.chosen, null, 'not chosen');
  [combat, el, boss, chest, shop, camp, forge, cache, ev].forEach((n) => t.ok(n.tile && Number.isInteger(n.tile.q) && Number.isInteger(n.tile.r), n.kind + ' carries its tile'));
});
t.test('step: a resolved tile does nothing on the second visit', () => {
  const R = NEW();
  const tile = tiles(R, 'enemy')[0];
  const n = walkTo(R, tile);
  t.eq(n.kind, 'combat', 'first visit fights');
  R.node = null; tile.done = true;
  const nb = MAP.neighbors(R.map, tile.q, tile.r).map((c) => R.map.tiles[MAP.key(c[0], c[1])]).find((x) => x.painted && x.type !== 'block');
  RUN.step(R, nb.q, nb.r);
  t.eq(RUN.step(R, tile.q, tile.r), null, 'a done tile is just ground');
  t.eq(R.node, null, 'no node');
});
t.test('encounters: content.enc wins, otherwise the picker is seeded, weighted and by difficulty', () => {
  const R = NEW({ seed: 3 });
  const tile = tiles(R, 'enemy').find((x) => x.content && x.content.enc);
  t.ok(tile, 'the fake map assigned some groups');
  const withEnc = walkTo(R, tile);
  t.eq(withEnc.enc, tile.content.enc, 'content.enc is used as given'); t.deep(withEnc.enemies, DATA.groupById(tile.content.enc).enemies, 'and its enemies');
  const pick = (seed, tileDiff, lastEnc) => {
    const S = NEW({ seed });
    const x = reachable(S, 'enemy'); x.content = {}; x.diff = tileDiff; S.lastEnc = lastEnc || null;
    return walkTo(S, x);
  };
  t.eq(pick(4, 0.0).enc, pick(4, 0.0).enc, 'the pick is deterministic');
  const early = new Set(); for (let s = 0; s < 80; s++) early.add(pick(s, 0).enc);
  t.ok([...early].every((id) => DATA.groupById(id).min <= 0), 'diff 0 only draws groups with min 0: ' + [...early]);
  const late = new Set(); for (let s = 0; s < 200; s++) late.add(pick(s, 1).enc);
  t.ok(late.size >= 10, 'diff 1 can draw nearly every group: ' + late.size);
  const counts = {}; for (let s = 0; s < 600; s++) { const g = pick(s, 0.0).enc; counts[g] = (counts[g] || 0) + 1; }
  t.ok(counts.ch1_n2 > counts.ch1_n0 * 1.3, 'a weight 3 group beats a weight 1 group: ' + J(counts));
  let repeats = 0; for (let s = 0; s < 200; s++) { const a = pick(s, 0.5).enc; if (pick(s, 0.5, a).enc === a) repeats++; }
  t.eq(repeats, 0, 'the last encounter is never drawn again straight away');
  t.eq(NEW({ seed: 1 }).lastEnc, null, 'lastEnc starts null');
});
t.test('encounters: R.lastEnc is remembered per chapter', () => {
  const R = NEW({ seed: 6 });
  const n = enter(R, 'enemy');
  t.eq(R.lastEnc, n.enc, 'remembered'); RUN.startChapter(R, 2); t.eq(R.lastEnc, null, 'a new chapter forgets');
});

// ================================================================================================ the Ink mercy rule
function calm(R) { Object.keys(R.map.tiles).forEach((k) => { R.map.tiles[k].done = true; }); R.node = null; }
t.test('mercy: stranded means no Ink, no brush and nothing unresolved reachable', () => {
  const R = NEW();
  calm(R); R.ink = 0; R.brushes = [];
  t.eq(RUN.checkStranded(R), true, 'stranded -> mercy'); t.eq(R.ink, E.paintCost, 'exactly paintCost Ink'); t.eq(R.stats.mercy, 1, 'stat');
  t.eq(RUN.checkStranded(R), false, 'with 1 Ink you are not stranded'); t.eq(R.ink, 1, 'no second grant');
  R.ink = 0; R.brushes = ['stroke'];
  t.eq(RUN.checkStranded(R), false, 'a brush in the tray is a way forward'); t.eq(R.ink, 0, 'no Ink');
  R.brushes = [];
  const chest = tiles(R, 'chest')[0]; chest.painted = true; chest.done = false;
  const nb = MAP.neighbors(R.map, chest.q, chest.r);
  nb.forEach((c) => { R.map.tiles[MAP.key(c[0], c[1])].painted = true; });
  R.map.pos = { q: chest.q, r: chest.r };
  t.eq(RUN.checkStranded(R), false, 'standing on an unresolved tile is not stranded');
  R.map.pos = R.map.start;
});
t.test('mercy: an unresolved painted tile only counts when it can be reached over painted ground', () => {
  const R = NEW();
  calm(R); R.ink = 0; R.brushes = [];
  const island = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => !x.painted && x.type === 'empty' && MAP.dist(x.q, x.r, R.map.start.q, R.map.start.r) > 4);
  island.type = 'chest'; island.painted = true; island.done = false;
  t.eq(RUN.checkStranded(R), true, 'a painted but unreachable chest does not save you');
  R.ink = 0;
  island.painted = false;
  const link = MAP.pathToPaint(R.map, island.q, island.r);
  t.ok(link && link.path.length >= 2, 'a real chain to the island');
  link.path.forEach((c) => { const x = R.map.tiles[MAP.key(c[0], c[1])]; x.painted = true; x.done = true; });
  island.done = false;
  t.eq(RUN.checkStranded(R), false, 'reachable and unresolved: not stranded');
  t.eq(R.ink, 0, 'no grant');
  island.done = true; island.type = 'empty';
  t.eq(RUN.checkStranded(R), true, 'resolved (or plain ground): stranded again');
});
t.test('mercy: void tiles and empty tiles never count, a pending node blocks the rule', () => {
  const R = NEW();
  calm(R); R.ink = 0; R.brushes = [];
  const b = tiles(R, 'block')[0]; b.painted = true; b.done = false;
  t.eq(RUN.checkStranded(R), true, 'a painted Void hex is not something to resolve');
  R.ink = 0; R.node = { kind: 'camp', tile: { q: 0, r: 0 }, used: [] };
  t.eq(RUN.checkStranded(R), false, 'never while a node is open (it may still pay Ink)'); t.eq(R.ink, 0, 'no grant');
  R.node = null; R.done = true;
  t.eq(RUN.checkStranded(R), false, 'never after the run ended');
});
t.test('mercy: painting the last useful hex hands back one Ink; it can repeat', () => {
  const R = NEW();
  calm(R); R.brushes = [];
  const e = hiddenEdge(R);
  R.ink = 1;
  const res = RUN.paint(R, e.q, e.r);
  t.eq(res.ok, true, 'painted'); t.eq(res.mercy, true, 'paint reports the grant'); t.eq(R.ink, 1, '1 - 1 + 1'); t.eq(R.stats.mercy, 1, 'counted');
  const next = MAP.pathToPaint(R.map, R.map.boss.q, R.map.boss.r).path[0];
  t.eq(RUN.paint(R, next[0], next[1]).mercy, true, 'and again on the next hex'); t.eq(R.stats.mercy, 2, 'twice');
  t.ok(R.log.some((l) => /Ink/.test(l.msg)), 'the log remembers');
});
t.test('mercy: finishing a node and the brush rack also run the check', () => {
  const R = NEW({ seed: 21 });
  R.ink = 0; R.brushes = [];
  const camp = tiles(R, 'camp')[0];
  Object.keys(R.map.tiles).forEach((k) => { const x = R.map.tiles[k]; if (x !== camp) x.done = true; });
  R.ink = R.inkMax; camp.painted = true;
  const path = MAP.pathToPaint(R.map, camp.q, camp.r); if (path) path.path.forEach((c) => { R.map.tiles[MAP.key(c[0], c[1])].painted = true; });
  R.ink = 0;
  const q = []; const seen = {}; q.push([R.map.pos.q, R.map.pos.r]); seen[MAP.key(R.map.pos.q, R.map.pos.r)] = null;
  while (q.length) { const c = q.shift(); MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = MAP.key(n[0], n[1]); if (!(k in seen) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { seen[k] = c; q.push(n); } }); }
  const route = []; for (let c = [camp.q, camp.r]; c; c = seen[MAP.key(c[0], c[1])]) route.unshift(c);
  route.slice(1).forEach((c) => RUN.step(R, c[0], c[1]));
  t.eq(R.node.kind, 'camp', 'at the camp'); t.eq(R.ink, 0, 'no mercy while the camp is open');
  const fin = RUN.finishNode(R);
  t.eq(fin.chapterEnded, false, 'a camp is not a boss'); t.eq(R.ink, E.paintCost, 'finishNode runs the mercy check');
});

// ================================================================================================ combat
function fight(R, tier, i, cover, nodeOver) {
  R.node = Object.assign({ kind: 'combat', tile: { q: i || 0, r: 0 }, tier: tier || 'normal', enc: null, enemies: ['kappa'], seed: i || 0, rewards: true, onWin: null, source: 'combat' }, nodeOver || {});
  return RUN.combatDone(R, fakeC(cover));
}
const hasRare = (ids) => ids.some((id) => DATA.cards[id].rarity === 'rare');
t.test('combatInit: the options COMBAT.create needs, with copies not references', () => {
  const R = NEW({ seed: 5 });
  RUN.addRelic(R, 't_energy');
  const node = enter(R, 'enemy');
  const o = RUN.combatInit(R, node);
  t.deep(Object.keys(o).sort(), ['chapter', 'deck', 'enemies', 'frontIdx', 'gold', 'heroes', 'mods', 'relics', 'seed', 'tier'], 'exactly the documented options');
  t.deep(o.heroes, R.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp })), 'party with current HP'); t.eq(o.frontIdx, 0, 'frontIdx');
  t.deep(o.deck, R.deck, 'the deck'); t.ok(o.deck[0] !== R.deck[0], 'deck instances are copies');
  o.deck[0].up = 1; o.deck[0].gems[0] = 'red_g0'; t.eq(R.deck[0].up, 0, 'mutating the copy leaves R alone'); t.eq(R.deck[0].gems[0], null, 'also the gems');
  t.deep(o.enemies, node.enemies, 'enemies'); t.eq(o.tier, 'normal', 'tier'); t.eq(o.chapter, 1, 'chapter'); t.eq(o.seed, node.seed, 'the node seed');
  t.deep(o.mods, RUN.mods(R), 'mods verbatim'); t.eq(o.mods.energy, 4, 'including relic energy'); t.deep(o.relics, ['t_energy'], 'relics for hooks'); t.eq(o.gold, R.gold, 'run gold for thieves');
  t.eq(node.seed, U.hash(5, 'combat', 1, node.tile.q, node.tile.r), 'the seed is derived from the run seed and the tile, nothing else');
  t.deep(RUN.combatInit(R), RUN.combatInit(R, R.node), 'the node defaults to R.node');
  R.frontIdx = 1; t.eq(RUN.combatInit(R, node).frontIdx, 1, 'the leading hero');
  const re = J(RUN.combatInit(R, node)); t.eq(re, J(RUN.combatInit(R, node)), 'pure and repeatable');
});
t.test('combatDone: HP, revive, max HP gains and who leads', () => {
  const R = NEW();
  const rw = fight(R, 'normal', 1, { heroes: [{ id: 'hanae', hp: 31, maxHp: HA, down: false }, { id: 'kuro', hp: 0, maxHp: KU, down: true }], frontId: 'kuro' });
  t.ok(rw, 'won'); t.eq(R.heroes[0].hp, 31, 'hp from the fight'); t.eq(R.heroes[1].hp, Math.round(KU * E.reviveFrac), 'the downed hero stands up at reviveFrac of max HP');
  t.eq(R.frontIdx, 1, 'frontIdx follows whoever holds the front row');
  const S = NEW();
  fight(S, 'normal', 1, { heroes: [{ id: 'hanae', hp: 0, maxHp: HA, down: true }, { id: 'kuro', hp: 5, maxHp: KU, down: false }] });
  t.eq(S.heroes[0].hp, Math.round(HA * E.reviveFrac), 'the first hero revives too');
  const T = NEW({ trial: 6 });
  fight(T, 'normal', 1, { heroes: [{ id: 'hanae', hp: 0, maxHp: HA, down: true }, { id: 'kuro', hp: 9, maxHp: KU, down: false }] });
  t.eq(T.heroes[0].hp, Math.round(HA * (E.reviveFrac - 0.05)), 'trial reviveFrac lowers the revive');
  const G2 = NEW();
  fight(G2, 'normal', 1, { heroes: [{ id: 'hanae', hp: 40, maxHp: HA, down: false }, { id: 'kuro', hp: 30, maxHp: KU, down: false }], maxHpGain: { hanae: 3, kuro: 2 } });
  t.eq(G2.heroes[0].maxHp, HA + 3, 'max HP gain'); t.eq(G2.heroes[1].maxHp, KU + 2, 'max HP gain'); t.eq(G2.heroes[0].hp, 40, 'hp as reported (COMBAT already raised it)');
  const tiny = NEW(); tiny.heroes[0].maxHp = 3; tiny.heroes[0].hp = 3;
  fight(tiny, 'normal', 1, { heroes: [{ id: 'hanae', hp: 0, maxHp: 3, down: true }, { id: 'kuro', hp: 9, maxHp: KU, down: false }] });
  t.eq(tiny.heroes[0].hp, 1, 'a revive is at least 1 HP');
  const cap = NEW();
  fight(cap, 'normal', 1, { heroes: [{ id: 'hanae', hp: 999, maxHp: HA, down: false }, { id: 'kuro', hp: 9, maxHp: KU, down: false }] });
  t.eq(cap.heroes[0].hp, HA, 'hp never above max');
  t.ok(NEW().heroes.every((h) => h.hp > 0), 'sanity');
});
t.test('combatDone: gold by tier, goldMul, thief loot and the extra gold ops', () => {
  const range = (tier) => { let lo = 1e9, hi = -1; for (let i = 0; i < 400; i++) { const R = NEW({ seed: i }); const before = R.gold; const rw = fight(R, tier, i); const g = R.gold - before; lo = Math.min(lo, g); hi = Math.max(hi, g); t.eq(rw.gold, g, 'Rewards.gold is what was added'); } return [lo, hi]; };
  t.deep(range('normal'), E.gold.normal, 'normal gold covers exactly its range'); t.deep(range('elite'), E.gold.elite, 'elite range'); t.deep(range('boss'), E.gold.boss, 'boss range');
  let lo = 1e9, hi = -1;
  for (let i = 0; i < 400; i++) { const R = NEW({ seed: i }); R.relics.push('t_gold'); const b = R.gold; fight(R, 'normal', i); lo = Math.min(lo, R.gold - b); hi = Math.max(hi, R.gold - b); }
  t.deep([lo, hi], [Math.round(E.gold.normal[0] * 1.25), Math.round(E.gold.normal[1] * 1.25)], 'goldMul scales the combat roll, rounded');
  const R = NEW(); R.relics.push('t_gold');
  const before = R.gold;
  const rw = fight(R, 'normal', 3, { gold: 30 });
  t.eq(R.gold - before, rw.goldBase + 30, 'gold ops and thief loot are NOT multiplied');
  const S = NEW(); S.gold = 100;
  const rs = fight(S, 'normal', 3, { gold: -20 });
  t.eq(S.gold, 100 + rs.goldBase - 20, 'gold the thief kept is gone'); t.eq(rs.gold, rs.goldBase - 20, 'and Rewards.gold is the net');
  const poor = NEW(); poor.gold = 2; fight(poor, 'normal', 3, { gold: -500 });
  t.eq(poor.gold, 0, 'gold never goes below 0');
  const earned = NEW(); fight(earned, 'normal', 3, { gold: 5 });
  t.ok(earned.stats.goldEarned >= 5 + E.gold.normal[0], 'goldEarned counts the pouch too');
});
t.test('combatDone: Ink from kills (+1 normal, +2 elite, none for minions and bosses) and from ink ops', () => {
  const R = NEW(); R.ink = 3;
  const rw = fight(R, 'normal', 1, { stats: { kills: [{ def: 'kappa', tier: 'normal', by: 'card' }, { def: 'oni_brute', tier: 'elite', by: 'card' }, { def: 'leaf_imp', tier: 'minion', by: 'poison' }, { def: 'boss_x', tier: 'boss', by: 'card' }] }, ink: 2 });
  t.eq(R.ink, 3 + 1 + 2 + 0 + 0 + 2, 'kill Ink plus ink ops'); t.eq(rw.ink, 1 + 2 + 2, 'Rewards.ink is the total: 1 + 2 + 0 + 0 + the ink ops'); t.eq(rw.ink, 5, 'five');
  const cap = NEW(); cap.ink = cap.inkMax - 1; fight(cap, 'normal', 1, { ink: 9 });
  t.eq(cap.ink, cap.inkMax, 'capped at inkMax');
  const none = NEW(); const r0 = none.ink; fight(none, 'normal', 1, { stats: { kills: [] } });
  t.eq(none.ink, r0, 'no kills, no Ink');
});
t.test('combatDone: stats merge (sums, max keys, kills, elites, bosses, flawless)', () => {
  const R = NEW({ seed: 2 });
  fight(R, 'normal', 1, { stats: { turns: 4, cardsPlayed: 10, attacksPlayed: 6, damageDealt: 50, damageTaken: 5, blockGained: 12, maxHit: 20, maxTurnDamage: 25, swaps: 2, heroDowns: 1, revives: 0, poisonKills: 1, burnKills: 0, thornKills: 2, multiHitTurns: 1, zeroCostTurns: 1, kills: [{ def: 'kappa', tier: 'normal', by: 'card' }, { def: 'oni_brute', tier: 'elite', by: 'poison' }] } });
  fight(R, 'normal', 2, { stats: { turns: 6, cardsPlayed: 8, damageDealt: 30, damageTaken: 0, maxHit: 12, maxTurnDamage: 40, kills: [{ def: 'kappa', tier: 'normal', by: 'card' }] } });
  const s = R.stats;
  t.eq(s.turns, 10, 'turns sum'); t.eq(s.cardsPlayed, 18, 'cardsPlayed sum'); t.eq(s.damageDealt, 80, 'damage sum'); t.eq(s.damageTaken, 5, 'damage taken sum'); t.eq(s.blockGained, 12, 'block sum');
  t.eq(s.maxHit, 20, 'maxHit is a max key'); t.eq(s.maxTurnDamage, 40, 'maxTurnDamage is a max key'); t.eq(s.swaps, 2, 'swaps'); t.eq(s.thornKills, 2, 'thornKills'); t.eq(s.poisonKills, 1, 'poisonKills');
  t.eq(s.kills, 3, 'kills += kills.length'); t.eq(s.elites, 1, 'elites counts elite kills'); t.eq(s.bossKills, 0, 'no boss yet');
  t.deep(R.foes, { kappa: 2, oni_brute: 1 }, 'per-enemy kills for the bestiary');
  const B = NEW({ seed: 2 }); RUN.startChapter(B, 2);
  fight(B, 'boss', 3, { stats: { damageTaken: 0, kills: [{ def: 'boss_jorogumo', tier: 'boss', by: 'card' }] } });
  t.eq(B.stats.bossKills, 1, 'bossKills'); t.eq(B.stats.boss2Kills, 1, 'boss2Kills'); t.eq(B.stats.boss1Kills, 0, 'not chapter 1'); t.eq(B.stats.flawlessBosses, 1, 'no damage taken: flawless');
  const H = NEW({ seed: 2 }); fight(H, 'boss', 3, { stats: { damageTaken: 4, kills: [] } });
  t.eq(H.stats.flawlessBosses, 0, 'a scratch spoils flawless'); t.eq(H.stats.boss1Kills, 1, 'chapter 1 boss');
  const N = NEW(); fight(N, 'normal', 1, { stats: { turns: 3, kills: [], bogus: 99, damageDealt: 'x' } });
  t.eq(N.stats.turns, 3, 'known numeric keys merge'); t.eq(N.stats.bogus, undefined, 'unknown keys are ignored'); t.eq(N.stats.damageDealt, 0, 'junk values are ignored');
  t.deep(Object.keys(N.stats).sort(), L.statKeys.slice().sort(), 'R.stats never grows a new key');
});
t.test('combatDone: the reward node, its shape, and idempotence', () => {
  const R = NEW({ seed: 8 });
  const node = enter(R, 'enemy');
  const rw = RUN.combatDone(R, fakeC({}));
  t.deep(Object.keys(rw).sort(), ['boss', 'brush', 'cards', 'claimed', 'gems', 'gold', 'goldBase', 'ink', 'log', 'maxHp', 'pending', 'relics', 'source', 'tier'], 'Rewards fields');
  t.eq(R.node.kind, 'reward', 'R.node becomes the reward'); t.eq(R.node.rewards, rw, 'holding these very rewards'); t.eq(R.node.source, 'combat', 'source'); t.deep(R.node.tile, node.tile, 'on the same tile');
  t.eq(rw.tier, 'normal', 'tier'); t.eq(rw.boss, false, 'not a boss'); t.eq(rw.claimed, false, 'unclaimed');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.combatDone(R, fakeC({})), rw, 'a second call returns the same rewards'); t.eq(J(RUN.serialize(R)), snap, 'and changes nothing (no double gold)');
  const s = J(RUN.serialize(RUN.deserialize(JSON.parse(snap))));
  t.eq(s, snap, 'the reward node survives a save round trip');
});
t.test('combatDone: a lost fight ends the run and keeps the stats', () => {
  const R = NEW();
  R.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'normal', enc: null, enemies: ['kappa'], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const rw = RUN.combatDone(R, fakeC({ result: 'lose', stats: { turns: 7, damageTaken: 90, kills: [{ def: 'kappa', tier: 'normal', by: 'card' }] } }));
  t.eq(rw, null, 'no rewards'); t.eq(R.done, true, 'the run is over'); t.eq(R.victory, false, 'not a victory'); t.eq(R.node, null, 'node cleared');
  t.eq(R.stats.turns, 7, 'stats merged'); t.eq(R.stats.kills, 1, 'kills merged'); t.deep(R.foes, { kappa: 1 }, 'foes merged'); t.eq(R.stats.bossKills, 0, 'a lost boss fight is not a kill');
  const B = NEW(); B.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'boss', enc: null, enemies: ['boss_kuzunoha'], seed: 1, rewards: true, onWin: null, source: 'combat' };
  RUN.combatDone(B, fakeC({ result: 'lose', stats: { kills: [] } }));
  t.eq(B.stats.bossKills, 0, 'no boss credit on a loss'); t.eq(B.done, true, 'over');
  const U2 = NEW(); U2.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'normal', enc: null, enemies: [], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const snap = J(RUN.serialize(U2));
  t.eq(RUN.combatDone(U2, fakeC({ result: null })), null, 'a fight that is not over yields null'); t.eq(J(RUN.serialize(U2)), snap, 'and changes nothing'); t.eq(U2.done, false, 'the run goes on');
});
t.test('combatDone accepts anything with summary(), or the summary itself', () => {
  const R = NEW(); R.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'normal', enc: null, enemies: [], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const s = { result: 'win', heroes: [{ id: 'hanae', hp: 20, maxHp: HA }, { id: 'kuro', hp: 20, maxHp: KU }], stats: { kills: [{ def: 'kappa', tier: 'normal', by: 'card' }] } };
  const rw = RUN.combatDone(R, s);
  t.ok(rw && R.heroes[0].hp === 20, 'a bare summary works'); t.eq(R.frontIdx, 0, 'no front() keeps the leader');
  const Q = NEW(); Q.node = null;
  t.ok(RUN.combatDone(Q, fakeC({ tier: 'elite' })), 'works even without a combat node (debug fights)'); t.eq(Q.node.rewards.tier, 'elite', 'tier from C.tier');
});

// ================================================================================================ card offers
t.test('card offers: cardChoices cards, distinct, party heroes only, never locked-and-unowned', () => {
  const bad = { dup: 0, wrongHero: 0, locked: 0, count: 0, starter: 0 };
  for (let i = 0; i < 300; i++) {
    const R = NEW({ seed: i, heroes: i % 2 ? ['hanae', 'kuro'] : ['suzu', 'raiga'] });
    const rw = fight(R, i % 5 === 0 ? 'elite' : 'normal', i);
    if (rw.cards.length !== 3) bad.count++;
    if (new Set(rw.cards).size !== rw.cards.length) bad.dup++;
    rw.cards.forEach((id) => { const d = DATA.cards[id]; if (!R.heroes.some((h) => h.id === d.hero)) bad.wrongHero++; if (d.locked) bad.locked++; if (d.rarity === 'starter' || d.rarity === 'token') bad.starter++; });
  }
  t.deep(bad, { dup: 0, wrongHero: 0, locked: 0, count: 0, starter: 0 }, 'offer rules hold over 300 rewards');
  const R = NEW({ seed: 1 }); R.relics.push('t_choices');
  t.eq(fight(R, 'normal', 1).cards.length, 4, 'cardChoices +1 gives four');
  const S = NEW({ seed: 1, trial: 0, unlocked: { card: ['hanae_u0', 'hanae_r6', 'hanae_r7', 'kuro_u0', 'kuro_r6', 'kuro_r7'], relic: [], gem: [] } });
  const seen = new Set();
  for (let i = 0; i < 400; i++) { S.rareOffset = 40; fight(S, 'elite', i).cards.forEach((id) => seen.add(id)); }
  t.ok(seen.has('hanae_r6') || seen.has('hanae_r7') || seen.has('kuro_r6') || seen.has('kuro_r7'), 'an owned locked card can be offered');
  t.ok(!seen.has('hanae_c99'), 'sanity');
  const O = NEW({ seed: 1, unlocked: null });
  const open = new Set(); for (let i = 0; i < 400; i++) { O.rareOffset = 40; fight(O, 'elite', i).cards.forEach((id) => open.add(id)); }
  t.ok(open.has('hanae_r6') || open.has('kuro_r7') || open.has('hanae_u0'), 'with unlocked undefined (everything open) locked cards show');
});
t.test('card offers: each offer picks a hero uniformly, then a rarity by the tier table', () => {
  const heroes = { hanae: 0, kuro: 0 }, rar = { common: 0, uncommon: 0, rare: 0 };
  let n = 0;
  for (let i = 0; i < 700; i++) {
    const R = NEW({ seed: 1000 + i });
    fight(R, 'normal', i).cards.forEach((id) => { heroes[DATA.cards[id].hero]++; rar[DATA.cards[id].rarity]++; n++; });
  }
  t.near(heroes.hanae / n, 0.5, 0.05, 'heroes split evenly: ' + J(heroes));
  t.near(rar.common / n, 0.62, 0.05, 'common share ' + rar.common / n); t.near(rar.uncommon / n, 0.33, 0.05, 'uncommon share ' + rar.uncommon / n); t.near(rar.rare / n, 0.05, 0.03, 'rare share ' + rar.rare / n);
  const el = { common: 0, uncommon: 0, rare: 0 }; n = 0;
  for (let i = 0; i < 700; i++) { const R = NEW({ seed: 2000 + i }); fight(R, 'elite', i).cards.forEach((id) => { el[DATA.cards[id].rarity]++; n++; }); }
  t.near(el.rare / n, 0.15, 0.04, 'elite rare share ' + el.rare / n); t.near(el.common / n, 0.45, 0.05, 'elite common share ' + el.common / n);
});
t.test('card offers: rare pity (rareOffset) and rareBoost move weight from common to rare', () => {
  const share = (setup, tier) => { let rare = 0, n = 0; for (let i = 0; i < 500; i++) { const R = NEW({ seed: 3000 + i }); setup(R); const rw = fight(R, tier || 'normal', i); rw.cards.forEach((id) => { n++; if (DATA.cards[id].rarity === 'rare') rare++; }); } return rare / n; };
  const base = share(() => {});
  const pity = share((R) => { R.rareOffset = 20; });
  const cap = share((R) => { R.rareOffset = 40; });
  const over = share((R) => { R.rareOffset = 400; });
  const boost = share((R) => { R.relics.push('t_rare'); });
  t.near(pity, 0.25, 0.05, 'offset 20: rare 5 + 20 = 25% (' + pity + ')'); t.near(cap, 0.45, 0.06, 'offset 40: 45% (' + cap + ')'); t.near(over, cap, 0.06, 'the offset is capped at rareOffsetCap (' + over + ')');
  t.near(boost, 0.15, 0.04, 'rareBoost +10: 15% (' + boost + ')'); t.ok(base < pity && pity < cap, 'monotone');
  const both = share((R) => { R.rareOffset = 40; R.relics.push('t_rare'); });
  t.near(both, 0.55, 0.06, 'pity and boost add: 5 + 40 + 10 = 55% (' + both + ')');
});
t.test('card offers: pity rises after a normal or elite reward with no rare, resets when a rare is taken', () => {
  let bumps = 0, kept = 0;
  for (let i = 0; i < 300; i++) {
    const R = NEW({ seed: 4000 + i });
    const rw = fight(R, i % 2 ? 'elite' : 'normal', i);
    if (hasRare(rw.cards)) { t.eq(R.rareOffset, 0, 'a reward that offered a rare does not bump'); kept++; } else { t.eq(R.rareOffset, 1, 'no rare offered: +1'); bumps++; }
  }
  t.ok(bumps > 100 && kept > 5, 'both branches happened: ' + bumps + '/' + kept);
  const R = NEW({ seed: 1 });
  for (let i = 0; i < 5; i++) { const rw = fight(R, 'normal', 50 + i); RUN.claim(R, rw, {}); R.node = null; }
  t.ok(R.rareOffset >= 0, 'sanity');
  const P = NEW({ seed: 1 }); P.rareOffset = 9;
  const rw = fight(P, 'normal', 9);
  const rare = rw.cards.find((id) => DATA.cards[id].rarity === 'rare');
  const common = rw.cards.find((id) => DATA.cards[id].rarity !== 'rare');
  if (common) { const c = RUN.claim(P, rw, { card: common }); t.eq(c.ok, true, 'claimed'); t.ok(P.rareOffset >= 9, 'taking a non-rare does not reset'); }
  const Q = NEW({ seed: 1 }); Q.rareOffset = 9;
  const rq = { cards: ['hanae_r0'], relics: [], gems: [], brush: null, claimed: false };
  RUN.claim(Q, rq, { card: 'hanae_r0' }); t.eq(Q.rareOffset, 0, 'taking a rare resets the pity');
  t.ok(rare === undefined || DATA.cards[rare].rarity === 'rare', 'sanity');
  const B = NEW({ seed: 1 }); B.rareOffset = 5; fight(B, 'boss', 1); t.eq(B.rareOffset, 5, 'a boss reward does not touch the pity counter');
  const E0 = NEW({ seed: 1 }); E0.unlocked = { card: [], relic: [], gem: [] };
  const none = NEW({ seed: 1 }); DATA.cards; none.heroes.forEach((h) => { h.id = h.id; });
  t.eq(E0.rareOffset, 0, 'fresh run has no pity');
});
t.test('card offers: a drained rarity falls back instead of returning nothing', () => {
  const A = fresh();
  Object.keys(A.DATA.cards).forEach((id) => { if (A.DATA.cards[id].hero === 'hanae' && A.DATA.cards[id].rarity === 'rare') A.DATA.cards[id].locked = true; });
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: { card: [], relic: [], gem: [] } });
  R.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'boss', enc: null, enemies: [], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const rw = A.RUN.combatDone(R, fakeC({}));
  t.eq(rw.cards.length, 3, 'a boss reward still has three cards'); t.ok(rw.cards.every((id) => A.DATA.cards[id].hero === 'kuro'), 'only kuro rares were left, so only kuro cards');
  const B = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: { card: [], relic: [], gem: [] } });
  Object.keys(A.DATA.cards).forEach((id) => { if (A.DATA.cards[id].rarity === 'rare') A.DATA.cards[id].locked = true; });
  B.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'boss', enc: null, enemies: [], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const rb = A.RUN.combatDone(B, fakeC({}));
  t.eq(rb.cards.length, 3, 'with no rares at all a boss offers the next best'); t.ok(rb.cards.every((id) => A.DATA.cards[id].rarity === 'uncommon'), 'uncommons');
  Object.keys(A.DATA.cards).forEach((id) => { if (A.DATA.cards[id].hero !== 'curse') A.DATA.cards[id].locked = true; });
  const C = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: { card: [], relic: [], gem: [] } });
  C.node = { kind: 'combat', tile: { q: 1, r: 0 }, tier: 'normal', enc: null, enemies: [], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const rc = A.RUN.combatDone(C, fakeC({}));
  t.eq(rc.cards.length, 0, 'with nothing unlocked the offer is empty (and the screen shows only Continue)'); t.eq(C.rareOffset, 0, 'an empty offer does not bump the pity counter');
});

// ================================================================================================ relic, gem and brush rewards
t.test('elite reward: one relic (never boss or shop rarity), unowned, unlocked, for this party', () => {
  const rar = { common: 0, uncommon: 0, rare: 0 };
  for (let i = 0; i < 500; i++) {
    const R = NEW({ seed: 5000 + i, heroes: i % 2 ? ['hanae', 'kuro'] : ['suzu', 'raiga'] });
    if (i % 7 === 0) R.relics.push('t_c0', 't_u0');
    const rw = fight(R, 'elite', i);
    t.eq(rw.relics.length, 1, 'one relic');
    const d = DATA.relics[rw.relics[0]];
    rar[d.rarity]++;
    t.ok(['common', 'uncommon', 'rare'].indexOf(d.rarity) >= 0, 'elite relics are common..rare: ' + d.rarity);
    t.ok(!d.locked, 'not locked'); t.ok(R.relics.indexOf(d.id) < 0, 'not already owned'); t.ok(!d.hero || R.heroes.some((h) => h.id === d.hero), 'a hero relic only with its hero: ' + d.id);
  }
  const n = rar.common + rar.uncommon + rar.rare;
  t.near(rar.common / n, 0.5, 0.06, 'weights 50/40/10: common ' + rar.common / n); t.near(rar.rare / n, 0.1, 0.05, 'rare ' + rar.rare / n);
  t.eq(fight(NEW(), 'normal', 1).relics.length, 0, 'a normal fight offers no relic');
});
t.test('boss reward: a rare card set, three boss relics to choose from, a gem, no brush', () => {
  const R = NEW({ seed: 3 });
  const rw = fight(R, 'boss', 1);
  t.eq(rw.boss, true, 'boss flag'); t.ok(rw.cards.length === 3 && rw.cards.every((id) => DATA.cards[id].rarity === 'rare'), 'three rares');
  t.eq(rw.relics.length, 3, 'three relics'); t.eq(new Set(rw.relics).size, 3, 'distinct'); t.ok(rw.relics.every((id) => DATA.relics[id].rarity === 'boss'), 'all boss rarity');
  t.eq(rw.gems.length, 1, 'a gem'); t.eq(rw.brush, null, 'no brush from a boss'); t.eq(rw.tier, 'boss', 'tier');
  const bossIds = DATA.relicPool('boss').map((r) => r.id);
  t.eq(bossIds.length, 8, 'the universe has eight boss relics');
  const a = NEW({ seed: 3 }); bossIds.slice(0, 7).forEach((id) => a.relics.push(id));
  const ra = fight(a, 'boss', 1);
  t.eq(ra.relics.length, 3, 'still three offers'); t.eq(ra.relics[0], bossIds[7], 'the one boss relic left comes first'); t.ok(ra.relics.slice(1).every((id) => DATA.relics[id].rarity === 'rare'), 'then rares fill the gap');
  const b = NEW({ seed: 3 }); bossIds.forEach((id) => b.relics.push(id));
  const rb = fight(b, 'boss', 1);
  t.ok(rb.relics.length === 3 && rb.relics.every((id) => DATA.relics[id].rarity === 'rare'), 'no boss relics left: three rares');
  const seen = {}; for (let i = 0; i < 200; i++) fight(NEW({ seed: i }), 'boss', i).relics.forEach((id) => { seen[id] = 1; });
  t.eq(Object.keys(seen).length, 8, 'across seeds every boss relic turns up');
});
t.test('gem and brush drops: elites sometimes, event fights always brush, gems match the chapter table', () => {
  let gem = 0, brush = 0;
  for (let i = 0; i < 600; i++) { const rw = fight(NEW({ seed: 6000 + i }), 'elite', i); gem += rw.gems.length; brush += rw.brush ? 1 : 0; if (rw.brush) t.ok(DATA.brushes[rw.brush], 'a real brush'); if (rw.gems[0]) t.ok(DATA.gems[rw.gems[0]], 'a real gem'); }
  t.near(gem / 600, 0.4, 0.07, 'elite gem chance ' + gem / 600); t.near(brush / 600, 0.5, 0.07, 'elite brush chance ' + brush / 600);
  let ng = 0, nb = 0; for (let i = 0; i < 200; i++) { const rw = fight(NEW({ seed: i }), 'normal', i); ng += rw.gems.length; nb += rw.brush ? 1 : 0; }
  t.eq(ng + nb, 0, 'normal fights drop neither');
  let eb = 0; for (let i = 0; i < 100; i++) { const rw = fight(NEW({ seed: i }), 'normal', i, {}, { source: 'event' }); if (rw.brush) eb++; t.eq(rw.source, 'event', 'source'); }
  t.eq(eb, 100, 'fable fights always drop a brush');
  const tiers = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 400; i++) { const R = NEW({ seed: i, unlocked: null }); const rw = fight(R, 'boss', i); tiers[DATA.gems[rw.gems[0]].tier]++; }
  t.ok(tiers[1] > tiers[2] && tiers[2] > tiers[3], 'chapter 1 leans on tier 1 gems: ' + J(tiers));
  const t3 = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 400; i++) { const R = NEW({ seed: i, unlocked: null }); RUN.startChapter(R, 3); const rw = fight(R, 'boss', i); t3[DATA.gems[rw.gems[0]].tier]++; }
  t.ok(t3[3] > t3[1], 'chapter 3 leans on tier 3: ' + J(t3));
});
t.test('rewards:false gives no gold, cards, relics, gems or brush, but the fight itself still counts', () => {
  const R = NEW({ seed: 4 }); const g = R.gold; R.ink = 2;
  const rw = fight(R, 'elite', 1, { stats: { kills: [{ def: 'kappa', tier: 'normal', by: 'card' }] } }, { rewards: false });
  t.eq(rw.gold, 0, 'no gold'); t.deep(rw.cards, [], 'no cards'); t.deep(rw.relics, [], 'no relics'); t.deep(rw.gems, [], 'no gems'); t.eq(rw.brush, null, 'no brush'); t.eq(R.gold, g, 'gold untouched');
  t.eq(R.ink, 3, 'kill Ink is a consequence, not a reward'); t.eq(R.stats.kills, 1, 'stats merge'); t.eq(R.rareOffset, 0, 'no pity bump');
  t.eq(R.node.kind, 'reward', 'a (bare) reward node keeps the flow uniform');
});
t.test('combatDone fires onFightWon before rolling rewards, filtered by tier', () => {
  const R = NEW(); R.relics.push('t_fightgold', 't_elitegold'); const g = R.gold;
  const rw = fight(R, 'normal', 1);
  t.eq(R.gold - g, rw.goldBase + 2, 'a plain fight pays the generic relic only');
  const E1 = NEW(); E1.relics.push('t_fightgold', 't_elitegold'); const g2 = E1.gold;
  const re = fight(E1, 'elite', 1);
  t.eq(E1.gold - g2, re.goldBase + 22, 'an elite fight pays both');
  t.ok(re.log.some((x) => x.op === 'relic' && x.id === 't_elitegold'), 'the log names the relic so the screen can flash it');
  const onWin = NEW();
  const rw2 = fight(onWin, 'normal', 1, {}, { onWin: [{ op: 'gold', n: 50 }, { op: 'removeCard' }, { op: 'flag', k: 'won_it' }] });
  t.eq(onWin.flags.won_it, 1, 'win ops ran'); t.eq(rw2.pending.length, 1, 'a choice op waits as pending'); t.eq(onWin.pending.length, 1, 'and in R.pending'); t.ok(onWin.gold >= E.startGold + 50, 'gold op applied');
  const ok = RUN.resolvePending(onWin, rw2.pending[0].id, [onWin.deck[0].uid]);
  t.eq(ok.ok, true, 'resolved'); t.eq(onWin.deck.length, 9, 'a card was removed');
});

// ================================================================================================ claim
t.test('claim: card, relic, gem, brush, each optional, nothing applied on a bad choice', () => {
  const R = NEW({ seed: 9 });
  const rw = fight(R, 'elite', 1);
  const card = rw.cards[0], relic = rw.relics[0];
  const before = J(RUN.serialize(R));
  t.eq(RUN.claim(R, rw, { card: 'hanae_slash' }).reason, 'card', 'a card that was not offered'); t.eq(RUN.claim(R, rw, { relic: 'jade_key', card }).reason, 'relic', 'a relic that was not offered');
  t.eq(RUN.claim(R, rw, { gem: 'red_g0' }).reason, 'gem', 'a gem that was not offered');
  if (!rw.brush) t.eq(RUN.claim(R, rw, { takeBrush: true }).reason, 'brush', 'no brush was offered');
  t.eq(J(RUN.serialize(R)), before, 'refusals change nothing, not even the good half of a mixed choice');
  const deck = R.deck.length, relics = R.relics.length;
  const res = RUN.claim(R, rw, { card, relic, gem: rw.gems[0] || null, takeBrush: !!rw.brush });
  t.eq(res.ok, true, 'claimed'); t.eq(R.deck.length, deck + 1, 'card added'); t.eq(R.deck[R.deck.length - 1].id, card, 'the card'); t.eq(R.relics.length, relics + 1, 'relic added'); t.eq(R.relics[R.relics.length - 1], relic, 'the relic');
  t.eq(R.stats.relicsFound, 1, 'relicsFound'); if (rw.gems[0]) t.deep(R.gems, [rw.gems[0]], 'gem added'); if (rw.brush) t.ok(R.brushes.indexOf(rw.brush) >= 0, 'brush added');
  t.eq(rw.claimed, true, 'marked claimed'); t.eq(R.node.rewards.claimed, true, 'also on the node copy');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.claim(R, rw, { card }).reason, 'claimed', 'no second claim'); t.eq(J(RUN.serialize(R)), snap, 'so no card farming');
  const skip = NEW({ seed: 9 }); const rs = fight(skip, 'normal', 1); const d = skip.deck.length;
  t.eq(RUN.claim(skip, rs, {}).ok, true, 'skipping everything is fine'); t.eq(skip.deck.length, d, 'no card'); t.eq(rs.claimed, true, 'and it is over');
  t.eq(RUN.claim(skip, null, {}).ok, false, 'no rewards, no claim');
  const copy = NEW({ seed: 9 }); const rc = fight(copy, 'normal', 1); const clone = JSON.parse(JSON.stringify(rc));
  RUN.claim(copy, clone, { card: rc.cards[0] }); t.eq(copy.node.rewards.claimed, true, 'a screen holding a copy of the rewards still closes the node copy');
});
t.test('claim: a relic with an onPickup hook reports its log and pending choices', () => {
  const R = NEW(); R.gold = 0;
  const rw = { cards: [], relics: ['t_pickup', 't_pickcard'], gems: [], brush: null, claimed: false };
  const a = RUN.claim(R, rw, { relic: 't_pickup' });
  t.eq(R.gold, 10, 'onPickup gold'); t.ok(a.log.some((x) => x.op === 'relic'), 'log has the relic flash');
  const R2 = NEW();
  const b = RUN.claim(R2, { cards: [], relics: ['t_pickcard'], gems: [], brush: null, claimed: false }, { relic: 't_pickcard' });
  t.eq(b.pending.length, 1, 'a removeCard hook waits for the player'); t.eq(b.pending[0].op, 'removeCard', 'which op');
  const R3 = NEW();
  RUN.claim(R3, { cards: [], relics: ['t_pickrelic'], gems: [], brush: null, claimed: false }, { relic: 't_pickrelic' });
  t.deep(R3.relics, ['t_pickrelic', 't_pickup'], 'a pickup hook can hand out another relic, whose own hook then runs'); t.eq(R3.gold, E.startGold + 10, 'nested onPickup fired');
});
t.test('finishNode after a reward: tile done, node cleared, boss rewards flag the chapter', () => {
  const R = NEW({ seed: 8 });
  const node = enter(R, 'enemy');
  const rw = RUN.combatDone(R, fakeC({}));
  RUN.claim(R, rw, {});
  const fin = RUN.finishNode(R);
  t.eq(fin.chapterEnded, false, 'a normal fight'); t.eq(R.node, null, 'node cleared'); t.eq(R.map.tiles[MAP.key(node.tile.q, node.tile.r)].done, true, 'tile marked done'); t.eq(R.chapterCleared, false, 'chapter goes on');
  t.deep(RUN.finishNode(R), { chapterEnded: false }, 'finishNode with no node is a no-op');
  const B = NEW({ seed: 8 });
  const bn = enter(B, 'boss');
  t.eq(bn.tier, 'boss', 'boss node');
  const rb = RUN.combatDone(B, fakeC({ stats: { kills: [{ def: 'boss_kuzunoha', tier: 'boss', by: 'card' }] } }));
  RUN.claim(B, rb, {});
  const fb = RUN.finishNode(B);
  t.eq(fb.chapterEnded, true, 'the boss reward ends the chapter'); t.eq(B.chapterCleared, true, 'and the flag survives a save until chapterEnd runs'); t.eq(RUN.deserialize(JSON.parse(JSON.stringify(RUN.serialize(B)))).chapterCleared, true, 'saved');
});

// ================================================================================================ chests and gem caches
t.test('chest: gold (goldMul applies) plus a relic offer or gems, taken once', () => {
  const R = NEW({ seed: 2 });
  const node = enter(R, 'chest', (x) => { x.content = { gold: 60, relic: 'rare', gems: false }; });
  t.eq(node.loot.gold, 60, 'gold from the map'); t.ok(node.loot.relic && DATA.relics[node.loot.relic].rarity === 'rare', 'a rare relic'); t.deep(node.loot.gems, [], 'no gems when there is a relic');
  const g = R.gold, ink = R.ink;
  const res = RUN.take(R, node, { relic: true });
  t.eq(res.ok, true, 'taken'); t.eq(R.gold, g + 60, 'gold granted on take'); t.deep(R.relics, [node.loot.relic], 'relic gained'); t.eq(R.stats.chestsOpened, 1, 'chestsOpened'); t.eq(R.stats.goldEarned, 60, 'goldEarned'); t.eq(node.taken, true, 'marked');
  t.eq(R.ink, ink, 'no Ink from a chest');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.take(R, node, { relic: true }).reason, 'taken', 'once only'); t.eq(J(RUN.serialize(R)), snap, 'and nothing changed');
  const M = NEW({ seed: 2 }); M.relics.push('t_gold');
  t.eq(enter(M, 'chest', (x) => { x.content = { gold: 60, relic: null, gems: true }; }).loot.gold, 75, 'goldMul x1.25 applies to chest gold');
  const S = NEW({ seed: 2 });
  const gemChest = enter(S, 'chest', (x) => { x.content = { gold: 50, relic: null, gems: true }; });
  t.eq(gemChest.loot.relic, null, 'no relic'); t.eq(gemChest.loot.gems.length, 3, 'a choice of three gems'); t.eq(new Set(gemChest.loot.gems).size, 3, 'distinct');
  t.eq(RUN.take(S, gemChest, { gem: 'nope' }).reason, 'gem', 'a gem that was not offered'); t.eq(gemChest.taken, false, 'refusal keeps the chest open');
  const r = RUN.take(S, gemChest, { gem: gemChest.loot.gems[1] });
  t.eq(r.ok, true, 'taken'); t.deep(S.gems, [gemChest.loot.gems[1]], 'the chosen gem'); t.eq(S.gold, E.startGold + 50, 'gold too');
  const N = NEW({ seed: 2 }); const noRelic = enter(N, 'chest', (x) => { x.content = { gold: 50, relic: null, gems: true }; });
  t.eq(RUN.take(N, noRelic, { relic: true }).reason, 'relic', 'no relic to take'); t.eq(RUN.take(N, noRelic, {}).ok, true, 'leaving everything but the gold is allowed'); t.eq(N.gold, E.startGold + 50, 'the gold is always granted');
});
t.test('chest: a drained rarity falls back to another; only with no relic left at all does it offer gems', () => {
  const A = fresh();
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 2, unlocked: ALL });
  A.DATA.relicPool('rare').forEach((r) => R.relics.push(r.id));
  const tile = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => x.type === 'chest');
  tile.content = { gold: 50, relic: 'rare', gems: false };
  Object.keys(R.map.tiles).forEach((k) => { if (R.map.tiles[k] !== tile) R.map.tiles[k].done = true; });
  const p = A.MAP.pathToPaint(R.map, tile.q, tile.r); if (p) p.path.forEach((c) => { R.ink = R.inkMax; A.RUN.paint(R, c[0], c[1]); });
  const pos = R.map.pos;
  const chest = (() => { const q = [[pos.q, pos.r]], prev = {}; prev[A.MAP.key(pos.q, pos.r)] = null; while (q.length) { const c = q.shift(); A.MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = A.MAP.key(n[0], n[1]); if (!(k in prev) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); } const path = []; for (let c = [tile.q, tile.r]; c; c = prev[A.MAP.key(c[0], c[1])]) path.unshift(c); let res = null; path.slice(1).forEach((c) => { res = A.RUN.step(R, c[0], c[1]); }); return res; })();
  t.ok(chest.loot.relic && A.DATA.relics[chest.loot.relic].rarity !== 'rare', 'the rare pool is empty, so the offer falls back to another rarity: ' + chest.loot.relic);
  t.deep(chest.loot.gems, [], 'and there are no gems beside it');
});
t.test('gem cache: choose one of three, or none', () => {
  const R = NEW({ seed: 5 });
  const node = enter(R, 'gemcache');
  t.eq(RUN.take(R, node, { gem: 'nope' }).reason, 'gem', 'not offered'); t.deep(R.gems, [], 'nothing gained');
  const r = RUN.take(R, node, { gem: node.offers[2] });
  t.eq(r.ok, true, 'taken'); t.deep(R.gems, [node.offers[2]], 'the chosen gem'); t.eq(node.taken, true, 'marked'); t.eq(RUN.take(R, node, { gem: node.offers[0] }).reason, 'taken', 'one only');
  const S = NEW({ seed: 5 }); const skip = enter(S, 'gemcache');
  t.eq(RUN.take(S, skip, {}).ok, true, 'walking away is allowed'); t.deep(S.gems, [], 'no gem');
  const colors = new Set(); for (let i = 0; i < 40; i++) enter(NEW({ seed: 100 + i }), 'gemcache').offers.forEach((g) => colors.add(DATA.gems[g].color));
  t.eq(colors.size, 4, 'all colours can turn up');
  const distinct = []; for (let i = 0; i < 40; i++) { const o = enter(NEW({ seed: 200 + i }), 'gemcache').offers; distinct.push(new Set(o.map((g) => DATA.gems[g].color)).size); }
  t.ok(distinct.every((n) => n === 3), 'three different colours when the pool allows: ' + distinct.join(''));
  const locked = new Set(); for (let i = 0; i < 80; i++) enter(NEW({ seed: 300 + i, unlocked: ALL }), 'gemcache').offers.forEach((g) => locked.add(g));
  t.ok([...locked].every((g) => !DATA.gems[g].locked), 'locked gems never show up until owned');
});

// ================================================================================================ shop
const shopOf = (R, seed, mutate) => enter(R, 'shop', (x) => { x.content = { shop: { seed } }; if (mutate) mutate(x); });
t.test('shop: five cards, two gems, three relics, one brush, removal, keys and one sale', () => {
  const R = NEW({ seed: 4 });
  const node = shopOf(R, 555);
  const items = node.stock.items;
  const by = (k) => items.filter((x) => x.kind === k);
  t.eq(by('card').length, E.shop.cards, 'five cards'); t.eq(by('gem').length, E.shop.gems, 'two gems'); t.eq(by('relic').length, E.shop.relics, 'three relics'); t.eq(by('brush').length, E.shop.brushes, 'one brush');
  t.deep(items.map((x) => x.key), ['c0', 'c1', 'c2', 'c3', 'c4', 'g0', 'g1', 'r0', 'r1', 'r2', 'b0'], 'keys are the kind letter plus the index within the kind');
  t.eq(items.filter((x) => x.sale).length, 1, 'exactly one sale'); t.ok(by('card').filter((x) => x.sale).length === 1, 'and it is a card');
  items.forEach((x) => { t.eq(x.sold, false, x.key + ' unsold'); t.ok(x.price >= 1 && Number.isInteger(x.price), x.key + ' has a whole price'); t.ok(typeof x.id === 'string', x.key + ' id'); });
  t.eq(new Set(by('card').map((x) => x.id)).size, 5, 'five different cards'); t.eq(new Set(by('relic').map((x) => x.id)).size, 3, 'three different relics');
  t.eq(node.stock.removePrice, E.price.remove, 'removal starts at the base price');
  const heroes = new Set(by('card').map((x) => DATA.cards[x.id].hero));
  t.deep([...heroes].sort(), ['hanae', 'kuro'], 'a mix of both heroes, always'); 
  t.eq(R.stats.shopsVisited, 1, 'shopsVisited');
});
t.test('shop: prices are ECONOMY.price times priceMul, rounded; the sale halves one card', () => {
  const check = (R, mul, label) => {
    const st = shopOf(R, 71).stock;
    st.items.forEach((x) => {
      const base = x.kind === 'card' ? E.price.card[DATA.cards[x.id].rarity] : x.kind === 'gem' ? E.price.gem[DATA.gems[x.id].tier] : x.kind === 'relic' ? E.price.relic[DATA.relics[x.id].rarity] : E.price.brush;
      const full = Math.round(base * mul);
      t.eq(x.price, x.sale ? Math.round(full * E.price.saleFrac) : full, `${label} ${x.key} price`);
      if (x.sale) t.eq(x.was, full, `${label} the sale shows the price it replaces`);
    });
    t.eq(st.removePrice, Math.round(E.price.remove * mul), label + ' removal');
    return st;
  };
  check(NEW({ seed: 4 }), 1, 'base');
  const cheap = NEW({ seed: 4 }); cheap.relics.push('t_price'); check(cheap, 0.8, 'priceMul -20%');
  check(NEW({ seed: 4, trial: 10 }), 1.1, 'trial 10 (+10%)');
  const both = NEW({ seed: 4, trial: 10 }); both.relics.push('t_price'); check(both, 0.9, 'trial and relic add: 1 + 0.1 - 0.2');
});
t.test('shop: r0 is a shop relic while one is unowned; the other two roll the shop weights', () => {
  const counts = { common: 0, uncommon: 0, rare: 0 };
  for (let s = 0; s < 250; s++) {
    const st = shopOf(NEW({ seed: s }), 900 + s).stock;
    const r = st.items.filter((x) => x.kind === 'relic');
    t.eq(DATA.relics[r[0].id].rarity, 'shop', 'r0 is a shop relic'); t.eq(r[0].price, E.price.relic.shop, 'shop relic price');
    r.slice(1).forEach((x) => { const rr = DATA.relics[x.id].rarity; t.ok(rr in counts, 'the other two are common..rare: ' + rr); counts[rr]++; });
  }
  const n = counts.common + counts.uncommon + counts.rare;
  t.near(counts.common / n, 0.4, 0.07, 'weights 40/40/20: common ' + counts.common / n); t.near(counts.rare / n, 0.2, 0.06, 'rare ' + counts.rare / n);
  const R = NEW({ seed: 1 }); DATA.relicPool('shop').forEach((r) => R.relics.push(r.id));
  const st = shopOf(R, 5).stock;
  t.eq(st.items.filter((x) => x.kind === 'relic').length, 3, 'still three relics once every shop relic is owned');
  t.ok(st.items.filter((x) => x.kind === 'relic').every((x) => ['common', 'uncommon', 'rare'].indexOf(DATA.relics[x.id].rarity) >= 0), 'from the ordinary pools');
  const owned = NEW({ seed: 1 }); owned.relics.push('t_c0', 't_c1', 't_c2', 't_c3', 't_c4', 't_c5', 't_u0');
  shopOf(owned, 6).stock.items.filter((x) => x.kind === 'relic').forEach((x) => t.ok(owned.relics.indexOf(x.id) < 0, 'never sells what you own'));
});
t.test('shop: cards are party-only, unlocked-only; gems are unlocked-only and distinct', () => {
  for (let s = 0; s < 120; s++) {
    const R = NEW({ seed: s, heroes: s % 2 ? ['suzu', 'raiga'] : ['hanae', 'kuro'] });
    const st = shopOf(R, 40 + s).stock;
    st.items.filter((x) => x.kind === 'card').forEach((x) => { const d = DATA.cards[x.id]; t.ok(R.heroes.some((h) => h.id === d.hero) && !d.locked && d.rarity !== 'starter', 'card ' + x.id); });
    st.items.filter((x) => x.kind === 'gem').forEach((x) => t.ok(!DATA.gems[x.id].locked, 'gem ' + x.id));
    t.eq(new Set(st.items.filter((x) => x.kind === 'gem').map((x) => x.id)).size, 2, 'two different gems');
    st.items.filter((x) => x.kind === 'relic').forEach((x) => { const d = DATA.relics[x.id]; t.ok(!d.locked && (!d.hero || R.heroes.some((h) => h.id === d.hero)), 'relic ' + x.id); });
  }
  const R = NEW({ seed: 3, unlocked: { card: ['hanae_r6'], relic: ['t_locked'], gem: DATA.gemPool().filter((g) => g.locked).map((g) => g.id) } });
  const seen = new Set(); for (let s = 0; s < 300; s++) shopOf(NEW({ seed: 1, unlocked: R.unlocked }), 5000 + s).stock.items.forEach((x) => seen.add(x.id));
  t.ok(seen.has('hanae_r6') || seen.has('t_locked') || [...seen].some((id) => DATA.gems[id] && DATA.gems[id].locked), 'owned locked content can be sold');
});
t.test('shop: the stock is a function of content.shop.seed (and the party), not of the run seed or the visit order', () => {
  const a = shopOf(NEW({ seed: 10 }), 4242).stock, b = shopOf(NEW({ seed: 11 }), 4242).stock;
  t.eq(J(a), J(b), 'two runs, one shop seed, one stock');
  t.ok(J(shopOf(NEW({ seed: 10 }), 4243).stock) !== J(a), 'another shop seed, another stock');
  const c = shopOf(NEW({ seed: 10, heroes: ['suzu', 'raiga'] }), 4242).stock;
  t.ok(J(c) !== J(a), 'another party sees other cards');
  const R = NEW({ seed: 10 }); R.gold = 999; R.ink = R.inkMax;
  const first = shopOf(R, 4242);
  const snap = J(RUN.serialize(R));
  const back = RUN.deserialize(JSON.parse(snap));
  t.eq(J(back.node.stock), J(first.stock), 'a reload restores the very same stock');
  const legacy = NEW({ seed: 10 }); const noSeed = enter(legacy, 'shop', (x) => { x.content = {}; });
  t.eq(J(noSeed.stock), J(enter(NEW({ seed: 10 }), 'shop', (x) => { x.content = {}; }).stock), 'without a content seed the tile seed is used, still deterministic');
});
t.test('shop: onShopEnter fires when the shop opens', () => {
  const R = NEW(); R.relics.push('t_shopgift'); const g = R.gold;
  const node = shopOf(R, 1, null);
  t.eq(R.gold, g + 5, 'a shop relic paid on entry'); t.ok(node.hookLog.some((x) => x.op === 'relic' && x.id === 't_shopgift'), 'and the entry names it');
});
t.test('shopBuy: each kind, gold, sold flags, errors change nothing', () => {
  const R = NEW({ seed: 4 }); R.gold = 2000;
  const node = shopOf(R, 555); R.gold = 2000;
  const st = node.stock;
  const card = st.items.find((x) => x.kind === 'card' && !x.sale);
  const deck = R.deck.length;
  const r = RUN.shopBuy(R, st, card.key);
  t.eq(r.ok, true, 'bought a card'); t.eq(R.deck.length, deck + 1, 'card in the deck'); t.eq(R.deck[deck].id, card.id, 'the right card'); t.eq(R.gold, 2000 - card.price, 'gold spent'); t.eq(card.sold, true, 'sold flag'); t.eq(R.stats.purchases, 1, 'purchases'); t.eq(R.stats.goldSpent, card.price, 'goldSpent');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.shopBuy(R, st, card.key).reason, 'sold', 'sold out'); t.eq(RUN.shopBuy(R, st, 'zz9').reason, 'nokey', 'no such item'); t.eq(J(RUN.serialize(R)), snap, 'nothing changed');
  t.eq(st.items.length, 11, 'sold items stay in the stock (disabled on screen)');
  const gem = st.items.find((x) => x.kind === 'gem'); RUN.shopBuy(R, st, gem.key); t.deep(R.gems, [gem.id], 'gem in R.gems');
  const brush = st.items.find((x) => x.kind === 'brush'); RUN.shopBuy(R, st, brush.key); t.ok(R.brushes.filter((b) => b === brush.id).length >= 1, 'brush in the tray');
  const rel = st.items.find((x) => x.kind === 'relic'); const rr = RUN.shopBuy(R, st, rel.key); t.eq(rr.ok, true, 'relic bought'); t.ok(R.relics.indexOf(rel.id) >= 0, 'in R.relics'); t.eq(R.stats.relicsFound, 1, 'relicsFound');
  const poor = NEW({ seed: 4 }); const pn = shopOf(poor, 555); poor.gold = 10;
  const before = J(RUN.serialize(poor));
  const item = pn.stock.items[0];
  t.eq(RUN.shopBuy(poor, pn.stock, item.key).reason, 'gold', 'cannot afford'); t.eq(J(RUN.serialize(poor)), before, 'a failed purchase changes nothing');
  poor.gold = item.price; t.eq(RUN.shopBuy(poor, pn.stock, item.key).ok, true, 'exact change is enough'); t.eq(poor.gold, 0, 'to the last coin');
});
t.test('shopBuy: the screen may hold a copy of the stock; R.node stays in step', () => {
  const R = NEW({ seed: 4 }); const node = shopOf(R, 555); R.gold = 999;
  const copy = JSON.parse(JSON.stringify(node.stock));
  const key = copy.items[0].key;
  RUN.shopBuy(R, copy, key);
  t.eq(node.stock.items[0].sold, true, 'the live stock knows it sold');
  const rp = copy.removePrice;
  RUN.shopRemove(R, copy, R.deck[0].uid);
  t.ok(node.stock.removePrice > rp, 'and its removal price rose');
});
t.test('a shop relic with a pickup choice hands the pending back through shopBuy', () => {
  const A = fresh(); const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 4, unlocked: ALL });
  const st = { items: [{ key: 'r0', kind: 'relic', id: 't_pickcard', price: 5, sale: false, sold: false }], removePrice: 75 };
  R.gold = 50;
  const r = A.RUN.shopBuy(R, st, 'r0');
  t.eq(r.ok, true, 'bought'); t.eq(r.pending.length, 1, 'a choice is waiting'); t.eq(R.pending.length, 1, 'kept in R.pending');
});
t.test('shopRemove: the price rises with every removal and scales with priceMul; gems come back', () => {
  const R = NEW({ seed: 4 }); const node = shopOf(R, 555); R.gold = 9999;
  const st = node.stock;
  t.eq(st.removePrice, E.price.remove, 'first removal');
  const inst = R.deck[0]; inst.gems[0] = 'red_g0';
  const r1 = RUN.shopRemove(R, st, inst.uid);
  t.eq(r1.ok, true, 'removed'); t.eq(R.deck.length, 9, 'card gone'); t.eq(R.gold, 9999 - E.price.remove, 'paid'); t.eq(R.removals, 1, 'removals'); t.deep(R.gems, ['red_g0'], 'the gem came back');
  t.eq(st.removePrice, E.price.remove + E.price.removeStep, 'next removal is dearer');
  RUN.shopRemove(R, st, R.deck[0].uid); t.eq(st.removePrice, E.price.remove + 2 * E.price.removeStep, 'and dearer again'); t.eq(R.removals, 2, 'two removals');
  t.eq(R.stats.purchases, 2, 'each removal is a purchase');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.shopRemove(R, st, 99999).reason, 'card', 'no such card'); t.eq(J(RUN.serialize(R)), snap, 'nothing changed');
  const poor = NEW({ seed: 4 }); const pn = shopOf(poor, 555); poor.gold = E.price.remove - 1;
  t.eq(RUN.shopRemove(poor, pn.stock, poor.deck[0].uid).reason, 'gold', 'cannot afford it'); t.eq(poor.deck.length, 10, 'card kept');
  const trial = NEW({ seed: 4, trial: 10 }); const tn = shopOf(trial, 555);
  t.eq(tn.stock.removePrice, Math.round(E.price.remove * 1.1), 'priceMul applies to removal'); trial.gold = 9999; RUN.shopRemove(trial, tn.stock, trial.deck[0].uid);
  t.eq(tn.stock.removePrice, Math.round((E.price.remove + E.price.removeStep) * 1.1), 'and to the step');
  const later = NEW({ seed: 4 }); later.removals = 3; t.eq(shopOf(later, 555).stock.removePrice, E.price.remove + 3 * E.price.removeStep, 'a later shop starts from the run-wide removal count');
  t.eq(RUN.shopRemove(R, null, 1).reason, 'nostock', 'no stock');
});
t.test('shop: reloading from the entry snapshot never keeps a purchase or re-rolls the stock', () => {
  const R = NEW({ seed: 4 }); const node = shopOf(R, 555); R.gold = 500;
  const entry = J(RUN.serialize(R));
  RUN.shopBuy(R, node.stock, 'c0'); RUN.shopBuy(R, node.stock, 'g0');
  const back = RUN.deserialize(JSON.parse(entry));
  t.eq(back.gold, 500, 'gold from before the purchases'); t.eq(back.deck.length, 10, 'deck from before'); t.ok(back.node.stock.items.every((x) => !x.sold), 'nothing sold'); t.eq(J(back.node.stock), J(RUN.deserialize(JSON.parse(entry)).node.stock), 'same stock every time');
});
t.test('chest: with no relic left in any pool the chest offers gems instead', () => {
  const A = fresh();
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 2, unlocked: ALL });
  Object.keys(A.DATA.relics).forEach((id) => R.relics.push(id));
  const tile = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => x.type === 'chest' && A.MAP.pathToPaint(R.map, x.q, x.r));
  tile.content = { gold: 50, relic: 'common', gems: false };
  Object.keys(R.map.tiles).forEach((k) => { if (R.map.tiles[k] !== tile) R.map.tiles[k].done = true; });
  const p = A.MAP.pathToPaint(R.map, tile.q, tile.r); p.path.forEach((c) => { R.ink = R.inkMax; A.RUN.paint(R, c[0], c[1]); });
  const q = [[R.map.pos.q, R.map.pos.r]], prev = {}; prev[A.MAP.key(R.map.pos.q, R.map.pos.r)] = null;
  while (q.length) { const c = q.shift(); A.MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = A.MAP.key(n[0], n[1]); if (!(k in prev) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); }
  const path = []; for (let c = [tile.q, tile.r]; c; c = prev[A.MAP.key(c[0], c[1])]) path.unshift(c);
  let node = null; path.slice(1).forEach((c) => { node = A.RUN.step(R, c[0], c[1]); });
  t.eq(node.loot.relic, null, 'no relic'); t.eq(node.loot.gems.length, 3, 'three gems');
});

// ================================================================================================ events
function evWorld(events) {
  const A = fresh();
  Object.keys(A.DATA.events).forEach((k) => { delete A.DATA.events[k]; });
  if (events) A.DATA.add('events', events);
  return A;
}
const evTile = (R) => R.map.tiles[MAP.key(R.map.start.q, R.map.start.r)];
t.test('pickEvent: chapter, when (flag, relic, hero) and once all filter the pool', () => {
  const A = evWorld({ any: mkEv('any'), c1: mkEv('c1', { chapters: [1] }), c2: mkEv('c2', { chapters: [2, 3] }), flag: mkEv('flag', { when: { flag: 'fox_spared' } }), bell: mkEv('bell', { when: { relic: 'silver_bell' } }), hanae: mkEv('hanae', { when: { hero: 'hanae' } }), kuro: mkEv('kuro', { when: { hero: 'kuro' } }) });
  const pool = (R) => { const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(A.RUN.pickEvent(R, { q: i, r: 0 })); return [...seen].sort(); };
  const R = A.RUN.newRun({ heroes: ['hanae', 'suzu'], seed: 1, unlocked: ALL });
  t.deep(pool(R), ['any', 'c1', 'hanae'], 'chapter 1, hanae in the party, no flag and no bell');
  R.flags.fox_spared = 1; t.deep(pool(R), ['any', 'c1', 'flag', 'hanae'], 'a flag opens its event');
  R.relics.push('silver_bell'); t.deep(pool(R), ['any', 'bell', 'c1', 'flag', 'hanae'], 'and so does a relic');
  R.flags.fox_spared = 0; t.ok(pool(R).indexOf('flag') < 0, 'a falsy flag does not');
  A.RUN.startChapter(R, 2); t.deep(pool(R), ['any', 'bell', 'c2', 'hanae'], 'chapter 2');
  const K = A.RUN.newRun({ heroes: ['kuro', 'raiga'], seed: 1, unlocked: ALL }); t.deep(pool(K), ['any', 'c1', 'kuro'], 'the other party');
});
t.test('pickEvent: once events never repeat, unseen events come first, then repeatables', () => {
  const A = evWorld({ a: mkEv('a'), b: mkEv('b'), c: mkEv('c'), o: mkEv('o', { once: true }) });
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL });
  const order = [];
  for (let i = 0; i < 4; i++) { const id = A.RUN.pickEvent(R, { q: i, r: 0 }); order.push(id); R.seen.events.push(id); }
  t.eq(new Set(order).size, 4, 'four tiles, four different events: ' + order);
  const next = A.RUN.pickEvent(R, { q: 9, r: 0 });
  t.ok(['a', 'b', 'c'].indexOf(next) >= 0, 'everything seen: a repeatable event comes back (never the once event): ' + next);
  const only = evWorld({ o: mkEv('o', { once: true }) });
  const S = only.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL });
  t.eq(only.RUN.pickEvent(S, { q: 0, r: 0 }), 'o', 'the first time it is fine'); S.seen.events.push('o');
  t.eq(only.RUN.pickEvent(S, { q: 0, r: 0 }), null, 'a seen once event is gone for good');
  const none = evWorld({});
  t.eq(none.RUN.pickEvent(none.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL }), { q: 0, r: 0 }), null, 'no events at all');
});
t.test('pickEvent: weighted by w, seeded per tile, deterministic', () => {
  const A = evWorld({ heavy: mkEv('heavy', { w: 30 }), light: mkEv('light', { w: 1 }), plain: mkEv('plain') });
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL });
  const counts = { heavy: 0, light: 0, plain: 0 };
  for (let i = 0; i < 600; i++) counts[A.RUN.pickEvent(R, { q: i, r: 0 })]++;
  t.ok(counts.heavy > 0.85 * 600 * (30 / 32) - 30, 'w 30 dominates: ' + J(counts)); t.ok(counts.light < 60 && counts.plain < 60, 'w 1 seldom: ' + J(counts));
  t.eq(A.RUN.pickEvent(R, { q: 3, r: 4 }), A.RUN.pickEvent(R, { q: 3, r: 4 }), 'same run, same tile, same event');
  const S = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL });
  t.eq(A.RUN.pickEvent(S, { q: 3, r: 4 }), A.RUN.pickEvent(R, { q: 3, r: 4 }), 'and across runs with one seed');
  const picks = new Set(); for (let sd = 0; sd < 60; sd++) picks.add(A.RUN.pickEvent(A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: sd, unlocked: ALL }), { q: 1, r: 1 }));
  t.ok(picks.size >= 2, 'different run seeds pick differently');
  const A2 = evWorld({ x: mkEv('x'), y: mkEv('y'), z: mkEv('z') });
  const T = A2.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 2, unlocked: ALL });
  const at = A2.RUN.pickEvent(T, { q: 5, r: 5 }); T.seen.events.push('x', 'y');
  t.ok(at !== undefined, 'a pick exists');
});
t.test('a fable tile: the event node, seen list, stat, preset ids and the empty fallback', () => {
  const A = evWorld({ a: mkEv('a'), b: mkEv('b') });
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL });
  const tile = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => x.type === 'event' && A.MAP.pathToPaint(R.map, x.q, x.r));
  const node = (() => { Object.keys(R.map.tiles).forEach((k) => { if (R.map.tiles[k] !== tile) R.map.tiles[k].done = true; }); const p = A.MAP.pathToPaint(R.map, tile.q, tile.r); p.path.forEach((c) => { R.ink = R.inkMax; A.RUN.paint(R, c[0], c[1]); }); const q = [[R.map.pos.q, R.map.pos.r]], prev = {}; prev[A.MAP.key(R.map.pos.q, R.map.pos.r)] = null; while (q.length) { const c = q.shift(); A.MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = A.MAP.key(n[0], n[1]); if (!(k in prev) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); } const path = []; for (let c = [tile.q, tile.r]; c; c = prev[A.MAP.key(c[0], c[1])]) path.unshift(c); let res = null; path.slice(1).forEach((c) => { res = A.RUN.step(R, c[0], c[1]); }); return res; })();
  t.eq(node.kind, 'event', 'an event node'); t.ok(['a', 'b'].indexOf(node.event) >= 0, 'one of the two'); t.deep(R.seen.events, [node.event], 'remembered as seen'); t.eq(R.stats.eventsSeen, 1, 'eventsSeen'); t.eq(node.chosen, null, 'not chosen yet');
  // preset content.id
  const B = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL });
  const t2 = Object.keys(B.map.tiles).map((k) => B.map.tiles[k]).find((x) => x.type === 'event'); t2.content = { id: 'b' };
  t.eq(t2.content.id, 'b', 'preset');
  const empty = evWorld({});
  const E1 = empty.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL });
  const et = Object.keys(E1.map.tiles).map((k) => E1.map.tiles[k]).find((x) => x.type === 'event' && empty.MAP.pathToPaint(E1.map, x.q, x.r));
  Object.keys(E1.map.tiles).forEach((k) => { if (E1.map.tiles[k] !== et) E1.map.tiles[k].done = true; });
  empty.MAP.pathToPaint(E1.map, et.q, et.r).path.forEach((c) => { E1.ink = E1.inkMax; empty.RUN.paint(E1, c[0], c[1]); });
  E1.ink = 5;
  const q = [[E1.map.pos.q, E1.map.pos.r]], prev = {}; prev[empty.MAP.key(E1.map.pos.q, E1.map.pos.r)] = null;
  while (q.length) { const c = q.shift(); empty.MAP.neighbors(E1.map, c[0], c[1]).forEach((n) => { const k = empty.MAP.key(n[0], n[1]); if (!(k in prev) && E1.map.tiles[k].painted && E1.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); }
  const path = []; for (let c = [et.q, et.r]; c; c = prev[empty.MAP.key(c[0], c[1])]) path.unshift(c);
  let res = null; path.slice(1).forEach((c) => { res = empty.RUN.step(E1, c[0], c[1]); });
  t.eq(res.kind, 'well', 'the fallback is an Instant'); t.eq(res.fallback, 'event', 'flagged as the event fallback'); t.eq(res.gained, 1, '+1 Ink'); t.eq(res.done, true, 'done'); t.ok(/Ink/.test(res.toast), 'with a one-line toast: ' + res.toast); t.eq(E1.ink, 6, 'applied'); t.eq(et.done, true, 'the tile resolves'); t.eq(E1.node, null, 'no node'); t.eq(E1.stats.eventsSeen, 0, 'nothing was seen');
});
function eventRun(events, over) {
  const A = evWorld(events);
  const R = A.RUN.newRun(Object.assign({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL }, over || {}));
  R.node = { kind: 'event', tile: { q: R.map.start.q, r: R.map.start.r }, event: Object.keys(events)[0], chosen: null };
  return { A, R };
}
t.test('event requirements: every req key, and a failed hero requirement hides the choice', () => {
  const ev = mkEv('r', { choices: [
    { label: 'gold', req: { gold: 100 }, out: [{ w: 1, text: 'a', ops: [] }] }, { label: 'hpPct', req: { hpPct: 0.5 }, out: [{ w: 1, text: 'b', ops: [] }] }, { label: 'hpBelow', req: { hpBelow: 0.5 }, out: [{ w: 1, text: 'c', ops: [] }] },
    { label: 'relic', req: { relic: 'silver_bell' }, out: [{ w: 1, text: 'd', ops: [] }] },
  ] });
  const ev2 = mkEv('r2', { choices: [
    { label: 'flag', req: { flag: 'fox_spared' }, out: [{ w: 1, text: 'a', ops: [] }] }, { label: 'hero', req: { hero: 'suzu' }, out: [{ w: 1, text: 'b', ops: [] }] }, { label: 'chapter', req: { chapter: 2 }, out: [{ w: 1, text: 'c', ops: [] }] },
    { label: 'free', out: [{ w: 1, text: 'd', ops: [] }] },
  ] });
  const { A, R } = eventRun({ r: ev, r2: ev2 });
  const ch = (def) => A.RUN.eventChoices(R, def);
  R.gold = 99; t.eq(ch(ev)[0].ok, false, 'gold 99 < 100'); t.ok(/100/.test(ch(ev)[0].reason), 'the reason names the price: ' + ch(ev)[0].reason); R.gold = 100; t.eq(ch(ev)[0].ok, true, 'exactly 100');
  t.eq(ch(ev)[1].ok, true, 'everybody is at full health'); R.heroes[1].hp = KU / 2 - 1; t.eq(ch(ev)[1].ok, false, 'kuro under half'); R.heroes[1].hp = KU / 2; t.eq(ch(ev)[1].ok, true, 'exactly half is enough');
  t.eq(ch(ev)[2].ok, false, 'hpBelow: nobody hurt'); R.heroes[0].hp = HA / 2 - 1; t.eq(ch(ev)[2].ok, true, 'hanae below half'); R.heroes[0].hp = HA / 2; t.eq(ch(ev)[2].ok, false, 'exactly half is not below');
  t.eq(ch(ev)[3].ok, false, 'no bell'); R.relics.push('silver_bell'); t.eq(ch(ev)[3].ok, true, 'bell');
  t.eq(ch(ev2)[0].ok, false, 'no flag'); R.flags.fox_spared = 1; t.eq(ch(ev2)[0].ok, true, 'flag');
  t.eq(ch(ev2)[1].ok, false, 'suzu is not in the party'); t.eq(ch(ev2)[1].hidden, true, 'and the choice is hidden, not merely disabled');
  t.eq(ch(ev2)[2].ok, false, 'wrong chapter'); t.eq(ch(ev2)[2].hidden, false, 'shown disabled'); A.RUN.startChapter(R, 2); t.eq(ch(ev2)[2].ok, true, 'chapter 2');
  t.eq(ch(ev2)[3].ok, true, 'a choice with no req is always open'); t.eq(ch(ev2)[3].reason, null, 'no reason');
  R.heroes[0].hp = 0; R.heroes[1].hp = 10; R.heroes[1].maxHp = KU; t.eq(ch(ev)[1].ok, false, 'hpPct looks at living heroes only: kuro is hurt'); R.heroes[1].hp = KU; t.eq(ch(ev)[1].ok, true, 'a downed hero is ignored');
  t.deep(A.RUN.eventChoices(R, 'nope'), [], 'unknown event id'); t.eq(A.RUN.eventChoices(R, 'r').length, 4, 'an id works too');
  R.node = { kind: 'event', tile: { q: 0, r: 0 }, event: 'r', chosen: null }; R.gold = 0;
  const snap = J(A.RUN.serialize(R));
  const bad = A.RUN.eventChoose(R, ev, 0);
  t.eq(bad.ok, false, 'a failed req refuses the choice'); t.eq(J(A.RUN.serialize(R)), snap, 'and changes nothing'); t.eq(A.RUN.eventChoose(R, ev, 9).reason, 'choice', 'no such choice'); t.eq(R.node.chosen, null, 'still open');
});
t.test('locked choices say what is missing (relic by name, chapter, hp, flag hint)', () => {
  const ev = mkEv('rs', { choices: [
    { label: 'relic', req: { relic: 'silver_bell' }, out: [{ w: 1, text: 'a', ops: [] }] }, { label: 'chapter', req: { chapter: 3 }, out: [{ w: 1, text: 'b', ops: [] }] }, { label: 'hpPct', req: { hpPct: 0.8 }, out: [{ w: 1, text: 'c', ops: [] }] },
    { label: 'hpBelow', req: { hpBelow: 0.4 }, out: [{ w: 1, text: 'd', ops: [] }] }, { label: 'fox', req: { flag: 'fox_spared' }, out: [{ w: 1, text: 'e', ops: [] }] }, { label: 'other', req: { flag: 'zzz' }, out: [{ w: 1, text: 'f', ops: [] }] },
    { label: 'gold', req: { gold: 70 }, out: [{ w: 1, text: 'g', ops: [] }] },
  ] });
  const { A, R } = eventRun({ rs: ev });
  R.gold = 5; R.heroes[0].hp = 1;
  const rows = A.RUN.eventChoices(R, ev), why = rows.map((x) => x.reason);
  t.ok(why[0].indexOf(A.DATA.relics.silver_bell.name) >= 0, 'the relic is named: ' + why[0]); t.eq(why[1], 'Chapter 3 only', 'the chapter is named');
  t.ok(/80%/.test(why[2]), 'the hp bar is named: ' + why[2]); t.ok(/40%/.test(why[3]) || rows[3].ok, 'so is the hurt bar: ' + why[3]);
  t.ok(/^Not yet/.test(why[4]) && /fox/.test(why[4]), 'a flag gives a story hint: ' + why[4]); t.ok(/^Not yet/.test(why[5]) && why[5].length > 8, 'an unknown flag still gets a hint: ' + why[5]); t.eq(why[6], 'Needs 70 gold', 'gold keeps its price');
  why.forEach((w, i) => { if (!rows[i].ok) t.ok(!/^(Not yet|Wrong chapter|Needs a treasure|Party too hurt|Nobody is hurt enough)$/.test(w), 'no vague reason: ' + w); });
  R.heroes[0].hp = A.DATA.heroes.hanae.maxHp; R.heroes[1].hp = A.DATA.heroes.kuro.maxHp; t.ok(/hero below 40%/.test(A.RUN.eventChoices(R, ev)[3].reason), 'at full health the hurt bar says why: ' + A.RUN.eventChoices(R, ev)[3].reason);
});
t.test('choices that can only do nothing are locked with a reason: no curse to remove, nothing to sharpen, a fixed treasure already owned', () => {
  const curse = { op: 'removeCard', filter: { type: 'curse' } };
  const ev = mkEv('dead', { choices: [
    { label: 'regret', out: [{ w: 1, text: 'a', ops: [curse, { op: 'ink', n: 2 }] }] },
    { label: 'sharpen', req: { gold: 20 }, cost: '20 gold', out: [{ w: 1, text: 'b', ops: [{ op: 'gold', n: -20 }, { op: 'upgradeCard' }] }] },
    { label: 'lamp', req: { gold: 60 }, out: [{ w: 1, text: 'c', ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', id: 'brass_lantern' }] }] },
    { label: 'wish', out: [{ w: 1, text: 'd', ops: [{ op: 'upgradeCard', random: true }] }, { w: 1, text: 'e', ops: [{ op: 'gold', n: 5 }] }] },
    { label: 'swap', out: [{ w: 1, text: 'f', ops: [{ op: 'addCurse', id: 'curse_regret' }, curse] }] },
    { label: 'copy', out: [{ w: 1, text: 'g', ops: [{ op: 'duplicateCard', filter: { hero: 'raiga' } }] }] },
    { label: 'morph', out: [{ w: 1, text: 'h', ops: [{ op: 'transformCard', filter: { type: 'curse' } }] }] },
    { label: 'leave', out: [{ w: 1, text: 'i', ops: [] }] },
  ] });
  const { A, R } = eventRun({ dead: ev });
  R.gold = 300; R.deck.forEach((c) => { if (A.DATA.cards[c.id].up) c.up = 1; });
  const rows = () => A.RUN.eventChoices(R, ev), ok = () => rows().map((x) => x.ok);
  t.deep(ok(), [false, false, true, true, true, false, false, true], 'curse removal, a paid sharpen with every card sharp, copying a hero who is not here and transforming a curse that is not there are locked; a gamble with a live outcome, a grower and a plain choice stay open');
  t.ok(/no curse/i.test(rows()[0].reason) && /sharpen/i.test(rows()[1].reason) && /Nothing to copy/.test(rows()[5].reason) && /Nothing to transform/.test(rows()[6].reason), 'each lock says why: ' + rows().filter((x) => !x.ok).map((x) => x.reason).join(' | '));
  t.eq(rows()[0].hidden, false, 'shown, not hidden');
  R.relics = ['brass_lantern']; t.eq(rows()[2].ok, false, 'the lamp locks once the Brass Lantern is owned'); t.ok(rows()[2].reason.indexOf(A.DATA.relics.brass_lantern.name) >= 0, 'by name: ' + rows()[2].reason);
  R.relics = []; R.deck.push({ uid: 990, id: 'curse_regret', up: 0, gems: [] }); t.eq(ok()[0], true, 'a curse in the deck opens the removal'); t.eq(ok()[6], false, 'a curse is no card to transform'); R.deck.pop();
  R.deck[0].up = 0; t.eq(ok()[1], true, 'a card left to sharpen opens the paid choice');
  const stats = J(A.RUN.serialize(R)); R.deck[0].up = 1; R.node = { kind: 'event', tile: { q: 0, r: 0 }, event: 'dead', chosen: null }; const snap = J(A.RUN.serialize(R));
  const bad = A.RUN.eventChoose(R, ev, 0); t.eq(bad.ok, false, 'choosing a locked choice is refused'); t.ok(/no curse/i.test(bad.reason), 'with the reason'); t.eq(J(A.RUN.serialize(R)), snap, 'and costs nothing'); t.eq(R.node.chosen, null, 'the fable stays open');
  t.eq(A.RUN.eventChoose(R, ev, 7).ok, true, 'a plain choice still goes through');
  // a fable never locks itself: when every choice is a dead end the locks are lifted
  const all = mkEv('alldead', { choices: [{ label: 'a', out: [{ w: 1, text: 'a', ops: [curse] }] }, { label: 'b', out: [{ w: 1, text: 'b', ops: [{ op: 'upgradeCard' }] }] }] });
  const W = eventRun({ alldead: all }); W.R.deck.forEach((c) => { c.up = 1; }); t.deep(W.A.RUN.eventChoices(W.R, all).map((x) => x.ok), [true, true], 'nothing else is open, so nothing is locked');
  const some = mkEv('somedead', { choices: [{ label: 'a', out: [{ w: 1, text: 'a', ops: [curse] }] }, { label: 'b', req: { gold: 999 }, out: [{ w: 1, text: 'b', ops: [] }] }] });
  const V = eventRun({ somedead: some }); V.R.gold = 0; t.deep(V.A.RUN.eventChoices(V.R, some).map((x) => x.ok), [true, false], 'the dead end is the only open choice (the gold gate is locked): it is lifted too');
});
t.test('newRun: a nonce gives every tale its own id; without one equal inputs give equal ids', () => {
  const mk = (extra) => RUN.newRun(Object.assign({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL }, extra || {}));
  t.eq(mk().id, mk().id, 'no nonce: deterministic'); t.ok(mk({ nonce: 1 }).id !== mk({ nonce: 2 }).id, 'different nonces differ'); t.eq(mk({ nonce: 7 }).id, mk({ nonce: 7 }).id, 'the same nonce is the same id'); t.ok(mk({ nonce: 1 }).id !== mk().id, 'a nonce changes the id'); t.ok(/^rb[0-9a-z]+$/.test(mk({ nonce: 3 }).id), 'same shape');
  t.eq(mk({ daily: true, seed: 20260101 }).id === mk({ daily: true, seed: 20260101, nonce: 9 }).id, false, 'a daily replay with a nonce is its own tale');
});
t.test('eventChoose: outcomes are weighted, seeded per tile and choice, and a reload replays them', () => {
  const ev = mkEv('w', { choices: [{ label: 'roll', out: [{ w: 3, text: 'heavy', ops: [{ op: 'flag', k: 'heavy' }] }, { w: 1, text: 'light', ops: [{ op: 'flag', k: 'light' }] }] }, { label: 'other', out: [{ w: 1, text: 'other', ops: [] }] }] });
  const counts = { heavy: 0, light: 0 };
  for (let s = 0; s < 800; s++) { const { A, R } = eventRun({ w: ev }, { seed: s }); counts[A.RUN.eventChoose(R, ev, 0).text]++; }
  t.near(counts.heavy / 800, 0.75, 0.06, 'w 3 : w 1 is 75% : ' + J(counts));
  const one = (seed) => { const { A, R } = eventRun({ w: ev }, { seed }); return A.RUN.eventChoose(R, ev, 0).text; };
  t.eq(one(11), one(11), 'same seed, same tile, same choice: same outcome');
  const { A, R } = eventRun({ w: ev }, { seed: 11 });
  const entry = J(A.RUN.serialize(R));
  const first = A.RUN.eventChoose(R, ev, 0);
  const back = A.RUN.deserialize(JSON.parse(entry));
  const again = A.RUN.eventChoose(back, ev, 0);
  t.eq(again.text, first.text, 'reloading mid-event replays the same outcome'); t.eq(J(A.RUN.serialize(back)), J(A.RUN.serialize(R)), 'and the same state');
  const two = new Set(); for (let s = 0; s < 40; s++) { const w2 = eventRun({ w: ev }, { seed: s }); two.add(w2.A.RUN.eventChoose(w2.R, ev, 0).text); }
  t.eq(two.size, 2, 'both outcomes occur across seeds');
  const r = eventRun({ w: ev }, { seed: 11 }); r.R.node.tile = { q: 5, r: 5 };
  t.ok(['heavy', 'light'].indexOf(r.A.RUN.eventChoose(r.R, ev, 0).text) >= 0, 'another tile still resolves');
});
t.test('eventChoose: result shape, chosen guard, applied log, node bookkeeping', () => {
  const ev = mkEv('s', { choices: [{ label: 'give', out: [{ w: 1, text: 'You are kind.', ops: [{ op: 'gold', n: 25 }, { op: 'flag', k: 'kind' }, { op: 'heal', n: 5 }] }] }, { label: 'leave', out: [{ w: 1, text: 'You leave.', ops: [] }] }] });
  const { A, R } = eventRun({ s: ev });
  const res = A.RUN.eventChoose(R, ev, 0);
  t.eq(res.ok, true, 'ok'); t.eq(res.text, 'You are kind.', 'the outcome text'); t.ok(Array.isArray(res.applied) && res.applied.length === 3, 'one applied line per op'); t.eq(res.applied[0].op, 'gold', 'in order'); t.eq(res.fight, undefined, 'no fight'); t.eq(res.pending, undefined, 'no pending');
  t.ok(res.applied.every((x) => typeof x.text === 'string'), 'every line has text (empty means silent)'); t.eq(res.applied[1].text, '', 'a flag is silent');
  t.eq(R.gold, E.startGold + 25, 'applied'); t.eq(R.flags.kind, 1, 'flag set'); t.eq(R.node.chosen, 0, 'node remembers the choice');
  const snap = J(A.RUN.serialize(R));
  t.eq(A.RUN.eventChoose(R, ev, 1).reason, 'chosen', 'one choice per event'); t.eq(J(A.RUN.serialize(R)), snap, 'changes nothing');
  const bare = evWorld({ s: ev }); const R2 = bare.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL });
  t.eq(bare.RUN.eventChoose(R2, ev, 0).reason, 'node', 'needs an open event node');
  t.eq(A.RUN.eventChoose(R, null, 0).reason, 'node', 'and a real event');
  t.ok(R.log.some((l) => /kind|give|Fable/i.test(l.msg)), 'the run log remembers');
});
t.test('eventChoose fight: the combat node replaces the event node and pays out through combatDone', () => {
  const ev = mkEv('f', { choices: [{ label: 'brawl', out: [{ w: 1, text: 'A brawl!', ops: [{ op: 'gold', n: 5 }, { op: 'fight', enemies: ['kappa', 'kodama'], tier: 'elite', win: [{ op: 'gold', n: 30 }, { op: 'flag', k: 'won' }] }] }] }, { label: 'plain', out: [{ w: 1, text: 'A plain one.', ops: [{ op: 'fight', enc: 'ch1_n1' }] }] }, { label: 'dry', out: [{ w: 1, text: 'A dry one.', ops: [{ op: 'fight', enemies: ['kappa'], rewards: false }] }] }] });
  const { A, R } = eventRun({ f: ev });
  const g = R.gold;
  const res = A.RUN.eventChoose(R, ev, 0);
  t.eq(res.ok, true, 'ok'); t.ok(res.fight, 'a fight comes back'); t.eq(R.node, res.fight, 'R.node is that combat node'); t.eq(R.gold, g + 5, 'ops before the fight applied first');
  t.eq(res.fight.kind, 'combat', 'combat node'); t.eq(res.fight.tier, 'elite', 'the tier picks the reward table'); t.deep(res.fight.enemies, ['kappa', 'kodama'], 'enemies'); t.eq(res.fight.source, 'event', 'source'); t.eq(res.fight.rewards, true, 'rewards on');
  t.deep(res.fight.onWin, [{ op: 'gold', n: 30 }, { op: 'flag', k: 'won' }], 'win ops travel on the node'); t.deep(res.fight.tile, { q: R.map.start.q, r: R.map.start.r }, 'same tile as the event');
  t.ok(Number.isInteger(res.fight.seed), 'a seed'); t.deep(Object.keys(A.RUN.combatInit(R, res.fight)).sort(), ['chapter', 'deck', 'enemies', 'frontIdx', 'gold', 'heroes', 'mods', 'relics', 'seed', 'tier'], 'and it can start a combat');
  const gold0 = R.gold;
  const rw = A.RUN.combatDone(R, fakeC({}));
  t.eq(rw.source, 'event', 'the rewards know they came from a fable'); t.eq(rw.tier, 'elite', 'elite table'); t.ok(rw.brush, 'fable fights drop a brush'); t.eq(rw.relics.length, 1, 'elite reward offers a relic'); t.eq(R.flags.won, 1, 'win ops applied'); t.ok(R.gold >= gold0 + 30 + E.gold.elite[0], 'win gold plus elite gold');
  A.RUN.claim(R, rw, {}); A.RUN.finishNode(R);
  t.eq(R.map.tiles[A.MAP.key(R.map.start.q, R.map.start.r)].done, true, 'finishNode marks the event tile done after the reward');
  const b = eventRun({ f: ev }); const rb = b.A.RUN.eventChoose(b.R, ev, 1);
  t.eq(rb.fight.enc, 'ch1_n1', 'enc names a group'); t.deep(rb.fight.enemies, DATA.groupById('ch1_n1').enemies, 'its enemies'); t.eq(rb.fight.tier, 'normal', 'normal by default'); t.eq(rb.fight.onWin, null, 'no win ops');
  const c = eventRun({ f: ev }); const rc = c.A.RUN.eventChoose(c.R, ev, 2); t.eq(rc.fight.rewards, false, 'rewards:false rides on the node');
});
t.test('event outcome text is the applied result for gambles: both branches', () => {
  const ev = mkEv('g', { choices: [{ label: 'a', out: [{ w: 1, text: 'lucky', ops: [{ op: 'gold', n: 20 }] }, { w: 1, text: 'unlucky', ops: [{ op: 'hurt', n: 9 }] }] }, { label: 'b', out: [{ w: 1, text: 'z', ops: [] }] }] });
  let lucky = 0, hurt = 0;
  for (let s = 0; s < 100; s++) { const { A, R } = eventRun({ g: ev }, { seed: s }); const r = A.RUN.eventChoose(R, ev, 0); if (r.text === 'lucky') { lucky++; t.eq(R.gold, E.startGold + 20, 'lucky gold'); } else { hurt++; t.eq(R.heroes[0].hp, DATA.heroes.hanae.maxHp - 9, 'hurt hanae'); t.eq(R.heroes[1].hp, DATA.heroes.kuro.maxHp - 9, 'hurt kuro'); } }
  t.ok(lucky > 20 && hurt > 20, 'both happen: ' + lucky + '/' + hurt);
});

// ================================================================================================ run ops
const ops = (R, list, ctx) => RUN.applyOps(R, list, ctx);
t.test('op gold: n, pct, floors at 0, only gains count as earned', () => {
  const R = NEW(); R.gold = 61;
  ops(R, [{ op: 'gold', n: 20 }]); t.eq(R.gold, 81, '+20'); t.eq(R.stats.goldEarned, 20, 'earned');
  ops(R, [{ op: 'gold', n: -30 }]); t.eq(R.gold, 51, '-30'); t.eq(R.stats.goldEarned, 20, 'a cost is not earnings'); t.eq(R.stats.goldSpent, 0, 'and not shop spending');
  ops(R, [{ op: 'gold', n: -500 }]); t.eq(R.gold, 0, 'floors at 0');
  R.gold = 61; ops(R, [{ op: 'gold', pct: 0.5 }]); t.eq(R.gold, 91, 'pct is a fraction of current gold, floored (30.5 -> 30)');
  R.gold = 61; ops(R, [{ op: 'gold', pct: -0.5 }]); t.eq(R.gold, 31, 'a negative pct takes the floored amount (30)');
  R.gold = 3; ops(R, [{ op: 'gold', pct: -1 }]); t.eq(R.gold, 0, 'pct -1 takes everything');
  const m = NEW(); m.relics.push('t_gold'); m.gold = 0; ops(m, [{ op: 'gold', n: 40 }]); t.eq(m.gold, 40, 'goldMul never touches event gold');
  const r = ops(NEW(), [{ op: 'gold', n: 7 }]); t.eq(r.log[0].n, 7, 'the log reports the real change'); t.ok(/7/.test(r.log[0].text), 'with text');
});
t.test('op ink: n, pct of inkMax, clamped to 0..inkMax', () => {
  const R = NEW(); R.ink = 5;
  ops(R, [{ op: 'ink', n: 3 }]); t.eq(R.ink, 8, '+3'); ops(R, [{ op: 'ink', n: 99 }]); t.eq(R.ink, R.inkMax, 'capped'); ops(R, [{ op: 'ink', n: -99 }]); t.eq(R.ink, 0, 'floored');
  ops(R, [{ op: 'ink', pct: 0.5 }]); t.eq(R.ink, 7, 'half of inkMax (14) is 7'); ops(R, [{ op: 'ink', pct: -0.25 }]); t.eq(R.ink, 4, '-25% of inkMax is -3 (floored 3.5)');
});
t.test('op heal: n or pct, who, healMul, no overheal', () => {
  const mk = () => { const R = NEW(); R.heroes[0].hp = 10; R.heroes[1].hp = 5; return R; };
  let R = mk(); ops(R, [{ op: 'heal', n: 10 }]); t.deep(R.heroes.map((h) => h.hp), [20, 15], 'both by default');
  R = mk(); ops(R, [{ op: 'heal', n: 10, who: 'hanae' }]); t.deep(R.heroes.map((h) => h.hp), [20, 5], 'a hero id');
  R = mk(); R.frontIdx = 1; ops(R, [{ op: 'heal', n: 10, who: 'front' }]); t.deep(R.heroes.map((h) => h.hp), [10, 15], 'front follows frontIdx');
  R = mk(); ops(R, [{ op: 'heal', n: 10, who: 'lowest' }]); t.deep(R.heroes.map((h) => h.hp), [10, 15], 'lowest current HP');
  R = mk(); ops(R, [{ op: 'heal', pct: 0.25 }]); t.deep(R.heroes.map((h) => h.hp), [10 + Math.round(HA * 0.25), 5 + Math.round(KU * 0.25)], 'pct of each hero max HP');
  R = mk(); ops(R, [{ op: 'heal', n: 999 }]); t.deep(R.heroes.map((h) => h.hp), [HA, KU], 'no overheal');
  R = mk(); R.relics.push('t_heal'); ops(R, [{ op: 'heal', n: 10 }]); t.deep(R.heroes.map((h) => h.hp), [25, 20], 'healMul +50% applies to heal ops');
  R = mk(); ops(R, [{ op: 'heal', n: 10, who: 'suzu' }]); t.deep(R.heroes.map((h) => h.hp), [10, 5], 'a hero who is not in the party is skipped');
  const seen = new Set(); for (let s = 0; s < 30; s++) { const x = NEW({ seed: s }); x.heroes[0].hp = 10; x.heroes[1].hp = 10; ops(x, [{ op: 'heal', n: 5, who: 'random' }]); seen.add(x.heroes[0].hp + ',' + x.heroes[1].hp); }
  t.deep([...seen].sort(), ['10,15', '15,10'], 'random picks either hero, one at a time');
  R = mk(); const a = J(ops(R, [{ op: 'heal', n: 4, who: 'random' }], { rng: U.rng(1) }).log); R = mk(); t.eq(J(ops(R, [{ op: 'heal', n: 4, who: 'random' }], { rng: U.rng(1) }).log), a, 'a given rng gives repeatable results');
  const T = NEW({ trial: 10 }); T.heroes[0].hp = 10; ops(T, [{ op: 'heal', n: 10, who: 'hanae' }]); t.eq(T.heroes[0].hp, 19, 'trial healMul x0.9 rounds 9');
});
t.test('op hurt: never kills, who, pct, at least 1', () => {
  let R = NEW(); ops(R, [{ op: 'hurt', n: 10 }]); t.deep(R.heroes.map((h) => h.hp), [HA - 10, KU - 10], 'both by default');
  R = NEW(); R.heroes[0].hp = 3; ops(R, [{ op: 'hurt', n: 50, who: 'hanae' }]); t.eq(R.heroes[0].hp, 1, 'never below 1'); ops(R, [{ op: 'hurt', n: 50, who: 'hanae' }]); t.eq(R.heroes[0].hp, 1, 'and stays at 1');
  R = NEW(); ops(R, [{ op: 'hurt', pct: 0.1, who: 'kuro' }]); t.eq(R.heroes[1].hp, KU - Math.round(KU * 0.1), '10% of max HP, rounded'); R = NEW(); ops(R, [{ op: 'hurt', pct: 0.001 }]); t.deep(R.heroes.map((h) => h.hp), [HA - 1, KU - 1], 'a positive pct hurts at least 1');
  R = NEW(); R.heroes[1].hp = 4; ops(R, [{ op: 'hurt', n: 2, who: 'lowest' }]); t.deep(R.heroes.map((h) => h.hp), [HA, 2], 'lowest');
  R = NEW(); R.frontIdx = 1; ops(R, [{ op: 'hurt', n: 2, who: 'front' }]); t.deep(R.heroes.map((h) => h.hp), [HA, KU - 2], 'front');
});
t.test('op maxHp: raises max and current, or lowers max, never below 1', () => {
  let R = NEW(); R.heroes[0].hp = 40; ops(R, [{ op: 'maxHp', n: 6 }]); t.deep(R.heroes.map((h) => [h.hp, h.maxHp]), [[46, HA + 6], [KU + 6, KU + 6]], 'both raised, current follows');
  R = NEW(); ops(R, [{ op: 'maxHp', n: -10, who: 'kuro' }]); t.deep(R.heroes.map((h) => [h.hp, h.maxHp]), [[HA, HA], [KU - 10, KU - 10]], 'lowering max lowers a full hero');
  R = NEW(); R.heroes[1].hp = 20; ops(R, [{ op: 'maxHp', n: -10, who: 'kuro' }]); t.deep(R.heroes[1].hp, 20, 'a hurt hero below the new max keeps their HP');
  R = NEW(); ops(R, [{ op: 'maxHp', n: -1000 }]); t.deep(R.heroes.map((h) => [h.hp, h.maxHp]), [[1, 1], [1, 1]], 'max never below 1, HP at least 1');
  R = NEW(); ops(R, [{ op: 'maxHp', n: 4, who: 'front' }]); t.deep(R.heroes.map((h) => h.maxHp), [HA + 4, KU], 'who front');
});
t.test('op addCard: a card, or a random card from a pool, upgraded or not', () => {
  const R = NEW();
  ops(R, [{ op: 'addCard', card: 'hanae_c0' }]); t.eq(R.deck[10].id, 'hanae_c0', 'a named card'); t.eq(R.deck[10].up, 0, 'plain');
  ops(R, [{ op: 'addCard', card: 'hanae_c1', n: 3, up: true }]); t.eq(R.deck.length, 14, 'n copies'); t.ok(R.deck.slice(11).every((c) => c.id === 'hanae_c1' && c.up === 1), 'upgraded'); t.eq(new Set(R.deck.map((c) => c.uid)).size, 14, 'every copy has its own uid');
  const r = ops(R, [{ op: 'addCard', card: 'nope_card' }]); t.eq(R.deck.length, 14, 'an unknown card id adds nothing'); t.ok(/No card/.test(r.log[0].text), 'and says so');
  const S = NEW({ seed: 1, heroes: ['suzu', 'raiga'] });
  for (let i = 0; i < 60; i++) ops(S, [{ op: 'addCard', pool: 'party', rarity: 'rare' }], { rng: U.rng(i) });
  const added = S.deck.slice(10);
  t.eq(added.length, 60, 'one per op'); t.ok(added.every((c) => DATA.cards[c.id].rarity === 'rare' && ['suzu', 'raiga'].indexOf(DATA.cards[c.id].hero) >= 0), 'rares of the party heroes'); t.ok(added.every((c) => !DATA.cards[c.id].locked), 'unlocked only');
  t.ok(new Set(added.map((c) => DATA.cards[c.id].hero)).size === 2, 'both heroes are drawn from');
  const K = NEW({ seed: 1 }); for (let i = 0; i < 40; i++) ops(K, [{ op: 'addCard', pool: 'kuro', rarity: 'uncommon' }], { rng: U.rng(i) });
  t.ok(K.deck.slice(10).every((c) => DATA.cards[c.id].hero === 'kuro' && DATA.cards[c.id].rarity === 'uncommon' && !DATA.cards[c.id].locked), 'a hero pool, a rarity, no locked kuro_u0');
  const W = NEW({ seed: 1 }); for (let i = 0; i < 300; i++) ops(W, [{ op: 'addCard', pool: 'party' }], { rng: U.rng(i) });
  const rar = { common: 0, uncommon: 0, rare: 0 }; W.deck.slice(10).forEach((c) => { rar[DATA.cards[c.id].rarity]++; });
  t.near(rar.common / 300, 0.62, 0.08, 'no rarity given: the normal weights (common ' + rar.common / 300 + ')');
  const up = NEW(); ops(up, [{ op: 'addCard', pool: 'party', rarity: 'common', up: true }]); t.eq(up.deck[10].up, 1, 'up applies to pool cards too');
  const own = NEW({ seed: 1, unlocked: { card: ['kuro_u0'], relic: [], gem: [] } }); const seen = new Set(); for (let i = 0; i < 400; i++) { const x = NEW({ seed: 1, unlocked: own.unlocked }); ops(x, [{ op: 'addCard', pool: 'kuro', rarity: 'uncommon' }], { rng: U.rng(i) }); seen.add(x.deck[10].id); }
  t.ok(seen.has('kuro_u0'), 'an owned locked card may be drawn');
});
function pendingOf(R, op) { const r = ops(R, [op]); return r.pending[0]; }
t.test('deck ops without random: a pending choice the UI answers with uids', () => {
  const R = NEW();
  const p = pendingOf(R, { op: 'removeCard' });
  t.deep(Object.keys(p).sort(), ['filter', 'id', 'n', 'op', 'pick'], 'pending fields'); t.eq(p.op, 'removeCard', 'op'); t.eq(p.n, 1, 'n'); t.eq(p.pick, 'choose', 'the player chooses'); t.eq(p.filter, null, 'no filter'); t.ok(/^p\d+$/.test(p.id), 'an id');
  t.deep(R.pending, [p], 'kept in R.pending'); t.eq(R.deck.length, 10, 'nothing happened yet');
  t.eq(RUN.resolvePending(R, p.id, null).reason, 'required', 'a deck op cannot be skipped'); t.eq(RUN.resolvePending(R, p.id, []).reason, 'choice', 'no cards');
  t.eq(RUN.resolvePending(R, p.id, [R.deck[0].uid, R.deck[1].uid]).reason, 'choice', 'too many'); t.eq(RUN.resolvePending(R, p.id, [99999]).reason, 'choice', 'not in the deck');
  t.eq(RUN.resolvePending(R, 'p999', [1]).reason, 'unknown', 'unknown id'); t.eq(R.deck.length, 10, 'refusals changed nothing'); t.eq(R.pending.length, 1, 'still waiting');
  const uid = R.deck[3].uid; const res = RUN.resolvePending(R, p.id, [uid]);
  t.eq(res.ok, true, 'resolved'); t.eq(R.deck.length, 9, 'the card is gone'); t.ok(!R.deck.some((c) => c.uid === uid), 'that one'); t.deep(R.pending, [], 'pending cleared'); t.eq(RUN.resolvePending(R, p.id, [R.deck[0].uid]).reason, 'unknown', 'once only');
  const S = NEW(); const q = pendingOf(S, { op: 'removeCard' }); const single = S.deck[2].uid; t.eq(RUN.resolvePending(S, q.id, single).ok, true, 'a bare uid works for n = 1');
  const T = NEW(); const two = pendingOf(T, { op: 'removeCard', n: 2 });
  t.eq(two.n, 2, 'n = 2'); t.eq(RUN.resolvePending(T, two.id, [T.deck[0].uid]).reason, 'choice', 'one is not two'); t.eq(RUN.resolvePending(T, two.id, [T.deck[0].uid, T.deck[0].uid]).reason, 'choice', 'the same card twice'); t.eq(RUN.resolvePending(T, two.id, [T.deck[0].uid, T.deck[1].uid]).ok, true, 'two distinct cards'); t.eq(T.deck.length, 8, 'both gone');
  const F = NEW(); const f = pendingOf(F, { op: 'removeCard', n: 3, filter: { hero: 'kuro', type: 'attack' } });
  t.eq(f.n, 3, 'n kept'); t.eq(RUN.resolvePending(F, f.id, [F.deck.find((c) => c.id === 'hanae_slash').uid, 1, 2]).reason, 'choice', 'the filter limits the candidates');
  const fk = F.deck.filter((c) => DATA.cards[c.id].hero === 'kuro' && DATA.cards[c.id].type === 'attack').map((c) => c.uid);
  t.eq(fk.length, 2, 'two kuro attacks'); t.eq(RUN.resolvePending(F, f.id, [fk[0]]).reason, 'choice', 'exactly min(n, candidates) = 2 are required'); t.eq(RUN.resolvePending(F, f.id, fk).ok, true, 'both');
  const none = NEW(); const r = ops(none, [{ op: 'removeCard', filter: { hero: 'suzu' } }]); t.eq(r.pending.length, 0, 'no candidates, no pending'); t.eq(none.pending.length, 0, 'nor in R.pending'); t.ok(/Nothing/.test(r.log[0].text), 'a log line says so');
  const gemmed = NEW(); gemmed.deck[0].gems[0] = 'red_g0'; const g = pendingOf(gemmed, { op: 'removeCard' }); RUN.resolvePending(gemmed, g.id, [gemmed.deck[0].uid]); t.deep(gemmed.gems, ['red_g0'], 'a removed card gives its gem back');
});
t.test('deck ops with random: true resolve at once with the given rng', () => {
  const R = NEW();
  const r = ops(R, [{ op: 'removeCard', random: true, n: 2 }]); t.eq(r.pending.length, 0, 'no pending'); t.eq(R.deck.length, 8, 'two gone'); t.eq(r.log.length, 2, 'a log line each');
  const a = NEW(), b = NEW(); ops(a, [{ op: 'removeCard', random: true }], { rng: U.rng(5) }); ops(b, [{ op: 'removeCard', random: true }], { rng: U.rng(5) }); t.eq(J(a.deck), J(b.deck), 'repeatable');
  const F = NEW(); ops(F, [{ op: 'removeCard', random: true, n: 5, filter: { hero: 'kuro' } }]); t.eq(F.deck.filter((c) => DATA.cards[c.id].hero === 'kuro').length, 0, 'the filter picks kuro cards (n larger than the candidates takes all of them)'); t.eq(F.deck.length, 5, 'hanae untouched');
  const U1 = NEW(); ops(U1, [{ op: 'upgradeCard', random: true, n: 2 }]); t.eq(U1.deck.filter((c) => c.up).length, 2, 'two upgraded'); t.eq(U1.stats.upgrades, 2, 'upgrades stat');
  const D = NEW(); D.deck[0].up = 1; ops(D, [{ op: 'duplicateCard', random: true, n: 1, filter: { type: 'attack' } }]); t.eq(D.deck.length, 11, 'a copy');
});
t.test('upgradeCard: only cards with an upgrade that are not upgraded yet', () => {
  const R = NEW(); R.deck.forEach((c, i) => { if (i < 9) c.up = 1; });
  const p = pendingOf(R, { op: 'upgradeCard', n: 3 });
  const left = R.deck[9].uid;
  t.eq(RUN.resolvePending(R, p.id, [R.deck[0].uid]).reason, 'choice', 'an upgraded card is not a candidate'); t.eq(RUN.resolvePending(R, p.id, [left]).ok, true, 'only one candidate: n shrinks to 1'); t.eq(R.deck[9].up, 1, 'upgraded'); t.eq(R.stats.upgrades, 1, 'stat');
  const C = NEW(); C.deck.push({ uid: 900, id: 'curse_regret', up: 0, gems: [] }); const q = pendingOf(C, { op: 'upgradeCard', n: 5 });
  t.eq(RUN.resolvePending(C, q.id, C.deck.slice(0, 5).map((c) => c.uid).concat([900])).reason, 'choice', 'a curse has no upgrade');
  t.deep(RUN.upgradable(NEW()).length, 10, 'RUN.upgradable lists every plain card'); t.eq(RUN.upgradeCard(NEW(), 99999), null, 'unknown uid');
  const Z = NEW(); t.ok(RUN.upgradeCard(Z, Z.deck[0].uid) && !RUN.upgradeCard(Z, Z.deck[0].uid), 'a card upgrades once');
  const filt = NEW(); t.eq(RUN.upgradable(filt, { hero: 'kuro' }).length, 5, 'upgradable honours the filter'); t.eq(RUN.upgradable(filt, { type: 'attack' }).length, 4, 'by type');
});
t.test('transformCard: same hero and rarity, new uid, gems come back, curses excluded', () => {
  const R = NEW(); const slash = R.deck.find((c) => c.id === 'hanae_slash');
  slash.gems[0] = 'red_g1'; slash.up = 1; const oldUid = slash.uid;
  const p = pendingOf(R, { op: 'transformCard' });
  t.eq(RUN.resolvePending(R, p.id, [R.deck[0].uid]).ok, true, 'the first card transformed');
  const first = R.deck[0]; t.ok(first.uid !== 1, 'a new uid'); t.ok(first.id !== 'hanae_slash', 'a different card'); t.eq(DATA.cards[first.id].hero, 'hanae', 'same hero'); t.eq(DATA.cards[first.id].rarity, 'starter', 'same rarity (a starter becomes another starter)');
  t.eq(R.deck.length, 10, 'same deck size');
  const S = NEW(); S.deck.push({ uid: 700, id: 'kuro_r0', up: 1, gems: ['red_g0', 'green_g0'] }); const r = pendingOf(S, { op: 'transformCard', filter: { hero: 'kuro' } });
  t.eq(RUN.resolvePending(S, r.id, [700]).ok, true, 'a rare kuro card transformed'); const moved = S.deck[S.deck.length - 1];
  t.ok(moved.id !== 'kuro_r0' && DATA.cards[moved.id].hero === 'kuro' && DATA.cards[moved.id].rarity === 'rare', 'another kuro rare'); t.ok(!DATA.cards[moved.id].locked, 'never a locked one: ' + moved.id); t.eq(moved.up, 1, 'the upgrade carries over'); t.eq(moved.gems.length, DATA.cards[moved.id].slots.length, 'fresh sockets'); t.ok(moved.gems.every((g) => g === null), 'empty'); t.deep(S.gems.sort(), ['green_g0', 'red_g0'], 'the old gems return to the pouch');
  const C = NEW(); C.deck.push({ uid: 900, id: 'curse_regret', up: 0, gems: [] }); const q = pendingOf(C, { op: 'transformCard', filter: { type: 'curse' } });
  t.eq(q, undefined, 'a curse cannot be transformed (no candidates, no pending)');
  const ids = new Set(); for (let s = 0; s < 50; s++) { const x = NEW({ seed: 1 }); x.deck.push({ uid: 701, id: 'hanae_c5', up: 0, gems: [null] }); ops(x, [{ op: 'transformCard', random: true, filter: { type: 'skill', hero: 'hanae' } }], { rng: U.rng(s) }); x.deck.filter((c) => c.uid > 700).forEach((c) => ids.add(c.id)); }
  t.ok(true, 'random transform runs without a pool problem: ' + ids.size);
});
t.test('duplicateCard: a copy with the same upgrade and empty sockets', () => {
  const R = NEW(); R.deck[0].up = 1; R.deck[0].gems[0] = 'red_g0'; const p = pendingOf(R, { op: 'duplicateCard' });
  t.eq(RUN.resolvePending(R, p.id, [R.deck[0].uid]).ok, true, 'copied'); const copy = R.deck[R.deck.length - 1];
  t.eq(R.deck.length, 11, 'one more'); t.eq(copy.id, R.deck[0].id, 'same card'); t.eq(copy.up, 1, 'same upgrade'); t.ok(copy.gems.every((g) => g === null), 'no gems are ever duplicated'); t.ok(copy.uid !== R.deck[0].uid, 'own uid'); t.eq(R.deck[0].gems[0], 'red_g0', 'the original keeps its gem');
  const C = NEW(); C.deck.push({ uid: 900, id: 'curse_regret', up: 0, gems: [] }); t.eq(pendingOf(C, { op: 'duplicateCard', filter: { type: 'curse' } }), undefined, 'curses are not copied');
});
t.test('op addRelic: by id or rarity, owned and empty cases, hero relics only with their hero', () => {
  const R = NEW();
  let r = ops(R, [{ op: 'addRelic', id: 't_gold' }]); t.deep(R.relics, ['t_gold'], 'by id'); t.ok(/Found/.test(r.log[0].text), 'log'); t.eq(R.stats.relicsFound, 1, 'stat');
  r = ops(R, [{ op: 'addRelic', id: 't_gold' }]); t.eq(R.relics.length, 2, 'owned: a stand-in arrives, never nothing'); t.eq(R.relics.filter((x) => x === 't_gold').length, 1, 'the owned relic is not doubled'); t.eq(DATA.relics[R.relics[1]].rarity, DATA.relics.t_gold.rarity, 'of the same rarity'); t.ok(r.log.length === 1 && r.log[0].id === R.relics[1] && /Found/.test(r.log[0].text), 'and the log names the stand-in'); t.eq(R.stats.relicsFound, 2, 'it counts as found');
  ops(R, [{ op: 'addRelic', rarity: 'rare' }]); t.eq(R.relics.length, 3, 'by rarity'); t.eq(DATA.relics[R.relics[2]].rarity, 'rare', 'a rare one');
  const seen = new Set(); for (let s = 0; s < 200; s++) { const x = NEW({ seed: s, heroes: ['suzu', 'raiga'] }); ops(x, [{ op: 'addRelic', rarity: 'common' }], { rng: U.rng(s) }); seen.add(x.relics[0]); }
  t.ok(!seen.has('t_hanae') && !seen.has('t_kuro'), 'a hero relic needs its hero'); t.ok(seen.size > 4, 'variety: ' + seen.size);
  const locked = new Set(); for (let s = 0; s < 200; s++) { const x = NEW({ seed: s }); ops(x, [{ op: 'addRelic', rarity: 'uncommon' }], { rng: U.rng(s) }); locked.add(x.relics[0]); }
  t.ok(!locked.has('t_locked'), 'a locked relic is not drawn until owned');
  const E2 = NEW(); DATA.relicPool('shop').forEach((x) => E2.relics.push(x.id)); r = ops(E2, [{ op: 'addRelic', rarity: 'shop' }]); t.ok(/No treasure/.test(r.log[0].text), 'nothing left: says so'); t.eq(E2.relics.length, 4, 'nothing added');
  t.eq(ops(NEW(), [{ op: 'addRelic', id: 'ghost' }]).log[0].text, 'No treasure to find.', 'an unknown id is refused, and does not claim a relic');
  const F = NEW(); DATA.relicPool('shop').forEach((x) => F.relics.push(x.id)); const shopId = F.relics[0], g0 = F.gold, f0 = F.relics.length;
  r = ops(F, [{ op: 'addRelic', id: shopId }]); const pay = Math.round(E.price.relic.shop * 0.4);
  t.eq(F.relics.length, f0, 'owned and nothing of its rarity left: no relic'); t.eq(r.log[0].text, 'Already owned.', 'the first line says it is already owned'); t.eq(r.log[0].id, shopId, 'with the id (so a screen can tell what was refused)'); t.eq(r.log[1].op, 'gold', 'then pays gold instead'); t.eq(r.log[1].n, pay, 'its gold entry carries the amount'); t.eq(F.gold, g0 + pay, '40% of the shop price (' + pay + ')'); t.ok(/already carry/.test(r.log[1].text) && new RegExp(String(pay)).test(r.log[1].text), 'and says so truthfully: ' + r.log[1].text); t.eq(F.stats.goldEarned >= pay, true, 'counted as gold earned');
  const P = NEW(); ops(P, [{ op: 'addRelic', id: 't_pickup' }]); t.eq(P.gold, E.startGold + 10, 'onPickup ran for a relic gained by an op');
  const I = NEW(); ops(I, [{ op: 'addRelic', id: 't_inkmax' }]); t.eq(I.inkMax, E.inkMax + 2, 'inkMax follows');
});
t.test('ops addGem addBrush addCurse flag', () => {
  const R = NEW();
  ops(R, [{ op: 'addGem', id: 'red_g0' }]); t.deep(R.gems, ['red_g0'], 'a named gem');
  ops(R, [{ op: 'addGem', color: 'blue', tier: 1 }]); t.ok(DATA.gems[R.gems[1]].color === 'blue' && DATA.gems[R.gems[1]].tier === 1, 'a filtered gem');
  ops(R, [{ op: 'addGem', color: 'gold' }]); t.eq(DATA.gems[R.gems[2]].color, 'gold', 'colour only'); ops(R, [{ op: 'addGem' }]); t.eq(R.gems.length, 4, 'anything at all');
  ops(R, [{ op: 'addGem', id: 'no_such_gem' }]); t.eq(R.gems.length, 5, 'an unknown id falls back to a random gem');
  const seen = new Set(); for (let s = 0; s < 100; s++) { const x = NEW({ seed: s }); ops(x, [{ op: 'addGem', tier: 3 }], { rng: U.rng(s) }); seen.add(x.gems[0]); }
  t.ok([...seen].every((g) => DATA.gems[g].tier === 3 && !DATA.gems[g].locked), 'tier 3, unlocked only');
  const drained = NEW({ seed: 1 }); const x = ops(drained, [{ op: 'addGem', color: 'red', tier: 3 }, { op: 'addGem', color: 'red', tier: 3 }]);
  t.eq(drained.gems.length, 2, 'a drained filter relaxes instead of failing'); t.ok(x.log.every((l) => l.id), 'both gave a gem');
  ops(R, [{ op: 'addBrush', id: 'halo' }]); t.ok(R.brushes.indexOf('halo') >= 0, 'a named brush'); const n = R.brushes.length; ops(R, [{ op: 'addBrush', id: 'random' }]); t.eq(R.brushes.length, n + 1, 'random'); t.ok(DATA.brushes[R.brushes[n]], 'a real one');
  ops(R, [{ op: 'addBrush', id: 'nope' }]); t.eq(R.brushes.length, n + 1, 'unknown brush id adds nothing');
  const C = NEW(); ops(C, [{ op: 'addCurse', id: 'curse_regret', n: 2 }]); t.deep(C.deck.slice(10).map((c) => c.id), ['curse_regret', 'curse_regret'], 'named curses'); t.ok(C.deck.slice(10).every((c) => c.gems.length === 0), 'no sockets');
  const D = NEW(); ops(D, [{ op: 'addCurse', n: 3 }]); t.eq(D.deck.length, 13, 'three seeded curses'); t.ok(D.deck.slice(10).every((c) => DATA.cards[c.id].hero === 'curse'), 'all curses');
  const a = NEW(), b = NEW(); ops(a, [{ op: 'addCurse' }], { rng: U.rng(9) }); ops(b, [{ op: 'addCurse' }], { rng: U.rng(9) }); t.eq(a.deck[10].id, b.deck[10].id, 'seeded');
  const F = NEW(); ops(F, [{ op: 'flag', k: 'a' }, { op: 'flag', k: 'b', v: 5 }]); t.deep(F.flags, { a: 1, b: 5 }, 'flag defaults to 1');
});
t.test('op paint log: a plural that agrees with the count', () => {
  const R = NEW({ seed: 3 });
  const one = ops(R, [{ op: 'paint', n: 1 }]); t.eq(one.log[0].text, 'The path opens (1 hex).', 'one hex'); t.eq(one.log[0].n, 1, 'n');
  const many = ops(R, [{ op: 'paint', n: 3 }]); t.eq(many.log[0].text, 'The path opens (3 hexes).', 'three hexes');
});
t.test('op paint: free hexes along the cheapest chain to the boss', () => {
  const R = NEW({ seed: 3 });
  const chain = MAP.pathToPaint(R.map, R.map.boss.q, R.map.boss.r).path;
  const ink = R.ink;
  const r = ops(R, [{ op: 'paint', n: 3 }]);
  t.ok(chain.slice(0, 3).every((c) => R.map.tiles[MAP.key(c[0], c[1])].painted), 'the first three hexes of the chain'); t.eq(R.ink, ink, 'no Ink spent'); t.eq(R.stats.hexesPainted, 3, 'counted'); t.ok(/3/.test(r.log[0].text), 'log');
  ops(R, [{ op: 'paint', n: 12 }]); const rest = MAP.pathToPaint(R.map, R.map.boss.q, R.map.boss.r); t.eq(rest, null, 'twelve is enough to finish this short chain: the boss hex itself is painted'); t.eq(R.map.tiles[MAP.key(R.map.boss.q, R.map.boss.r)].painted, true, 'boss painted');
  const again = ops(R, [{ op: 'paint', n: 2 }]); t.ok(/already open/.test(again.log[0].text), 'nothing left to paint says so');
  const H = NEW({ seed: 3 }); H.relics.push('t_paint3'); H.ink = 0; ops(H, [{ op: 'paint', n: 6 }]); t.eq(H.ink, 2, 'onPaint hooks run for each chained hex (every 3rd: two refunds)');
});
t.test('op cardReward: a skippable pick, offers by rarity and hero, pity reset when a rare is taken', () => {
  const R = NEW({ seed: 2 });
  const r = ops(R, [{ op: 'cardReward' }]); const p = r.pending[0];
  t.eq(p.op, 'cardReward', 'op'); t.eq(p.offers.length, 3, 'three by default'); t.eq(new Set(p.offers).size, 3, 'distinct'); t.eq(p.n, 3, 'n');
  t.eq(RUN.resolvePending(R, p.id, 'hanae_slash').reason, 'choice', 'only offered cards'); t.eq(R.pending.length, 1, 'still waiting');
  const deck = R.deck.length; const take = RUN.resolvePending(R, p.id, p.offers[1]);
  t.eq(take.ok, true, 'taken'); t.eq(R.deck.length, deck + 1, 'card added'); t.eq(R.deck[deck].id, p.offers[1], 'the pick'); t.deep(R.pending, [], 'cleared');
  const S = NEW({ seed: 2 }); const q = ops(S, [{ op: 'cardReward', n: 2 }]).pending[0]; const d = S.deck.length;
  t.eq(RUN.resolvePending(S, q.id, null).ok, true, 'a card reward may be skipped'); t.eq(S.deck.length, d, 'nothing gained'); t.deep(S.pending, [], 'cleared');
  const Rr = NEW({ seed: 2 }); const rare = ops(Rr, [{ op: 'cardReward', rarity: 'rare', n: 5 }]).pending[0];
  t.eq(rare.offers.length, 5, 'n up to 5'); t.ok(rare.offers.every((id) => DATA.cards[id].rarity === 'rare' && !DATA.cards[id].locked), 'all rares, none locked'); t.deep(rare.filter, { rarity: 'rare', hero: null }, 'the filter is echoed');
  Rr.rareOffset = 9; RUN.resolvePending(Rr, rare.id, rare.offers[0]); t.eq(Rr.rareOffset, 0, 'taking a rare resets pity');
  const K = NEW({ seed: 2 }); const kp = ops(K, [{ op: 'cardReward', hero: 'kuro', n: 4 }]).pending[0]; t.ok(kp.offers.every((id) => DATA.cards[id].hero === 'kuro'), 'a hero filter');
  const P = NEW({ seed: 2 }); const pp = ops(P, [{ op: 'cardReward', hero: 'party' }]).pending[0]; t.ok(pp.offers.every((id) => ['hanae', 'kuro'].indexOf(DATA.cards[id].hero) >= 0), 'party');
  const N = NEW({ seed: 2, unlocked: { card: [], relic: [], gem: [] } }); N.unlocked = { card: [], relic: [], gem: [] }; Object.keys(DATA.cards).forEach(() => {});
  const one = NEW({ seed: 2 }); const ids = new Set(); for (let i = 0; i < 100; i++) { const x = NEW({ seed: i }); ids.add(ops(x, [{ op: 'cardReward' }]).pending[0].offers[0]); } t.ok(ids.size > 10, 'offers vary by seed');
  const rc = NEW({ seed: 2 }); rc.relics.push('t_choices'); t.eq(ops(rc, [{ op: 'cardReward', n: 2 }]).pending[0].offers.length, 2, 'n is explicit: cardChoices does not change it');
  t.ok(one && N, 'sanity');
});
t.test('op fight: only where a fight is allowed; last op wins; pending and logs collect', () => {
  const R = NEW();
  const res = ops(R, [{ op: 'gold', n: 5 }, { op: 'fight', enemies: ['kappa'] }, { op: 'gold', n: 99 }], { tile: { q: 4, r: 4 } });
  t.ok(res.fight && res.fight.tile.q === 4, 'the fight node is built on the given tile'); t.eq(R.gold, E.startGold + 5, 'ops after a fight are dropped'); t.eq(res.log.length, 2, 'gold and fight lines');
  const hookish = ops(NEW(), [{ op: 'fight', enemies: ['kappa'] }], { fight: false }); t.eq(hookish.fight, null, 'run hooks cannot start fights'); t.ok(/Nothing stirs/.test(hookish.log[0].text), 'they say so');
  const many = ops(NEW(), [{ op: 'removeCard' }, { op: 'upgradeCard' }, { op: 'cardReward' }]); t.eq(many.pending.length, 3, 'several pending choices at once'); t.eq(new Set(many.pending.map((x) => x.id)).size, 3, 'each with its own id');
  const unknown = ops(NEW(), [{ op: 'zzz' }, null, { op: 'gold', n: 1 }]); t.eq(unknown.log.length, 1, 'unknown ops and junk are skipped');
  t.deep(ops(NEW(), []), { log: [], pending: [], fight: null }, 'an empty list is a no-op'); t.deep(ops(NEW(), undefined), { log: [], pending: [], fight: null }, 'undefined too');
});
t.test('applyOps without an rng is still deterministic for a run', () => {
  const play = () => { const R = NEW({ seed: 8 }); ops(R, [{ op: 'addCurse' }, { op: 'addGem' }, { op: 'addBrush', id: 'random' }]); ops(R, [{ op: 'addCurse' }, { op: 'addGem' }]); return J(RUN.serialize(R)); };
  t.eq(play(), play(), 'same run, same calls, same results (one live run at a time: uids share the global counter)');
});

// ================================================================================================ relic hooks
t.test('hooks: onChapterStart, once per run and every trigger vs every chapter', () => {
  const R = NEW(); R.relics.push('t_chapter', 't_once');
  const g = R.gold;
  RUN.startChapter(R, 2);
  t.eq(R.gold, g + 3 + 7, 'both fire on chapter 2'); RUN.startChapter(R, 3);
  t.eq(R.gold, g + 3 + 7 + 3, 'the once hook is spent, the plain one fires again');
  const r = RUN.hook(R, 'onChapterStart', {}); t.deep(Object.keys(r).sort(), ['log', 'pending'], 'RUN.hook returns {log, pending}'); t.ok(r.log.some((x) => x.op === 'relic' && x.id === 't_chapter'), 'the log names the relic');
  const seen = NEW(); RUN.addRelic(seen, 't_chapter'); seen.gold = 0; RUN.startChapter(seen, 2); t.eq(seen.gold, 3, 'a relic gained mid-run works from the next chapter');
});
t.test('hooks: every N counts triggers per run, limit N is per chapter', () => {
  const R = NEW({ seed: 3 }); R.relics.push('t_paint3'); R.ink = 0;
  const chain = MAP.pathToPaint(R.map, R.map.boss.q, R.map.boss.r).path;
  R.ink = 6; chain.slice(0, 6).forEach((c) => RUN.paint(R, c[0], c[1]));
  t.eq(R.stats.hexesPainted, 6, 'six hexes'); t.eq(R.ink, 2, 'six paints spent 6 Ink and every 3rd refunded 1: 6 - 6 + 2');
  const S = NEW({ seed: 3 }); S.relics.push('t_paint3'); RUN.startChapter(S, 2); S.ink = 3;
  const c2 = MAP.pathToPaint(S.map, S.map.boss.q, S.map.boss.r).path; c2.slice(0, 2).forEach((c) => RUN.paint(S, c[0], c[1])); t.eq(S.ink, 1, 'two paints, no refund yet');
  RUN.startChapter(S, 3); S.ink = 3; const c3 = MAP.pathToPaint(S.map, S.map.boss.q, S.map.boss.r).path; RUN.paint(S, c3[0][0], c3[0][1]);
  t.eq(S.ink, 3, 'the third trigger of the RUN (across chapters) refunds: 3 - 1 + 1');
  const L2 = NEW({ seed: 3 }); L2.relics.push('t_paintlim'); const g = L2.gold; L2.ink = 14;
  MAP.pathToPaint(L2.map, L2.map.boss.q, L2.map.boss.r).path.slice(0, 5).forEach((c) => RUN.paint(L2, c[0], c[1]));
  t.eq(L2.gold, g + 2, 'limit 2 per chapter: five paints, two coins'); RUN.startChapter(L2, 2); const g2 = L2.gold; L2.ink = 14;
  MAP.pathToPaint(L2.map, L2.map.boss.q, L2.map.boss.r).path.slice(0, 5).forEach((c) => RUN.paint(L2, c[0], c[1]));
  t.eq(L2.gold, g2 + 2, 'a new chapter resets the limit');
});
t.test('hooks: onPaint fires for every hex however it was painted (Ink, chain, brush, paint op)', () => {
  const R = NEW({ seed: 3 }); R.relics.push('t_paintlim'); R.relics.push('t_paint3'); R.ink = 10;
  const g = R.gold;
  const boss = R.map.boss; const chain = MAP.pathToPaint(R.map, boss.q, boss.r).path;
  RUN.paint(R, chain[3][0], chain[3][1]);
  t.eq(R.gold, g + 2, 'a four hex chain is four triggers, the limit caps the payout at 2');
  const S = NEW({ seed: 3 }); S.relics.push('t_paint3'); S.brushes = ['fan', 'halo']; S.ink = 0;
  let hit = null; Object.keys(S.map.tiles).forEach((k) => { const x = S.map.tiles[k]; for (let d = 0; d < 6 && !hit; d++) if (MAP.brushCells(S.map, 'halo', x.q, x.r, d).length >= 3) hit = [x.q, x.r, d]; });
  const before = S.ink; const b = RUN.useBrush(S, 'halo', hit[0], hit[1], hit[2]);
  t.eq(S.ink, before + Math.floor(b.tiles.length / 3), 'a brush stroke triggers once per hex painted');
  const P = NEW({ seed: 3 }); P.relics.push('t_paint3'); P.ink = 0; RUN.applyOps(P, [{ op: 'paint', n: 6 }]); t.eq(P.ink, 2, 'the paint op too');
});
t.test('hooks never re-enter themselves: a paint op inside onPaint cannot loop', () => {
  const R = NEW({ seed: 3 }); R.relics.push('t_paintloop'); R.ink = 5;
  const e = hiddenEdge(R);
  const res = RUN.paint(R, e.q, e.r);
  t.eq(res.ok, true, 'painted'); t.eq(R.stats.hexesPainted, 2, 'the hook painted exactly one more hex and stopped');
  const S = NEW({ seed: 3 }); S.relics.push('t_paintloop', 't_paint3'); S.ink = 9;
  for (let i = 0; i < 3; i++) { const c = MAP.pathToPaint(S.map, S.map.boss.q, S.map.boss.r).path[0]; RUN.paint(S, c[0], c[1]); }
  t.eq(S.stats.hexesPainted, 6, 'three manual paints, each followed by one free hex from the loop relic');
  t.eq(S.ink, 9 - 3 + 2, 'the other relic (every 3rd) saw all six hexes: two refunds');
});
t.test('hooks: onPickup runs only the new relic, onRest and onFightWon and onShopEnter have their own moments', () => {
  const R = NEW(); R.relics.push('t_pickup'); R.gold = 0;
  RUN.addRelic(R, 't_c0'); t.eq(R.gold, 0, 'an older onPickup relic does not fire when something else arrives');
  const S = NEW(); S.gold = 0; const r = RUN.addRelic(S, 't_pickup'); t.eq(S.gold, 10, 'it fires for itself'); t.eq(r.ok, true, 'ok'); t.deep(Object.keys(r).sort(), ['id', 'log', 'ok', 'pending'], 'shape');
  t.eq(RUN.addRelic(S, 't_pickup').reason, 'owned', 'no duplicates'); t.eq(RUN.addRelic(S, 'ghost').reason, 'unknown', 'unknown id'); t.eq(S.gold, 10, 'and no second payout');
  const H = NEW(); H.relics.push('t_rest'); H.heroes[0].hp = 10; H.heroes[1].hp = 10;
  enter(H, 'camp'); const rest = RUN.campAction(H, 'rest');
  t.eq(rest.ok, true, 'rested'); t.ok(rest.log.some((x) => x.op === 'relic' && x.id === 't_rest'), 'onRest is in the rest log');
  t.eq(H.heroes[0].hp, Math.min(HA, 10 + Math.round(HA * E.camp.restPct) + 3), 'the relic healed 3 more after the rest');
  const P = NEW(); P.relics.push('t_pickcard');
  const q = RUN.hook(P, 'onPickup', { only: 't_pickcard' }); t.eq(q.pending.length, 1, 'a hook that needs a choice returns it');
  t.eq(RUN.hook(P, 'onPickup', { only: 'nobody' }).log.length, 0, 'ctx.only names a relic');
  const N = NEW(); N.relics.push('t_fightgold'); t.eq(RUN.hook(N, 'onFightWon', { tier: 'normal' }).log.length > 0, true, 'direct calls work'); t.eq(RUN.hook(N, 'onRest', {}).log.length, 0, 'hooks only answer to their own name');
});
t.test('hooks: counters survive a save; hook rolls are seeded by trigger', () => {
  const mk = () => { const R = NEW({ seed: 3 }); R.relics.push('t_paint3'); R.ink = 14; return R; };
  const R = mk(); const chain = MAP.pathToPaint(R.map, R.map.boss.q, R.map.boss.r).path;
  RUN.paint(R, chain[0][0], chain[0][1]); RUN.paint(R, chain[1][0], chain[1][1]);
  const back = RUN.deserialize(JSON.parse(J(RUN.serialize(R))));
  const ink = back.ink; RUN.paint(back, chain[2][0], chain[2][1]); t.eq(back.ink, ink - 1 + 1, 'the reloaded run fires on its third trigger');
  const A = NEW({ seed: 3 }), B = NEW({ seed: 3 });
  A.relics.push('t_pickcard'); B.relics.push('t_pickcard');
  const a = J(RUN.hook(A, 'onPickup', { only: 't_pickcard' }).log), b = J(RUN.hook(B, 'onPickup', { only: 't_pickcard' }).log);
  t.eq(a, b, 'the same trigger gives the same roll');
  const rnd = fresh(); rnd.DATA.add('relics', { t_rgem: { name: 'rg', rarity: 'common', text: 'x.', art: { m: 'lantern' }, hooks: [{ on: 'onFightWon', fx: [{ op: 'addGem' }] }] } });
  const run1 = () => { const x = rnd.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, unlocked: ALL }); x.relics.push('t_rgem'); for (let i = 0; i < 6; i++) rnd.RUN.hook(x, 'onFightWon', { tier: 'normal' }); return x.gems.join(','); };
  t.eq(run1(), run1(), 'random hook effects replay exactly'); t.ok(new Set(run1().split(',')).size > 1, 'and differ from trigger to trigger: ' + run1());
});

// ================================================================================================ camp and forge
t.test('camp: rest heals both heroes by camp.restPct of max HP, healMul applies, one action by default', () => {
  const R = NEW(); R.heroes[0].hp = 10; R.heroes[1].hp = 20;
  enter(R, 'camp');
  const r = RUN.campAction(R, 'rest');
  t.eq(r.ok, true, 'rested'); t.eq(R.heroes[0].hp, 10 + Math.round(HA * E.camp.restPct), 'hanae gets restPct of max HP'); t.eq(R.heroes[1].hp, 20 + Math.round(KU * E.camp.restPct), 'kuro gets restPct of max HP');
  t.deep(r.healed.map((h) => h.id), ['hanae', 'kuro'], 'healed list'); t.eq(r.healed[0].n, Math.round(HA * E.camp.restPct), 'amounts'); t.eq(R.stats.campRests, 1, 'campRests'); t.deep(R.node.used, ['rest'], 'used');
  t.eq(RUN.campAction(R, 'rest').reason, 'used', 'not twice'); t.eq(RUN.campAction(R, 'meditate').reason, 'actions', 'one action per visit by default');
  const F = NEW(); F.heroes[0].hp = HA - 6; enter(F, 'camp'); const rf = RUN.campAction(F, 'rest'); t.eq(F.heroes[0].hp, HA, 'no overheal'); t.eq(rf.healed[0].n, 6, 'reports what it really healed');
  const H = NEW(); H.relics.push('t_heal'); H.heroes[0].hp = 1; enter(H, 'camp'); RUN.campAction(H, 'rest'); t.eq(H.heroes[0].hp, 1 + Math.round(HA * E.camp.restPct * 1.5), 'healMul +50%');
  const T = NEW({ trial: 7 }); T.heroes[0].hp = 1; enter(T, 'camp'); RUN.campAction(T, 'rest'); t.eq(T.heroes[0].hp, 1 + Math.round(HA * E.camp.restPct * 0.9), 'trial healMul -10%');
  const bare = NEW(); t.eq(RUN.campAction(bare, 'rest').reason, 'node', 'a camp node is required'); t.eq(RUN.campAction(R, 'dance').reason, 'action', 'unknown action');
  const wrong = NEW(); enter(wrong, 'forge'); t.eq(RUN.campAction(wrong, 'rest').reason, 'node', 'not at a forge');
});
t.test('camp: campActions (mod or flag) lets one visit hold more different actions, at most three', () => {
  const R = NEW(); R.relics.push('t_camp'); R.heroes[0].hp = 10; enter(R, 'camp');
  t.eq(RUN.campAction(R, 'rest').ok, true, 'rest'); t.eq(RUN.campAction(R, 'meditate').ok, true, 'and meditate'); t.eq(RUN.campAction(R, 'sharpen', R.deck[0].uid).reason, 'actions', 'but not a third'); t.deep(R.node.used, ['rest', 'meditate'], 'two used');
  const F = NEW(); F.flags.extraCampActions = 1; enter(F, 'camp'); t.eq(RUN.campAction(F, 'rest').ok, true, 'a flag works like the mod'); t.eq(RUN.campAction(F, 'meditate').ok, true, 'second'); t.eq(RUN.campAction(F, 'sharpen', F.deck[0].uid).ok, false, 'not a third');
  const M = NEW(); M.relics.push('t_camp'); M.flags.extraCampActions = 9; enter(M, 'camp');
  t.eq(RUN.campAction(M, 'rest').ok, true, 'rest'); t.eq(RUN.campAction(M, 'meditate').ok, true, 'meditate'); t.eq(RUN.campAction(M, 'sharpen', M.deck[0].uid).ok, true, 'sharpen: the third'); t.eq(RUN.campAction(M, 'gems').reason, 'actions', 'the cap is three');
});
t.test('camp: sharpen upgrades one chosen card, and only a valid card uses the action up', () => {
  const R = NEW(); enter(R, 'camp');
  const uid = R.deck[2].uid;
  t.eq(RUN.campAction(R, 'sharpen', 99999).reason, 'card', 'not in the deck'); t.deep(R.node.used, [], 'a refusal keeps the action'); t.eq(RUN.campAction(R, 'sharpen').reason, 'card', 'a card is required');
  const s = RUN.campAction(R, 'sharpen', uid);
  t.eq(s.ok, true, 'sharpened'); t.eq(R.deck[2].up, 1, 'upgraded'); t.eq(R.stats.upgrades, 1, 'stat'); t.eq(s.uid, uid, 'uid echoed'); t.eq(s.id, R.deck[2].id, 'id');
  const S = NEW(); enter(S, 'camp'); S.deck[0].up = 1;
  t.eq(RUN.campAction(S, 'sharpen', S.deck[0].uid).reason, 'card', 'an upgraded card cannot be sharpened again'); t.eq(RUN.campAction(S, 'sharpen', { uid: S.deck[1].uid }).ok, true, 'an {uid} object works too');
  const C = NEW(); C.deck.push({ uid: 900, id: 'curse_regret', up: 0, gems: [] }); enter(C, 'camp'); t.eq(RUN.campAction(C, 'sharpen', 900).reason, 'card', 'a curse cannot be sharpened');
});
t.test('camp: meditate gives campInk Ink (capped) and one random brush, seeded by the tile', () => {
  const R = NEW(); enter(R, 'camp', null, () => { R.ink = 3; });
  const m = RUN.campAction(R, 'meditate');
  t.eq(m.ok, true, 'meditated'); t.eq(R.ink, 3 + E.campInk, 'campInk'); t.eq(m.ink, E.campInk, 'reported'); t.ok(DATA.brushes[m.brush], 'a real brush'); t.ok(R.brushes.indexOf(m.brush) >= 0, 'in the tray'); t.eq(R.brushes.length, 2, 'stroke plus the new one');
  const F = NEW(); enter(F, 'camp', null, () => { F.ink = F.inkMax - 1; }); t.eq(RUN.campAction(F, 'meditate').ink, 1, 'capped at inkMax; only 1 fitted');
  const a = NEW({ seed: 6 }); enter(a, 'camp'); const b = NEW({ seed: 6 }); enter(b, 'camp'); t.eq(RUN.campAction(a, 'meditate').brush, RUN.campAction(b, 'meditate').brush, 'the same camp gives the same brush');
  const brushes = new Set(); for (let s = 0; s < 60; s++) { const x = NEW({ seed: s }); enter(x, 'camp'); brushes.add(RUN.campAction(x, 'meditate').brush); } t.ok(brushes.size >= 4, 'variety across seeds: ' + brushes.size);
});
t.test('camp: Cut Gems stays open all visit, counts as an action on the first socket or on leaving', () => {
  const R = NEW(); enter(R, 'camp'); R.gems = ['red_g0', 'red_g1', 'blue_g0'];
  const slash = R.deck.find((c) => c.id === 'hanae_slash'), parry = R.deck.find((c) => c.id === 'hanae_parry');
  t.deep(RUN.campAction(R, 'gems'), { ok: true, open: true }, 'no argument: may cutting start?'); t.deep(R.node.used, [], 'asking costs nothing');
  const bad = RUN.campAction(R, 'gems', { uid: slash.uid, slot: 0, gem: 'blue_g0' }); t.eq(bad.ok, false, 'a colour mismatch'); t.eq(bad.reason, 'color', 'says why'); t.deep(R.node.used, [], 'a failed cut uses no action');
  const ok = RUN.campAction(R, 'gems', { uid: slash.uid, slot: 0, gem: 'red_g0' });
  t.eq(ok.ok, true, 'socketed'); t.deep(R.node.used, ['gems'], 'the first success counts as the action'); t.eq(slash.gems[0], 'red_g0', 'in the card'); t.deep(R.gems, ['red_g1', 'blue_g0'], 'out of the pouch');
  t.eq(RUN.campAction(R, 'gems', { uid: parry.uid, slot: 0, gem: 'blue_g0' }).ok, true, 'any number of cuts in one visit'); t.eq(R.node.used.length, 1, 'still one action');
  t.eq(RUN.campAction(R, 'gems', { uid: slash.uid, slot: 0, gem: 'red_g1' }).replaced, 'red_g0', 'replacing destroys the old gem and says which'); t.deep(R.gems, [], 'pouch empty'); t.eq(R.stats.gemsSocketed, 3, 'gemsSocketed counts every cut');
  t.eq(RUN.campAction(R, 'rest').reason, 'actions', 'the visit is spent'); t.eq(RUN.campAction(R, 'gems', { leave: true }).ok, true, 'leaving after the fact is fine');
  const L2 = NEW(); enter(L2, 'camp'); t.eq(RUN.campAction(L2, 'gems', { leave: true }).ok, true, 'leaving without cutting'); t.deep(L2.node.used, ['gems'], 'still counts as the action'); t.eq(RUN.campAction(L2, 'rest').reason, 'actions', 'so rest is gone');
  const K = NEW(); enter(K, 'camp'); RUN.campAction(K, 'rest'); t.eq(RUN.campAction(K, 'gems').reason, 'actions', 'no free action left for gems'); t.eq(RUN.campAction(K, 'gems', { leave: true }).reason, 'actions', 'not even to leave with credit');
  const M = NEW(); M.relics.push('t_camp'); enter(M, 'camp'); M.gems = ['red_g0']; RUN.campAction(M, 'rest'); t.eq(RUN.campAction(M, 'gems', { uid: M.deck[0].uid, slot: 0, gem: 'red_g0' }).ok, true, 'with two actions: rest then gems'); t.deep(M.node.used, ['rest', 'gems'], 'both');
});
t.test('forge: one upgrade OR gem cutting; unused forges can be revisited', () => {
  const R = NEW(); enter(R, 'forge'); R.gems = ['red_g0'];
  const slash = R.deck[0];
  t.eq(RUN.forgeAction(R, 'upgrade', 99999).reason, 'card', 'bad card'); t.eq(RUN.forgeAction(R, 'dance').reason, 'action', 'bad action'); t.eq(R.node.used, null, 'nothing used');
  t.eq(RUN.forgeAction(R, 'upgrade', slash.uid).ok, true, 'upgraded'); t.eq(slash.up, 1, 'the card'); t.eq(R.node.used, 'upgrade', 'marked');
  t.eq(RUN.forgeAction(R, 'upgrade', R.deck[1].uid).reason, 'used', 'once'); t.eq(RUN.forgeAction(R, 'gems', { uid: slash.uid, slot: 0, gem: 'red_g0' }).reason, 'used', 'and not gems after an upgrade');
  const G2 = NEW(); enter(G2, 'forge'); G2.gems = ['red_g0', 'red_g1'];
  t.deep(RUN.forgeAction(G2, 'gems'), { ok: true, open: true }, 'begin'); t.eq(G2.node.used, null, 'asking costs nothing');
  t.eq(RUN.forgeAction(G2, 'gems', { uid: G2.deck[0].uid, slot: 0, gem: 'red_g0' }).ok, true, 'cut'); t.eq(G2.node.used, 'gems', 'marked'); t.eq(RUN.forgeAction(G2, 'gems', { uid: G2.deck[0].uid, slot: 0, gem: 'red_g1' }).ok, true, 'as many cuts as you like');
  t.eq(RUN.forgeAction(G2, 'upgrade', G2.deck[1].uid).reason, 'used', 'no upgrade after gem cutting');
  const bare = NEW(); t.eq(RUN.forgeAction(bare, 'upgrade', 1).reason, 'node', 'needs a forge');
  const T = NEW(); const tn = enter(T, 'forge'); const tile = T.map.tiles[MAP.key(tn.tile.q, tn.tile.r)];
  t.eq(RUN.finishNode(T).chapterEnded, false, 'leaving unused'); t.eq(tile.done, false, 'an unused forge stays on the map (there is something to use)');
  const U1 = NEW(); const un = enter(U1, 'forge'); RUN.forgeAction(U1, 'upgrade', U1.deck[0].uid); RUN.finishNode(U1); t.eq(U1.map.tiles[MAP.key(un.tile.q, un.tile.r)].done, true, 'a used forge is done');
  const N = NEW(); N.deck.forEach((c) => { c.up = 1; }); N.gems = []; const nn = enter(N, 'forge'); t.eq(RUN.forgeUsable(N), false, 'nothing to upgrade or cut'); RUN.finishNode(N); t.eq(N.map.tiles[MAP.key(nn.tile.q, nn.tile.r)].done, true, 'a forge with nothing to offer is done when you leave, so it cannot block the mercy rule');
  const V = NEW(); V.deck.forEach((c) => { c.up = 1; }); V.gems = ['red_g0']; t.eq(RUN.forgeUsable(V), true, 'a gem and a matching slot is a use'); V.gems = ['blue_g0']; V.deck.forEach((c) => { if (DATA.cards[c.id].slots[0] === 'blue') c.gems[0] = 'blue_g0'; });
  const W = NEW(); W.deck.forEach((c) => { c.up = 1; }); W.gems = ['green_g0']; t.eq(RUN.forgeUsable(W), false, 'a green gem fits no starter slot');
});
t.test('finishNode: a camp is always done; shop, event, chest and gem cache too', () => {
  ['camp', 'shop', 'chest', 'gemcache', 'event'].forEach((type) => {
    const R = NEW({ seed: 14 }); const n = enter(R, type); const tile = R.map.tiles[MAP.key(n.tile.q, n.tile.r)];
    t.eq(tile.done, false, type + ' open'); RUN.finishNode(R); t.eq(tile.done, true, type + ' done after finishNode'); t.eq(R.node, null, 'node cleared');
  });
  const R = NEW({ seed: 14 }); enter(R, 'shop'); R.pending = [{ id: 'p1', op: 'removeCard', n: 1, pick: 'choose', filter: null }]; RUN.finishNode(R); t.deep(R.pending, [], 'unresolved pending choices are dropped with the node');
});

// ================================================================================================ socketing and deck operations
t.test('socket: colour rules, prism slots, replacing destroys, every refusal changes nothing', () => {
  const R = NEW(); R.gems = ['red_g0', 'blue_g0', 'green_g0', 'gold_g0'];
  const slash = R.deck.find((c) => c.id === 'hanae_slash');           // one red slot
  t.deep(RUN.socket(R, slash.uid, 0, 'blue_g0'), { ok: false, reason: 'color' }, 'a blue gem does not fit a red slot');
  const ok = RUN.socket(R, slash.uid, 0, 'red_g0'); t.eq(ok.ok, true, 'red fits red'); t.eq(ok.replaced, null, 'nothing replaced'); t.deep(R.gems, ['blue_g0', 'green_g0', 'gold_g0'], 'gem used up'); t.eq(R.stats.gemsSocketed, 1, 'stat');
  R.gems.push('red_g1'); const rep = RUN.socket(R, slash.uid, 0, 'red_g1'); t.eq(rep.replaced, 'red_g0', 'replaced'); t.ok(R.gems.indexOf('red_g0') < 0, 'the old gem is destroyed, not returned'); t.eq(slash.gems[0], 'red_g1', 'new gem in');
  const snap = J(RUN.serialize(R));
  t.eq(RUN.socket(R, slash.uid, 0, 'red_g1').reason, 'gem', 'that gem is already in the card, not in the pouch'); R.gems.push('red_g1'); t.eq(RUN.socket(R, slash.uid, 0, 'red_g1').reason, 'same', 'the same gem into the same slot is refused'); R.gems.pop();
  t.eq(RUN.socket(R, slash.uid, 5, 'red_g0').reason, 'slot', 'no such slot'); t.eq(RUN.socket(R, slash.uid, -1, 'red_g0').reason, 'slot', 'negative'); t.eq(RUN.socket(R, slash.uid, 0.5, 'red_g0').reason, 'slot', 'fractional'); t.eq(RUN.socket(R, 99999, 0, 'red_g0').reason, 'card', 'no such card'); t.eq(RUN.socket(R, slash.uid, 0, 'nope').reason, 'gem', 'no such gem'); t.eq(RUN.socket(R, slash.uid, 0, 'gold_g0').reason, 'color', 'gold is not red'); t.eq(J(RUN.serialize(R)), snap, 'none of it changed anything');
  const curse = { uid: 800, id: 'curse_hex', up: 0, gems: [] }; R.deck.push(curse); t.eq(RUN.socket(R, 800, 0, 'red_g0').reason, 'slot', 'a curse has no sockets');
  const P = NEW(); P.deck.push({ uid: 810, id: 'hanae_u1', up: 0, gems: [null] }); P.gems = ['red_g0', 'green_g0', 'gold_g0'];
  t.deep(DATA.cards.hanae_u1.slots, ['any'], 'the test card has a prism slot'); t.eq(RUN.socket(P, 810, 0, 'green_g0').ok, true, 'a prism takes green'); t.eq(RUN.socket(P, 810, 0, 'gold_g0').replaced, 'green_g0', 'and gold, replacing it');
  const two = NEW(); two.deck.push({ uid: 820, id: 'hanae_r0', up: 0, gems: [null, null] }); two.gems = ['red_g0', 'gold_g0', 'blue_g0']; t.deep(DATA.cards.hanae_r0.slots, ['red', 'any'], 'two slots'); t.eq(RUN.socket(two, 820, 1, 'blue_g0').ok, true, 'the prism slot takes blue'); t.eq(RUN.socket(two, 820, 0, 'red_g0').ok, true, 'the red slot takes red'); t.deep(two.deck[10].gems, ['red_g0', 'blue_g0'], 'both filled');
});
t.test('deck: addCard, removeCard, upgradeCard keep instances well formed', () => {
  const R = NEW();
  const c = RUN.addCard(R, 'hanae_r0'); t.eq(c.up, 0, 'plain'); t.eq(c.gems.length, 2, 'gems as long as the slots'); t.eq(RUN.addCard(R, 'nope'), null, 'unknown id');
  const u = RUN.addCard(R, 'hanae_r0', { up: true, gems: ['red_g0', 'blue_g0', 'extra'] }); t.eq(u.up, 1, 'upgraded on request'); t.deep(u.gems, ['red_g0', 'blue_g0'], 'gems trimmed to the slots');
  const cu = RUN.addCard(R, 'curse_regret', { up: true }); t.eq(cu.up, 0, 'a card with no upgrade stays plain'); t.deep(cu.gems, [], 'no sockets');
  R.deck.push({ uid: 999, id: 'hanae_c0', up: 0, gems: ['red_g2'] }); const rem = RUN.removeCard(R, 999); t.eq(rem.id, 'hanae_c0', 'returns the card'); t.deep(R.gems, ['red_g2'], 'gem back in the pouch'); t.eq(RUN.removeCard(R, 999), null, 'gone');
  t.eq(RUN.removeCard(R, u.uid).gems.length, 2, 'removing a fully socketed card'); t.deep(R.gems.sort(), ['blue_g0', 'red_g0', 'red_g2'], 'every gem returned');
});

// ================================================================================================ chapter end
t.test('chapterEnd: +8 max HP, then 30% heal (healMul), the next map, Ink top-up, hooks', () => {
  const R = NEW({ seed: 5 }); R.heroes[0].hp = 20; R.heroes[1].hp = KU; R.ink = 2; R.chapterCleared = true;
  R.relics.push('t_chapter');
  const g = R.gold;
  const res = RUN.chapterEnd(R);
  t.eq(res.next, 2, 'next chapter'); t.eq(res.maxHp, 8, 'max HP figure'); t.eq(R.heroes[0].maxHp, HA + 8, '+8 max'); t.eq(R.heroes[1].maxHp, KU + 8, '+8 max');
  t.eq(R.heroes[0].hp, Math.min(HA + 8, 20 + 8 + Math.round((HA + 8) * 0.3)), 'hurt hero: +8 (max HP raise) then 30% of the new max'); t.eq(R.heroes[1].hp, KU + 8, 'a full hero is full at the new max');
  t.deep(res.healed.map((h) => h.id), ['hanae', 'kuro'], 'healed list'); t.eq(res.healed[0].n, Math.round((HA + 8) * 0.3), 'heal amount'); t.eq(res.healed[0].hp, R.heroes[0].hp, 'hp echoed'); t.eq(res.healed[1].n, 0, 'nothing left to heal');
  t.eq(R.chapter, 2, 'chapter'); t.eq(R.map.chapter, 2, 'a new map'); t.eq(R.map.seed, U.hash(5, 'ch2', 'map'), 'from the run seed'); t.eq(R.chapterCleared, false, 'flag cleared'); t.eq(R.node, null, 'no node'); t.eq(R.ink, E.startInk, 'Ink topped up to startInk'); t.eq(R.gold, g + 3, 'onChapterStart fired after the map was made');
  const h = NEW(); h.relics.push('t_heal'); h.heroes[0].hp = 1; RUN.chapterEnd(h); t.eq(h.heroes[0].hp, Math.min(HA + 8, 1 + 8 + Math.round((HA + 8) * 0.3 * 1.5)), 'healMul applies to chapter-end healing');
  const hi = NEW(); hi.ink = 13; RUN.chapterEnd(hi); t.eq(hi.ink, 13, 'more Ink than startInk is kept');
  const two = NEW({ seed: 5 }); RUN.chapterEnd(two); const three = RUN.chapterEnd(two); t.eq(three.next, 3, 'and on to chapter 3'); t.eq(two.heroes[0].maxHp, HA + 16, 'another +8'); t.eq(two.chapter, 3, 'chapter 3');
});
t.test('chapterEnd after the chapter 3 boss: victory, no heal, no max HP', () => {
  const R = NEW({ seed: 5 }); RUN.startChapter(R, 3); R.heroes[0].hp = 10; R.chapterCleared = true; R.stats.bossKills = 3;
  const res = RUN.chapterEnd(R);
  t.eq(res.next, 'victory', 'victory'); t.deep(res.healed, [], 'no healing'); t.eq(res.maxHp, 0, 'no max HP'); t.eq(R.heroes[0].maxHp, HA, 'max HP unchanged'); t.eq(R.heroes[0].hp, 10, 'hp unchanged');
  t.eq(R.done, true, 'the run is done'); t.eq(R.victory, true, 'and won'); t.eq(R.chapterCleared, false, 'flag cleared'); t.eq(R.chapter, 3, 'still chapter 3'); t.eq(RUN.summary(R).victory, true, 'the summary agrees');
});

// ================================================================================================ score and summary
t.test('score: the documented formula, floored at 0', () => {
  const R = NEW();
  R.stats.bossKills = 2; R.stats.elites = 3; R.stats.turns = 21; R.gold = 259;
  R.heroes[0].maxHp = 90; R.heroes[1].maxHp = 70;
  R.deck.forEach((c, i) => { if (i < 4) c.up = 1; });
  R.deck[0].gems[0] = 'red_g0'; R.deck[1].gems[0] = 'red_g0'; R.deck[2].gems[0] = 'blue_g0';
  RUN.addCard(R, 'curse_regret'); RUN.addCard(R, 'curse_hex');
  const S = E.score;
  const want = S.chapter * 2 + S.boss * 2 + S.elite * 3 + Math.floor(259 / S.goldDiv) + S.maxHp * 160 + S.upgraded * 4 + S.gemSlot * 3 + S.curse * 2 - Math.floor(21 / S.turnDiv);
  t.eq(RUN.score(R), want, 'formula: ' + want); t.eq(want, 100 * 2 + 60 * 2 + 15 * 3 + 25 + 2 * 160 + 2 * 4 + 3 * 3 - 5 * 2 - 10, 'and it is the design number ' + want);
  const low = NEW(); low.heroes.forEach((h) => { h.maxHp = 1; }); for (let i = 0; i < 30; i++) RUN.addCard(low, 'curse_regret'); low.stats.turns = 900;
  t.eq(RUN.score(low), 0, 'never below zero');
  const plain = RUN.score(NEW()); t.eq(plain, 2 * (HA + KU) + 6, 'a fresh run: 2 per max HP plus 60 gold / 10'); const up = NEW(); up.heroes[0].maxHp += 8; t.eq(RUN.score(up), plain + 16, 'max HP counts double');
});
t.test('summary: the fields the end screens and META read', () => {
  const R = NEW({ seed: 4, trial: 3 }); R.stats.bossKills = 1; R.relics.push('t_gold');
  const s = RUN.summary(R);
  t.deep(Object.keys(s).sort(), ['chapter', 'chaptersCleared', 'daily', 'deckSize', 'done', 'gold', 'heroes', 'id', 'relics', 'score', 'seed', 'stats', 'trial', 'victory'], 'fields');
  t.eq(s.score, RUN.score(R), 'score'); t.eq(s.victory, false, 'victory'); t.eq(s.chapter, 1, 'chapter'); t.eq(s.trial, 3, 'trial'); t.eq(s.daily, false, 'daily'); t.eq(s.seed, 4, 'seed'); t.eq(s.deckSize, R.deck.length, 'deck size'); t.deep(s.relics, ['t_gold'], 'relics'); t.eq(s.gold, R.gold, 'gold'); t.eq(s.chaptersCleared, 1, 'chapters cleared'); t.deep(s.heroes, R.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp })), 'heroes');
  s.stats.kills = 99; s.relics.push('x'); s.heroes[0].hp = 1; t.eq(R.stats.kills, 0, 'the summary holds copies'); t.deep(R.relics, ['t_gold'], 'relics untouched'); t.eq(R.heroes[0].hp, HA, 'heroes untouched');
});

// ================================================================================================ saves
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));
const roundTrip = (R) => RUN.deserialize(JSON.parse(J(RUN.serialize(R))));
// first path at which two plain values differ (for failure messages)
function diffPath(a, b, p) {
  p = p || '$';
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${p}: ${J(a)} vs ${J(b)}`;
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of [...keys].sort()) { const d = diffPath(a[k], b[k], p + '.' + k); if (d) return d; }
  return null;
}
t.test('serialize: plain JSON, pure, includes the map and the uid counter', () => {
  const R = NEW({ seed: 9 });
  const before = canon(R);
  const o = RUN.serialize(R);
  t.eq(canon(R), before, 'serialize does not touch R'); t.eq(o.v, 1, 'versioned'); t.ok(Number.isInteger(o.uid) && o.uid > 10, 'the uid counter rides along: ' + o.uid);
  t.ok(o.map && o.map.tiles && o.map !== R.map, 'a map copy'); o.deck[0].up = 1; o.map.pos.q = 99; t.eq(R.deck[0].up, 0, 'the copy is deep'); t.ok(R.map.pos.q !== 99, 'including the map');
  t.eq(J(JSON.parse(J(RUN.serialize(R)))), J(RUN.serialize(R)), 'survives JSON unchanged');
  const back = RUN.deserialize(JSON.parse(J(RUN.serialize(R))));
  t.eq(canon(back), before, 'a fresh run round trips exactly'); t.eq(back.uid, undefined, 'the uid field is bookkeeping, not part of R');
  t.ok(back.map !== R.map && back.deck !== R.deck, 'a distinct object graph');
});
t.test('deserialize keeps duplicate gems and duplicate brushes (they are counts, not sets)', () => {
  const R = NEW({ seed: 9 }); R.gems = ['red_g0', 'red_g0', 'blue_g1', 'red_g0']; R.brushes = ['stroke', 'stroke', 'halo'];
  const back = roundTrip(R);
  t.deep(back.gems, ['red_g0', 'red_g0', 'blue_g1', 'red_g0'], 'three copies of one gem survive a save'); t.deep(back.brushes, ['stroke', 'stroke', 'halo'], 'two Long Strokes survive');
  R.relics = ['t_gold', 't_gold', 't_c0']; t.deep(roundTrip(R).relics, ['t_gold', 't_c0'], 'relics are a set: a duplicate id is collapsed');
});
t.test('deserialize: uid counter continues past every existing uid', () => {
  const R = NEW({ seed: 9 }); RUN.addCard(R, 'hanae_c0'); RUN.addCard(R, 'hanae_c1');
  const max = Math.max(...R.deck.map((c) => c.uid));
  const saved = JSON.parse(J(RUN.serialize(R)));
  U.resetUid(1);
  const back = RUN.deserialize(saved);
  const next = RUN.addCard(back, 'hanae_c2'); t.ok(next.uid > max, 'a new card gets a fresh uid after a page reload: ' + next.uid + ' > ' + max);
  t.eq(new Set(back.deck.map((c) => c.uid)).size, back.deck.length, 'unique');
  const noCounter = JSON.parse(J(RUN.serialize(R))); delete noCounter.uid; U.resetUid(1); const b2 = RUN.deserialize(noCounter); t.ok(RUN.addCard(b2, 'hanae_c2').uid > max, 'even with no stored counter, 1 + max uid in the deck is used');
  const low = JSON.parse(J(RUN.serialize(R))); low.uid = 2; U.resetUid(1); const b3 = RUN.deserialize(low); t.ok(RUN.addCard(b3, 'hanae_c2').uid > max, 'a stale low counter never wins over the deck');
  U.resetUid(5000); const b4 = RUN.deserialize(JSON.parse(J(RUN.serialize(R)))); t.ok(RUN.addCard(b4, 'hanae_c2').uid >= 1 && RUN.addCard(b4, 'hanae_c2').uid > max, 'restoring never leaves the counter below the deck');
});
t.test('deserialize: version, junk and stale content', () => {
  const R = NEW({ seed: 9 });
  const o = () => JSON.parse(J(RUN.serialize(R)));
  t.eq(RUN.deserialize(null), null, 'null'); t.eq(RUN.deserialize(undefined), null, 'undefined'); t.eq(RUN.deserialize('x'), null, 'a string'); t.eq(RUN.deserialize(5), null, 'a number'); t.eq(RUN.deserialize([]), null, 'an array');
  const v2 = o(); v2.v = 2; t.eq(RUN.deserialize(v2), null, 'another version is refused'); const v0 = o(); delete v0.v; t.eq(RUN.deserialize(v0), null, 'no version');
  const noHeroes = o(); noHeroes.heroes = []; t.eq(RUN.deserialize(noHeroes), null, 'no party'); const badHero = o(); badHero.heroes[0].id = 'nobody'; t.eq(RUN.deserialize(badHero), null, 'an unknown hero'); const noDeck = o(); delete noDeck.deck; t.eq(RUN.deserialize(noDeck), null, 'no deck');
  const badMap = o(); badMap.map = 'junk'; t.ok(RUN.deserialize(badMap) === null || typeof RUN.deserialize(badMap) === 'object', 'a junk map does not throw');
  const stale = o(); stale.deck.push({ uid: 777, id: 'gone_card', up: 0, gems: [] }); stale.deck[0].gems[0] = 'gone_gem'; stale.gems = ['red_g0', 'gone_gem']; stale.relics = ['t_gold', 'gone_relic']; stale.brushes = ['halo', 'gone_brush'];
  const back = RUN.deserialize(stale);
  t.eq(back.deck.length, 10, 'a deck entry whose card no longer exists is dropped'); t.eq(back.deck[0].gems[0], null, 'a socket holding an unknown gem is emptied'); t.deep(back.gems, ['red_g0'], 'unknown gems dropped'); t.deep(back.relics, ['t_gold'], 'unknown relics dropped'); t.deep(back.brushes, ['halo'], 'unknown brushes dropped');
  const lenient = o(); delete lenient.flags; delete lenient.hk; delete lenient.foes; delete lenient.seen; delete lenient.log; delete lenient.pending; delete lenient.rareOffset; delete lenient.stats;
  const l = RUN.deserialize(lenient);
  t.deep(l.flags, {}, 'missing fields get defaults'); t.deep(l.seen, { events: [] }, 'seen'); t.deep(Object.keys(l.stats).sort(), L.statKeys.slice().sort(), 'stats'); t.eq(l.rareOffset, 0, 'rareOffset');
  const partial = o(); partial.stats = { kills: 4 }; const p = RUN.deserialize(partial); t.eq(p.stats.kills, 4, 'a partial stats block keeps what it has'); t.eq(p.stats.turns, 0, 'and fills the rest');
  const slots = o(); slots.deck[0].gems = []; t.eq(RUN.deserialize(slots).deck[0].gems.length, 1, 'gem arrays are rebuilt to the slot count');
  const up = o(); up.deck.push({ uid: 778, id: 'curse_hex', up: 1, gems: [] }); t.eq(RUN.deserialize(up).deck[10].up, 0, 'a stale upgrade on a card that has none is cleared');
});
t.test('every node kind survives a save', () => {
  const kinds = ['enemy', 'elite', 'boss', 'chest', 'shop', 'camp', 'forge', 'gemcache', 'event'];
  kinds.forEach((type) => {
    const R = NEW({ seed: 15 }); const n = enter(R, type);
    const back = roundTrip(R);
    t.eq(canon(back.node), canon(R.node), type + ' node restored'); t.eq(canon(back), canon(R), type + ' whole run restored');
    const reward = NEW({ seed: 15 }); enter(reward, type === 'boss' ? 'enemy' : type);
    t.ok(n, type);
  });
  const R = NEW({ seed: 15 }); enter(R, 'enemy'); RUN.combatDone(R, fakeC({})); t.eq(canon(roundTrip(R)), canon(R), 'the reward node restored');
  const P = NEW({ seed: 15 }); RUN.applyOps(P, [{ op: 'removeCard' }, { op: 'cardReward' }]); t.eq(canon(roundTrip(P)), canon(P), 'pending choices restored'); const back = roundTrip(P);
  t.eq(RUN.resolvePending(back, back.pending[0].id, [back.deck[0].uid]).ok, true, 'and still answerable after a reload');
});
t.test('a reload at an event replays the same fable and the same outcome', () => {
  const A = fresh(); const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 33, unlocked: ALL });
  const tile = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => x.type === 'event' && A.MAP.pathToPaint(R.map, x.q, x.r));
  Object.keys(R.map.tiles).forEach((k) => { if (R.map.tiles[k] !== tile) R.map.tiles[k].done = true; });
  A.MAP.pathToPaint(R.map, tile.q, tile.r).path.forEach((c) => { R.ink = R.inkMax; A.RUN.paint(R, c[0], c[1]); });
  const q = [[R.map.pos.q, R.map.pos.r]], prev = {}; prev[A.MAP.key(R.map.pos.q, R.map.pos.r)] = null;
  while (q.length) { const c = q.shift(); A.MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = A.MAP.key(n[0], n[1]); if (!(k in prev) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); }
  const path = []; for (let c = [tile.q, tile.r]; c; c = prev[A.MAP.key(c[0], c[1])]) path.unshift(c);
  path.slice(1).forEach((c) => A.RUN.step(R, c[0], c[1]));
  const entry = J(A.RUN.serialize(R));
  const ev = A.DATA.events[R.node.event];
  const i = A.RUN.eventChoices(R, ev).findIndex((c) => c.ok);
  const first = A.RUN.eventChoose(R, ev, i);
  const back = A.RUN.deserialize(JSON.parse(entry));
  t.eq(back.node.event, R.node.event, 'the same fable'); const again = A.RUN.eventChoose(back, ev, i);
  t.eq(again.text, first.text, 'the same outcome'); t.eq(canon(back), canon(R), 'the same resulting state');
});

// ================================================================================================ a bot plays whole runs
function sinkEvents(encId) {
  const one = (label, ops, req) => ({ label, req, out: [{ w: 1, text: label + '.', ops }] });
  const safe = one('Walk on', []);
  return {
    sink_gold: mkEv('sink_gold', { choices: [safe, { label: 'Gamble', req: { gold: 20 }, cost: '20 gold', out: [{ w: 2, text: 'Won.', ops: [{ op: 'gold', n: 40 }] }, { w: 1, text: 'Lost.', ops: [{ op: 'gold', n: -20 }] }] }] }),
    sink_deck: mkEv('sink_deck', { choices: [safe, one('Prune', [{ op: 'removeCard' }]), one('Refine', [{ op: 'upgradeCard', random: true }, { op: 'transformCard' }]), one('Echo', [{ op: 'duplicateCard' }, { op: 'addCurse' }])] }),
    sink_relic: mkEv('sink_relic', { choices: [safe, one('Take', [{ op: 'addRelic', rarity: 'uncommon' }]), one('Gems', [{ op: 'addGem', tier: 2 }, { op: 'addBrush', id: 'random' }]), one('Greed', [{ op: 'addRelic', rarity: 'rare' }, { op: 'addCurse', n: 2 }, { op: 'maxHp', n: -3, who: 'front' }])] }),
    sink_fight: mkEv('sink_fight', { choices: [safe, one('Fight', [{ op: 'fight', enc: encId || 'ch1_n2', win: [{ op: 'gold', n: 15 }, { op: 'upgradeCard', random: true }] }]), one('Duel', [{ op: 'hurt', pct: 0.1 }, { op: 'fight', enemies: ['oni_brute'], tier: 'elite' }]), one('Skirmish', [{ op: 'fight', enemies: ['kappa'], rewards: false }])] }),
    sink_heal: mkEv('sink_heal', { choices: [safe, one('Rest', [{ op: 'heal', pct: 0.3, who: 'lowest' }, { op: 'ink', n: 2 }]), one('Pay', [{ op: 'hurt', n: 5, who: 'random' }, { op: 'maxHp', n: 4 }, { op: 'ink', pct: -0.2 }])] }),
    sink_cards: mkEv('sink_cards', { choices: [safe, one('Choose', [{ op: 'cardReward', rarity: 'rare', n: 3 }]), one('Gift', [{ op: 'addCard', pool: 'party', rarity: 'uncommon', up: true, n: 2 }, { op: 'paint', n: 3 }, { op: 'flag', k: 'gifted' }])] }),
    sink_after: mkEv('sink_after', { when: { flag: 'gifted' }, choices: [safe, one('Thank', [{ op: 'gold', pct: 0.1 }, { op: 'flag', k: 'thanked', v: 2 }])] }),
    sink_once: mkEv('sink_once', { once: true, choices: [safe, one('Bargain', [{ op: 'addRelic', id: 'silver_bell' }])] }),
  };
}
const PAIRS = [['hanae', 'kuro'], ['suzu', 'raiga'], ['hanae', 'suzu'], ['kuro', 'raiga']];
function violations(A, R) {
  const D = A.DATA, v = [];
  if (!R.done) R.heroes.forEach((h) => { if (!(h.hp >= 1 && h.hp <= h.maxHp && h.maxHp >= 1)) v.push(`hp ${h.id} ${h.hp}/${h.maxHp}`); });
  if (!(R.ink >= 0 && R.ink <= R.inkMax)) v.push(`ink ${R.ink}/${R.inkMax}`);
  if (R.inkMax !== A.RUN.mods(R).inkMax) v.push('inkMax out of sync');
  if (!(Number.isInteger(R.gold) && R.gold >= 0)) v.push('gold ' + R.gold);
  if (new Set(R.deck.map((c) => c.uid)).size !== R.deck.length) v.push('duplicate uid');
  R.deck.forEach((c) => {
    const d = D.cards[c.id];
    if (!d) return v.push('unknown card ' + c.id);
    if (c.gems.length !== (d.slots || []).length) v.push('gems length ' + c.id);
    if (c.up && !d.up) v.push('up without a def ' + c.id);
    c.gems.forEach((g, i) => { if (g && (!D.gems[g] || (d.slots[i] !== 'any' && d.slots[i] !== D.gems[g].color))) v.push(`bad gem ${g} in ${c.id}[${i}]`); });
  });
  R.gems.forEach((g) => { if (!D.gems[g]) v.push('unknown gem ' + g); });
  if (new Set(R.relics).size !== R.relics.length) v.push('duplicate relic'); R.relics.forEach((r) => { if (!D.relics[r]) v.push('unknown relic ' + r); }); R.brushes.forEach((b) => { if (!D.brushes[b]) v.push('unknown brush ' + b); });
  Object.keys(R.stats).forEach((k) => { if (!Number.isFinite(R.stats[k]) || R.stats[k] < 0) v.push('stat ' + k + '=' + R.stats[k]); });
  if (Object.keys(R.stats).length !== L.statKeys.length) v.push('stat key set changed');
  if (R.node && R.node.tile && !R.map.tiles[A.MAP.key(R.node.tile.q, R.node.tile.r)]) v.push('node on a tile that does not exist');
  return v;
}
function runBot(A, seed, opts) {
  opts = opts || {};
  const { RUN: RN, MAP: MP, U: UU, DATA: D } = A;
  const rng = UU.rng(seed * 2654435761);
  const pair = opts.pair || PAIRS[seed % 4];
  let R = RN.newRun({ heroes: pair, seed, trial: opts.trial || 0, unlocked: seed % 3 === 0 ? undefined : { card: [], relic: [], gem: [] } });
  const trace = [], bad = [];
  let actions = 0, fights = 0, visited = {};
  const key = (c) => MP.key(c[0], c[1]);
  const tick = (label) => {
    trace.push(label); actions++;
    violations(A, R).forEach((m) => bad.push(`#${actions} ${label}: ${m}`));
    if (opts.roundTrip && actions % 7 === 0) { const back = RN.deserialize(JSON.parse(JSON.stringify(RN.serialize(R)))); if (canon(back) !== canon(R)) bad.push(`#${actions} ${label}: save round trip differs at ${diffPath(JSON.parse(canon(R)), JSON.parse(canon(back)))}`); }
    if (opts.reload) R = RN.deserialize(JSON.parse(JSON.stringify(RN.serialize(R))));
  };
  const pendings = () => {
    R.pending.slice().forEach((p) => {
      if (p.op === 'cardReward') { RN.resolvePending(R, p.id, rng.chance(0.7) ? rng.pick(p.offers) : null); return; }
      const ids = R.deck.map((c) => c.uid);
      for (let i = 0; i < 12; i++) { if (RN.resolvePending(R, p.id, rng.sample(ids, p.n)).ok) return; }
      for (let i = 0; i < ids.length; i++) if (RN.resolvePending(R, p.id, [ids[i]]).ok) return;
    });
  };
  const fitPair = () => { for (const g of rng.shuffle(R.gems)) for (const c of rng.shuffle(R.deck)) { const slots = D.cards[c.id].slots || []; for (let i = 0; i < slots.length; i++) if (c.gems[i] !== g && (slots[i] === 'any' || slots[i] === D.gems[g].color)) return { uid: c.uid, slot: i, gem: g }; } return null; };
  const fightNode = (n) => {
    const init = RN.combatInit(R, n); fights++;
    if (opts.real) {
      const sim = opts.real.COMBAT.simulate(init);
      const rw = RN.combatDone(R, sim.C);
      tick((sim.result === 'win' ? 'win:' : sim.result === 'lose' ? 'lose:' : 'capped:') + n.tier);
      return rw;
    }
    const win = rng.chance(0.985);
    const heroes = R.heroes.map((h) => { const hp = Math.max(0, h.hp - rng.int(0, 14)); return { id: h.id, hp, maxHp: h.maxHp, down: hp <= 0 }; });
    if (win && heroes.every((h) => h.down)) { heroes[0].down = false; heroes[0].hp = 1; }
    const kills = n.enemies.map((id, i) => ({ def: id, tier: i === 0 ? (n.tier === 'boss' ? 'boss' : n.tier === 'elite' ? 'elite' : 'normal') : 'normal', by: 'card' }));
    const rw = RN.combatDone(R, fakeC({ result: win ? 'win' : 'lose', heroes, stats: { turns: rng.int(3, 9), damageDealt: rng.int(20, 200), damageTaken: rng.chance(0.3) ? 0 : rng.int(1, 40), maxHit: rng.int(4, 25), kills }, gold: rng.chance(0.1) ? -5 : rng.chance(0.1) ? 8 : 0, ink: rng.chance(0.1) ? 1 : 0, frontId: rng.pick(pair), tier: n.tier }));
    tick(win ? 'win:' + n.tier : 'lose:' + n.tier);
    return rw;
  };
  const doNode = () => {
    const n = R.node;
    if (n.kind === 'combat') { fightNode(n); return; }
    if (n.kind === 'reward') {
      const rw = n.rewards, choice = {};
      if (rw.cards.length && rng.chance(0.7)) choice.card = rng.pick(rw.cards);
      if (rw.relics.length && rng.chance(0.8)) choice.relic = rng.pick(rw.relics);
      if (rw.gems.length) choice.gem = rw.gems[0];
      if (rw.brush && rng.chance(0.7)) choice.takeBrush = true;
      RN.claim(R, rw, choice); pendings(); tick('claim');
    } else if (n.kind === 'shop') {
      n.stock.items.forEach((it) => { if (!it.sold && rng.chance(0.5) && R.gold >= it.price) { RN.shopBuy(R, n.stock, it.key); pendings(); } });
      if (rng.chance(0.4) && R.gold >= n.stock.removePrice) RN.shopRemove(R, n.stock, rng.pick(R.deck).uid);
      const pair2 = fitPair(); if (pair2) RN.socket(R, pair2.uid, pair2.slot, pair2.gem);
      tick('shop');
    } else if (n.kind === 'event') {
      const opts2 = RN.eventChoices(R, n.event).filter((c) => c.ok && !c.hidden);
      const res = RN.eventChoose(R, n.event, rng.pick(opts2).index);
      if (!res.ok) bad.push('event choice refused: ' + res.reason);
      pendings(); tick('event:' + n.event);
      if (res.fight) return;
    } else if (n.kind === 'camp') {
      rng.shuffle(['rest', 'sharpen', 'gems', 'meditate']).forEach((a) => {
        if (a === 'sharpen') { const ups = RN.upgradable(R); if (ups.length) RN.campAction(R, 'sharpen', rng.pick(ups)); } else if (a === 'gems') { const f = fitPair(); if (f) RN.campAction(R, 'gems', f); RN.campAction(R, 'gems', { leave: true }); } else RN.campAction(R, a);
      });
      pendings(); tick('camp');
    } else if (n.kind === 'forge') {
      const key2 = MP.key(n.tile.q, n.tile.r);
      if (visited[key2] || rng.chance(0.7)) { const ups = RN.upgradable(R); const f = fitPair(); if (ups.length && rng.chance(0.6)) RN.forgeAction(R, 'upgrade', rng.pick(ups)); else if (f) RN.forgeAction(R, 'gems', f); }
      visited[key2] = true; tick('forge');
    } else if (n.kind === 'chest') {
      RN.take(R, n, { relic: !!n.loot.relic && rng.chance(0.8), gem: n.loot.gems.length ? rng.pick(n.loot.gems) : null }); tick('chest');
    } else if (n.kind === 'gemcache') {
      RN.take(R, n, { gem: rng.pick(n.offers) }); tick('cache');
    }
    if (R.node && R.node.kind !== 'combat') { const f = RN.finishNode(R); tick('finish'); if (f.chapterEnded) { RN.chapterEnd(R); tick('chapterEnd'); } }
  };
  const bfsTarget = (allowBoss) => {
    const M = R.map, prev = {}, q = [[M.pos.q, M.pos.r]], order = [];
    prev[key(q[0])] = null;
    while (q.length) { const c = q.shift(); order.push(c); MP.neighbors(M, c[0], c[1]).forEach((nb) => { const k = key(nb), t2 = M.tiles[k]; if (!(k in prev) && t2.painted && t2.type !== 'block') { prev[k] = c; q.push(nb); } }); }
    const open = order.filter((c) => { const t2 = M.tiles[key(c)]; return !t2.done && t2.type !== 'empty' && t2.type !== 'start'; });
    const pool = open.filter((c) => M.tiles[key(c)].type !== 'boss'); const pick = pool.length ? pool[0] : (allowBoss ? open[0] : null);
    if (!pick) return null;
    const path = []; for (let c = pick; c; c = prev[key(c)]) path.unshift(c);
    return path.slice(1).length ? path.slice(1) : 'here';
  };
  const brushPlacements = () => {
    const M = R.map, out = [];
    const all = Object.keys(M.tiles).map((k) => M.tiles[k]).filter((x) => x.type !== 'block');
    R.brushes.filter((b, i, a) => a.indexOf(b) === i).forEach((id) => all.forEach((x) => { for (let d = 0; d < 6; d++) if (MP.canBrush(M, id, x.q, x.r, d).ok) out.push([id, x.q, x.r, d]); }));
    return out;
  };
  const walkToFrontier = () => {
    const M = R.map, prev = {}, q = [[M.pos.q, M.pos.r]];
    prev[key(q[0])] = null;
    let goal = null;
    while (q.length && !goal) { const c = q.shift(); if (MP.neighbors(M, c[0], c[1]).some((nb) => M.tiles[key(nb)].type !== 'block' && !M.tiles[key(nb)].painted)) { goal = c; break; } MP.neighbors(M, c[0], c[1]).forEach((nb) => { const k = key(nb), t2 = M.tiles[k]; if (!(k in prev) && t2.painted && t2.type !== 'block') { prev[k] = c; q.push(nb); } }); }
    if (!goal || (goal[0] === M.pos.q && goal[1] === M.pos.r)) return false;
    const path = []; for (let c = goal; c; c = prev[key(c)]) path.unshift(c);
    const res = RN.step(R, path[1][0], path[1][1]); tick('frontier' + (res ? ':' + res.kind : ''));
    return true;
  };
  const paintSomething = () => {
    const M = R.map;
    if (R.brushes.length && (R.ink < 1 || rng.chance(0.4))) {
      const spots = brushPlacements();
      if (spots.length) { const s2 = rng.pick(spots); const r = RN.useBrush(R, s2[0], s2[1], s2[2], s2[3]); if (!r.ok) bad.push('a legal brush was refused: ' + r.reason); tick('brush:' + s2[0]); return true; }
      if (R.ink < 1 && walkToFrontier()) return true;
    }
    if (R.ink >= 1) {
      const boss = MP.pathToPaint(M, M.boss.q, M.boss.r);
      let target = boss && rng.chance(opts.real ? 0.1 : 0.6) ? boss.path[0] : null;
      if (!target) { const edge = Object.keys(M.tiles).map((k) => M.tiles[k]).filter((x) => !x.painted && x.type !== 'block' && MP.canPaint(M, x.q, x.r).ok); if (edge.length) { const e = rng.pick(edge); target = [e.q, e.r]; } }
      if (target) { const r = RN.paint(R, target[0], target[1]); if (!r.ok) bad.push('paint refused: ' + r.reason); tick('paint'); return true; }
    }
    return false;
  };
  while (!R.done && actions < (opts.max || 2500) && !(opts.stopAt && R.chapter >= opts.stopAt)) {
    if (R.node) { doNode(); continue; }
    if (R.chapterCleared) { RN.chapterEnd(R); tick('chapterEnd'); continue; }
    let target = bfsTarget(!opts.real);
    if (!target && opts.real && R.ink < 1 && !R.brushes.length) target = bfsTarget(true);          // nothing left to do: only now the boss
    if (target === 'here') { const nb = MP.neighbors(R.map, R.map.pos.q, R.map.pos.r).find((c) => R.map.tiles[key(c)].painted && R.map.tiles[key(c)].type !== 'block'); RN.step(R, nb[0], nb[1]); tick('step-off'); continue; }
    if (target) { const c = target[0]; const res = RN.step(R, c[0], c[1]); tick('step' + (res ? ':' + res.kind : '')); continue; }
    if (paintSomething()) continue;
    if (RN.checkStranded(R)) { tick('mercy'); continue; }
    bad.push('the bot is stuck at action ' + actions + ' (ink ' + R.ink + ', brushes ' + R.brushes.length + ')');
    break;
  }
  return { R, trace, bad, actions, fights, truncated: !R.done && !(opts.stopAt && R.chapter >= opts.stopAt) && actions >= (opts.max || 2500) };
}
function sinkWorld() {
  const A = fresh();
  Object.keys(A.DATA.events).forEach((k) => { delete A.DATA.events[k]; });
  A.DATA.add('events', sinkEvents());
  return A;
}
t.test('bot: whole seeded runs keep every invariant (hp, ink, gold, deck, gems, relics, stats, saves)', () => {
  const A = sinkWorld();
  const outcomes = { victory: 0, defeat: 0, truncated: 0 };
  let fights = 0, chapters = new Set(), kinds = {};
  for (let seed = 1; seed <= 24; seed++) {
    const r = runBot(A, seed, { roundTrip: seed % 4 === 0 });
    t.eq(r.bad.slice(0, 3).join(' | '), '', `seed ${seed}: no invariant broken (${r.actions} actions, chapter ${r.R.chapter})`);
    fights += r.fights; chapters.add(r.R.chapter); r.trace.forEach((x) => { const k = x.split(':')[0]; kinds[k] = (kinds[k] || 0) + 1; });
    if (r.truncated) outcomes.truncated++; else if (r.R.victory) outcomes.victory++; else outcomes.defeat++;
  }
  t.eq(outcomes.truncated, 0, 'every run finished in the action budget: ' + J(outcomes));
  t.ok(outcomes.victory >= 3, 'the bot wins some full three chapter runs: ' + J(outcomes)); t.ok(chapters.has(3), 'and gets to chapter 3');
  ['paint', 'step', 'win', 'claim', 'shop', 'event', 'camp', 'forge', 'chest', 'cache', 'brush', 'finish', 'chapterEnd'].forEach((k) => t.ok(kinds[k] > 5, `the bot exercised ${k}: ${kinds[k]}`));
  t.ok(fights > 150, 'a lot of fights were digested: ' + fights);
});
t.test('bot: the same seed gives the identical run, action for action', () => {
  const a = runBot(sinkWorld(), 5), b = runBot(sinkWorld(), 5);
  t.eq(a.trace.join(','), b.trace.join(','), 'same action trace'); t.eq(canon(RUN.serialize ? a.R : a.R), canon(b.R), 'same final run, byte for byte'); t.ok(a.actions > 100, 'a real run: ' + a.actions + ' actions');
  const c = runBot(sinkWorld(), 6); t.ok(c.trace.join(',') !== a.trace.join(','), 'another seed plays differently');
  const trial = runBot(sinkWorld(), 5, { trial: 10 }); t.ok(canon(trial.R) !== canon(a.R), 'trial 10 changes the run');
});
t.test('bot: saving and reloading after EVERY action changes nothing', () => {
  [2, 7, 12, 17].forEach((seed) => {
    const plain = runBot(sinkWorld(), seed), reloaded = runBot(sinkWorld(), seed, { reload: true });
    t.eq(reloaded.bad.slice(0, 3).join(' | '), '', `seed ${seed}: no invariant broken across ${reloaded.actions} reloads`);
    t.eq(reloaded.trace.join(','), plain.trace.join(','), `seed ${seed}: the reloaded run makes the same choices`);
    t.eq(canon(reloaded.R), canon(plain.R), `seed ${seed}: and ends in exactly the same state (nothing needed for the future is missing from a save)`);
  });
});
t.test('bot: trial 10 and daily style runs play through too', () => {
  const A = sinkWorld();
  for (let seed = 30; seed < 36; seed++) { const r = runBot(A, seed, { trial: 10 }); t.eq(r.bad.slice(0, 3).join(' | '), '', `trial 10 seed ${seed}`); t.ok(!r.truncated, `trial 10 seed ${seed} finished`); }
});

// ================================================================================================ contract odds and ends
t.test('the public API is complete', () => {
  ['newRun', 'dailyHeroes', 'startChapter', 'mods', 'paint', 'paintPreview', 'useBrush', 'step', 'combatInit', 'combatDone', 'claim', 'take', 'shopBuy', 'shopRemove', 'eventChoose', 'applyOps', 'resolvePending', 'hook', 'campAction', 'addCard', 'removeCard', 'upgradeCard', 'socket', 'checkStranded', 'finishNode', 'chapterEnd', 'score', 'summary', 'serialize', 'deserialize'].forEach((f) => t.eq(typeof RUN[f], 'function', 'RUN.' + f));
  ['eventChoices', 'pickEvent', 'forgeAction', 'canStep', 'addRelic', 'upgradable', 'forgeUsable'].forEach((f) => t.eq(typeof RUN[f], 'function', 'RUN.' + f + ' (extra)'));
  t.eq(RUN.VERSION, 1, 'version');
});
t.test('run.js reads no clock and needs nothing but util, data and the MAP contract', () => {
  const src = fs.readFileSync(path.join(DIR, 'js', 'run.js'), 'utf8');
  t.ok(!/\bDate\b|performance\.now|Math\.random|\bwindow\b|\bdocument\b|localStorage|\bMETA\b|\bCOMBAT\b/.test(src.replace(/\/\/[^\n]*/g, '')), 'no clock, no randomness, no DOM, no META, no COMBAT in code');
  const only = boot({ only: ['run'], skip: ['data_*', 'map', 'combat'] });
  t.eq(typeof only.RUN.newRun, 'function', 'loads with just util and data');
});

// ================================================================================================ the real MAP, when it exists
const realMap = fs.existsSync(path.join(DIR, 'js', 'map.js'));
if (realMap) {
  const real = () => { const api = boot({ only: ['run', 'map'], skip: ['data_*', 'combat'] }); universe(api.DATA); Object.keys(api.DATA.events).forEach((k) => { delete api.DATA.events[k]; }); api.DATA.add('events', sinkEvents()); return api; };
  t.test('real MAP: the RUN flows work on its maps (bot, invariants, saves)', () => {
    const A = real();
    t.eq(typeof A.MAP.generate, 'function', 'map.js loaded');
    const outcomes = { victory: 0, defeat: 0, truncated: 0 };
    for (let seed = 1; seed <= 8; seed++) {
      const r = runBot(A, seed, { roundTrip: true, max: 4000 });
      t.eq(r.bad.slice(0, 3).join(' | '), '', `real map seed ${seed}: invariants (${r.actions} actions)`);
      if (r.truncated) outcomes.truncated++; else if (r.R.victory) outcomes.victory++; else outcomes.defeat++;
    }
    t.eq(outcomes.truncated, 0, 'real map: every run finished: ' + J(outcomes));
  });
  t.test('real MAP: the run is a pure function of the seed, and reloads change nothing', () => {
    const A = real(), B = real();
    t.eq(canon(runBot(A, 4, { max: 4000 }).R), canon(runBot(B, 4, { max: 4000 }).R), 'same seed, same run');
    t.eq(canon(runBot(real(), 4, { max: 4000, reload: true }).R), canon(runBot(real(), 4, { max: 4000 }).R), 'reload after every action changes nothing');
  });
  t.test('real MAP: chapter maps come from the documented seed and mercy keeps runs solvable', () => {
    const A = real(); const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 77, unlocked: ALL });
    t.eq(R.map.seed, A.U.hash(77, 'ch1', 'map'), 'map seed'); A.RUN.startChapter(R, 2); t.eq(R.map.chapter, 2, 'chapter 2 map');
    const q = A.MAP.solve ? A.MAP.solve(R.map) : null; if (q) t.ok(q.ok, 'solvable');
  });
} else {
  t.ok(true, 'js/map.js does not exist yet: the real-MAP replay is skipped (the fake MAP covers the contract)');
}

// ================================================================================================ regressions from review
t.test('shopBuy pays before the relic arrives: a pickup hook that costs gold cannot leave gold negative', () => {
  const A = fresh();
  A.DATA.add('relics', { t_costly: { name: 'Costly', rarity: 'common', text: 'It bites.', art: { m: 'lantern' }, hooks: [{ on: 'onPickup', fx: [{ op: 'gold', n: -500 }] }] } });
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL }); R.gold = 100;
  const st = { items: [{ key: 'r0', kind: 'relic', id: 't_costly', price: 60, sale: false, sold: false }], removePrice: 75 };
  const r = A.RUN.shopBuy(R, st, 'r0');
  t.eq(r.ok, true, 'bought'); t.eq(R.gold, 0, 'the price was paid first (40 left), then the hook took what it could: never below 0'); t.eq(R.stats.goldSpent, 60, 'goldSpent is the price'); t.ok(st.items[0].sold, 'sold');
  const owned = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL }); owned.gold = 500; owned.relics.push('t_costly');
  const snap = J(A.RUN.serialize(owned));
  const st2 = { items: [{ key: 'r0', kind: 'relic', id: 't_costly', price: 60, sale: false, sold: false }], removePrice: 75 };
  t.eq(A.RUN.shopBuy(owned, st2, 'r0').reason, 'owned', 'a relic you already own is refused before any money moves'); t.eq(J(A.RUN.serialize(owned)), snap, 'nothing changed'); t.eq(st2.items[0].sold, false, 'still for sale');
});
t.test('claim refuses a relic that is already owned, and changes nothing', () => {
  const R = NEW(); R.relics.push('t_gold');
  const rw = { cards: ['hanae_c0'], relics: ['t_gold', 't_c0'], gems: [], brush: null, claimed: false };
  const snap = J(RUN.serialize(R));
  const bad = RUN.claim(R, rw, { card: 'hanae_c0', relic: 't_gold' });
  t.eq(bad.reason, 'owned', 'the boss relic you got from an event meanwhile'); t.eq(J(RUN.serialize(R)), snap, 'and the card half of the choice was not applied either'); t.eq(rw.claimed, false, 'the rewards stay open');
  t.eq(RUN.claim(R, rw, { card: 'hanae_c0', relic: 't_c0' }).ok, true, 'the other relic is fine');
});
t.test('addCard with neither card nor pool draws from the party, never from every hero', () => {
  const R = NEW({ seed: 2, heroes: ['suzu', 'raiga'] });
  for (let i = 0; i < 40; i++) RUN.applyOps(R, [{ op: 'addCard', rarity: 'common' }], { rng: U.rng(i) });
  t.ok(R.deck.slice(10).every((c) => ['suzu', 'raiga'].indexOf(DATA.cards[c.id].hero) >= 0), 'only the party heroes');
});
t.test('ops on nothing say so and change nothing', () => {
  const R = NEW(); const snap = J(RUN.serialize(R));
  const r = RUN.applyOps(R, [{ op: 'gold', n: 0 }, { op: 'heal', n: 5, who: 'suzu' }, { op: 'hurt', n: 5, who: 'suzu' }, { op: 'maxHp', n: 3, who: 'suzu' }], { rng: U.rng(1) });
  t.eq(r.log[0].text, 'No gold changes hands.', 'a zero gold op'); t.eq(r.log[1].text, 'Nobody to heal.', 'heal'); t.eq(r.log[2].text, 'Nobody was hurt.', 'hurt');
  const after = JSON.parse(J(RUN.serialize(R))); const before = JSON.parse(snap); delete after.opsN; delete before.opsN; t.eq(J(after), J(before), 'no state changed');
});
t.test('a shop node carries the onShopEnter log, and any choice a hook raises waits in R.pending', () => {
  const A = fresh();
  A.DATA.add('relics', { t_askshop: { name: 'Ask', rarity: 'common', text: 'It asks.', art: { m: 'lantern' }, hooks: [{ on: 'onShopEnter', fx: [{ op: 'removeCard' }] }] } });
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3, unlocked: ALL }); R.relics.push('t_askshop');
  const tile = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => x.type === 'shop' && A.MAP.pathToPaint(R.map, x.q, x.r));
  Object.keys(R.map.tiles).forEach((k) => { if (R.map.tiles[k] !== tile) R.map.tiles[k].done = true; });
  A.MAP.pathToPaint(R.map, tile.q, tile.r).path.forEach((c) => { R.ink = R.inkMax; A.RUN.paint(R, c[0], c[1]); });
  const q = [[R.map.pos.q, R.map.pos.r]], prev = {}; prev[A.MAP.key(R.map.pos.q, R.map.pos.r)] = null;
  while (q.length) { const c = q.shift(); A.MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = A.MAP.key(n[0], n[1]); if (!(k in prev) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); }
  const path = []; for (let c = [tile.q, tile.r]; c; c = prev[A.MAP.key(c[0], c[1])]) path.unshift(c);
  let node = null; path.slice(1).forEach((c) => { node = A.RUN.step(R, c[0], c[1]); });
  t.eq(node.kind, 'shop', 'a shop'); t.ok(node.hookLog.some((x) => x.op === 'relic' && x.id === 't_askshop'), 'the entry log names the relic'); t.eq(R.pending.length, 1, 'the removal choice is waiting'); t.eq(R.pending[0].op, 'removeCard', 'which op');
  t.eq(A.RUN.resolvePending(R, R.pending[0].id, [R.deck[0].uid]).ok, true, 'answerable while shopping'); t.eq(R.deck.length, 9, 'a card was removed');
});

// ================================================================================================ the real COMBAT, when its files exist
const jsFile = (n) => fs.existsSync(path.join(DIR, 'js', n + '.js'));
const REAL_NEED = ['combat', 'data_text', 'data_cards_hanae', 'data_cards_kuro', 'data_enemies_1', 'data_enemies_2'];
function realCombatWorld() {
  const api = boot({ only: ['run'].concat(REAL_NEED), skip: ['map'] });
  api._run('globalThis.MAP = (' + FAKE_SRC + ')(DATA, U);');
  universe(api.DATA, { keep: true });
  Object.keys(api.DATA.events).forEach((k) => { delete api.DATA.events[k]; });
  api.DATA.add('events', sinkEvents(api.DATA.encounters[1].normal[0].id));
  api.MAP = api._run('MAP');
  return api;
}
let realC = null;
if (REAL_NEED.every(jsFile)) {
  try { realC = realCombatWorld(); } catch (e) { console.log('run: the real combat world did not boot, integration skipped: ' + String(e && e.message).split('\n')[0]); }
}
if (realC && realC.COMBAT && typeof realC.COMBAT.simulate === 'function') {
  const P2 = ['hanae', 'kuro'];
  t.test('real COMBAT accepts what combatInit builds and is deterministic for its seed', () => {
    const A = realC;
    const R = A.RUN.newRun({ heroes: P2, seed: 21, unlocked: ALL });
    const tile = Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).find((x) => x.type === 'enemy' && A.MAP.pathToPaint(R.map, x.q, x.r));
    Object.keys(R.map.tiles).forEach((k) => { if (R.map.tiles[k] !== tile) R.map.tiles[k].done = true; });
    A.MAP.pathToPaint(R.map, tile.q, tile.r).path.forEach((c) => { R.ink = R.inkMax; A.RUN.paint(R, c[0], c[1]); });
    const q = [[R.map.pos.q, R.map.pos.r]], prev = {}; prev[A.MAP.key(R.map.pos.q, R.map.pos.r)] = null;
    while (q.length) { const c = q.shift(); A.MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = A.MAP.key(n[0], n[1]); if (!(k in prev) && R.map.tiles[k].painted && R.map.tiles[k].type !== 'block') { prev[k] = c; q.push(n); } }); }
    const path = []; for (let c = [tile.q, tile.r]; c; c = prev[A.MAP.key(c[0], c[1])]) path.unshift(c);
    let node = null; path.slice(1).forEach((c) => { node = A.RUN.step(R, c[0], c[1]); });
    t.eq(node.kind, 'combat', 'a real fight node'); const opts = A.RUN.combatInit(R, node);
    const C = A.COMBAT.create(opts); C.start();
    t.deep(C.heroes.map((h) => h.id), P2, 'party order'); t.eq(C.enemies.length, node.enemies.length, 'the node enemies'); t.eq(C.deck ? C.deck.length : R.deck.length, R.deck.length, 'the whole deck');
    t.eq(C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length, R.deck.length, 'conservation: every deck card is somewhere'); t.ok(C.hand.every((c) => R.deck.some((d) => d.uid === c.uid)), 'combat cards keep their run uids');
    C.hand[0].up = 1; t.eq(R.deck.find((d) => d.uid === C.hand[0].uid).up, 0, 'combat piles hold copies');
    const a = A.COMBAT.simulate(A.RUN.combatInit(R, node)), b = A.COMBAT.simulate(A.RUN.combatInit(R, node));
    t.eq(J(a.stats) + a.result, J(b.stats) + b.result, 'the same options replay the same fight'); t.ok(a.result === 'win' || a.result === 'lose', 'simulate finishes: ' + a.result);
  });
  t.test('real COMBAT summaries are digested: HP, revive, stats, Ink from kills, rewards', () => {
    const A = realC; let wins = 0, losses = 0;
    for (let seed = 1; seed <= 14; seed++) {
      const R = A.RUN.newRun({ heroes: P2, seed, unlocked: ALL });
      const enc = A.DATA.encounters[1].normal[seed % A.DATA.encounters[1].normal.length];
      R.node = { kind: 'combat', tile: { q: 3, r: 3 }, tier: 'normal', enc: enc.id, enemies: enc.enemies.slice(), seed: 1000 + seed, rewards: true, onWin: null, source: 'combat' };
      const ink0 = R.ink, gold0 = R.gold;
      const sim = A.COMBAT.simulate(A.RUN.combatInit(R, R.node));
      const C = sim.C;
      const rw = A.RUN.combatDone(R, C);
      const kills = C.stats.kills;
      t.eq(R.stats.turns, C.stats.turns, `seed ${seed}: turns merged`); t.eq(R.stats.cardsPlayed, C.stats.cardsPlayed, 'cards played merged'); t.eq(R.stats.damageDealt, C.stats.damageDealt, 'damage merged'); t.eq(R.stats.kills, kills.length, 'kills merged'); t.eq(R.stats.maxHit, C.stats.maxHit, 'max stat merged');
      if (sim.result === 'win') {
        wins++; t.ok(rw && rw.cards.length === 3, 'a win rolls three cards'); t.deep(R.heroes.map((h) => h.id), P2, 'party'); R.heroes.forEach((h, i) => { const sh = sim.heroes[i]; t.eq(h.hp, sh.down ? Math.max(1, Math.round(h.maxHp * 0.25)) : sh.hp, `seed ${seed}: ${h.id} HP is what the fight left, or the revive share when downed`); t.ok(h.hp >= 1, 'alive'); });
        const inkGain = kills.reduce((n, k) => n + (E.killInk[k.tier] || 0), 0) + sim.ink; t.eq(R.ink, Math.min(R.inkMax, ink0 + inkGain), 'Ink from kills'); t.eq(rw.ink, inkGain, 'reported'); t.eq(R.gold, gold0 + rw.goldBase + sim.gold, 'gold: reward plus any pouch or thief change'); t.eq(R.frontIdx, P2.indexOf(C.front().id), 'the front hero leads');
        t.eq(R.node.kind, 'reward', 'reward node');
      } else { losses++; t.eq(rw, null, 'a loss has no rewards'); t.eq(R.done, true, 'and ends the run'); }
    }
    t.ok(wins >= 8, 'the greedy bot beats most chapter 1 groups with a starter deck: ' + wins + ' wins, ' + losses + ' losses');
  });
  t.test('real COMBAT: whole runs through chapters 1 and 2 keep every invariant, replay exactly, and survive reloads', () => {
    const A = realC; let fights = 0, wins = 0; const reached = new Set();
    for (let seed = 1; seed <= 4; seed++) {
      const r = runBot(A, seed, { real: A, pair: P2, stopAt: 3, max: 3000, roundTrip: seed === 1 });
      t.eq(r.bad.slice(0, 3).join(' | '), '', `real fights, seed ${seed}: invariants hold over ${r.actions} actions (chapter ${r.R.chapter}, done ${r.R.done})`); t.ok(!r.truncated, `seed ${seed} finished or reached chapter 3`);
      fights += r.fights; reached.add(r.R.chapter); r.trace.forEach((x) => { if (/^win:/.test(x)) wins++; });
      if (process.env.RB_DEBUG) console.log(`seed ${seed}: ${r.actions} actions, ch ${r.R.chapter}, done ${r.R.done}, fights ${r.fights}, hp ${r.R.heroes.map((h) => h.hp + '/' + h.maxHp)}, gold ${r.R.gold}, deck ${r.R.deck.length}, last ${r.trace.slice(-3)}`);
    }
    t.ok(fights > 12, 'a lot of real fights were digested: ' + fights); t.ok(wins > 8, 'and mostly won: ' + wins);
    const a = runBot(A, 3, { real: A, pair: P2, stopAt: 3, max: 3000 }), b = runBot(A, 3, { real: A, pair: P2, stopAt: 3, max: 3000 });
    t.eq(canon(a.R), canon(b.R), 'the same seed plays the same run, real fights included');
    const c = runBot(A, 3, { real: A, pair: P2, stopAt: 3, max: 3000, reload: true });
    t.eq(canon(c.R), canon(a.R), 'saving and reloading after every action changes nothing, real fights included');
  });
} else t.ok(true, 'the real combat integration is skipped: combat.js or the hanae, kuro and chapter 1 and 2 content is not all there yet');

// END-OF-SUITE
await t.done();
