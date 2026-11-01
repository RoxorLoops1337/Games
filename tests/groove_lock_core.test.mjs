// Groove Lock: the pure rules, the levels and the solver, headless (no DOM, no audio device).
import assert from 'node:assert/strict';
import { Game, solve, parOf, hintFor, starsFor, parsePattern, mod, TYPES, TYPE_IDS, CHAR, JAM_TYPES } from '../groove_lock/core.js';
import { LEVELS, JAM, GROOVE8, GROOVE16 } from '../groove_lock/levels.js';
import { NOTE, VOWEL, SCALE, PAD, stepDuration, barSeconds } from '../groove_lock/audio.js';

let passed = 0;
const ok = (cond, name) => { assert.ok(cond, name); passed++; };
const eq = (a, b, name) => { assert.deepEqual(a, b, name); passed++; };
const by = (id) => LEVELS.find((l) => l.id === id);
const clone = (g) => { const c = new Game(g.lv); c.restore(g.snapshot()); return c; };

// ---------------------------------------------------------------- level data
eq(LEVELS.map((l) => l.id), ['heartbeat', 'backbeat', 'drums', 'hats', 'voices', 'fullmix'], 'level ids and order are stable (they are save keys)');
ok(new Set(LEVELS.map((l) => l.id)).size === LEVELS.length, 'ids are unique');
eq(GROOVE8.length, 8, 'groove8 length'); eq(GROOVE16.length, 16, 'groove16 length');
for (const lv of LEVELS) {
  ok(lv.pattern.length === lv.steps, lv.id + ': pattern length matches the ring size');
  ok([8, 12, 16].includes(lv.steps) && lv.steps % 4 === 0, lv.id + ': ring size divides into 4 beats');
  ok([...lv.show].every((c) => CHAR[c] && lv.pattern.includes(c)), lv.id + ': every shown layer exists in the pattern');
  ok([...lv.lock].every((c) => lv.show.includes(c)), lv.id + ': locked layers are shown layers');
  ok([...lv.stacks.join('')].every((c) => CHAR[c]), lv.id + ': lorries only hold real sounds');
  ok(lv.stacks.length >= 1 && lv.stacks.length <= 4, lv.id + ': one to four lorries fit the screen');
  ok(lv.tip && lv.name && lv.layer, lv.id + ': has text');
  // the lorries must hold exactly the cubes the ghosts ask for
  const need = {}; for (const c of lv.pattern) if (c !== '.' && lv.show.includes(c) && !lv.lock.includes(c)) need[c] = (need[c] || 0) + 1;
  const have = {}; for (const c of lv.stacks.join('')) have[c] = (have[c] || 0) + 1;
  eq(have, need, lv.id + ': lorry cubes match the ghosts exactly');
  const g = new Game(lv);
  ok(!g.isSolved(), lv.id + ': does not start solved');
  if (lv.lock) ok(lv.rot0 % lv.steps !== 0, lv.id + ': locked layers start out of sync');
}
ok(LEVELS.slice(1).every((l, i) => l.show.length >= LEVELS[i].show.length || l.id === 'drums'), 'layers never shrink inside a world');
eq(parsePattern('k.s').map((x) => x), ['kick', null, 'snare'], 'parsePattern');

// ---------------------------------------------------------------- geometry
{
  const g = new Game(by('heartbeat'));
  eq(g.dock, 4, 'dock is at the bottom (step N/2)');
  eq(g.dockSlot(), 4, 'rot 0: the slot at the dock is the dock step');
  g.rotate(1);
  eq([g.rot, g.dockSlot(), g.moves], [1, 3, 1], 'turning clockwise brings the previous slot to the dock');
  g.rotate(-1); g.rotate(-1);
  eq([g.rot, g.dockSlot()], [7, 5], 'rot wraps below zero');
  const h = new Game(by('heartbeat')); h.ring[0] = 'kick';
  eq(h.stepType(0), 'kick', 'cube at slot 0 plays on step 0 at rot 0');
  h.rotate(1); eq([h.stepType(0), h.stepType(1)], [null, 'kick'], 'turning clockwise plays that cube one step LATER');
  eq(mod(-1, 8), 7, 'mod');
}

// ---------------------------------------------------------------- drop rules
{
  const g = new Game(by('backbeat'));            // kicks locked, rot0 3, lorries hsh / sh
  const before = JSON.stringify(g.snapshot());
  const r = g.drop(0);                            // top of lorry 0 is a hat; which ghost is at the dock?
  const slot = g.dockSlot();
  if (r.ok) ok(g.ghost[slot] === 'hat', 'a drop that works only works on a matching ghost');
  else { ok(['wrongType', 'noGhost', 'occupied'].includes(r.reason), 'rejected drops say why'); eq(JSON.stringify(g.snapshot()), before, 'a rejected drop changes nothing'); }
  const e = new Game(by('heartbeat')); e.stacks[0].length = 0;
  eq(e.drop(0).reason, 'empty', 'empty lorry');
  eq(e.drop(9).reason, 'empty', 'no such lorry');
  const k = new Game(by('heartbeat'));
  ok(k.drop(0).ok, 'heartbeat: the first kick drops straight in');
  eq(k.drop(0).reason, 'occupied', 'the same slot twice is refused');
  eq(k.stacks[0].length, 2, 'one cube left the lorry');
  k.rotate(1); ok(k.drop(0).ok, 'next ghost, next cube');
  const w = new Game(by('backbeat'));
  let wrong = null; for (let t = 0; t < 8 && !wrong; t++) { for (let i = 0; i < w.stacks.length; i++) { const x = clone(w).drop(i); if (!x.ok && x.reason === 'wrongType') wrong = x; } w.rotate(1); }
  ok(wrong && wrong.need && wrong.type && wrong.need !== wrong.type, 'a wrong type reports what was needed');
}

// ---------------------------------------------------------------- undo, drag merge, one way
{
  const g = new Game(by('heartbeat'));
  g.drop(0); g.rotate(1); g.rotate(1, true); g.rotate(1, true);
  eq(g.history.length, 2, 'a drag of three notches is a single undo step');
  ok(g.undo(), 'undo'); eq([g.rot, g.moves, g.ring.filter(Boolean).length, g.stacks[0].length], [0, 0, 1, 2], 'undo the whole drag in one go');
  g.undo(); eq([g.moves, g.ring.filter(Boolean).length, g.stacks[0].length], [0, 0, 3], 'undo puts the cube back in its lorry');
  ok(!g.undo() && !g.canUndo(), 'nothing left to undo');
  const o = new Game(by('hats'));
  ok(!o.canRotate(-1) && o.canRotate(1), 'one way belt');
  const m = o.moves; eq(o.rotate(-1).reason, 'oneWay', 'turning back is refused'); eq(o.moves, m, 'and costs nothing');
}

// ---------------------------------------------------------------- solver vs an independent brute force
function brute(level) {
  const start = new Game(level), key = (g) => g.rot + '|' + g.ring.map((x) => x || '-').join(',') + '|' + g.stacks.map((s) => s.join('')).join('/');
  const seen = new Map([[key(start), 0]]); let cur = [start], d = 0;
  while (cur.length) {
    const next = [];
    for (let q = 0; q < cur.length; q++) {
      const g = cur[q]; if (seen.get(key(g)) !== d) continue;
      if (g.isSolved()) return d;
      for (let i = 0; i < g.stacks.length; i++) { const c = clone(g); if (c.drop(i).ok) { const k = key(c); if (!seen.has(k) || seen.get(k) > d) { seen.set(k, d); cur.push(c); } } }
      for (const dir of g.oneWay ? [1] : [1, -1]) { const c = clone(g); c.rotate(dir); const k = key(c); if (!seen.has(k) || seen.get(k) > d + 1) { seen.set(k, d + 1); next.push(c); } }
    }
    cur = next; d++;
  }
  return null;
}
const PARS = { heartbeat: 8, backbeat: 7, drums: 18, hats: 27, voices: 37, fullmix: 41 };
for (const lv of LEVELS) {
  const t0 = Date.now(), r = solve(new Game(lv));
  ok(r && r.cost === PARS[lv.id], lv.id + ': par is ' + PARS[lv.id] + ' (got ' + (r && r.cost) + ')');
  ok(Date.now() - t0 < 2500, lv.id + ': solves fast enough to run on a phone');
  eq(parOf(lv), r.cost, lv.id + ': parOf agrees');
  const g = new Game(lv); let mv = 0;
  for (const a of r.actions) { if (a.t === 'rot') { ok(g.rotate(a.dir).ok, 'solver rotation is legal'); mv++; } else ok(g.drop(a.stack).ok, 'solver drop is legal'); }
  ok(g.isSolved(), lv.id + ': replaying the solver path solves it'); eq(g.moves, r.cost, lv.id + ': and costs exactly par');
  eq(g.remaining(), 0, lv.id + ': nothing left to place');
  // the finished ring plays exactly the goal at every step
  for (let s = 0; s < lv.steps; s++) eq(g.stepType(s), g.goalType(s), lv.id + ': step ' + s + ' plays the goal');
}
for (const id of ['heartbeat', 'backbeat']) eq(brute(by(id)), PARS[id], id + ': brute force agrees the par is minimal');
{
  const g = new Game(by('fullmix')); const r = solve(g);
  eq(TYPE_IDS.map((t) => { let n = 0; for (let s = 0; s < 16; s++) if (clone(g).goalType(s) === t) n++; return n; }), [3, 2, 4, 3, 1, 2, 1], 'the finale groove has the right cube counts');
  ok(r.cost > 16 * 2, 'the finale needs more than two laps of the belt');
}

// ---------------------------------------------------------------- hints walk to par
for (const lv of LEVELS) {
  const g = new Game(lv); let guard = 0;
  while (!g.isSolved() && guard++ < 400) {
    const h = hintFor(g); assert.ok(!h.stuck && !h.done, 'hint available');
    for (let i = 0; i < h.n; i++) g.rotate(h.dir);
    if (h.drop != null) assert.ok(g.drop(h.drop).ok, 'hinted drop works');
  }
  ok(g.isSolved() && g.moves === PARS[lv.id], lv.id + ': following hints reaches par');
  ok(hintFor(g).done, lv.id + ': solved game says done');
}
{
  const g = new Game(by('hats')); const sol = solve(g);
  g.rotate(1); const h = hintFor(g);
  ok(h.cost === sol.cost - 1 || h.cost >= sol.cost - 1, 'a hint after a step still has a route');
}

// ---------------------------------------------------------------- scoring
eq([starsFor(8, 8), starsFor(7, 8), starsFor(9, 8), starsFor(11, 8), starsFor(12, 8), starsFor(99, 8)], [3, 3, 2, 2, 1, 1], 'stars: par, ceil(par*1.3), more');
eq(starsFor(5, null), 3, 'no par means full stars');

// ---------------------------------------------------------------- sync feel: locked layers are only in tune when home
for (const id of ['backbeat', 'hats', 'voices', 'fullmix']) {
  const lv = by(id), g = new Game(lv), locked = g.locked.map((x, j) => (x ? j : -1)).filter((j) => j >= 0);
  ok(locked.length > 0, id + ': has locked cubes');
  ok(locked.some((j) => !g.inTune(j)), id + ': scrambled start is out of tune');
  g.rot = 0; ok(locked.every((j) => g.inTune(j)), id + ': home is in tune');
}

// ---------------------------------------------------------------- jam mode
{
  const g = new Game(JAM);
  ok(g.jam && !g.isSolved() && solve(g) === null && parOf(JAM) === null, 'jam has no goal and no par');
  eq(g.stacks.length, JAM_TYPES.length, 'one palette tile per sound');
  const a = g.drop(0); ok(a.ok && g.ring[a.slot] === 'kick', 'jam drops any sound on any empty slot');
  eq(g.drop(1).reason, 'occupied', 'but not on a full one');
  g.rotate(1); ok(g.drop(4).ok && g.moves === 0, 'turning is free in jam');
  const slot = g.ring.findIndex(Boolean); ok(g.take(slot).ok && !g.ring[slot], 'tap a cube to pick it up');
  g.clearJam(); ok(g.ring.every((x) => !x), 'clear empties the ring'); ok(g.undo() && g.ring.some(Boolean), 'and clear can be undone');
}

// ---------------------------------------------------------------- the song itself
{
  const types = new Set([...GROOVE16].filter((c) => c !== '.').map((c) => CHAR[c]));
  eq([...types].sort(), TYPE_IDS.slice().sort(), 'the full groove uses all seven sounds');
  ok(![...GROOVE16].includes('.'), 'a full 16 step groove: every step sounds');
  ok(TYPE_IDS.every((t) => TYPES[t].color && TYPES[t].label && TYPES[t].who), 'every type has art data');
  ok(['ah', 'oh', 'ee'].every((t) => NOTE[t] > 200 && NOTE[t] < 1000 && VOWEL[t].length === 3), 'vowels have a pitch and three formants');
  ok(Math.abs(barSeconds(100) - 2.4) < 1e-9 && Math.abs(stepDuration(2.4, 16) - 0.15) < 1e-9, 'tempo maths');
  eq(SCALE.length, 10, 'tick scale'); ok(PAD.every((f) => f > 80 && f < 400), 'pad notes');
  // every note in the vocal hook belongs to A minor 7 (A C E G)
  const AM7 = [220, 261.63, 329.63, 392]; const pc = (f) => Math.round(12 * Math.log2(f / 220)) % 12;
  ok(['ah', 'oh', 'ee'].every((t) => AM7.some((n) => pc(n) === ((pc(NOTE[t]) % 12) + 12) % 12)), 'vocals sit inside the Am7 chord');
}

console.log(`groove_lock_core: ${passed} passed, 0 failed`);
