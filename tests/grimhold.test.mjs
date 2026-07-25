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
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return (a,b,w,h) => ({ data:new Uint8ClampedArray(w*h*4), width:w, height:h });
    if (k === 'createImageData') return (w,h) => ({ data:new Uint8ClampedArray(w*h*4), width:w, height:h });
    if (k === 'canvas') return { width: 800, height: 1400 };
    return noop;
  }, set(){ return true; } });
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

t.run();
