// Grimhold — headless suite.
//
// The game is one self-contained file drawing to a canvas. This harness stubs a
// DOM + a no-op 2d context, evals the inline <script> with __HQ_HEADLESS__ set
// (so timers fire instantly and nothing waits on rAF), and drives the real game
// through window.HQ: board wiring → doors and sight → movement and traps →
// combat dice → spells → searching → the Warlock's turn → objectives → the
// armoury → save/load. draw() runs against the stub context on every quest so
// render-time mistakes fail here instead of on a phone.
//
// Run: node tests/grimhold.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadGame(store){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'grimhold', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  // A real canvas throws on a malformed colour, and a throw inside draw() kills
  // the frame loop. The stub has to be just as fussy or that bug ships.
  const okColour = (c) => typeof c !== 'string' ? true : (
    /^#[0-9a-f]{3}$/i.test(c) || /^#[0-9a-f]{4}$/i.test(c) ||
    /^#[0-9a-f]{6}$/i.test(c) || /^#[0-9a-f]{8}$/i.test(c) ||
    /^rgb\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(c) ||
    /^rgba\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(c) ||
    /^[a-z]+$/i.test(c)
  );
  const checkColour = (where) => (c) => {
    if (!okColour(c)) throw new SyntaxError(`${where}: '${c}' is not a valid colour`);
  };
  const stopCheck = checkColour('addColorStop');
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop: (_pos, col) => stopCheck(col) });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return (a,b,w,h) => ({ data:new Uint8ClampedArray(w*h*4), width:w, height:h });
    if (k === 'createImageData') return (w,h) => ({ data:new Uint8ClampedArray(w*h*4), width:w, height:h });
    if (k === 'canvas') return { width: 800, height: 1400 };
    return noop;
  }, set(_t, k, v){
    if (k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') checkColour(k)(v);
    return true;
  } });
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 1400 }),
    setPointerCapture: noop, innerHTML: '', textContent: '', width: 800, height: 1400,
  }, { get(t, k){ return (k in t) ? t[k] : noop; }, set(t, k, v){ t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.setTimeout = () => 0;
  global.devicePixelRatio = 1;
  global.innerWidth = 800; global.innerHeight = 1400;
  global.performance = { now: () => 0 };
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k){ return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; },
    set(t, k, v){ t[k] = v; return true; },
  });
  global.__HQ_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.HQ;
}

// Tiny local runner: named cases, a diffing equality check, one summary line.
function harness(name){
  let pass = 0, fail = 0, cur = '';
  const fmt = v => typeof v === 'object' ? JSON.stringify(v) : String(v);
  return {
    test(label, fn){
      cur = label;
      try { fn(); }
      catch (e){ fail++; console.log(`FAIL: ${label} — threw ${e && e.stack ? e.stack.split('\n').slice(0,3).join(' | ') : e}`); }
    },
    ok(cond, msg){ if (cond) pass++; else { fail++; console.log(`FAIL: ${cur} — ${msg || 'expected truthy'}`); } },
    eq(a, b, msg){
      if (a === b || fmt(a) === fmt(b)) pass++;
      else { fail++; console.log(`FAIL: ${cur} — ${msg || ''} expected ${fmt(b)}, got ${fmt(a)}`); }
    },
    run(){
      console.log(`${name}: ${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    },
  };
}

const t = harness('grimhold');
const HQ = loadGame({});

// A rigged die stream: feed it the values ri() should hand back.
function rig(seq){
  let i = 0;
  HQ.setRng(() => {
    const v = seq[i % seq.length]; i++;
    return v;
  });
}
const ALL_SKULLS = () => rig([0.0]);          // ri(6) === 0 → skull, and pick() → first
const ALL_SHIELDS = () => rig([0.9]);         // ri(6) === 5 → black shield
const NO_SHIELDS = () => rig([0.5]);          // ri(6) === 3 → white shield

function fresh(qi){
  HQ.setRng(Math.random);
  HQ.G = HQ.newG();
  HQ.launchQuest(qi === undefined ? 0 : qi);
  return HQ.G;
}
const hero = (id) => HQ.G.q.actors.find(a => a.kind === 'hero' && a.id === id);
function put(h, x, y){ h.x = x; h.y = y; h.px = x + .5; h.py = y + .5; HQ.recomputeVision(); HQ.refreshField(); }
// make this hero the one the action buttons talk to
function use(h){ HQ.G.q.activeId = h.id; h.acted = false; h.done = false; HQ.refreshField(); return h; }
// clear a square of monsters and furniture so a test can rely on it
function clearSquare(x, y){
  for (const a of HQ.G.q.actors) if (a.kind === 'monster' && a.x === x && a.y === y) a.alive = false;
  HQ.G.q.furn = HQ.G.q.furn.filter(f => !(x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h));
}

/* ------------------------------------------------------------- the board */

t.test('board: rooms, corridors and rock are laid out as one connected map', () => {
  const { W, H, ROOMS, isFloor, roomAt } = HQ;
  t.eq(W, 26); t.eq(H, 19);
  t.eq(ROOMS.length, 13);
  // the border is solid rock all the way round
  for (let x = 0; x < W; x++){ t.ok(!isFloor(x, 0)); t.ok(!isFloor(x, H-1)); }
  for (let y = 0; y < H; y++){ t.ok(!isFloor(0, y)); t.ok(!isFloor(W-1, y)); }
  // no two rooms overlap, and every room square reports its own id
  for (const r of ROOMS)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        t.eq(roomAt(x, y), r.id, `room ${r.id} owns ${x},${y}`);
  // rooms never touch each other — there is always stone or corridor between
  for (const r of ROOMS){
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++){
        const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
        if (inside) continue;
        const o = roomAt(x, y);
        t.ok(o < 0 || o === r.id, `room ${r.id} border square ${x},${y} belongs to room ${o}`);
      }
  }
});

t.test('board: every door slot bridges a room square and a corridor square', () => {
  const { DOOR_SLOTS, ROOMS, roomAt, isFloor } = HQ;
  const perRoom = {};
  for (const [rid, rx, ry, cx, cy] of DOOR_SLOTS){
    t.eq(roomAt(rx, ry), rid, `door of room ${rid} sits in that room`);
    t.ok(isFloor(cx, cy) && roomAt(cx, cy) === -1, `door of room ${rid} opens onto a corridor`);
    t.eq(Math.abs(rx - cx) + Math.abs(ry - cy), 1, 'door squares are neighbours');
    perRoom[rid] = (perRoom[rid] || 0) + 1;
  }
  for (const r of ROOMS) t.ok(perRoom[r.id] >= 2, `room ${r.id} has at least two doors`);
});

t.test('board: with the doors in place every room can be reached from the stair', () => {
  fresh(0);
  const { W, H, idx, STAIRS, linkedIgnoringDoors, ROOMS, roomAt } = HQ;
  const seen = new Set([idx(STAIRS[0][0], STAIRS[0][1])]);
  const q = [STAIRS[0]];
  while (q.length){
    const [x, y] = q.shift();
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const nx = x + dx, ny = y + dy, k = idx(nx, ny);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k)) continue;
      if (!linkedIgnoringDoors(x, y, nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  for (const r of ROOMS) t.ok(seen.has(idx(r.x, r.y)), `room ${r.id} (${r.name}) is reachable`);
  let floors = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (HQ.isFloor(x, y)) floors++;
  t.eq(seen.size, floors, 'every floor square is on the same network');
});

/* ------------------------------------------------------------ quest setup */

t.test('quests: all eleven set up with their boss, their prize and their prisoner', () => {
  for (let i = 0; i < HQ.QUESTS.length; i++){
    fresh(i);
    const q = HQ.QUESTS[i], Q = HQ.G.q;
    t.ok(HQ.monstersOf().length >= 8, `quest ${i} is populated`);
    t.eq(HQ.livingHeroes().length, 4, `quest ${i} starts with four heroes`);
    t.eq(Q.traps.length, q.traps || 0, `quest ${i} lays its traps`);
    const secrets = Object.values(Q.doors).filter(d => d.secret).length;
    t.eq(secrets, q.secrets || 0, `quest ${i} hides ${q.secrets} doors`);
    if (q.objective.type === 'slay' || q.objective.type === 'fetchslay')
      t.ok(HQ.monstersOf().some(m => m.boss), `quest ${i} has a boss on the board`);
    if (q.objective.item)
      t.ok(Q.furn.some(f => f.quest === q.objective.item), `quest ${i} hides ${q.objective.item}`);
    if (q.objective.type === 'collect')
      t.eq(Q.furn.filter(f => f.quest).length, q.objective.count, `quest ${i} places every strongbox`);
    if (q.objective.type === 'rescue'){
      const npc = Q.actors.find(a => a.kind === 'npc');
      t.ok(npc, `quest ${i} places the prisoner`);
      t.eq(HQ.roomAt(npc.x, npc.y), q.objective.room, 'prisoner is in the right room');
    }
    // nothing shares a square with anything else
    const seen = new Set();
    for (const a of HQ.G.q.actors.filter(x => x.alive)){
      const k = a.x + ',' + a.y;
      t.ok(!seen.has(k), `quest ${i}: nothing double-booked at ${k}`);
      seen.add(k);
      t.ok(!HQ.furnAt(a.x, a.y), `quest ${i}: nobody standing inside furniture`);
    }
  }
});

t.test('quests: the same quest always builds the same board', () => {
  fresh(4);
  const a = HQ.G.q.actors.filter(x => x.kind === 'monster').map(m => m.mt + m.x + ',' + m.y).join('|');
  const fa = HQ.G.q.furn.map(f => f.t + f.x + ',' + f.y).join('|');
  fresh(4);
  const b = HQ.G.q.actors.filter(x => x.kind === 'monster').map(m => m.mt + m.x + ',' + m.y).join('|');
  const fb = HQ.G.q.furn.map(f => f.t + f.x + ',' + f.y).join('|');
  t.eq(a, b, 'monsters land in the same squares');
  t.eq(fa, fb, 'furniture lands in the same squares');
});

t.test('art: every room has a floor tone and a litter table of its own', () => {
  t.eq(HQ.ROOM_FLOOR.length, HQ.ROOMS.length, 'one floor palette per room');
  for (const r of HQ.ROOMS){
    const col = HQ.ROOM_FLOOR[r.id];
    t.ok(Array.isArray(col) && col.length === 3, `room ${r.id} has an rgb triple`);
    t.ok(col.every(c => c >= 0 && c <= 255), `room ${r.id}'s tone is in range`);
    const decor = HQ.ROOM_DECOR[r.id];
    t.ok(Array.isArray(decor) && decor.length > 0, `room ${r.id} has litter to scatter`);
  }
  // corridors must not read as any room
  for (const col of HQ.ROOM_FLOOR){
    const d = Math.abs(col[0]-HQ.CORR_FLOOR[0]) + Math.abs(col[1]-HQ.CORR_FLOOR[1]) + Math.abs(col[2]-HQ.CORR_FLOOR[2]);
    t.ok(d >= 18, `room tone ${col.join(',')} is distinguishable from corridor stone`);
  }
});

t.test('art: a dividing wall is drawn on every room-to-corridor edge without a door', () => {
  fresh(0);
  let edges = 0, doors = 0;
  for (let y = 0; y < HQ.H; y++) for (let x = 0; x < HQ.W; x++){
    if (!HQ.isFloor(x, y)) continue;
    for (const [dx, dy] of [[1,0],[0,1]]){
      const nx = x+dx, ny = y+dy;
      if (!HQ.isFloor(nx, ny)) continue;
      const sameRegion = HQ.roomAt(x,y) === HQ.roomAt(nx,ny);
      if (sameRegion) continue;
      // rooms never touch rooms, so this is always a room against a corridor
      if (HQ.doorAt(x, y, nx, ny)) { doors++; continue; }
      edges++;
      t.ok(!HQ.linked(x, y, nx, ny), `no walking across the wall at ${x},${y}`);
    }
  }
  t.ok(edges > 100, `the rooms are walled in (${edges} wall edges)`);
  t.eq(doors, HQ.DOOR_SLOTS.length, 'and every doorway is a gap in that wall');
});

t.test('render: draw() survives every quest with the party on the board', () => {
  for (let i = 0; i < HQ.QUESTS.length; i++){
    fresh(i);
    HQ.update(16); HQ.draw();
    // open a door, wake the dungeon, and draw again with dice and effects up
    const d = Object.values(HQ.G.q.doors)[0];
    HQ.openDoorAt(hero('barbarian'), d);
    for (const m of HQ.monstersOf()) m.awake = true;
    HQ.G.q.traps.forEach(tr => { tr.found = true; });
    HQ.update(16); HQ.draw();
  }
  t.ok(true, 'no render-time errors');
});

/* --------------------------------------------------------- doors and sight */

t.test('doors: a shut door blocks the way and blocks the sight; opening it lights the room', () => {
  fresh(0);
  const h = hero('barbarian');
  const slot = HQ.DOOR_SLOTS.find(s => s[0] === 9);            // the Crypt
  const [rid, rx, ry, cx, cy] = slot;
  const d = HQ.doorAt(rx, ry, cx, cy);
  d.secret = false; d.found = true; d.open = false;
  put(h, cx, cy);
  t.ok(!HQ.linked(cx, cy, rx, ry), 'you cannot step through a shut door');
  t.ok(!HQ.hasLOS(cx, cy, rx, ry), 'you cannot see through a shut door');
  t.ok(!HQ.G.q.roomSeen[rid], 'the room is still dark');
  HQ.openDoorAt(h, d);
  t.ok(d.open, 'the door is open');
  t.ok(HQ.linked(cx, cy, rx, ry), 'now you can step through');
  t.ok(HQ.G.q.roomSeen[rid], 'the whole room is revealed at once');
  for (const [x, y] of HQ.roomTiles(rid)) t.ok(HQ.tileSeen(x, y), `${x},${y} is on the map now`);
});

t.test('doors: a hidden door stays shut until somebody searches for it', () => {
  fresh(1);
  const secret = Object.values(HQ.G.q.doors).find(d => d.secret);
  t.ok(secret, 'quest II hides a door');
  const h = use(hero('dwarf'));
  put(h, secret.cx, secret.cy);
  t.ok(!HQ.doorBetween(h.x, h.y, secret.rx, secret.ry), 'an unfound door is not there yet');
  for (const m of HQ.monstersOf()) m.alive = false;
  HQ.searchTraps();
  t.ok(secret.found, 'searching turns it up');
  t.ok(HQ.doorBetween(h.x, h.y, secret.rx, secret.ry), 'and now it can be opened');
});

t.test('sight: a torch reaches down a corridor but not through stone', () => {
  fresh(0);
  const h = hero('elf');
  put(h, 8, 10);
  t.ok(HQ.hasLOS(8, 10, 8, 14), 'straight down the corridor');
  t.ok(!HQ.hasLOS(8, 10, 3, 10), 'not sideways into the Storeroom through the wall');
  t.ok(!HQ.hasLOS(8, 10, 20, 10), 'not across the whole keep through solid rock');
});

/* -------------------------------------------------------------- movement */

t.test('movement: the roll bounds the walk, and armour slows you down', () => {
  fresh(0);
  const h = hero('barbarian');
  h.rolled = false; h.moveLeft = 0;
  rig([0.0]);                                    // 1+1 on the movement dice
  HQ.beginHeroActivation(h);
  t.eq(h.moveLeft, 2, 'two ones is two squares');
  h.armour = 'plate';
  h.rolled = false;
  rig([0.5]);                                    // 4+4, minus two for plate
  HQ.beginHeroActivation(h);
  t.eq(HQ.moveSlow(h), 2);
  t.eq(h.moveLeft, 6, 'plate costs you two squares');
  h.armour = null;
});

t.test('movement: you walk only where the field says you can, and never through a body', () => {
  fresh(0);
  const h = hero('barbarian');
  put(h, 8, 13);
  h.rolled = true; h.moveLeft = 3;
  HQ.refreshField();
  const f = HQ.G.q.field;
  t.ok(f.d.has(HQ.idx(8, 10)), 'three squares up the corridor is on the field');
  t.ok(!f.d.has(HQ.idx(8, 9)), 'four squares is not');
  const other = hero('dwarf');
  put(other, 8, 12);
  h.moveLeft = 3; use(h);
  t.ok(!HQ.G.q.field.d.has(HQ.idx(8, 12)), 'you may not stand on a companion');
  t.ok(HQ.G.q.field.d.has(HQ.idx(8, 11)), 'but you may squeeze past one');
  const orc = HQ.monstersOf()[0];
  orc.x = 8; orc.y = 12; other.x = 1; other.y = 1;
  use(h); h.moveLeft = 3; HQ.refreshField();
  t.ok(!HQ.G.q.field.d.has(HQ.idx(8, 11)), 'a monster in the corridor stops you dead');
});

t.test('movement: walking spends squares one at a time and drags the prisoner along', () => {
  fresh(1);
  const h = hero('barbarian');
  const npc = HQ.G.q.actors.find(a => a.kind === 'npc');
  put(h, 8, 13);
  npc.x = 8; npc.y = 14; npc.follow = h.id;
  h.rolled = true; h.moveLeft = 3;
  HQ.refreshField();
  HQ.heroWalk(h, HQ.tracePath(HQ.G.q.field, 8, 10));
  t.eq([h.x, h.y].join(), '8,10', 'the hero arrives');
  t.eq(h.moveLeft, 0, 'and has spent the roll');
  t.eq([npc.x, npc.y].join(), '8,11', 'the prisoner follows one square behind');
});

t.test('movement: a hero walking into a shut door opens it and stops there', () => {
  fresh(0);
  const h = hero('barbarian');
  const slot = HQ.DOOR_SLOTS.find(s => s[0] === 9 && s[3] === 8);
  const d = HQ.doorAt(slot[1], slot[2], slot[3], slot[4]);
  d.secret = false; d.found = true; d.open = false;
  clearSquare(slot[1], slot[2]);
  for (const o of HQ.heroes()) if (o !== h) o.x = 1, o.y = 1;
  use(h);
  put(h, slot[3], slot[4] - 2);
  h.rolled = true; h.moveLeft = 6;
  HQ.refreshField();
  HQ.tapTile(slot[1], slot[2]);
  t.ok(d.open, 'the door is open');
  t.eq([h.x, h.y].join(), [slot[3], slot[4]].join(), 'and the hero waits on the threshold');
});

/* ------------------------------------------------------------------ traps */

t.test('traps: every trap lands on a real square', () => {
  for (let i = 0; i < HQ.QUESTS.length; i++){
    fresh(i);
    for (const tr of HQ.G.q.traps){
      t.ok(Number.isInteger(tr.x) && Number.isInteger(tr.y), `quest ${i}: trap has integer coordinates`);
      t.ok(HQ.isFloor(tr.x, tr.y), `quest ${i}: trap at ${tr.x},${tr.y} is on the floor`);
      t.ok(!HQ.furnAt(tr.x, tr.y), `quest ${i}: trap is not under the furniture`);
      t.ok(!HQ.STAIRS.some(s => s[0] === tr.x && s[1] === tr.y), `quest ${i}: no trap on the stair`);
      t.eq(HQ.trapAt(tr.x, tr.y), tr, `quest ${i}: the square knows its trap`);
    }
  }
});

t.test('traps: pit, spear and falling block each bite differently', () => {
  fresh(0);
  const h = hero('barbarian');
  put(h, 8, 13);
  const bp = h.bp;
  const pit = { x:8, y:12, t:'pit', found:true, sprung:false, disarmed:false };
  HQ.G.q.traps.push(pit);
  h.moveLeft = 4;
  HQ.springTrap(h, pit, () => {});
  t.eq(h.bp, bp - 1, 'a pit costs one Body Point');
  t.eq(h.moveLeft, 0, 'and every square you had left');
  t.ok(pit.sprung);

  h.bp = h.bpMax; h.moveLeft = 4;
  const spear = { x:8, y:11, t:'spear', found:true, sprung:false, disarmed:false };
  HQ.G.q.traps.push(spear);
  HQ.springTrap(h, spear, () => {});
  t.eq(h.bp, h.bpMax - 2, 'spears cost two');
  t.eq(h.moveLeft, 4, 'but you keep walking');

  h.bp = h.bpMax;
  const block = { x:8, y:10, t:'block', found:true, sprung:false, disarmed:false };
  HQ.G.q.traps.push(block);
  HQ.springTrap(h, block, () => {});
  t.eq(h.bp, h.bpMax - 3, 'a falling block costs three');
  t.ok(HQ.trapBlocks(8, 10), 'and seals the square for good');
});

t.test('traps: rope saves the fall, the toolkit kills the trap outright', () => {
  fresh(0);
  const h = use(hero('dwarf'));
  put(h, 8, 13);
  h.gear.rope = true; h.moveLeft = 5;
  const pit = { x:8, y:12, t:'pit', found:true, sprung:false, disarmed:false };
  HQ.G.q.traps.push(pit);
  HQ.springTrap(h, pit, () => {});
  t.eq(h.moveLeft, 5, 'with a rope you climb straight back out');
  const tr = { x:8, y:14, t:'spear', found:true, sprung:false, disarmed:false };
  HQ.G.q.traps.push(tr);
  h.acted = false;
  t.eq(HQ.disarmTarget(), tr, 'a found trap beside you is a target');
  HQ.disarmTrap();
  t.ok(tr.disarmed, 'the dwarf takes it apart without a roll');
});

/* ----------------------------------------------------------------- combat */

t.test('combat dice: three skulls, two white shields, one black', () => {
  const faces = [];
  for (let i = 0; i < 6; i++){ rig([i / 6 + 0.01]); faces.push(HQ.combatDie()); }
  t.eq(faces.filter(f => f === HQ.SKULL).length, 3, 'three skulls on the die');
  t.eq(faces.filter(f => f === HQ.WHITE).length, 2, 'two white shields');
  t.eq(faces.filter(f => f === HQ.BLACK).length, 1, 'one black shield');
  t.eq(HQ.countSkulls([HQ.SKULL, HQ.SKULL, HQ.WHITE]), 2);
  t.eq(HQ.countShields([HQ.WHITE, HQ.BLACK, HQ.BLACK], true), 1, 'heroes block on white');
  t.eq(HQ.countShields([HQ.WHITE, HQ.BLACK, HQ.BLACK], false), 2, 'monsters block on black');
});

t.test('combat: skulls the defender cannot shield come off the Body Points', () => {
  fresh(0);
  const h = hero('barbarian');
  const m = HQ.monstersOf()[0];
  m.x = h.x; m.y = h.y - 1; m.bp = m.bpMax = 4; m.def = 2;
  put(h, h.x, h.y);
  HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  h.acted = false;
  t.eq(HQ.attackDice(h, m), 3, 'the broadsword rolls three');
  ALL_SKULLS();
  t.ok(HQ.doAttack(h, m), 'the attack goes in');
  t.eq(m.bp, 1, 'three skulls, no black shields, three Body Points gone');
  t.ok(h.acted, 'and that was the action');
});

t.test('combat: a defender who shields everything takes nothing', () => {
  fresh(0);
  const h = hero('barbarian');
  const m = HQ.monstersOf()[0];
  m.x = h.x; m.y = h.y - 1; m.bp = m.bpMax = 4; m.def = 3;
  HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  h.acted = false;
  ALL_SHIELDS();                                  // every die a black shield
  HQ.doAttack(h, m);
  t.eq(m.bp, 4, 'nothing gets through');
});

t.test('combat: reach — orthogonal by default, diagonal with a spear, ranged with a crossbow', () => {
  fresh(0);
  const h = use(hero('elf'));
  const m = HQ.monstersOf()[0];
  put(h, 11, 8);                                  // inside the Chamber of Chaos
  m.x = 11; m.y = 7; m.alive = true;
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  h.acted = false;
  t.ok(HQ.canStrike(h, m), 'a sword reaches the next square');
  m.x = 12; m.y = 7;
  t.ok(!HQ.canStrike(h, m), 'but not the diagonal');
  h.weapon = 'spear';
  t.ok(HQ.canStrike(h, m), 'a spear does reach the diagonal');
  put(h, 8, 10);
  m.x = 8; m.y = 9;
  h.weapon = 'crossbow';
  m.x = 8; m.y = 5;
  t.ok(HQ.canStrike(h, m), 'a crossbow reaches down the corridor');
  m.x = 8; m.y = 9;
  t.ok(!HQ.canStrike(h, m), 'but not with something breathing on you');
  h.weapon = 'shortsword';
});

t.test('combat: a refused attack says why it was refused', () => {
  fresh(0);
  const h = use(hero('barbarian'));
  put(h, 11, 8);
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1);
  const m = HQ.monstersOf()[0];
  m.x = 11; m.y = 7; m.alive = true; m.name = 'Goblin';
  HQ.recomputeVision(); HQ.refreshField();

  // in reach and unspent: no complaint at all
  t.eq(HQ.strikeBlocker(h, m), null, 'the blow is legal');

  // the reported bug: a spent action was reported as "too far to reach"
  h.acted = true;
  t.eq(HQ.strikeBlocker(h, m), 'acted', 'the blocker is the spent action, not the distance');
  HQ.G.q.log.length = 0;
  HQ.tapTile(m.x, m.y);
  const said = HQ.G.q.log.map(l => l.text).join(' ');
  t.ok(/already taken an action/.test(said), `the message names the action, got: "${said}"`);
  t.ok(!/reach/.test(said), 'and does not blame the distance');

  // genuinely out of reach reads as distance
  h.acted = false; m.x = 15; m.y = 10;
  HQ.recomputeVision();
  t.eq(HQ.strikeBlocker(h, m), 'range', 'now it really is the distance');
  HQ.G.q.log.length = 0;
  h.moveLeft = 0; h.rolled = true;
  HQ.tapTile(m.x, m.y);
  t.ok(/out of reach/.test(HQ.G.q.log.map(l => l.text).join(' ')), 'and says so');

  // a crossbow with something breathing on it is its own reason
  h.acted = false; h.weapon = 'crossbow';
  m.x = 11; m.y = 7;
  HQ.recomputeVision();
  t.eq(HQ.strikeBlocker(h, m), 'crowded', 'the crossbow is jammed up close');
  t.ok(/cannot be fired/.test(HQ.strikeReason(h, m, 'crowded')), 'and the wording says so');
  h.weapon = 'broadsword';
});

t.test('search: a monster that wanders in mid-turn cannot be hit, and says why', () => {
  // exactly the reported sequence: search a room, something turns up, tap it
  fresh(0);
  const h = use(hero('barbarian'));
  const rid = 4;
  const [x, y] = HQ.roomTiles(rid).find(([a, b]) => !HQ.furnAt(a, b) && !HQ.actorAt(a, b));
  put(h, x, y);
  for (const m of HQ.monstersOf()) if (HQ.roomAt(m.x, m.y) === rid) m.alive = false;
  HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  const before = HQ.monstersOf().length;
  HQ.spawnWanderer(h);
  t.eq(HQ.monstersOf().length, before + 1, 'something wandered in');
  h.acted = true;                                     // the search was the action
  const w = HQ.monstersOf()[HQ.monstersOf().length - 1];
  HQ.recomputeVision();
  HQ.G.q.log.length = 0;
  HQ.tapTile(w.x, w.y);
  const said = HQ.G.q.log.map(l => l.text).join(' ');
  t.ok(/already taken an action/.test(said), `told the truth, got: "${said}"`);
  t.eq(w.bp, w.bpMax, 'and no attack went in');
});

t.test('the action bar and the hero cards do not share a class name', () => {
  // `.act` marked both the selected hero card and every action button, so the
  // active card silently inherited button sizing.
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'grimhold', 'index.html'), 'utf8');
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  t.ok(/\.hcard\.act\{/.test(css), 'the selected hero card is still marked');
  t.ok(/\.actbtn\{/.test(css), 'the action buttons have their own class');
  t.ok(!/(^|[^d])\.act\{/m.test(css), 'and nothing styles a bare .act any more');
  t.ok(html.includes("b.className = 'actbtn'"), 'the buttons are built with it');
});

t.test('the HUD repaints itself whenever anything it shows moves', () => {
  fresh(0);
  const h = use(hero('elf'));
  put(h, 11, 8);
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  const a = HQ.hudState();
  t.ok(a.length > 0, 'there is a state to watch');
  t.eq(HQ.hudState(), a, 'and it is stable while nothing happens');

  // casting a spell must move it — this is what left End Turn greyed
  const m = HQ.monstersOf()[0];
  m.x = 11; m.y = 7; m.bp = m.bpMax = 9;
  HQ.recomputeVision();
  HQ.castSpell(h, 'genie', m);
  t.ok(HQ.hudState() !== a, 'the spell changed it');

  // and a kill, whose cleanup timer used to drain with nothing repainting after
  const b = use(hero('barbarian'));
  put(b, 11, 8);
  const c = HQ.hudState();
  m.bp = 1;
  ALL_SKULLS();
  HQ.doAttack(b, m);
  t.ok(!m.alive, 'the monster is down');
  t.eq(HQ.busy(), false, 'and nothing is left pending');
  t.ok(HQ.hudState() !== c, 'the HUD state moved with it');

  // and the frame loop, not a scattered call site, is what keeps it current
  b.acted = !b.acted;
  t.eq(HQ.syncHUD(), true, 'a dirty state wants a repaint');
  t.eq(HQ.syncHUD(), false, 'a clean state does not');
  b.acted = !b.acted;
  HQ.update(16);
  t.eq(HQ.syncHUD(), false, 'one frame of update() is enough to have repainted it');
});

t.test('combat: the Witch Lord shrugs off anything but the Spirit Blade', () => {
  fresh(10);
  const h = hero('barbarian');
  const boss = HQ.monstersOf().find(m => m.spirit);
  t.ok(boss, 'the Witch Lord is on the board');
  boss.x = 12; boss.y = 10; boss.bp = boss.bpMax = 6; boss.def = 0;
  use(h); put(h, 12, 11);
  HQ.G.q.roomSeen.fill(1);
  HQ.G.q.seen.fill(1); HQ.recomputeVision();
  h.acted = false;
  ALL_SKULLS();
  HQ.doAttack(h, boss);
  t.eq(boss.bp, 6, 'steel does nothing');
  h.weapon = 'spirit'; h.acted = false;
  ALL_SKULLS();
  HQ.doAttack(h, boss);
  t.ok(boss.bp < 6, 'the Spirit Blade bites');
});

t.test("combat: Orc's Bane rolls an extra die against greenskins", () => {
  fresh(5);
  const h = hero('barbarian');
  h.weapon = 'orcsbane';
  const orc = { mt:'orc' }, skel = { mt:'skeleton' };
  t.eq(HQ.attackDice(h, orc), 5, 'five dice against an orc');
  t.eq(HQ.attackDice(h, skel), 4, 'four against everything else');
  h.buffs.courage = 1;
  t.eq(HQ.attackDice(h, skel), 6, 'courage is worth two more');
  delete h.buffs.courage;
});

t.test('defence: armour, helm and shield all add dice; rock skin adds two more', () => {
  fresh(0);
  const h = hero('dwarf');
  t.eq(HQ.defendDice(h), 2, 'bare bones is two');
  h.armour = 'chain';
  h.gear.helmet = true; h.gear.shield = true;
  t.eq(HQ.defendDice(h), 6, 'chain, helm and shield');
  h.buffs.rockskin = 1;
  t.eq(HQ.defendDice(h), 8, 'and rock skin on top');
  h.buffs = {}; h.armour = null; h.gear = {};
});

t.test('combat: a hero at zero Body Points is out of the quest', () => {
  fresh(0);
  const h = hero('wizard');
  HQ.hurt(h, 99, null);
  t.ok(!h.alive, 'the wizard is down');
  t.ok(h.done, 'and takes no more turns');
  t.eq(HQ.livingHeroes().length, 3);
});

t.test('combat: killing the last hero ends the quest', () => {
  fresh(0);
  for (const h of HQ.livingHeroes().slice()) HQ.hurt(h, 99, null);
  t.eq(HQ.G.q.over, 2, 'the quest is lost');
});

/* ----------------------------------------------------------------- spells */

t.test('spells: each hero knows their elements, and each spell fires once', () => {
  fresh(0);
  const w = hero('wizard'), e = hero('elf'), b = hero('barbarian');
  t.eq(HQ.knownSpells(w).length, 9, 'the wizard holds three elements');
  t.eq(HQ.knownSpells(e).length, 3, 'the elf holds one');
  t.eq(HQ.knownSpells(b).length, 0, 'the barbarian holds none');
  w.bp = 1; w.acted = false;
  t.ok(HQ.castSpell(w, 'healbody', w), 'heal body goes off');
  t.eq(w.bp, 4, 'four Body Points back, capped at the maximum');
  w.acted = false;
  t.ok(!HQ.spellReady(w, 'healbody'), 'it is spent for the quest');
  t.ok(!HQ.castSpell(w, 'healbody', w), 'and cannot be cast again');
});

t.test('spells: every spell in the book can be cast and drawn without killing the frame', () => {
  // The particles a spell throws off carry colours built at runtime. A bad one
  // used to throw inside draw() and freeze the board mid-cast.
  for (const key in HQ.SPELLS){
    fresh(0);
    const sp = HQ.SPELLS[key];
    const caster = HQ.heroes().find(h => HQ.knownSpells(h).includes(key));
    t.ok(caster, `${key} is in somebody's book`);
    if (!caster) continue;
    use(caster);
    put(caster, 11, 8);
    HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1);
    const m = HQ.monstersOf()[0];
    m.x = 11; m.y = 7; m.alive = true; m.mind = 2;
    HQ.recomputeVision();
    const target = sp.target === 'enemy' ? m
                 : sp.target === 'tile' ? { tile:[12, 8] }
                 : caster;
    t.ok(HQ.castSpell(caster, key, target), `${key} goes off`);
    HQ.update(16); HQ.draw();          // the frame the particles are alive for
    HQ.update(16); HQ.draw();
  }
});

t.test('spells: ball of flame ignores defence, sleep only takes a weak mind', () => {
  fresh(0);
  const w = hero('wizard');
  const m = HQ.monstersOf()[0];
  m.x = w.x; m.y = w.y - 2; m.bp = m.bpMax = 5; m.def = 6; m.mind = 2;
  HQ.G.q.seen.fill(1); HQ.recomputeVision();
  w.acted = false;
  ALL_SKULLS();
  HQ.castSpell(w, 'ballflame', m);
  t.eq(m.bp, 2, 'three skulls land in full despite six defend dice');
  w.acted = false;
  HQ.castSpell(w, 'sleep', m);
  t.eq(m.sleep, 1, 'a two-Mind monster goes to sleep');
  const tough = HQ.monstersOf()[1];
  tough.mind = 5; w.acted = false;
  HQ.castSpell(w, 'sleep', tough);
  t.eq(tough.sleep, 0, 'a strong mind shrugs it off');
});

t.test('spells: the elf can halt a room with a tempest, and hurry a friend with wind', () => {
  fresh(0);
  const e = hero('elf');
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1);
  for (const m of HQ.monstersOf().slice(0, 3)){ m.x = e.x; m.y = e.y; }
  HQ.recomputeVision();
  e.acted = false;
  HQ.castSpell(e, 'tempest', e);
  t.ok(HQ.monstersOf().some(m => m.stun === 1), 'the visible monsters lose their turn');
  const b = hero('barbarian');
  b.moveLeft = 2; e.acted = false;
  HQ.castSpell(e, 'swiftwind', b);
  t.eq(b.moveLeft, 8, 'six more squares for the barbarian');
});

t.test('spells: a sleeping monster wakes the moment it is struck', () => {
  fresh(0);
  const h = hero('barbarian');
  const m = HQ.monstersOf()[0];
  m.x = h.x; m.y = h.y - 1; m.bp = m.bpMax = 4; m.def = 0; m.sleep = 1;
  HQ.G.q.seen.fill(1); HQ.recomputeVision();
  h.acted = false;
  ALL_SKULLS();
  HQ.doAttack(h, m);
  t.eq(m.sleep, 0, 'the blow wakes it');
});

/* -------------------------------------------------------------- searching */

t.test('search: a room is ransacked once, and never with a monster watching', () => {
  fresh(0);
  const h = hero('barbarian');
  const rid = 4;                                       // Guard Room
  const [x, y] = HQ.roomTiles(rid).find(([a, b]) => !HQ.furnAt(a, b) && !HQ.actorAt(a, b));
  use(h); put(h, x, y);
  HQ.searchTreasure();
  t.ok(!HQ.G.q.searched[rid], 'not with the guards still in the room');
  for (const m of HQ.monstersOf()) if (HQ.roomAt(m.x, m.y) === rid) m.alive = false;
  h.acted = false;
  HQ.searchTreasure();
  t.ok(HQ.G.q.searched[rid], 'now the room gives up its secrets');
  t.ok(h.acted, 'searching is the action');
  h.acted = false;
  const goldBefore = HQ.G.q.pot || 0;
  HQ.searchTreasure();
  t.eq(HQ.G.q.pot || 0, goldBefore, 'a picked-over room gives nothing more');
});

t.test('search: the treasure deck pays, poisons and sometimes answers back', () => {
  fresh(0);
  const h = hero('barbarian');
  HQ.G.q.pot = 0;
  HQ.applyTreasure({ k:'gold', n:100, t:'A heavy purse', d:'' }, h);
  t.eq(HQ.G.q.pot, 100, 'coin goes into the pot, not the treasury');
  t.eq(HQ.G.camp.gold, 300, 'the treasury is untouched until you climb out');
  HQ.applyTreasure({ k:'item', n:'potion', t:'Potion', d:'' }, h);
  t.eq(h.items.potion, 1, 'the potion goes in the pack');
  const bp = h.bp;
  HQ.applyTreasure({ k:'hazard', n:1, t:'Poison', d:'' }, h);
  t.eq(h.bp, bp - 1, 'poison bites');
  const n = HQ.monstersOf().length;
  put(h, 8, 10);
  HQ.applyTreasure({ k:'wander', t:'Wandering Monster', d:'' }, h);
  t.eq(HQ.monstersOf().length, n + 1, 'something wanders in');
  const w = HQ.monstersOf()[HQ.monstersOf().length - 1];
  t.ok(Math.abs(w.x - h.x) <= 1 && Math.abs(w.y - h.y) <= 1, 'and arrives right beside you');
});

t.test('search: hunting for traps turns up traps and hidden doors together', () => {
  fresh(7);
  const h = use(hero('dwarf'));
  const tr = HQ.G.q.traps[0];
  put(h, tr.x, tr.y);
  for (const m of HQ.monstersOf()) m.alive = false;
  HQ.searchTraps();
  t.ok(tr.found, 'the trap under your boots turns up');
});

t.test('search: the potion in the pack heals four and is gone', () => {
  fresh(0);
  const h = use(hero('barbarian'));
  h.items.potion = 1; h.bp = 2;
  HQ.quaffPotion();
  t.eq(h.bp, 6, 'four Body Points back');
  t.eq(h.items.potion, 0, 'the flask is empty');
});

t.test('search: holy water only answers the undead', () => {
  fresh(6);
  const h = hero('barbarian');
  HQ.G.q.activeId = h.id;
  h.items.holy = 1; h.acted = false;
  const live = HQ.monstersOf().find(m => !HQ.MONSTERS[m.mt].undead);
  t.ok(!HQ.useHolyWater(live), 'it does nothing to the living');
  const dead = HQ.monstersOf().find(m => HQ.MONSTERS[m.mt].undead);
  dead.bp = dead.bpMax = 4;
  ALL_SKULLS();
  t.ok(HQ.useHolyWater(dead), 'but it burns the walking dead');
  t.eq(dead.bp, 1, 'three dice, three skulls, no save');
});

/* ------------------------------------------------------------ the Warlock */

t.test("the Warlock: a woken monster closes the distance and swings", () => {
  fresh(0);
  const h = hero('barbarian');
  put(h, 8, 10);
  for (const m of HQ.monstersOf()) m.alive = false;
  const m = HQ.monstersOf.call(null) && HQ.G.q.actors.find(a => a.kind === 'monster');
  m.alive = true; m.awake = true; m.x = 8; m.y = 6; m.mv = 6; m.atk = 3;
  m.sleep = 0; m.stun = 0;
  HQ.G.q.seen.fill(1); HQ.recomputeVision();
  const bp = h.bp;
  ALL_SKULLS();
  HQ.monsterAct(m, () => {});
  t.eq(Math.abs(m.x - h.x) + Math.abs(m.y - h.y), 1, 'it walks up to the hero');
  t.ok(h.bp < bp, 'and hits');
});

t.test('the Warlock: a sleeping or stunned monster does nothing at all', () => {
  fresh(0);
  const h = hero('barbarian');
  put(h, 8, 10);
  const m = HQ.G.q.actors.find(a => a.kind === 'monster');
  m.awake = true; m.x = 8; m.y = 9; m.sleep = 1;
  const bp = h.bp;
  HQ.monsterAct(m, () => {});
  t.eq(h.bp, bp, 'the sleeper sleeps on');
  m.sleep = 0; m.stun = 1;
  HQ.monsterAct(m, () => {});
  t.eq(h.bp, bp, 'the stunned one loses the turn');
  t.eq(m.stun, 0, 'and shakes it off for next time');
});

t.test('the Warlock: the turn passes back to the heroes with fresh rolls', () => {
  fresh(0);
  for (const h of HQ.heroes()){ h.done = true; h.acted = true; h.rolled = true; h.moveLeft = 3; }
  const turn = HQ.G.q.turn;
  HQ.zargonTurn();
  t.eq(HQ.G.q.turn, turn + 1, 'the turn counter moves');
  t.eq(HQ.G.q.phase, 'hero', 'and it is the heroes again');
  const active = HQ.activeHero();
  t.ok(active && active.rolled, 'the first hero has rolled their movement');
  t.ok(HQ.heroes().every(h => !h.acted), 'everyone has their action back');
});

t.test('the Warlock: running out of turns loses a timed quest', () => {
  fresh(8);                                            // Race Against Time
  const limit = HQ.QUESTS[8].turnLimit;
  t.ok(limit >= 20 && limit <= 40, 'the clock is set');
  HQ.G.q.turn = limit;
  for (const h of HQ.heroes()) h.done = true;
  HQ.zargonTurn();
  t.eq(HQ.G.q.over, 2, 'the working completes without you');
});

/* -------------------------------------------------------------- objectives */

t.test('objectives: slaying the boss finishes a slay quest on the spot', () => {
  fresh(0);
  const boss = HQ.monstersOf().find(m => m.boss);
  t.ok(!HQ.objectiveReady(), 'not yet');
  HQ.hurt(boss, 99, null);
  t.ok(HQ.G.q.bossDead, 'Verag is down');
  t.eq(HQ.G.q.over, 1, 'and the quest is won');
});

t.test('quests: a boss stands at the back of his hall, not in the doorway', () => {
  for (let i = 0; i < HQ.QUESTS.length; i++){
    fresh(i);
    const boss = HQ.monstersOf().find(m => m.boss);
    if (!boss) continue;
    const rid = HQ.roomAt(boss.x, boss.y);
    const near = (x, y) => Math.min(...HQ.STAIRS.map(s => Math.abs(s[0]-x) + Math.abs(s[1]-y)));
    const bossD = near(boss.x, boss.y);
    for (const [x, y] of HQ.roomTiles(rid)){
      if (HQ.furnAt(x, y)) continue;
      t.ok(near(x, y) <= bossD, `quest ${i}: no square of the boss room is further from the stair`);
    }
  }
});

t.test('objectives: a fetch quest wants the prize carried back up the stair', () => {
  fresh(4);                                            // Melar's Maze
  const h = hero('elf');
  put(h, 10, 3);                                   // off in the Scriptorium
  HQ.giveQuestItem("Melar's Tome", h);
  t.ok(HQ.objectiveReady(), 'the tome is in hand');
  t.ok(HQ.needsEscape(), 'but the quest is not over');
  t.eq(HQ.G.q.carrier, 'elf', 'the elf is carrying it');
  t.ok(!HQ.G.q.over, 'and the others waiting on the stair do not count');
  put(h, HQ.STAIRS[0][0], HQ.STAIRS[0][1]);
  HQ.checkQuestState();
  t.eq(HQ.G.q.over, 1, 'up the stair and out');
});

t.test('objectives: a collect quest counts every strongbox', () => {
  fresh(3);                                            // Prince Magnus' Gold
  const h = hero('dwarf');
  HQ.giveQuestItem('Strongbox', h);
  HQ.giveQuestItem('Strongbox', h);
  t.ok(!HQ.objectiveReady(), 'two of three is not enough');
  HQ.giveQuestItem('Strongbox', h);
  t.ok(HQ.objectiveReady(), 'three of three');
});

t.test('rescue: the prisoner you are escorting never seals you in', () => {
  // Reported: freed the prisoner in a one-wide corridor, and could not get
  // back past them. The way out must never be blocked by the person you came
  // down here to save.
  fresh(1);
  const h = use(hero('barbarian'));
  const npc = HQ.G.q.actors.find(a => a.kind === 'npc');
  for (const o of HQ.heroes()) if (o !== h){ o.x = 1; o.y = 1; }
  put(h, 8, 12);
  npc.x = 8; npc.y = 13; npc.follow = h.id;
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  h.rolled = true; h.moveLeft = 5;
  HQ.refreshField();

  t.ok(HQ.bodyPassable(h, npc), 'a hero may squeeze past the prisoner');
  t.ok(!HQ.bodyPassable(HQ.monstersOf()[0], npc), 'a monster may not');
  t.ok(!HQ.G.q.field.d.has(HQ.idx(8, 13)), 'you still cannot stand on them');
  t.ok(HQ.G.q.field.d.has(HQ.idx(8, 14)), 'but the square beyond them is reachable');
  t.ok(HQ.G.q.field.d.has(HQ.idx(8, 15)), 'and so is the one after that');

  HQ.tapTile(8, 15);
  t.eq([h.x, h.y].join(), '8,15', 'the hero walks out past them');
  t.eq([npc.x, npc.y].join(), '8,14', 'and the prisoner ends up right behind, not left behind');

  // and all the way to the stair, which is what the quest actually needs
  h.rolled = true; h.moveLeft = 4; HQ.refreshField();
  HQ.G.q.npcFreed = true; HQ.G.q.carrier = h.id;
  HQ.tapTile(HQ.STAIRS[0][0], HQ.STAIRS[0][1]);
  t.ok(HQ.onStairs(h), 'and reaches the stair');
  t.eq(HQ.G.q.over, 1, 'which finishes the rescue');
});

t.test('rescue: a hero is never left with nowhere to go because of a friendly', () => {
  fresh(1);
  const h = use(hero('barbarian'));
  const npc = HQ.G.q.actors.find(a => a.kind === 'npc');
  const others = HQ.heroes().filter(o => o !== h);
  // the worst case: dead end, prisoner behind you, companions behind them
  put(h, 8, 17);
  npc.x = 8; npc.y = 16; npc.follow = h.id;
  others[0].x = 8; others[0].y = 15;
  others[1].x = 8; others[1].y = 14;
  others[2].x = 1; others[2].y = 1;
  HQ.G.q.seen.fill(1); HQ.recomputeVision();
  h.rolled = true; h.moveLeft = 6;
  HQ.refreshField();
  const reach = [...HQ.G.q.field.d.entries()].filter(([, c]) => c > 0);
  t.ok(reach.length > 0, 'there is somewhere to go');
  t.ok(HQ.G.q.field.d.has(HQ.idx(8, 13)), 'straight up the corridor past all of them');
});

t.test('objectives: a rescue needs the prisoner freed and the stair reached', () => {
  fresh(1);
  const h = hero('barbarian');
  const npc = HQ.G.q.actors.find(a => a.kind === 'npc');
  clearSquare(npc.x, npc.y + 1);
  use(h); put(h, npc.x, npc.y + 1);
  h.rolled = true; h.moveLeft = 2;
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  HQ.tapTile(npc.x, npc.y);
  t.ok(HQ.G.q.npcFreed, 'Sir Ragnar is loose');
  t.eq(npc.follow, h.id, 'and follows the hero who cut him free');
  t.ok(!HQ.G.q.over, 'the stair is still a walk away');
  put(h, HQ.STAIRS[1][0], HQ.STAIRS[1][1]);
  HQ.checkQuestState();
  t.eq(HQ.G.q.over, 1, 'both of you get out');
});

t.test('objectives: the last quest wants the blade first and the Witch Lord second', () => {
  fresh(10);
  const h = hero('barbarian');
  const boss = HQ.monstersOf().find(m => m.boss);
  HQ.hurt(boss, 99, null);
  t.ok(!HQ.objectiveReady(), 'a dead Witch Lord alone is not the quest');
  HQ.giveQuestItem('Spirit Blade', h);
  t.ok(HQ.objectiveReady(), 'blade and body together');
  t.eq(h.weapon, 'spirit', 'and the finder wields it');
});

t.test('objectives: finishing a quest pays out, unlocks the next and mends the party', () => {
  fresh(0);
  HQ.G.camp.gold = 0;
  HQ.G.q.pot = 130;
  const h = hero('wizard');
  HQ.hurt(h, 99, null);
  const boss = HQ.monstersOf().find(m => m.boss);
  const bounty = HQ.MONSTERS[boss.mt].gold;
  HQ.hurt(boss, 99, null);
  t.eq(HQ.G.q.over, 1);
  t.eq(HQ.G.camp.gold, 130 + bounty + HQ.QUESTS[0].reward, 'pot, bounty and the Empire’s reward');
  t.ok(HQ.G.camp.done.includes(0), 'the quest is marked done');
  t.eq(HQ.G.camp.unlocked, 2, 'quest II opens up');
  t.ok(HQ.G.camp.heroes.every(x => x.alive && x.bp === x.bpMax), 'everyone is on their feet again');
});

t.test('objectives: a failed quest still pays half the pot, and unlocks nothing', () => {
  fresh(0);
  HQ.G.camp.gold = 0;
  HQ.G.q.pot = 200;
  for (const h of HQ.livingHeroes().slice()) HQ.hurt(h, 99, null);
  t.eq(HQ.G.q.over, 2);
  t.eq(HQ.G.camp.gold, 100, 'half of what you were carrying gets out');
  t.eq(HQ.G.camp.unlocked, 1, 'and no new quest');
});

t.test('objectives: quest weapons stay only when the quest says so', () => {
  fresh(5);                                            // Legacy — keeps Orc's Bane
  const h = hero('barbarian');
  HQ.giveQuestItem("Orc's Bane", h);
  const boss = HQ.monstersOf().find(m => m.boss);
  HQ.hurt(boss, 99, null);
  t.eq(HQ.G.q.over, 1);
  t.eq(HQ.G.camp.heroes.find(x => x.id === 'barbarian').weapon, 'orcsbane', 'the bane is kept');

  fresh(9);                                            // no keepItem on this one
  const e = hero('elf');
  const before = e.weapon;
  HQ.giveQuestItem('Spirit Blade', e);
  t.eq(e.weapon, 'spirit');
  HQ.questOver(true);
  t.eq(HQ.G.camp.heroes.find(x => x.id === 'elf').weapon, before, 'and handed back afterwards');
});

/* --------------------------------------------------------------- armoury */

t.test('armoury: buying spends the gold and equips the hero', () => {
  fresh(0);
  HQ.G.camp.gold = 1000;
  HQ.shopHero = 0;
  t.ok(HQ.buy('battleaxe'), 'the barbarian takes the battle axe');
  t.eq(HQ.G.camp.gold, 650);
  t.eq(HQ.G.camp.heroes[0].weapon, 'battleaxe');
  t.ok(!HQ.buy('shield'), 'no shield with both hands on the axe');
  t.ok(HQ.buy('helmet'), 'a helmet is fine');
  t.eq(HQ.defendDice(HQ.G.camp.heroes[0]), 3, 'helmet is one more defend die');
  HQ.G.camp.gold = 10;
  t.ok(!HQ.buy('chain'), 'and you cannot buy what you cannot afford');
});

t.test('armoury: the wizard wears robes and carries a dagger, whatever the gold says', () => {
  fresh(0);
  HQ.G.camp.gold = 5000;
  HQ.shopHero = 3;
  t.ok(!HQ.buy('broadsword'), 'no broadsword for the wizard');
  t.ok(!HQ.buy('plate'), 'and no plate mail');
  t.ok(HQ.buy('potion'), 'potions are allowed');
  t.eq(HQ.G.camp.heroes[3].items.potion, 1);
  HQ.shopHero = 0;
});

/* ------------------------------------------------------------ save + load */

t.test('save: the campaign survives a round trip through storage', () => {
  const store = {};
  const A = loadGame(store);
  A.G = A.newG();
  A.G.camp.gold = 777;
  A.G.camp.done = [0, 1];
  A.G.camp.unlocked = 3;
  A.G.camp.heroes[0].weapon = 'battleaxe';
  A.G.camp.heroes[1].armour = 'chain';
  A.G.camp.heroes[2].items.potion = 2;
  A.saveCampaign();
  const B = loadGame(store);
  const c = B.loadCampaign();
  t.eq(c.gold, 777);
  t.eq(c.done.join(), '0,1');
  t.eq(c.unlocked, 3);
  t.eq(c.heroes[0].weapon, 'battleaxe');
  t.eq(c.heroes[1].armour, 'chain');
  t.eq(c.heroes[2].items.potion, 2);
});

t.test('save: a quest in progress can be picked up again exactly where it was', () => {
  const store = {};
  const A = loadGame(store);
  A.G = A.newG();
  A.launchQuest(2);
  const h = A.G.q.actors.find(x => x.kind === 'hero' && x.id === 'dwarf');
  h.x = 8; h.y = 10; h.bp = 3; h.acted = true;
  A.G.q.turn = 7;
  A.G.q.pot = 260;
  const door = Object.values(A.G.q.doors)[3];
  door.open = true;
  A.monstersOf()[0].bp = 1;
  A.G.q.seen[A.idx(12, 12)] = 1;
  A.saveRun();
  t.ok(A.hasRun(), 'there is a run to come back to');

  const B = loadGame(store);
  B.G = B.newG();
  t.ok(B.resumeRun(), 'the run loads');
  t.eq(B.G.q.qi, 2, 'the same quest');
  t.eq(B.G.q.turn, 7, 'on the same turn');
  t.eq(B.G.q.pot, 260, 'with the same pot');
  const h2 = B.G.q.actors.find(x => x.kind === 'hero' && x.id === 'dwarf');
  t.eq([h2.x, h2.y].join(), '8,10', 'the dwarf is where we left him');
  t.eq(h2.bp, 3, 'as hurt as we left him');
  t.ok(h2.acted, 'and has already acted');
  t.eq(B.G.camp.heroes.find(x => x.id === 'dwarf'), h2, 'the roster and the board share one object');
  t.eq(Object.values(B.G.q.doors)[3].open, true, 'the door we opened is still open');
  t.eq(B.monstersOf()[0].bp, 1, 'the monster we wounded is still wounded');
  t.ok(B.G.q.seen[B.idx(12, 12)], 'the map we drew is still drawn');
  B.update(16); B.draw();
  B.clearRun();
  t.ok(!B.hasRun(), 'abandoning clears the slot');
});

t.test('save: a corrupt or missing save falls back to a fresh campaign', () => {
  const store = { grimhold_camp_v1: '{{{not json', grimhold_run_v1: 'nonsense' };
  const A = loadGame(store);
  const c = A.loadCampaign();
  t.eq(c.gold, 300, 'a new party starts with 300 gold');
  t.eq(c.heroes.length, 4);
  A.G = A.newG();
  t.ok(!A.resumeRun(), 'a broken run does not resume');
});

/* ------------------------------------------------------------ a whole run */

t.test('the party lines up on the stair with the barbarian in front', () => {
  fresh(0);
  const order = HQ.heroes().slice().sort((a,b) => a.y - b.y).map(h => h.id);
  t.eq(order.join(), 'barbarian,dwarf,elf,wizard', 'the barbarian leads, the wizard brings up the rear');
  const first = HQ.activeHero();
  t.eq(first.id, 'barbarian', 'and the one who acts first is the one in front');
  t.ok(HQ.G.q.field.d.size > 1, 'who has somewhere to walk to');
  for (const h of HQ.heroes()) t.ok(HQ.STAIRS.some(s => s[0] === h.x && s[1] === h.y), `${h.id} starts on the stair`);
});

t.test('a full quest can be played from the stair to the boss', () => {
  fresh(0);
  const G = HQ.G;
  t.eq(G.q.phase, 'hero');
  t.ok(HQ.activeHero(), 'somebody is up');
  // walk the party out of the stairwell, opening what is in the way
  const b = hero('barbarian');
  use(b);
  b.rolled = true; b.moveLeft = 12;
  HQ.refreshField();
  HQ.tapTile(8, 12);
  t.ok(b.y < 14, 'the barbarian squeezes past the party and up the corridor');
  HQ.endHeroTurn();
  t.ok(b.done, 'and passes the turn on');
  // run the rest of the party through, then let the Warlock move
  for (let i = 0; i < 3; i++) HQ.endHeroTurn();    // the other three, then the Warlock
  t.eq(HQ.G.q.turn, 2, 'a full round has passed');
  t.ok(!HQ.G.q.over, 'and the quest is still on');
  HQ.update(16); HQ.draw();
});

/* ------------------------------------------------------------ the Descent */

function runFresh(party){
  HQ.setRng(Math.random);
  HQ.G = HQ.newG();
  HQ.startRun(party || ['barbarian','dwarf','elf','wizard']);
  return HQ.G;
}
const rhero = (id) => HQ.G.run.heroes.find(h => h.id === id);

t.test('descent: a floor is generated whole and legal at every depth', () => {
  const seenObj = {}, seenMon = {};
  for (let depth = 1; depth <= 16; depth++){
    const def = HQ.makeFloor(depth, (() => { let a = depth*7919 + 13; return () => {
      a = (a*1664525 + 1013904223) >>> 0; return a/4294967296; }; })());
    t.ok(typeof def.name === 'string' && def.name.length > 4, `depth ${depth} is named`);
    t.eq(def.depth, depth, 'and knows its depth');
    seenObj[def.objective.type] = 1;
    t.ok(['slay','clear','fetch','collect','rescue'].includes(def.objective.type),
         `depth ${depth} objective ${def.objective.type} is one we can resolve`);
    t.ok(def.objective.label && def.objective.label.length > 8, 'and is described');
    t.ok(def.monsters.length > 0, `depth ${depth} is garrisoned`);
    for (const m of def.monsters){
      t.ok(HQ.MONSTERS[m.t], `depth ${depth} spawns a real monster (${m.t})`);
      t.ok(m.r >= 0 && m.r < HQ.ROOMS.length, 'in a real room');
      t.ok(m.n >= 1, 'in a real number');
      seenMon[m.t] = 1;
      const entry = HQ.SPAWN_TABLE.find(e => e.t === m.t);
      if (entry && !m.boss) t.ok(entry.from <= depth, `${m.t} is not spawned above its depth`);
    }
    if (def.objective.type === 'slay')
      t.ok(def.monsters.some(m => m.boss), `depth ${depth} has something in charge`);
    if (def.objective.type === 'fetch')
      t.ok(def.furn.some(f => f.quest === def.objective.item), 'the prize is hidden somewhere');
    if (def.objective.type === 'collect')
      t.eq(def.furn.filter(f => f.quest).length, def.objective.count, 'every reliquary is placed');
    if (def.objective.type === 'rescue')
      t.ok(def.objective.room >= 0 && def.objective.room < HQ.ROOMS.length, 'the prisoner has a cell');
    t.ok(def.traps >= 2 && def.traps <= 14, `depth ${depth} trap count is sane (${def.traps})`);
    t.ok(def.secrets >= 1 && def.secrets <= 2, 'and its hidden doors');
    for (const m of def.mods) t.ok(HQ.MODIFIERS.some(x => x.id === m), `modifier ${m} is real`);
    t.ok(def.mods.length <= 2, 'no more than two modifiers on a floor');
    if (depth % 5 === 0) t.eq(def.objective.type, 'slay', `depth ${depth} is a boss floor`);
  }
  t.ok(Object.keys(seenObj).length >= 3, 'the objectives vary with depth');
  t.ok(Object.keys(seenMon).length >= 5, 'and so does what lives down there');
});

t.test('descent: depth decides what can live there, and how much of it', () => {
  const roll = (seed) => { let a = seed; return () => { a = (a*1664525 + 1013904223) >>> 0; return a/4294967296; }; };
  const weight = (def) => def.monsters.reduce((n, m) => {
    const e = HQ.SPAWN_TABLE.find(x => x.t === m.t);
    return n + (e ? e.cost : 4)*m.n;
  }, 0);
  const shallow = HQ.makeFloor(1, roll(11));
  const deep = HQ.makeFloor(12, roll(11));
  t.ok(weight(deep) > weight(shallow)*2, `depth 12 is much heavier than depth 1 (${weight(shallow)} → ${weight(deep)})`);
  for (let i = 0; i < 20; i++){
    const d1 = HQ.makeFloor(1, roll(100 + i));
    t.ok(!d1.monsters.some(m => !m.boss && ['ogre','gargoyle','sorcerer','mummy','chaos'].includes(m.t)),
         'nothing from the deep turns up on the first floor');
  }
});

t.test('descent: the same seed builds the same floor', () => {
  const roll = () => { let a = 777; return () => { a = (a*1664525 + 1013904223) >>> 0; return a/4294967296; }; };
  const a = JSON.stringify(HQ.makeFloor(6, roll()));
  const b = JSON.stringify(HQ.makeFloor(6, roll()));
  t.eq(a, b, 'floor generation is deterministic');
});

t.test('descent: you take only the heroes you chose', () => {
  runFresh(['barbarian','elf']);
  t.eq(HQ.G.run.heroes.length, 2, 'a party of two');
  t.eq(HQ.partyHeroes().length, 2, 'and that is the roster in play');
  t.eq(HQ.livingHeroes().length, 2, 'both on the board');
  t.ok(!HQ.G.q.actors.some(a => a.kind === 'hero' && a.id === 'wizard'), 'nobody else came along');
  t.ok(HQ.G.run.heroes.every(h => h !== HQ.G.camp.heroes.find(c => c.id === h.id)),
       'and the run roster is its own, so the campaign is untouched');
});

t.test('descent: a fallen hero is gone for the whole run', () => {
  runFresh();
  const w = rhero('wizard');
  HQ.hurt(w, 99, null);
  t.ok(!w.alive, 'the wizard is down');
  // clear the floor and go down
  HQ.G.q.pot = 100;
  HQ.questOver(true);
  t.eq(HQ.G.run.floorsCleared, 1, 'the floor counted');
  t.ok(HQ.G.run.gold >= 100, 'and paid');
  HQ.G.run.depth++;
  HQ.beginFloor();
  t.eq(HQ.G.run.depth, 2, 'a floor deeper');
  t.ok(!rhero('wizard').alive, 'and the wizard is still dead');
  t.eq(HQ.livingHeroes().length, 3, 'three walk onto the new floor');
  t.ok(HQ.livingHeroes().every(h => h.bp > 0), 'and they got a breather between floors');
});

t.test('descent: losing everybody ends the run and pays favour', () => {
  runFresh(['barbarian','elf']);
  HQ.G.run.depth = 4;
  HQ.G.run.gold = 900;
  const before = HQ.G.meta.favour;
  for (const h of HQ.runAlive().slice()) HQ.hurt(h, 99, null);
  t.eq(HQ.runAlive().length, 0, 'the party is gone');
  t.ok(HQ.G.run.over, 'the run is over');
  t.ok(HQ.G.meta.favour > before, `favour was earned (${before} → ${HQ.G.meta.favour})`);
  t.ok(HQ.G.meta.best >= 4, 'and the depth was recorded');
});

t.test('descent: boons are drafted once and actually bite', () => {
  runFresh();
  const h = rhero('barbarian');
  const orc = { mt:'orc', bp:3 }, skel = { mt:'skeleton', bp:3 };
  const base = HQ.attackDice(h, orc);
  t.ok(HQ.takeBoon('banegreen'), "Greenskin's Bane taken");
  t.eq(HQ.attackDice(h, orc), base + 1, 'and it sharpens the blow against orcs');
  t.eq(HQ.attackDice(h, skel), base, 'but not against bones');
  t.ok(HQ.takeBoon('keeneye'), 'consecrated steel taken');
  t.eq(HQ.attackDice(h, skel), base + 1, 'which does bite the undead');
  t.ok(!HQ.takeBoon('keeneye'), 'a boon is never taken twice');

  const d = HQ.defendDice(h);
  HQ.takeBoon('ironskin');
  t.eq(HQ.defendDice(h), d + 1, 'iron skin is a defend die');

  const bpMax = h.bpMax;
  HQ.takeBoon('stoutheart');
  t.eq(h.bpMax, bpMax + 1, 'stout heart raises the ceiling');
  HQ.takeBoon('bloodprice');
  t.eq(h.bpMax, bpMax, 'and the blood price takes it back');
  t.eq(HQ.attackDice(h, skel), base + 1 + 2, 'in exchange for two dice');

  const r = HQ.torchRadius();
  HQ.takeBoon('torchbearer');
  t.eq(HQ.torchRadius(), r + 3, 'the torch reaches further');
});

t.test('descent: the draft never offers what you already hold', () => {
  runFresh();
  for (let i = 0; i < 6; i++){
    const opts = HQ.draftOptions();
    t.ok(opts.length >= 1, 'there is something to draft');
    for (const o of opts) t.ok(!HQ.G.run.boons.includes(o.id), `${o.id} is not already held`);
    t.eq(new Set(opts.map(o => o.id)).size, opts.length, 'and no duplicates in one draft');
    HQ.takeBoon(opts[0].id);
  }
  t.eq(HQ.G.run.boons.length, 6, 'six boons in');
  HQ.G.meta.unlocks.push('extradraft');
  t.eq(HQ.draftOptions().length, 4, 'wider counsel draws four');
});

t.test('descent: quiet hands, red thirst and the ward of thresholds', () => {
  runFresh();
  // runFresh rolls a real floor off Math.random, and a floor modifier can move
  // the very numbers this test asserts. Hoarded pays treasure DOUBLE, so the
  // gold check below read 300 instead of 150 on roughly one run in eight —
  // measured: one failure in eight consecutive solo runs of this suite. The
  // boon is what is under test, so hold the floor still.
  HQ.G.q.def.mods = [];
  const h = rhero('barbarian');
  h.x = 3; h.y = 7; HQ.recomputeVision();
  HQ.takeBoon('quietstep');
  const n = HQ.monstersOf().length;
  HQ.applyTreasure({ k:'wander', t:'Wandering Monster', d:'' }, h);
  t.eq(HQ.monstersOf().length, n, 'nothing wandered in');

  HQ.G.q.pot = 0;
  HQ.takeBoon('luckyfind');
  HQ.applyTreasure({ k:'gold', n:100, t:'purse', d:'' }, h);
  t.eq(HQ.G.q.pot, 150, "prospector's luck is worth half again");

  HQ.takeBoon('vampiric');
  const m = HQ.monstersOf()[0];
  m.x = h.x; m.y = h.y - 1;
  h.bp = 2;
  HQ.hurt(m, 99, null);
  t.eq(h.bp, 3, 'the red thirst pays out on a kill');

  HQ.takeBoon('doorward');
  h.bp = 2;
  const door = Object.values(HQ.G.q.doors).find(d => !d.open && (!d.secret || d.found));
  HQ.openDoorAt(h, door);
  t.eq(h.bp, 3, 'and a door opened is a Body Point back');
});

t.test('descent: second wind catches the first hero who would fall, once', () => {
  runFresh();
  HQ.takeBoon('secondwind');
  const a = rhero('barbarian'), b = rhero('dwarf');
  HQ.hurt(a, 99, null);
  t.ok(a.alive, 'the barbarian is caught');
  t.eq(a.bp, 1, 'on his last point');
  HQ.hurt(b, 99, null);
  t.ok(!b.alive, 'the dwarf is not — it is once a floor');
});

t.test('descent: modifiers change how a floor plays', () => {
  runFresh();
  HQ.G.q.def.mods = [];                            // the rolled floor may already be dark
  const base = HQ.torchRadius();
  HQ.G.q.def.mods = ['dark'];
  t.ok(HQ.torchRadius() < base, 'a lightless floor cuts your sight');
  t.ok(HQ.modHas('dark') && !HQ.modHas('wealthy'), 'modHas reads the floor it is on');

  HQ.G.q.def.mods = ['wealthy'];
  HQ.G.q.pot = 0;
  HQ.applyTreasure({ k:'gold', n:100, t:'purse', d:'' }, rhero('barbarian'));
  t.eq(HQ.G.q.pot, 200, 'a hoarded floor pays double');

  // hunted: something arrives on the fourth turn
  HQ.G.q.def.mods = ['hunted'];
  HQ.G.q.turn = 3;
  for (const h of HQ.heroes()) h.done = true;
  const n = HQ.monstersOf().length;
  HQ.zargonTurn();
  t.eq(HQ.G.q.turn, 4, 'the fourth turn');
  t.ok(HQ.monstersOf().length > n, 'and the Warlock sent something');
});

t.test('descent: brittle floors show their traps, stolen plans show the doors', () => {
  HQ.setRng(Math.random);
  HQ.G = HQ.newG();
  HQ.G.run = HQ.newRun(['barbarian','dwarf']);
  HQ.G.run.depth = 3;
  HQ.G.run.boons = ['trapsense','mapsense'];
  HQ.beginFloor();
  t.ok(HQ.G.q.traps.length > 0, 'the floor is trapped');
  // Undermined reveals every trap on its own — the code reads
  // `boonHas('trapsense') || modHas('brittle')` — so a floor that happened to
  // roll it passes this with the boon completely broken. Not flaky; quietly
  // weaker than it looks. Clearing the modifier and calling beginFloor again
  // would only re-roll the same dice, so pin the stream and keep drawing until
  // an un-undermined trapped floor comes up. Bounded, and it reports if it
  // never finds one rather than passing on whatever it got.
  // The floor is a pure function of the run seed and the depth
  // (`mkRng(G.run.seed + G.run.depth*7717)`), so calling beginFloor again
  // redraws the SAME floor — walk the seed instead. Deterministic: the same
  // seed is found on every run, and the search reports itself if it fails.
  let tries = 0;
  while (tries++ < 60){
    HQ.G.run.seed = 4100 + tries * 13;
    HQ.beginFloor();
    if (!HQ.modHas('brittle') && HQ.G.q.traps.length > 0) break;
  }
  t.ok(tries < 60, 'a trapped floor without Undermined came up (seed ' + HQ.G.run.seed + ', ' + tries + ' draws)');
  t.ok(!HQ.modHas('brittle'), 'and it is not an undermined floor doing the work');
  t.ok(HQ.G.q.traps.every(tr => tr.found), "the sapper's eye found all of them");
  t.ok(Object.values(HQ.G.q.doors).every(d => d.found), 'and the stolen plans found every door');
});

t.test('descent: the pedlar on the stair takes gold and gives goods', () => {
  runFresh();
  HQ.G.run.gold = 500;
  const h = HQ.runAlive()[0];
  for (const x of HQ.runAlive()) x.bp = 1;
  t.ok(HQ.buyPedlar('mend'), 'field surgery bought');
  t.eq(HQ.G.run.gold, 300, 'and paid for');
  t.ok(HQ.runAlive().every(x => x.bp > 1), 'everyone is patched up');
  const potions = HQ.runAlive().reduce((n,x) => n + (x.items.potion||0), 0);
  t.ok(HQ.buyPedlar('potion'), 'a potion bought');
  t.eq(HQ.runAlive().reduce((n,x) => n + (x.items.potion||0), 0), potions + 1, 'and handed over');
  HQ.G.run.gold = 10;
  t.ok(!HQ.buyPedlar('holy'), 'and you cannot buy what you cannot afford');
});

t.test('descent: favour buys things that outlast the run', () => {
  HQ.G = HQ.newG();
  HQ.G.meta.favour = 3;
  t.ok(!HQ.buyUnlock('revive'), 'five favour is five favour');
  t.ok(HQ.buyUnlock('leather'), 'standard issue is affordable');
  t.eq(HQ.G.meta.favour, 1, 'and costs two');
  t.ok(!HQ.buyUnlock('leather'), 'you only buy it once');
  HQ.G.meta.favour = 20;
  HQ.buyUnlock('potionbelt'); HQ.buyUnlock('warchest'); HQ.buyUnlock('veteran');
  const run = HQ.newRun(['barbarian','wizard']);
  t.ok(run.heroes.every(h => h.armour === 'leather'), 'every hero starts armoured');
  t.ok(run.heroes.every(h => h.items.potion >= 1), 'and with a potion');
  t.eq(run.gold, 250, 'and a war chest');
  t.eq(run.heroes[0].bpMax, HQ.HERO_DEFS[0].bp + 1, 'veterans carry an extra Body Point');
});

t.test('descent: a run in progress survives being put down and picked up', () => {
  const store = {};
  const A = loadGame(store);
  A.G = A.newG();
  A.startRun(['barbarian','elf']);
  A.takeBoon('ironskin'); A.takeBoon('swiftboots');
  A.G.run.depth = 3; A.G.run.gold = 640; A.G.run.kills = 11;
  A.beginFloor();
  const elf = A.G.run.heroes.find(h => h.id === 'elf');
  elf.bp = 2; elf.x = 8; elf.y = 10;
  A.saveRun();

  const B = loadGame(store);
  B.G = B.newG();
  t.ok(B.resumeRun(), 'the run comes back');
  t.ok(B.G.run, 'as a run, not a quest');
  t.eq(B.G.run.depth, 3, 'at the same depth');
  t.eq(B.G.run.gold, 640, 'with the same purse');
  t.eq(B.G.run.boons.join(), 'ironskin,swiftboots', 'and the same boons');
  t.eq(B.G.run.heroes.length, 2, 'and the same party');
  const e2 = B.G.run.heroes.find(h => h.id === 'elf');
  t.eq(e2.bp, 2, 'as hurt as we left them');
  t.eq(B.G.q.actors.find(a => a.kind === 'hero' && a.id === 'elf'), e2,
       'and the board and the roster share one object');
  t.eq(B.defendDice(e2), B.HERO_DEFS[2].def + 1, 'the boons are still doing their work');
  B.update(16); B.draw();
});

t.test('descent: every floor of a long run draws without complaint', () => {
  runFresh(['barbarian','dwarf','elf','wizard']);
  for (let d = 1; d <= 14; d++){
    HQ.G.run.depth = d;
    if (d % 3 === 0){
      const opts = HQ.draftOptions();
      if (opts.length) HQ.takeBoon(opts[0].id);
    }
    HQ.beginFloor();
    t.ok(HQ.monstersOf().length > 0, `depth ${d} is populated`);
    t.ok(HQ.livingHeroes().length > 0, `depth ${d} has a party`);
    for (const m of HQ.monstersOf()) m.awake = true;
    HQ.G.q.traps.forEach(tr => { tr.found = true; });
    HQ.update(16); HQ.draw();
  }
  t.ok(true, 'fourteen floors, no render or generation errors');
});

/* ----------------------------------------------------------------- juice */

t.test('juice: a blow lunges, throws blood the way it landed, and stops the world', () => {
  fresh(0);
  const h = use(hero('barbarian'));
  put(h, 11, 8);
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1);
  const m = HQ.monstersOf()[0];
  m.x = 11; m.y = 7; m.bp = m.bpMax = 9; m.def = 0;
  HQ.recomputeVision();
  const fx = HQ.G.fx.length;
  ALL_SKULLS();
  HQ.doAttack(h, m);
  t.ok(h.lt > 0, 'the attacker lunged');
  t.eq([h.lx, h.ly].join(), '0,-1', 'toward the thing it hit');
  t.ok(HQ.G.fx.length > fx, 'and threw something');
  t.ok(HQ.G.shake > 10, 'a full skull roll shakes hard');
  t.eq(HQ.G.freeze || 0, 0, 'hit-stop stays out of headless so the sim never stalls');
  HQ.update(16); HQ.draw();
});

t.test('juice: damage numbers, ash and the low-health beat all survive a frame', () => {
  fresh(0);
  const h = use(hero('wizard'));
  put(h, 11, 8);
  HQ.G.q.seen.fill(1); HQ.G.q.roomSeen.fill(1); HQ.recomputeVision();
  h.bp = 1;                                        // trips the heartbeat vignette
  const m = HQ.monstersOf()[0];
  m.x = 11; m.y = 7;
  HQ.hurt(m, 99, null);
  t.ok(!m.alive, 'it is down');
  t.ok(m.deathT > 0, 'and dissolving');
  t.ok(HQ.G.fx.some(p => p.text), 'a damage number is up');
  t.ok(HQ.G.fx.some(p => p.glow), 'and embers with it');
  for (let i = 0; i < 30; i++){ HQ.update(16); HQ.draw(); }
  t.ok(true, 'thirty frames of it, no errors');
});

t.test('a timer that ends the quest does not take the frame loop with it', () => {
  // clearTimers() inside a firing callback used to leave update() walking off
  // the end of the list it was iterating.
  fresh(0);
  HQ.G.timers.length = 0;
  let ran = 0;
  HQ.G.timers.push({ t:1, fn: () => { ran++; HQ.questOver(false, 'test'); } });
  HQ.G.timers.push({ t:1, fn: () => { ran++; } });
  HQ.G.timers.push({ t:1, fn: () => { ran++; } });
  HQ.update(16);
  t.ok(ran >= 1, 'the first callback ran');
  t.eq(HQ.G.timers.length, 0, 'and the queue was cleared, not corrupted');
  HQ.update(16); HQ.update(16);
  t.ok(true, 'and the frames after it are fine');
});

t.run();
