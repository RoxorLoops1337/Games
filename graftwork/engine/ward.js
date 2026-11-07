// THE WARD (design/WARD.md): the hospital you build instead of the map. Pure rules, no DOM, every roll from run.rng.
// State lives on run.ward (plain JSON, saved with the run). run.phase is 'ward' while the Ward screen is up; fights,
// events, shops and forges reuse the classic phases and screens, and RUN.advance / afterEvent come back here.
//
//   wardInit(run, act)                        new floor (called by RUN.startAct when run.mode === 'ward')
//   canBuild(run, uid, x, y) -> {ok, why}     a room card on a cell; canPlayBuild(run, uid, target) for any card
//   playBuildCard(run, uid, target)           target: {x,y} (room cards, Demolish on rubble) | roomId | 'wood'|'stone' | null
//   togglePower(run, roomId)  endMorning(run)
//   pathTo(run, roomId, alt?) -> {ok, why, path, triggers, cost, offPenalty, alts, move}
//   startWalk(run, roomId, alt?) -> the first trigger's pending (run.phase set) | null (walk ended, next phase) | false (illegal, run.ward.why)
//   afterTrigger(run)                         continue the walk (RUN.advance and RUN.afterEvent call it in ward mode)
import { ROOMS, BUILD_CARDS, BUILD_LIST, STARTER_BUILD_DECK, PHASES, PHASE_ORDER, FLOOR, START_RES, PREBUILT, WARD_TUNE as T } from '../data/ward.js';
import { ENEMIES, EVENTS, CARDS } from '../data/index.js';
import { hasBigRecipe } from '../data/ward_kit.js';
import { runAllows } from './unlock.js';
import { makeEncounter, makeShop, startFight, startAct, priceMult, rollRelicByAct, perkN, rollPotion as RUN_rollPotion, potionSlots as potionCap } from './run.js';

export { ROOMS, BUILD_CARDS, PHASES, FLOOR, T as WARD_TUNE };
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// ---------------- helpers ----------------
const W = (run) => run.ward;
const def = (room) => ROOMS[room.type];
export const roomAt = (run, x, y) => { const w = W(run); const id = w.grid[y] && w.grid[y][x]; return id && id !== 'rubble' ? w.rooms[id] : null; };
const inside = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
// ---- footprints (design/WARD.md "Room sizes and Expand") ----
// A room is a rectangle of w x h cells (both absent = 1). (x, y) is its top-left (smallest x, smallest y) cell and w.grid holds its id in EVERY cell it covers.
// Old saves only have 1 x 1 rooms and carry no w / h: nothing to migrate.
export const cellsOf = (r) => { const out = []; for (let j = 0; j < (r.h || 1); j++) for (let i = 0; i < (r.w || 1); i++) out.push([r.x + i, r.y + j]); return out; };
export const sizeOf = (r) => [r.w || 1, r.h || 1];
export const cellCount = (r) => (r.w || 1) * (r.h || 1);
export const isBig = (r) => cellCount(r) > 1;
export const sizeKey = (r) => (r.w || 1) + 'x' + (r.h || 1);
const bigOf = (room) => (isBig(room) ? ROOMS[room.type].big || {} : NOBIG);
const NOBIG = {};
export const powerUse = (room) => { const d = ROOMS[room.type]; return d.power ? (bigOf(room).power !== undefined ? bigOf(room).power : d.power * cellCount(room)) : 0; };
const powerAddOf = (room) => { const d = ROOMS[room.type]; return bigOf(room).powerAdd !== undefined ? bigOf(room).powerAdd : d.powerAdd || 0; };
export function neighbors(run, rid) {
  const w = W(run), r = w.rooms[rid], out = [];
  for (const [cx, cy] of cellsOf(r)) for (const [dx, dy] of DIRS) { const n = inside(w, cx + dx, cy + dy) && roomAt(run, cx + dx, cy + dy); if (n && n.id !== rid && !out.includes(n.id)) out.push(n.id); }
  return out;
}
const log = (run, s) => { const w = W(run); w.log.push(`D${w.day} ${w.phase}: ${s}`); if (w.log.length > 40) w.log.splice(0, w.log.length - 40); };
const effect = (run, id) => W(run).effects.filter((e) => e.id === id);
const effectN = (run, id) => effect(run, id).reduce((a, e) => a + (e.n || 1), 0);
const isDark = (room) => !room.on && def(room).power > 0;
export function everyOf(room) { const s = def(room).spawn; return s && s.every ? (bigOf(room).every || s.every) : 0; }
export function spawnN(room) { return room.upgrades.includes('b_reinforced_beds') ? 2 : 1; } // monsters per tick
export function capOf(room, run) {
  const s = def(room).spawn; if (!s) return 0;
  let cap = room.upgrades.includes('b_sterile_field') ? 2 : (bigOf(room).cap || s.cap || 1);
  if (s.kind === 'fight') { if (run) cap += perkN(run, 'wardCap'); if (room.upgrades.includes('b_fire_door')) cap = Math.min(cap, T.fireDoorCap); }
  return cap;
}
const lit = (run, type) => Object.values(W(run).rooms).filter((r) => r.type === type && !isDark(r));
export function wardPower(run) {
  const w = W(run); let cap = w.power.base, used = 0;
  const wards = Object.values(w.rooms).filter((r) => r.type === 'rm_ward' && r.on).length;
  cap += perkN(run, 'powerCap') + effectN(run, 'power');
  for (const r of Object.values(w.rooms)) { cap += powerAddOf(r); if (def(r).boiler) cap += Math.floor(wards / 2) + (bigOf(r).boilerFlat || 0); if (r.on) used += powerUse(r); }
  w.power.cap = cap; w.power.used = used;
  return { cap, used, free: cap - used };
}
export const moveOf = (run) => T.move + effectN(run, 'move') + perkN(run, 'move');
const lampOn = (run) => effect(run, 'lamp').length > 0 || perkN(run, 'noDark') > 0;
export const bossForced = (run) => { const w = W(run); return !!w && w.day >= w.dayLimit && w.phase === 'night'; };
export const bossOpen = (run) => { const w = W(run); return w.day >= w.dayLimit - T.earlyDays; };
export const theatreOf = (run) => Object.values(W(run).rooms).find((r) => r.type === 'rm_theatre');
export const entranceOf = (run) => Object.values(W(run).rooms).find((r) => r.type === 'rm_entrance');
export const cardInst = (run, uid) => { const d = W(run).deck; return [...d.hand, ...d.draw, ...d.discard].find((c) => c.uid === uid) || null; };
export const buildDeckList = (run) => { const d = W(run).deck; return [...d.draw, ...d.hand, ...d.discard]; };

function newRoom(run, type, x, y, fw = 1, fh = 1) {
  const w = W(run);
  const id = 'r' + w.nextRoom++;
  const r = { id, type, x, y, on: true, level: 1, timers: { spawn: 1 }, contents: [], upgrades: [] };
  if (fw > 1) r.w = fw; if (fh > 1) r.h = fh; // 1 x 1 rooms carry no size: byte-identical to the old saves
  w.rooms[id] = r; for (const [cx, cy] of cellsOf(r)) w.grid[cy][cx] = id;
  if (powerUse(r) > 0 && wardPower(run).free < 0) r.on = false; // no spare power: built dark
  wardPower(run);
  return r;
}
function addCard(run, id, to = 'discard') { const w = W(run); const c = { uid: w.cardNext++, id }; w.deck[to].push(c); return c; }

// ---------------- floor ----------------
export function wardInit(run, act) {
  const rng = run.rng, prev = run.ward, F = FLOOR[act] || FLOOR[3];
  const w = {
    act, day: 1, dayLimit: F.days, phase: 'morning', w: F.w, h: F.h,
    grid: Array.from({ length: F.h }, () => Array(F.w).fill(null)), rooms: {}, nextRoom: 1, cardNext: prev ? prev.cardNext : 1, dieUp: prev ? prev.dieUp || 0 : 0,
    hero: { room: null }, res: { wood: START_RES.wood + perkN(run, 'startRes'), stone: START_RES.stone + perkN(run, 'startRes') }, power: { base: START_RES.power, cap: START_RES.power, used: 0 },
    deck: { draw: [], hand: [], discard: [] }, effects: [], log: [], walk: null, bossDone: false, why: null,
  };
  if (prev) { // a new floor: resources carry at 50 percent, the building deck in full
    w.res.wood += Math.floor(prev.res.wood * T.carry); w.res.stone += Math.floor(prev.res.stone * T.carry);
    w.deck.draw = [...prev.deck.draw, ...prev.deck.hand, ...prev.deck.discard];
  }
  run.ward = w;
  if (!prev) for (const id of STARTER_BUILD_DECK) addCard(run, id, 'draw');
  rng.shuffle(w.deck.draw);
  const ent = newRoom(run, 'rm_entrance', 0, rng.int(F.h));
  newRoom(run, 'rm_theatre', F.w - 2, rng.int(F.h - 1), 2, 2); // the boss room is 2 x 2
  w.hero.room = ent.id;
  // pre-built rooms grow from the Entrance, in the left half of the floor
  for (const type of PREBUILT) {
    const cells = buildCells(run).filter(([x]) => x < Math.floor(F.w / 2));
    const [x, y] = rng.pick(cells);
    newRoom(run, type, x, y);
  }
  // rubble: never next to the Entrance, never cutting the Theatre off from the Entrance side
  const n = rng.range(F.rubble[0], F.rubble[1]);
  for (let k = 0, guard = 0; k < n && guard < 200; guard++) {
    const x = rng.int(F.w), y = rng.int(F.h);
    if (w.grid[y][x] || Math.abs(x - ent.x) + Math.abs(y - ent.y) <= 1) continue;
    w.grid[y][x] = 'rubble';
    if (!theatreReachable(run)) { w.grid[y][x] = null; continue; }
    k++;
  }
  run.phase = 'ward'; run.pending = null;
  log(run, `${F.name}: day 1 of ${F.days}.`);
  morningStart(run);
  return w;
}
// cells a room card may go on: empty, inside, orthogonally next to a room that is not the Theatre
export function buildCells(run) {
  const w = W(run), out = [];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (!w.grid[y][x] && adjacentRoom(run, x, y)) out.push([x, y]);
  return out;
}
// ---- placing and expanding (footprints) ----
// dir names: 'e' (+x) 's' (+y) 'w' (-x) 'n' (-y). A 2 cell footprint grows from a cell toward dir.
export const DIR_NAMES = ['e', 's', 'w', 'n'];
const DIRV = { e: [1, 0], s: [0, 1], w: [-1, 0], n: [0, -1] };
export function footprint(x, y, size, dir) { // the rectangle a [fw, fh] room covers when its first cell is (x, y) and it grows toward dir
  const [fw, fh] = size || [1, 1];
  if (fw * fh === 1) return { x, y, w: 1, h: 1 };
  if (fw * fh === 4) return { x, y, w: 2, h: 2 };
  const [dx, dy] = DIRV[dir || 'e'] || DIRV.e; // a domino: the second cell is at (x + dx, y + dy)
  return { x: Math.min(x, x + dx), y: Math.min(y, y + dy), w: dx ? 2 : 1, h: dy ? 2 : 1 };
}
const rectCells = (f) => { const o = []; for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) o.push([f.x + i, f.y + j]); return o; };
// why: bounds | rubble | occupied | adjacent | space
function footWhy(run, f) {
  const w = W(run), cells = rectCells(f);
  for (const [cx, cy] of cells) if (!inside(w, cx, cy)) return cells.length === 1 ? 'bounds' : 'space';
  for (const [cx, cy] of cells) if (w.grid[cy][cx] === 'rubble') return 'rubble';
  for (const [cx, cy] of cells) if (w.grid[cy][cx]) return 'occupied';
  if (!cells.some(([cx, cy]) => adjacentRoom(run, cx, cy))) return 'adjacent';
  return null;
}
// where a room of `size` goes when the player points at (x, y): { ok, why, f: {x, y, w, h}, cells, dir }. Without a dir the first legal side (e, s, w, n) is used.
export function placement(run, size, x, y, dir) {
  const w = W(run);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inside(w, x, y)) return { ok: false, why: 'bounds', cells: [] };
  const one = (size[0] * size[1]) === 1;
  const tries = one ? [undefined] : dir ? [dir] : DIR_NAMES;
  let first = null;
  for (const d of tries) {
    const f = footprint(x, y, size, d), why = footWhy(run, f);
    if (!why) return { ok: true, why: null, f, cells: rectCells(f), dir: d };
    if (!first) first = { why, f };
  }
  // pointed cell itself is the problem: say so; otherwise the second cell has no room
  const w0 = W(run);
  const cellWhy = w0.grid[y][x] === 'rubble' ? 'rubble' : w0.grid[y][x] ? 'occupied' : null;
  return { ok: false, why: cellWhy || (one ? first.why : first.why === 'adjacent' ? 'adjacent' : 'space'), f: first.f, cells: rectCells(first.f) };
}
// Expand: the sides a room can grow toward. { ok, why, to: [w, h], dirs: [{dir, cells, f}], cost }. why: type already norecipe space
export function expandOptions(run, rid) {
  const w = W(run), room = w.rooms[rid];
  const no = (why) => ({ ok: false, why, dirs: [], to: null, cost: null });
  if (!room) return no('target');
  const d = def(room);
  if (!d.expand) return no('type');
  if (isBig(room)) return no('already');
  const dirs = [];
  for (const dir of DIR_NAMES) {
    const [dx, dy] = DIRV[dir], cx = room.x + dx, cy = room.y + dy;
    if (!inside(w, cx, cy) || w.grid[cy][cx]) continue;
    const f = footprint(room.x, room.y, [2, 1], dir);
    if (!hasBigRecipe(room.type, f.w, f.h)) continue;
    dirs.push({ dir, cells: [[cx, cy]], f });
  }
  if (!dirs.length) { const any = DIR_NAMES.some((dir) => hasBigRecipe(room.type, dir === 'e' || dir === 'w' ? 2 : 1, dir === 'e' || dir === 'w' ? 1 : 2)); return no(any ? 'space' : 'norecipe'); }
  return { ok: true, why: null, dirs, to: [dirs[0].f.w, dirs[0].f.h], cost: d.expand.cost };
}
export const expandCostOf = (room) => (ROOMS[room.type].expand || {}).cost || {};
function adjacentRoom(run, x, y) {
  const w = W(run);
  return DIRS.some(([dx, dy]) => { const r = inside(w, x + dx, y + dy) && roomAt(run, x + dx, y + dy); return r && r.type !== 'rm_theatre'; });
}
// the Theatre can still be reached by building: a path of non-rubble cells from the Entrance network
export function theatreReachable(run) {
  const w = W(run), th = theatreOf(run), seen = new Set(), q = [];
  for (const r of Object.values(w.rooms)) if (r.type !== 'rm_theatre') for (const [cx, cy] of cellsOf(r)) { q.push([cx, cy]); seen.add(cx + ',' + cy); }
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (!inside(w, nx, ny) || seen.has(k)) continue;
      if (w.grid[ny][nx] === th.id) return true;
      if (w.grid[ny][nx]) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return false;
}
// every room reachable from the Entrance through rooms (the Theatre counts once something touches it)
export function connectedRooms(run, without = null) {
  const w = W(run), start = entranceOf(run).id, seen = new Set([start]), q = [start];
  while (q.length) { const id = q.shift(); for (const n of neighbors(run, id)) if (n !== without && !seen.has(n)) { seen.add(n); q.push(n); } }
  return seen;
}

// ---------------- morning ----------------
function pickMonster(run) {
  const pool = Object.values(ENEMIES).filter((e) => e.act === run.act && e.kind === 'normal' && !e.minion && !e.noPick && !e.summonOnly);
  return run.rng.pick(pool).id;
}
function pickElite(run) {
  const pool = Object.values(ENEMIES).filter((e) => e.act === run.act && e.kind === 'elite' && !e.minion && !e.noPick && !e.summonOnly);
  return run.rng.pick(pool).id;
}
function spawnInto(run, room) {
  const s = def(room).spawn;
  if (s.kind === 'fight') room.contents.push({ kind: 'monster', id: pickMonster(run) });
  else if (s.kind === 'elite') room.contents.push({ kind: 'elite', id: pickElite(run), age: 0, level: def(room).level2 ? 2 : 1 });
  else room.contents.push({ kind: s.kind });
}
// one timer tick of one room (morning, or Double Shift)
export function tickRoom(run, room) {
  const s = def(room).spawn;
  if (!s || !s.every) return false;
  room.timers.spawn--;
  if (room.timers.spawn > 0) return false;
  room.timers.spawn = everyOf(room);
  let n = 0;
  for (let k = 0; k < spawnN(room) && room.contents.length < capOf(room, run); k++) { spawnInto(run, room); n++; }
  return n > 0;
}
export function morningStart(run) {
  const w = W(run);
  w.phase = 'morning';
  w.effects = w.effects.filter((e) => e.until !== 'day');
  w.freeUsed = false;
  if (T.morningHeal && w.day > 1 && run.hp > 0) run.hp = Math.min(run.maxHp, run.hp + T.morningHeal); // a hospital: the night staff patch you up
  for (const room of Object.values(w.rooms)) {
    if (isDark(room)) continue; // off rooms pause: no timers, no aging, no produce
    if (room.quarantine > 0) { room.quarantine--; continue; } // Quarantine: no spawns, no aging
    for (const c of room.contents) if (c.kind === 'elite') { c.age++; if (c.age >= T.eliteAge && !room.upgrades.includes('b_scrub_in')) c.level = 2; }
    const pr = def(room).produce;
    if (pr) {
      const k = room.overtime ? 2 : 1; room.overtime = 0;
      if (pr.wood) w.res.wood += pr.wood * k;
      if (pr.stone) w.res.stone += pr.stone * k;
      if (pr.gold) { run.gold += pr.gold * k; run.stats.goldEarned += pr.gold * k; }
    }
    tickRoom(run, room);
    autoRoom(run, room);
  }
  drawHand(run, T.hand + perkN(run, 'handPlus'));
  wardPower(run);
}
// quiet services of the Z3 rooms (data/ward.js `auto`): a potion, a card upgrade, a clean deck
function autoRoom(run, room) {
  const au = def(room).auto; if (!au) return;
  if (au.every) { room.timers.auto = (room.timers.auto === undefined ? au.every : room.timers.auto) - 1; if (room.timers.auto > 0) return; room.timers.auto = au.every; }
  if (au.potion) {
    const id = RUN_rollPotion(run);
    if (run.potions.length < potionCap(run) && id) { run.potions.push(id); log(run, 'The Pharmacy brews a potion.'); }
    else { run.gold += T.pharmacyGold; run.stats.goldEarned += T.pharmacyGold; log(run, `The Pharmacy sells the batch: ${T.pharmacyGold} gold.`); }
  }
  if (au.upgrade && run.rng.chance(bigOf(room).upgrade || au.upgrade)) {
    const list = run.deck.filter((i) => !i.up && CARDS[i.id] && CARDS[i.id].up && CARDS[i.id].type !== 'junk');
    if (list.length) { const i = run.rng.pick(list); i.up = 1; log(run, `The Library upgrades ${CARDS[i.id].name}.`); }
  }
  if (au.junk) {
    const i = run.deck.findIndex((x) => x.id.startsWith('j_'));
    if (i >= 0) { run.deck.splice(i, 1); log(run, 'The Laundry washes out a junk card.'); }
  }
}
export function drawHand(run, n) {
  const d = W(run).deck;
  for (let i = 0; i < n; i++) {
    if (!d.draw.length) { if (!d.discard.length) break; d.draw = run.rng.shuffle(d.discard.splice(0)); }
    d.hand.push(d.draw.pop());
  }
}
export function endMorning(run) {
  const w = W(run);
  if (!w || w.phase !== 'morning' || run.phase !== 'ward') return false;
  w.deck.discard.push(...w.deck.hand.splice(0));
  w.phase = 'midday'; rollWalk(run);
  return true;
}

// ---------------- building ----------------
export function costOf(run, card) {
  const w = W(run);
  if (card.kind === 'room' && !w.freeUsed && perkN(run, 'firstFree') > 0) return {};
  return card.cost;
}
const affords = (run, cost) => (W(run).res.wood >= (cost.wood || 0)) && (W(run).res.stone >= (cost.stone || 0)) && (run.gold >= (cost.gold || 0));
function pay(run, cost) { const w = W(run); w.res.wood -= cost.wood || 0; w.res.stone -= cost.stone || 0; run.gold -= cost.gold || 0; }
export function canBuild(run, uid, x, y) {
  const r = canPlayBuild(run, uid, { x, y });
  return r;
}
// why: phase | nocard | cost | bounds | occupied | rubble | adjacent | target | type | already | hero | cut | fixed | timer | power
export function canPlayBuild(run, uid, target) {
  const w = W(run);
  if (!w || run.phase !== 'ward' || w.phase !== 'morning') return { ok: false, why: 'phase' };
  const inst = w.deck.hand.find((c) => c.uid === uid);
  if (!inst) return { ok: false, why: 'nocard' };
  const card = BUILD_CARDS[inst.id];
  if (!affords(run, costOf(run, card))) return { ok: false, why: 'cost' };
  if (card.kind === 'room') {
    const { x, y, dir } = target || {};
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inside(w, x, y)) return { ok: false, why: 'bounds' };
    const p = placement(run, card.size || [1, 1], x, y, dir);
    return p.ok ? { ok: true, cells: p.cells, dir: p.dir } : { ok: false, why: p.why };
  }
  if (card.kind === 'expand') { // target: a room id (the side is picked for you) or { room, dir }
    const rid = target && typeof target === 'object' ? target.room : target, dir = target && typeof target === 'object' ? target.dir : null;
    const ex = expandOptions(run, rid);
    if (!ex.ok) return { ok: false, why: ex.why };
    const opt = dir ? ex.dirs.find((o) => o.dir === dir) : ex.dirs[0];
    if (!opt) return { ok: false, why: 'space' };
    if (!affords(run, ex.cost)) return { ok: false, why: 'cost' };
    return { ok: true, dir: opt.dir, cells: opt.cells, f: opt.f };
  }
  if (card.kind === 'upgrade') {
    const room = w.rooms[target];
    if (!room) return { ok: false, why: 'target' };
    if (!card.on.includes(room.type)) return { ok: false, why: 'type' };
    if (card.oneShot ? room.overtime : room.upgrades.includes(card.id)) return { ok: false, why: 'already' };
    return { ok: true };
  }
  switch (card.effect) {
    case 'res': return target === 'wood' || target === 'stone' ? { ok: true } : { ok: false, why: 'target' };
    case 'tick': { const room = w.rooms[target]; if (!room) return { ok: false, why: 'target' }; if (!everyOf(room)) return { ok: false, why: 'timer' }; if (isDark(room)) return { ok: false, why: 'power' }; return { ok: true }; }
    case 'quarantine': { const room = w.rooms[target]; return room && def(room).spawn && !def(room).fixed ? { ok: true } : { ok: false, why: 'target' }; }
    case 'fumigate': { const room = w.rooms[target]; if (!room || room.type !== 'rm_ward') return { ok: false, why: 'target' }; return room.contents.length ? { ok: true } : { ok: false, why: 'target' }; }
    case 'demolish': {
      if (target && typeof target === 'object') { const { x, y } = target; return inside(w, x, y) && w.grid[y][x] === 'rubble' ? { ok: true } : { ok: false, why: 'target' }; }
      const room = w.rooms[target];
      if (!room) return { ok: false, why: 'target' };
      if (def(room).fixed) return { ok: false, why: 'fixed' };
      if (room.id === w.hero.room) return { ok: false, why: 'hero' };
      const before = connectedRooms(run), after = connectedRooms(run, room.id);
      for (const id of before) if (id !== room.id && !after.has(id)) return { ok: false, why: 'cut' };
      return { ok: true };
    }
    default: return { ok: true };
  }
}
export function playBuildCard(run, uid, target) {
  const chk = canPlayBuild(run, uid, target);
  if (!chk.ok) return chk;
  const w = W(run), d = w.deck;
  const inst = d.hand.find((c) => c.uid === uid), card = BUILD_CARDS[inst.id];
  pay(run, costOf(run, card));
  if (card.kind === 'expand') pay(run, expandCostOf(w.rooms[typeof target === 'object' ? target.room : target]));
  if (card.kind === 'room') w.freeUsed = true;
  d.hand.splice(d.hand.indexOf(inst), 1); d.discard.push(inst);
  let room = null;
  if (card.kind === 'room') { const f = chk.cells.length > 1 ? footprint(target.x, target.y, card.size, chk.dir) : { x: target.x, y: target.y, w: 1, h: 1 }; room = newRoom(run, card.room, f.x, f.y, f.w, f.h); log(run, `Built a ${def(room).name}${room.on ? '' : ' (dark: no spare power)'}.`); }
  else if (card.kind === 'expand') {
    room = w.rooms[typeof target === 'object' ? target.room : target]; const f = chk.f;
    room.x = f.x; room.y = f.y; room.w = f.w; room.h = f.h; for (const [cx, cy] of cellsOf(room)) w.grid[cy][cx] = room.id;
    wardPower(run); if (powerUse(room) > 0 && w.power.free < 0) room.on = false; wardPower(run); // no spare power for the bigger room: it goes dark
    log(run, `Expanded the ${def(room).name} to ${sizeKey(room)}${room.on ? '' : ' (dark: no spare power)'}.`);
  }
  else if (card.kind === 'upgrade') { room = w.rooms[target]; if (card.oneShot) room.overtime = 1; else room.upgrades.push(card.id); log(run, `${card.name} on the ${def(room).name}.`); }
  else {
    switch (card.effect) {
      case 'dieSides': w.dieUp = Math.min(8, (w.dieUp || 0) + (card.n || 2)); break;
      case 'reroll': case 'dieBonus': w.effects.push({ id: card.effect, n: card.n || 1, until: 'day' }); break;
      case 'move': case 'rations': case 'lamp': case 'flood': case 'nurse': case 'power': w.effects.push({ id: card.effect, n: card.n || 1, until: 'day' }); break;
      case 'bribe': w.effects.push({ id: 'bribe', n: 1, until: 'used' }); break;
      case 'otpay': { const g = Math.min(T.otPayMax, T.otPayPer * Object.values(w.rooms).filter((r) => def(r).power > 0 && r.on).length); run.gold += g; run.stats.goldEarned += g; break; }
      case 'quarantine': room = w.rooms[target]; room.contents = []; room.quarantine = T.quarantineDays; break;
      case 'fumigate': room = w.rooms[target]; room.contents = []; break;
      case 'linens': for (const r of lit(run, 'rm_linen')) { r.timers.spawn = 1; tickRoom(run, r); } break;
      case 'shift': for (const r of Object.values(w.rooms)) if (everyOf(r) && !isDark(r)) { r.timers.spawn = 1; tickRoom(run, r); } break;
      case 'ledger': drawHand(run, card.n || 2); break;
      case 'heal': run.hp = Math.min(run.maxHp, run.hp + card.n); break;
      case 'res': w.res[target] += card.n; break;
      case 'tick': room = w.rooms[target]; room.timers.spawn = 1; tickRoom(run, room); break;
      case 'demolish': {
        if (target && typeof target === 'object') { w.grid[target.y][target.x] = null; break; }
        room = w.rooms[target]; const c = refundBase(room);
        w.res.wood += Math.floor((c.wood || 0) / 2); w.res.stone += Math.floor((c.stone || 0) / 2); run.gold += Math.floor((c.gold || 0) / 2);
        for (const [cx, cy] of cellsOf(room)) w.grid[cy][cx] = null; delete w.rooms[room.id]; wardPower(run);
        break;
      }
    }
    log(run, `${card.name}.`);
  }
  return { ok: true, room: room ? room.id : null };
}
// what Demolish refunds half of: the build cost, plus the Expand cost when the room grew (a Ward Wing card already paid for both)
function refundBase(room) {
  const d = def(room), c = { ...d.cost };
  if (isBig(room) && d.expand && !d.foot && !room.paidWide) for (const k in d.expand.cost) c[k] = (c[k] || 0) + d.expand.cost[k];
  return c;
}
export function togglePower(run, rid) {
  const w = W(run), room = w && w.rooms[rid];
  if (!room || run.phase !== 'ward' || w.phase !== 'morning') return { ok: false, why: 'phase' };
  if (!def(room).power) return { ok: false, why: 'nopower' };
  if (!room.on && wardPower(run).free < powerUse(room)) return { ok: false, why: 'power' };
  room.on = !room.on; wardPower(run);
  return { ok: true, on: room.on };
}

// ---------------- walking ----------------
// What a room does when the hero passes (isDest: it is where the walk stops). null = nothing.
export function wouldTrigger(run, room, isDest) {
  const w = W(run);
  if (room.type === 'rm_theatre') return bossOpen(run) ? { kind: 'boss', detail: { early: !bossForced(run) } } : null;
  if (isDark(room)) return null; // lights out: whatever is inside sleeps
  if (room.upgrades.includes('b_iron_doors') && !isDest) return null;
  if (!room.contents.length) return null;
  const s = def(room).spawn;
  if (s.kind === 'fight') return { kind: 'fight', detail: { count: room.contents.length, ids: room.contents.map((c) => c.id) } };
  if (s.kind === 'elite') { const e = room.contents[0]; return { kind: 'elite', detail: { id: e.id, level: e.level } }; }
  return { kind: s.kind, detail: { n: room.contents.length } };
}
function previewWalk(run, path, wait) {
  const w = W(run), triggers = [];
  let off = 0, bribe = effectN(run, 'bribe');
  const lamp = lampOn(run);
  path.forEach((rid, i) => {
    const room = w.rooms[rid];
    if (!wait && isDark(room) && !lamp) off += T.offHp;
    const t = wouldTrigger(run, room, i === path.length - 1);
    if (!t) return;
    if (bribe > 0 && t.kind !== 'boss') { bribe--; triggers.push({ room: rid, kind: t.kind, detail: t.detail, bribed: true }); return; }
    triggers.push({ room: rid, kind: t.kind, detail: t.detail });
  });
  return { triggers, offPenalty: off, live: triggers.filter((t) => !t.bribed).length };
}
// every shortest path (capped), best first: fewest triggers, then least HP lost, then discovery order
function shortestPaths(run, from, to) {
  const dist = { [from]: 0 }, q = [from];
  while (q.length) { const id = q.shift(); for (const n of neighbors(run, id)) if (dist[n] === undefined) { dist[n] = dist[id] + 1; q.push(n); } }
  if (dist[to] === undefined) return null;
  const out = [];
  const back = (id, acc) => {
    if (out.length >= 16) return;
    if (id === from) { out.push(acc.slice().reverse()); return; }
    for (const p of neighbors(run, id)) if (dist[p] === dist[id] - 1) { acc.push(id); back(p, acc); acc.pop(); }
  };
  back(to, []);
  return out;
}
export function pathTo(run, rid, alt = 0) {
  const w = W(run);
  const no = (why) => ({ ok: false, why, path: [], triggers: [], cost: 0, offPenalty: 0, alts: [], move: moveOf(run) });
  if (!w || run.phase !== 'ward') return no('phase');
  if (w.phase === 'morning') return no('morning');
  if (!w.rooms[rid]) return no('target');
  const th = theatreOf(run);
  if (bossForced(run)) { // the last night: you are pulled into the Theatre, wherever it is
    if (rid !== th.id) return no('boss');
    return { ok: true, why: null, forced: true, path: [th.id], triggers: [{ room: th.id, kind: 'boss', detail: { early: false } }], cost: 0, offPenalty: 0, alts: [], move: moveOf(run) };
  }
  if (rid === w.hero.room) { const pv = previewWalk(run, [rid], true); return { ok: true, why: null, wait: true, path: [rid], triggers: pv.triggers, cost: 0, offPenalty: 0, alts: [], move: moveOf(run) }; }
  const paths = shortestPaths(run, w.hero.room, rid);
  if (!paths) return no('unreachable');
  const eff = (p) => p.reduce((a, id, i) => a + (i < p.length - 1 && w.rooms[id].upgrades.includes('b_double_doors') ? 0 : 1), 0);
  if (Math.min(...paths.map(eff)) > moveOf(run)) return no('far');
  const scored = paths.map((p, i) => ({ p, i, pv: previewWalk(run, p, false) }));
  scored.sort((a, b) => a.pv.live - b.pv.live || a.pv.offPenalty - b.pv.offPenalty || a.i - b.i);
  const k = Math.max(0, Math.min(scored.length - 1, alt | 0)), pick = scored[k];
  return { ok: true, why: null, path: pick.p, triggers: pick.pv.triggers, cost: pick.p.length, offPenalty: pick.pv.offPenalty, alts: scored.filter((_, j) => j !== k).map((s) => ({ path: s.p, triggers: s.pv.triggers, offPenalty: s.pv.offPenalty })), alt: k, move: moveOf(run) };
}
export function startWalk(run, rid, alt = 0) {
  const w = W(run);
  const p = pathTo(run, rid, alt);
  if (!p.ok) { if (w) w.why = p.why; return false; }
  w.why = null;
  w.walk = { path: p.path, i: 0, dest: rid, wait: !!p.wait, forced: !!p.forced };
  if (p.wait) { run.hp = Math.min(run.maxHp, run.hp + T.waitHeal); log(run, `You wait. Heal ${T.waitHeal}.`); }
  if (p.forced) log(run, 'The last night: the Theatre calls you in.');
  return afterTrigger(run);
}
// Continue the walk: the next room that triggers opens its screen (returns run.pending), or the walk ends (null).
export function afterTrigger(run) {
  const w = W(run), walk = w && w.walk;
  run.pending = null;
  if (!walk) { run.phase = 'ward'; return null; }
  while (walk.i < walk.path.length) {
    const rid = walk.path[walk.i++], room = w.rooms[rid];
    w.hero.room = rid;
    if (walk.again) walk.again = false;
    else if (!walk.wait && isDark(room) && !lampOn(run)) { run.hp = Math.max(1, run.hp - T.offHp); log(run, `You stumble through the dark ${def(room).name}: -${T.offHp} HP.`); }
    if (!walk.wait && !walk.forced) {
      const hl = (w.phase === 'evening' ? perkN(run, 'eveningHeal') : 0) + (w.phase === 'night' ? effect(run, 'nurse').reduce((x, e) => x + e.n, 0) : 0);
      if (hl > 0 && run.hp < run.maxHp) { run.hp = Math.min(run.maxHp, run.hp + hl); log(run, `Heal ${hl} on the way through the ${def(room).name}.`); }
    }
    const t = wouldTrigger(run, room, walk.i === walk.path.length);
    if (!t) continue;
    if (t.kind !== 'boss' && effectN(run, 'bribe') > 0) { const b = w.effects.findIndex((e) => e.id === 'bribe'); w.effects.splice(b, 1); log(run, `The porter looks away at the ${def(room).name}.`); continue; }
    const p = launch(run, room, t);
    if (p) { if (t.kind === 'event' && room.contents.length) { walk.i--; walk.again = true; } return p; }
  }
  return finishWalk(run);
}
function finishWalk(run) {
  const w = W(run);
  w.walk = null; run.pending = null; run.phase = 'ward';
  advancePhase(run);
  return null;
}
export function advancePhase(run) {
  const w = W(run);
  const i = PHASE_ORDER.indexOf(w.phase);
  if (w.phase === 'night') { w.day++; log(run, `Day ${w.day} of ${w.dayLimit}.`); morningStart(run); }
  else { w.phase = PHASE_ORDER[i + 1]; rollWalk(run); }
  return w.phase;
}
// phase modifiers for a fight in this room (read by engine/combat.js newCombat via run.pending.mods)
export function phaseMods(run, room, kind, level = 1) {
  const w = W(run), ph = PHASES[w.phase] || {};
  const night = w.phase === 'night', quiet = night && (effect(run, 'flood').length > 0 || (room && room.upgrades.includes('b_soundproofing')));
  const ns = quiet ? 0 : room && room.upgrades.includes('b_night_shift') && night ? 2 : 1;
  const m = { phase: w.phase };
  if (kind === 'normal' && ph.enemyStr) m.enemyStr = ph.enemyStr * ns;
  if (kind === 'boss') { const idle = Math.max(0, T.bossIdle.need - (w.fought || 0)); if (idle) m.enemyStr = Math.floor(idle / T.bossIdle.per); if (!m.enemyStr) delete m.enemyStr; } // hiding is punished: the boss grows restless
  if (kind === 'elite') { const s = (ph.eliteStr || 0) * ns + (level >= 2 ? T.eliteL2.str : 0); if (s) m.enemyStr = s; if (level >= 2) m.hpMul = T.eliteL2.hpMul; }
  if (ph.firstTurnDraw) { const ks = lit(run, 'rm_kitchen'); m.firstTurnDraw = ks.length ? Math.max(...ks.map((k) => bigOf(k).kitchen || T.kitchenDraw)) : ph.firstTurnDraw; }
  const r = effectN(run, 'rations'); if (r) m.handAdd = r;
  const g = ph.goldMul || 1; m.goldMul = 1 + (g - 1) * (night ? ns : 1);
  return m;
}
function launch(run, room, t) {
  const w = W(run);
  run.stats.floors++; // every room that opens something counts like a map node (unlock points, history)
  const every = everyOf(room);
  switch (t.kind) {
    case 'fight': {
      const ids = room.contents.map((c) => c.id); room.contents = []; w.fought = (w.fought || 0) + 1;
      run.phase = 'combat';
      run.pending = { kind: 'combat', fightKind: 'normal', enemies: ids.slice(0, T.boardMax), reinforce: ids.slice(T.boardMax), mods: phaseMods(run, room, 'normal'), ward: { room: room.id, count: ids.length } };
      log(run, `${ids.length} in the ${def(room).name}.`);
      return run.pending;
    }
    case 'elite': {
      const e = room.contents.shift(); room.timers.spawn = every; w.fought = (w.fought || 0) + 1;
      run.phase = 'combat';
      const m = phaseMods(run, room, 'elite', e.level);
      run.pending = { kind: 'combat', fightKind: 'elite', enemies: [e.id], reinforce: [], mods: m, ward: { room: room.id, count: 1, elite: true, level: e.level, night: w.phase === 'night' && m.goldMul > 1, ns: room.upgrades.includes('b_night_shift') } };
      log(run, `An elite in Isolation${e.level >= 2 ? ' (Level 2)' : ''}.`);
      return run.pending;
    }
    case 'boss': {
      const early = !bossForced(run);
      const m = phaseMods(run, room, 'boss'); if (early) m.hpMul = T.earlyBossHp;
      run.phase = 'combat';
      run.pending = { kind: 'combat', fightKind: 'boss', enemies: makeEncounter(run, 'boss'), reinforce: [], mods: m, ward: { room: room.id, boss: true, early } };
      log(run, early ? 'You catch the boss before it has scrubbed in.' : 'The boss is waiting.');
      return run.pending;
    }
    case 'event': {
      room.contents.shift(); room.timers.spawn = every;
      return wardStartEvent(run);
    }
    case 'shop': room.contents.shift(); room.timers.spawn = every; run.phase = 'shop'; run.pending = makeShop(run); return run.pending;
    case 'forge': room.contents.shift(); room.timers.spawn = every; run.phase = 'forge'; run.pending = { kind: 'forge', used: 0 }; return run.pending;
    case 'rest': {
      room.contents.shift(); room.timers.spawn = every;
      const n = Math.round(run.maxHp * (def(room).heal || 0.25)); run.hp = Math.min(run.maxHp, run.hp + n);
      log(run, `Clean sheets: heal ${n}.`);
      return null;
    }
  }
  return null;
}
// the Chapel's event: the act pool as in RUN.startEvent, weighted by the phase's lean
// An event may carry `phase: 'midday' | 'evening' | 'night'` (or an array): it is 3 times as likely in those phases and half as likely in the
// others. Untagged events keep the old lean by text (kind: heal or gold at midday, strange: chance and relics at night).
const LEAN = { kind: /heal|gold/i, strange: /random|relic|max HP|Overload|50%/i };
export function eventWeight(ev, phase) {
  if (ev.phase) { const ph = [].concat(ev.phase); return ph.includes(phase) ? 3 : 0.5; }
  const re = LEAN[(PHASES[phase] || {}).eventLean];
  const txt = ev.choices.map((c) => (c.text || '') + ' ' + c.label).join(' ');
  return re && re.test(txt) ? 3 : 1;
}
export function wardStartEvent(run) {
  const w = W(run);
  let pool = Object.values(EVENTS).filter((e) => (e.act === 0 || e.act === run.act) && !run.seenEvents.includes(e.id));
  const open = pool.filter((e) => runAllows(run, e.id)); if (open.length) pool = open;
  if (!pool.length) return null;
  const ev = run.rng.weighted(pool, (e) => eventWeight(e, w.phase));
  run.seenEvents.push(ev.id);
  run.phase = 'event'; run.pending = { kind: 'event', id: ev.id, result: null, phase: w.phase };
  return run.pending;
}

// ---------------- rewards, shop, act end (hooks called from engine/run.js) ----------------
export function rollBuildCard(run, rarities) {
  let pool = BUILD_LIST.filter((c) => rarities.includes(c.rarity) && runAllows(run, c.id));
  if (!pool.length) pool = BUILD_LIST.filter((c) => runAllows(run, c.id));
  const wt = { common: 6, uncommon: 3, rare: 1.2 };
  return run.rng.weighted(pool, (c) => wt[c.rarity] || 1).id;
}
// slots: one rarity list per offered card, so an offer has a shape (elite: common-or-uncommon, uncommon, uncommon-or-rare; boss: rare first)
export const OFFER_SLOTS = {
  elite: [['common', 'uncommon'], ['uncommon'], ['uncommon', 'rare']],
  boss: [['rare'], ['rare', 'uncommon'], ['uncommon']],
  shop: [['common', 'uncommon'], ['uncommon', 'common'], ['uncommon', 'rare']],
};
function buildChoice(run, slots, n = 3) {
  const out = [];
  const lists = Array.isArray(slots[0]) ? slots : Array.from({ length: n }, () => slots);
  for (const rar of lists) for (let g = 0; g < 20; g++) { const id = rollBuildCard(run, rar); if (!out.includes(id)) { out.push(id); break; } }
  return out;
}
// fightRewards hook: prev = the combat pending that just ended (carries .ward and .mods)
export function wardRewards(run, rw, prev) {
  const w = W(run), info = prev && prev.ward;
  if (!w || !info) return rw;
  const mods = prev.mods || {};
  let mul = mods.goldMul || 1;
  const gain = { wood: 0, stone: 0 };
  if (info.boss) {
    rw.buildChoice = buildChoice(run, OFFER_SLOTS.boss);
    if (info.early) { run.gold += T.earlyBossGold; run.stats.goldEarned += T.earlyBossGold; const id = rollBuildCard(run, ['uncommon', 'rare']); addCard(run, id); rw.wardBonus = { gold: T.earlyBossGold, card: id, graft: 1 }; run.flags.queueGraft = (run.flags.queueGraft || 0) + 1; }
    w.bossDone = true;
  } else if (info.elite) {
    gain.wood += T.resPerElite; gain.stone += T.resPerElite;
    rw.buildChoice = buildChoice(run, OFFER_SLOTS.elite);
    const extra = (info.night ? (PHASES.night.eliteRelic || 0) * (info.ns ? 2 : 1) : 0) + (info.level >= 2 ? T.eliteL2.relic : 0);
    if (extra > 0) {
      const list = [rw.relic]; for (let g = 0; g < 10 && list.length < 1 + extra; g++) { const r = rollRelicByAct(run); if (r && !list.includes(r)) list.push(r); }
      rw.relicChoices = list.filter(Boolean); rw.relic = null;
    }
  } else {
    const n = info.count || 1;
    mul *= n >= 2 ? 1 + T.goldPerExtra * (n - 2) : 0.75;
    for (let i = 0; i < n * T.resPerMonster; i++) gain[run.rng.chance(0.5) ? 'wood' : 'stone']++;
    if (lit(run, 'rm_morgue').length) gain.stone += n * T.morgueStone;
    const fd = w.rooms[info.room]; if (fd && fd.upgrades.includes('b_fire_door')) { gain.wood *= 2; gain.stone *= 2; }
    if (n >= T.bigFight) run.flags.queueGraft = (run.flags.queueGraft || 0) + 1;
  }
  w.res.wood += gain.wood; w.res.stone += gain.stone;
  rw.gold = Math.round(rw.gold * mul);
  if (mods.phase === 'night' && mods.goldMul > 1 && !info.boss) rw.gold += perkN(run, 'nightGold') * (info.count || 1);
  rw.ward = { ...gain, count: info.count || 0, goldMul: mul };
  return rw;
}
// The reward screen's building card pick: id from rw.buildChoice, or null to pass.
export function takeBuildChoice(run, id) {
  const rw = run.pending;
  if (!rw || !Array.isArray(rw.buildChoice)) return false;
  if (id && !rw.buildChoice.includes(id)) return false;
  if (id) addCard(run, id);
  rw.buildTaken = id || null; rw.buildChoice = null;
  return true;
}
// makeShop hook: the Dispensary also sells building cards and removes one
export function wardShopExtend(run, shop) {
  const m = priceMult(run);
  const slots = OFFER_SLOTS.shop.slice(); for (let k = 0; k < perkN(run, 'shopBuild'); k++) slots.push(['common', 'uncommon', 'rare']);
  shop.builds = buildChoice(run, slots).map((id) => ({ id, price: Math.max(10, Math.round(T.buildPrice[BUILD_CARDS[id].rarity] * m)), sold: false }));
  shop.buildRemovePrice = T.buildRemovePrice; shop.buildRemoved = false;
  return shop;
}
export function wardShopBuy(run, shop, kind, index, extra) {
  if (kind === 'build') {
    const it = shop.builds && shop.builds[index];
    if (!it || it.sold) return { ok: false, why: 'sold' };
    if (run.gold < it.price) return { ok: false, why: 'gold' };
    run.gold -= it.price; it.sold = true; addCard(run, it.id); return { ok: true };
  }
  if (kind === 'buildRemove') {
    const d = W(run).deck;
    if (shop.buildRemoved) return { ok: false, why: 'sold' };
    if (run.gold < shop.buildRemovePrice) return { ok: false, why: 'gold' };
    for (const z of ['draw', 'discard', 'hand']) { const i = d[z].findIndex((c) => c.uid === extra); if (i >= 0) { d[z].splice(i, 1); run.gold -= shop.buildRemovePrice; shop.buildRemoved = true; return { ok: true }; } }
    return { ok: false, why: 'nocard' };
  }
  return { ok: false, why: 'kind' };
}
// RUN.advance hook: back to the walk, or the next floor after the boss (Act 3: the Grafter)
export function wardAdvance(run) {
  const w = W(run);
  run.pending = null;
  if (w && w.bossDone) {
    w.bossDone = false; w.walk = null;
    if (run.act < 3) { startAct(run, run.act + 1); run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * 0.5)); return 'act'; }
    startFight(run, 'final'); return run.phase;
  }
  afterTrigger(run);
  return run.phase;
}

// ---------------- dice routes (design/WARD.md, "Dice routes") ----------------
// Each walk phase (midday, evening, night) the player ROLLS a die (run.ward.dice sides, default 4). The roll N is the longest route: the
// player plans it one room at a time (orthogonally adjacent, never the same room twice), then every room entered activates in order.
// extendRoute / undoRoute / clearRoute edit run.ward.route (room ids after the hero); startRoute walks it through afterTrigger.
export const diceOf = (run) => (T.dice || 4) + (W(run).dieUp || 0) + perkN(run, 'dieSides'); // Loaded Dice (w.dieUp) and Bone Dice (relic) add sides
export function rollWalk(run) {
  const w = W(run); if (!w) return null;
  const sides = diceOf(run), base = run.rng.int(sides) + 1; // 1..sides (rng.int(n) is 0..n-1)
  const bonus = effectN(run, 'move') + perkN(run, 'move') + effectN(run, 'dieBonus') + (w.phase === 'midday' ? perkN(run, 'dieMidday') : 0); // Morning Rounds, Weighted Die, Noon Dial
  w.roll = { key: `${w.day}:${w.phase}`, base, sides, bonus, n: base + bonus, lucky: effectN(run, 'reroll') + (w.rerollDay === w.day ? 0 : perkN(run, 'rerollDay')) };
  w.route = [];
  log(run, `Roll d${sides}: ${base}${bonus ? ` +${bonus}` : ''}.`);
  return w.roll;
}
// a save made before dice, or a phase reached without rollWalk: roll once, lazily
export function rollOf(run) {
  const w = W(run); if (!w || w.phase === 'morning') return null;
  if (!w.roll || w.roll.key !== `${w.day}:${w.phase}`) rollWalk(run);
  if (!Array.isArray(w.route)) w.route = []; // a save from before routes: the die and the route editor always have a list
  return w.roll;
}
// Lucky Roll (effect 'reroll') or the Lucky Coin (once a day): roll the die again; what allowed it is spent
export function rerollWalk(run) {
  const w = W(run), r = rollOf(run);
  if (!r || w.route.length || !r.lucky) return false;
  const i = w.effects.findIndex((e) => e.id === 'reroll'); if (i >= 0) w.effects.splice(i, 1); else w.rerollDay = w.day;
  rollWalk(run); return true;
}
export function routeInfo(run, route) {
  const w = W(run), r = rollOf(run), rt = route || w.route || [];
  const pv = previewWalk(run, rt, false);
  return { ok: true, why: null, path: rt.slice(), triggers: pv.triggers, offPenalty: pv.offPenalty, n: r ? r.n : 0, left: r ? Math.max(0, r.n - rt.length) : 0, cost: rt.length, alts: [] };
}
// why: phase morning boss (last night: only the Theatre) full (the roll is spent) unreachable (no door) visited (a room once per route) theatre (the route ends in the Theatre) target
export function routeWhy(run, rid) {
  const w = W(run);
  if (!w || run.phase !== 'ward') return 'phase';
  if (w.phase === 'morning') return 'morning';
  if (bossForced(run)) return 'boss';
  const room = w.rooms[rid]; if (!room) return 'target';
  const r = rollOf(run), rt = w.route, last = rt.length ? rt[rt.length - 1] : w.hero.room;
  if (rt.length >= r.n) return 'full';
  if (rt.length && w.rooms[last].type === 'rm_theatre' && bossOpen(run)) return 'theatre';
  if (rid === w.hero.room || rt.includes(rid)) return 'visited';
  if (!neighbors(run, last).includes(rid)) return 'unreachable';
  return null;
}
export function extendRoute(run, rid) {
  const why = routeWhy(run, rid);
  if (why) { W(run).why = why; return { ok: false, why }; }
  W(run).why = null; W(run).route.push(rid); return { ok: true, why: null };
}
export function undoRoute(run) { const w = W(run); return !!(w && w.route && w.route.pop()); }
export function clearRoute(run) { const w = W(run); if (w) w.route = []; }
export const legalSteps = (run) => Object.keys(W(run).rooms).filter((rid) => !routeWhy(run, rid));
export function startRoute(run) {
  const w = W(run);
  if (!w || run.phase !== 'ward' || w.phase === 'morning' || bossForced(run)) { if (w) w.why = w && w.phase === 'morning' ? 'morning' : 'boss'; return false; }
  if (!w.route || !w.route.length) { w.why = 'empty'; return false; }
  w.why = null;
  const path = w.route.slice(); w.route = [];
  w.walk = { path, i: 0, dest: path[path.length - 1], wait: false, forced: false };
  return afterTrigger(run);
}
