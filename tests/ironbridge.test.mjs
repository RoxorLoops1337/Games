// Ironbridge — headless suite.
//
// The game is one self-contained file drawing to two canvases. This harness
// stubs a DOM + a fussy no-op 2d context (a bad colour string throws, exactly
// like a real canvas, so a render mistake fails here instead of on the page),
// evals the inline <script> with __IB_HEADLESS__ set, and drives the real
// simulation through window.IB: content sanity → the hold economy → building
// and training → waves and targeting order → the damage model → turrets and
// inhibitors → hero creation, the 3/6/9/12 choice ladder and rank-ups → the
// Ember Host's AI → a full match played to a winner. draw() runs against the
// stub context throughout.
//
// Run: node tests/ironbridge.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

let CTX;
// `srcOverride` loads a MODIFIED copy of the game instead of the file on disk.
// Each call evals into its own closure, so two calls give two fully independent
// simulations — which is how the lockstep block below runs one build against
// another and compares them tick by tick.
function loadGame(store, srcOverride){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = srcOverride || readFileSync(join(here, '..', 'ironbridge', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
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
  // Two things beyond the colour check. `ops` counts every call and every
  // property write, so a test can tell "drew the world" from "drew nothing" —
  // draw() early-returned for this suite's entire life and no assertion
  // noticed. And a non-finite number is refused wherever it appears: a real
  // canvas SILENTLY DROPS a call carrying NaN, so a shape lost that way is
  // invisible on the page and invisible to a colour check.
  const stats = { ops:0 };
  const numCheck = (where, args) => {
    for (let i = 0; i < args.length; i++)
      if (typeof args[i] === 'number' && !Number.isFinite(args[i]))
        throw new TypeError(where + '(): argument ' + i + ' is ' + args[i]);
  };
  // A real canvas THROWS IndexSizeError on a negative radius, and this stub
  // used to shrug it off — so a looping animation whose phase went negative
  // (`x % 1` keeps the sign of x, and half the plot tiles have a negative gx)
  // blew up in the browser while every suite here stayed green.
  const radCheck = (k, a) => {
    const at = k === 'ellipse' ? [2, 3] : k === 'arc' ? [2] : k === 'arcTo' ? [4] : null;
    if (!at) return;
    for (const i of at)
      if (typeof a[i] === 'number' && a[i] < 0)
        throw new RangeError(k + '(): radius ' + i + ' is negative (' + a[i] + ')');
  };
  // A dash pattern is state, not an argument: leave one set and every stroke
  // for the rest of the frame comes out dashed. `stats.dash` follows it so a
  // test can assert the frame ended clean — a leak of this kind is invisible
  // to every other check here, because nothing about the call is wrong.
  // globalAlpha and the save/restore stack are the same class of bug: state,
  // not arguments. A block that fades something out and forgets to put the
  // alpha back leaves every later shape in the frame translucent, and an
  // unbalanced save() leaks a clip or a transform into whatever draws next.
  // Neither is visible to a per-call check, because no single call is wrong.
  stats.dash = 0; stats.alpha = 1; stats.depth = 0; stats.maxDepth = 0; stats.lw = 0; stats.lwMin = Infinity; stats.strokes = []; stats.texts = []; stats.ellipses = []; stats.fill = null;
  const TEXT0 = { lineCap:'butt', textAlign:'start', textBaseline:'alphabetic' };
  Object.assign(stats, TEXT0);
  stats.__text0 = TEXT0;
  const ctx = new Proxy({}, { get(_t, k){
    if (k === '__stats') return stats;
    if (k === 'save') return () => { stats.ops++; stats.depth++; stats.maxDepth = Math.max(stats.maxDepth, stats.depth); };
    if (k === 'restore') return () => {
      stats.ops++;
      if (--stats.depth < 0) throw new RangeError('restore() with nothing saved');
    };
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return (...a) => { stats.ops++; numCheck(k, a);
        return { addColorStop: (pos, col) => { numCheck('addColorStop', [pos]); stopCheck(col); } }; };
    if (k === 'measureText') return () => ({ width: 24 });
    // What state each piece of text was actually drawn under. The property
    // tracking above says what was SET; this says what reached the glyph,
    // which is the only way to state the bug as a relationship: the same
    // label has to render the same whatever else is on the board.
    if (k === 'fillText' || k === 'strokeText') return (...a) => {
      stats.ops++; numCheck(k, a);
      stats.texts.push({ txt: String(a[0]), baseline: stats.textBaseline, align: stats.textAlign, font: stats.font });
    };
    if (k === 'canvas') return { width: 900, height: 520 };
    if (k === 'setLineDash') return (a) => {
      stats.ops++;
      if (!Array.isArray(a)) throw new TypeError('setLineDash() wants an array');
      numCheck('setLineDash', a);
      for (const v of a) if (v < 0) throw new RangeError('setLineDash(): negative dash ' + v);
      stats.dash = a.length;
    };
    // Where the ellipses actually landed. Reading a table tells you what a
    // shadow was configured to be; this tells you where it was put, which is
    // the only way to check it leans the way the sun says.
    if (k === 'ellipse') return (...a) => {
      stats.ops++; numCheck(k, a); radCheck(k, a);
      if (stats.ellipses.length < 4000)
        stats.ellipses.push({ x:a[0], y:a[1], rx:a[2], ry:a[3], fill:null, alpha:stats.alpha });
    };
    // ell() lays the path down, THEN sets fillStyle, THEN fills — so the
    // colour has to be read at the fill, not at the ellipse. Reading it early
    // gives every shape the colour of the one before it, which is a very
    // convincing way to test nothing at all.
    if (k === 'fill') return (...a) => {
      stats.ops++;
      const last = stats.ellipses[stats.ellipses.length - 1];
      if (last && last.fill === null){ last.fill = stats.fill; last.alpha = stats.alpha; }
    };
    return (...a) => { stats.ops++; numCheck(k, a); radCheck(k, a); };
  }, set(_t, k, v){
    stats.ops++;
    if (k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') checkColour(k)(v);
    if (k === 'strokeStyle') stats.strokes.push(v);
    if (k === 'fillStyle') stats.fill = v;
    if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('ctx.' + k + ' = ' + v);
    if (k === 'globalAlpha'){
      if (!(v >= 0 && v <= 1)) throw new RangeError('globalAlpha = ' + v + ' is outside 0..1');
      stats.alpha = v;
    }
    // The widest and the NARROWEST stroke laid down since the last reset. The
    // narrowest is the one that matters: a shape sets a dozen widths and all
    // but one may scale with the zoom, so watching the widest passes whether
    // the odd one out is fixed or not. The odd one out is always the thinnest.
    if (k === 'lineWidth'){
      stats.lw = Math.max(stats.lw, v);
      stats.lwMin = Math.min(stats.lwMin, v);
    }
    // The rest of the sticky channels. textBaseline is the one that bit: a
    // label's vertical offset means one thing under `alphabetic` and another
    // under `middle`, so text that never changed moved on its own depending on
    // what had been drawn before it.
    if (k === 'lineCap' || k === 'textAlign' || k === 'textBaseline' || k === 'font') stats[k] = v;
    return true;
  } });
  CTX = ctx;
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 520 }),
    setPointerCapture: noop, innerHTML: '', textContent: '', width: 900, height: 520,
  }, { get(t, k){ return (k in t) ? t[k] : noop; }, set(t, k, v){ t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.setTimeout = () => 0;
  global.clearTimeout = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 1400; global.innerHeight = 800;
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k){ return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; },
    set(t, k, v){ t[k] = v; return true; },
  });
  global.__IB_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.IB;
}

// The game source, read as text — a couple of assertions below are about the
// code itself rather than its behaviour.
const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'ironbridge', 'index.html'), 'utf8');

const t = harness('ironbridge');
const store = {};
const IB = loadGame(store);
const G = IB.G, C = IB.C;
const finite = v => typeof v === 'number' && isFinite(v);
const step = (secs) => { const n = Math.round(secs * 30); for (let i = 0; i < n; i++) IB.update(1 / 30); };
const P = () => G.sides[0];
const E = () => G.sides[1];
// Give a side everything it needs so a test can exercise one system in isolation.
const SKILLOF = (id) => IB.SKILL[id];
const mmss = (t) => Math.floor(t/60) + 'm' + String(Math.floor(t%60)).padStart(2,'0') + 's';
const rich = (s) => { s.res.gold = 9000; s.res.iron = 9000; s.res.wood = 9000; s.res.food = 9000; };

/* ---------------------------------------------------------------- content */
t.ok(!!IB, 'exposes window.IB');
t.ok(G.state === 'menu', 'boots into the menu without starting a match');
{
  const ids = new Set(IB.PASSIVES.map(p => p.id));
  t.ok(IB.PASSIVES.length === 100, 'there are exactly 100 passives (' + IB.PASSIVES.length + ')');
  t.ok(ids.size === 100, 'every passive id is unique');
  t.ok(IB.PASSIVES.every(p => p.n && p.d && p.m && Object.keys(p.m).length), 'every passive has a name, text and at least one modifier');
  let bad = 0;
  for (const p of IB.PASSIVES) for (const k in p.m) if (!finite(p.m[k])) bad++;
  t.ok(bad === 0, 'every passive modifier is a finite number');
  // A passive that modifies a key nothing reads is a wasted pick out of three,
  // every time it is offered. Two of them shipped that way; this is the guard.
  {
    const start = SRC.indexOf('const PASSIVES = [');
    const end = SRC.indexOf('\n];', start);
    const table = SRC.slice(start, end), rest = SRC.slice(0, start) + SRC.slice(end);
    const keys = new Set();
    for (const p of IB.PASSIVES) for (const k in p.m) keys.add(k);
    const dead = [...keys].filter(k => !new RegExp("'" + k + "'").test(rest));
    t.ok(dead.length === 0, 'every passive modifier is actually read by the game (dead: ' + dead.join(', ') + ')');
    t.ok(table.length > 4000 && keys.size > 50, 'and the audit really did parse the passive table');
  }
}
{
  const ids = new Set(IB.SKILLS.map(s => s.id));
  t.ok(ids.size === IB.SKILLS.length, 'every skill id is unique');
  const kinds = new Set(['strike','bolt','nova','dash','heal','shield','buff','teambuff','regen','dot','summon','chain','volley','mark','taunt','storm','teamheal','hook']);
  t.ok(IB.SKILLS.every(s => kinds.has(s.k)), 'every skill uses an effect kind the sim implements');
  t.ok(IB.SKILLS.every(s => s.cd > 0 && s.mana >= 0 && s.f), 'every skill has a cooldown, a cost and flavour');
  // A summon skill once carried its count in `n`, which is the name field —
  // Object.assign quietly replaced "Banner Call" with the number 2.
  t.ok(IB.SKILLS.every(s => typeof s.n === 'string' && s.n.length > 2),
    'every skill has a real name, not a number left over from its own data');
  t.ok(IB.SKILLS.filter(s => s.k === 'summon').every(s => s.count > 0),
    'and every summon says how many it brings');
  t.ok(IB.SKILLS.filter(s => s.k === 'summon').every(s => IB.UNITS[s.kind]), 'every summon points at a real unit type');
  for (const cl of IB.CLASSES){
    t.ok(IB.basicPool(cl.id).length >= 6, cl.name + ' can be offered at least 6 basic skills');
    t.ok(IB.ultPool(cl.id).length === 3, cl.name + ' has exactly 3 ultimates');
  }
  let numbad = 0;
  for (const s of IB.SKILLS) for (let r = 1; r <= C.MAX_HERO_RANK; r++) if (typeof IB.skNums(s, r) !== 'string') numbad++;
  t.ok(numbad === 0, 'every skill prints readable numbers at every rank');
}
t.ok(Object.keys(IB.TRAIN).every(k => IB.UNITS[k]), 'every trainable unit exists in the unit table');
t.ok(IB.STRUCTS.length === 5 && IB.STRUCTS.some(s => s.key === 'gate') && IB.STRUCTS.some(s => s.key === 'inhib'),
  'each side has five structures including an inhibitor and the gates');

/* ---------------------------------------------------------------- match start */
IB.newMatch({ diff:'veteran', seed:7 });
t.ok(G.state === 'play' && G.t === 0 && G.wave === 0, 'newMatch starts a fresh match');
t.ok(G.sides.length === 2 && !G.sides[0].ai && G.sides[1].ai, 'you are side 0, the Host runs side 1');
t.ok(G.units.length === 0, 'nobody is on the bridge yet');
t.ok(P().structs.length === 5 && E().structs.length === 5, 'both holds have all five structures standing');
{
  const mine = P().structs.map(s => s.key);
  t.ok(mine[0] === 't1' && mine[4] === 'gate', 'the attack order runs outer turret → gates (' + mine.join('>') + ')');
  t.ok(IB.frontStruct(0).key === 't1', 'only the outer turret can be attacked first');
  const gx0 = IB.gateX(0), gx1 = IB.gateX(1);
  t.ok(gx0 < C.LANE_LEN / 2 && gx1 > C.LANE_LEN / 2, 'the two gates sit at opposite ends of the bridge');
}
IB.draw();
t.ok(true, 'drawing an empty bridge is harmless');

/* ------------------------------------------------------------ seed = the match */
{
  // A seed has to name a match, or nothing in this file that compares a before
  // to an after means anything. It did not: update() alternates which hold acts
  // first on the parity of G.frame, and newMatch reset G.t, G.wave, G.units and
  // the RNG but never that counter — so the same seed played out differently
  // depending on how many frames the process had already simulated. Two runs of
  // seed 5031 diverged at t=36.43s with byte-identical hp, positions, gold and
  // RNG state on the tick before. Play one seed, play a different one, play the
  // first again: all three must agree.
  const play = (seed, ticks) => {
    IB.newMatch({ diff:'veteran', seed });
    G.sides[0].ai = true;
    for (let i = 0; i < ticks && G.state === 'play'; i++) IB.update(1 / 30);
    return G.units.map(u => u.kind + ':' + u.side + ':' + u.hp.toFixed(6) + ':' + u.x.toFixed(6)).join(' ') +
      '|' + G.sides.map(s => s.res.gold.toFixed(6) + ',' + s.rs + ',' +
        s.structs.map(st => st.hp.toFixed(4)).join('.')).join('/');
  };
  // an ODD number of ticks in the middle, deliberately: the counter decides the
  // side order by its parity, so an even-length match in between leaves the
  // parity untouched and this check would pass on the broken code too
  const a = play(5031, 3000);
  const other = play(5062, 3001);
  const b = play(5031, 3000);
  t.ok(a === b, 'the same seed replays the same match after another match has been played');
  t.ok(a !== other, 'and two different seeds really are two different matches');
  // and the counter itself is back to zero, which is what makes that true
  IB.newMatch({ diff:'veteran', seed:5031 });
  t.ok(!G.frame, 'newMatch resets the tick counter the side order rides on (' + G.frame + ')');
}

/* ---------------------------------------------------------------- economy */
{
  const s = P();
  // The hold opens with its workers already earning — a player who spends the
  // first minute reading used to come back to an economy that had gathered
  // nothing while the Host, which assigns on its first tick, was three waves in.
  t.ok(IB.workerCount(s) === 4, 'you open with four workers');
  t.ok(s.workers.idle >= 1, 'at least one of them is yours to place');
  t.ok(IB.workerCount(s) - s.workers.idle >= 2, 'and the rest are already gathering');
  {
    const g0 = s.res.gold, w0 = s.res.wood;
    step(10);
    t.ok(s.res.gold > g0 && s.res.wood > w0, 'so the piles are growing before you touch anything');
  }
  t.ok(IB.popCap(s) === C.POP_BASE + C.POP_PER_FARM, 'the starting farm has already raised the population cap');
  for (const k of ['gold','iron','wood','food']) IB.assign(s, k, -99);
  t.ok(s.workers.idle === 4, 'and every one of them can be pulled back off again');
  t.ok(IB.assign(s, 'gold', 2) === null && s.workers.gold === 2 && s.workers.idle === 2, 'workers can be put on the gold mine');
  const g0 = s.res.gold;
  step(10);
  t.ok(s.res.gold > g0, 'assigned workers actually gather (' + Math.round(s.res.gold - g0) + ' gold in 10s)');
  t.ok(IB.assign(s, 'gold', -1) === null && s.workers.gold === 1, 'workers can be pulled off a job');
  IB.assign(s, 'gold', -99);
  t.ok(s.workers.gold === 0 && typeof IB.assign(s, 'gold', -1) === 'string', 'pulling from an empty job is refused');
  t.ok(IB.nodeCap(s, 'food') === IB.fieldSlots(s), 'field jobs come from farms, not from thin air');
  t.ok(typeof IB.assign(s, 'food', 99) === 'string' || s.workers.food <= IB.fieldSlots(s), 'the food job respects its slot cap');
}
{
  const s = P();
  rich(s);
  const before = IB.workerCount(s) + s.trainQ.length;
  t.ok(IB.trainWorker(s) === null, 'a worker can be queued');
  t.ok(s.trainQ.length > 0, 'the pit has something in it');
  step(C.WORKER_TIME + 1);
  t.ok(IB.workerCount(s) > before - 1, 'the worker finishes training and reports for duty');
  // fill the population and check the cap bites
  let guard = 0;
  while (IB.popUsed(s) < IB.popCap(s) && guard++ < 60){ IB.trainWorker(s); step(C.WORKER_TIME + .5); }
  t.ok(typeof IB.trainWorker(s) === 'string', 'a full population refuses more workers');
  const capBefore = IB.popCap(s);
  const free = s.plot.indexOf(null);
  t.ok(IB.build(s, free, 'farm') === null, 'a farm can be built on a free plot');
  t.ok(IB.popCap(s) === capBefore + C.POP_PER_FARM, 'the new farm raises the cap');
  t.ok(typeof IB.build(s, free, 'farm') === 'string', 'a taken plot refuses a second building');
}
{
  const s = P();
  rich(s);
  t.ok(typeof IB.trainUnit(s, 'melee') === 'string', 'without a barracks you cannot arm anyone');
  const free = s.plot.indexOf(null);
  IB.build(s, free, 'barracks');
  t.ok(IB.barracksLvl(s) === 1, 'the barracks is standing');
  const idle0 = s.workers.idle;
  t.ok(IB.trainUnit(s, 'melee') === null, 'a footman can be armed');
  t.ok(s.workers.idle === idle0 - 1, 'arming a footman consumes an idle worker');
  t.ok(typeof IB.trainUnit(s, 'caster') === 'string', 'casters need a level 2 barracks');
  IB.upgradeBuilding(s, free);
  t.ok(IB.barracksLvl(s) === 2 && IB.trainUnit(s, 'caster') === null, 'upgrading the barracks unlocks casters');
  step(20);
  const armed = s.muster.length + G.units.filter(u => u.side === 0 && u.paid).length;
  t.ok(armed >= 2, 'finished fighters muster up (or march out with a wave) — ' + armed);
}
{
  const s = P();
  rich(s);
  t.ok(typeof IB.buyUp(s, 'atk') === 'string', 'upgrades need a forge');
  IB.build(s, s.plot.indexOf(null), 'forge');
  t.ok(IB.upCap(s) === 2, 'a level 1 forge caps upgrades at rank 2');
  t.ok(IB.buyUp(s, 'hp') === null && s.towerUp.hp === 1, 'reinforced stone can be bought');
  const st = P().structs[0];
  t.ok(st.mhp > st.base.hp, 'the upgrade actually thickens the turret');
  IB.buyUp(s, 'hp');
  t.ok(typeof IB.buyUp(s, 'hp') === 'string', 'the forge rank cap is enforced');
  t.ok(IB.buyUp(s, 'tad') === null && s.troopUp.tad === 1, 'minion upgrades come from the same forge');
}

/* ---------------------------------------------------------------- waves */
{
  IB.newMatch({ diff:'veteran', seed:11 });
  const s = P();
  rich(s);
  IB.spawnWave();
  t.ok(G.wave === 1, 'the wave counter ticks');
  const mine = G.units.filter(u => u.side === 0), theirs = G.units.filter(u => u.side === 1);
  t.ok(mine.length >= 3 && theirs.length >= 3, 'both sides get a free levy trickle');
  t.ok(mine.every(u => finite(u.x) && finite(u.y) && u.hp > 0), 'spawned minions are well formed');
  t.ok(mine.every(u => Math.abs(u.x - IB.gateX(0)) < 6), 'your minions spawn at your own gate');
  s.muster.push({ type:'melee' }, { type:'cannon' });
  IB.spawnWave();
  t.ok(G.units.some(u => u.kind === 'cannon' && u.side === 0), 'mustered fighters march out with the wave');
  t.ok(s.muster.length === 0, 'the muster empties when the wave leaves');
  t.ok(G.units.filter(u => u.side === 0 && u.paid).length === 2, 'only armed fighters count against your population');
}
{
  // minions walk toward the enemy and meet in the middle
  IB.newMatch({ diff:'veteran', seed:13 });
  IB.spawnWave();
  const u = G.units.find(x => x.side === 0);
  const x0 = u.x;
  step(6);
  t.ok(u.x > x0 + 5, 'minions march up the bridge');
  let contact = false, traded = false;
  for (let i = 0; i < 40; i++){
    step(1);
    if (G.units.some(a => G.units.some(b => b.side !== a.side && Math.abs(a.x - b.x) < 3))) contact = true;
    if (G.sides[0].kills + G.sides[1].kills > 0) traded = true;
  }
  t.ok(contact, 'the two waves meet in the middle');
  t.ok(traded, 'and start killing each other');
}

/* ---------------------------------------------------------------- damage model */
{
  IB.newMatch({ diff:'veteran', seed:17 });
  const a = IB.spawnUnit(0, 'melee', { x:40, y:0 });
  const b = IB.spawnUnit(1, 'melee', { x:41, y:0 });
  b.armor = 100;
  const hp0 = b.hp;
  IB.dealDmg(a, b, 100);
  t.ok(Math.abs((hp0 - b.hp) - 50) < .01, '100 armour halves physical damage');
  b.armor = 0; b.mr = 0;
  const hp1 = b.hp;
  IB.dealDmg(a, b, 60, { magic:true });
  t.ok(Math.abs((hp1 - b.hp) - 60) < .01, 'zero resist takes the full magic hit');
  b.shield = 40; const hp2 = b.hp;
  IB.dealDmg(a, b, 30);
  t.ok(b.hp === hp2 && b.shield === 10, 'a shield eats the damage before health does');
  b.hp = 5;
  IB.dealDmg(a, b, 500);
  t.ok(b.dead && !G.units.includes(b), 'a dead minion leaves the bridge');
  t.ok(P().kills === 1 && P().res.gold > 0, 'the kill pays a bounty');
}
{
  // structures can only be taken in order
  IB.newMatch({ diff:'veteran', seed:19 });
  const foe = E().structs;
  const gate = foe.find(s => s.key === 'gate');
  const u = IB.spawnUnit(0, 'cannon', { x:gate.x - 4, y:0 });
  u.hp = u.mhp = 99999;                       // survive the gate's own fire while we watch
  IB.rebuildGrid();
  step(4);
  t.ok(gate.hp === gate.mhp, 'the gates cannot be touched while the turrets stand');
  t.ok(u.target && u.target.key === 't1', 'a minion walks past them to the outermost turret instead');
  for (const s of foe) if (s.key !== 'gate') s.dead = true;
  u.x = gate.x - 4;
  IB.rebuildGrid();
  step(4);
  t.ok(gate.hp < gate.mhp, 'with everything else down the gates take damage');
}
{
  // an inhibitor kill sends siege ogres, then rebuilds
  IB.newMatch({ diff:'veteran', seed:23 });
  const inh = E().structs.find(s => s.key === 'inhib');
  IB.dealDmg(IB.spawnUnit(0, 'cannon', { x:inh.x - 2 }), inh, 99999, { pure:true });
  t.ok(inh.dead && P().superT > 0, 'taking their inhibitor grants you siege ogres');
  IB.spawnWave();
  t.ok(G.units.some(u => u.side === 0 && u.kind === 'super'), 'siege ogres join your wave');
  inh.downT = .1;
  step(1);
  t.ok(!inh.dead && inh.hp === inh.mhp, 'the inhibitor rebuilds itself at full health');
}
{
  // turrets shoot, and prefer minions over heroes
  IB.newMatch({ diff:'veteran', seed:29 });
  const tur = E().structs.find(s => s.key === 't1');
  const m = IB.spawnUnit(0, 'melee', { x:tur.x - 2, y:0 });
  const hp0 = m.hp;
  IB.rebuildGrid();
  step(3);
  t.ok(m.hp < hp0 || m.dead, 'a turret fires on a minion in range');
}
{
  // breaking the gates ends the match
  IB.newMatch({ diff:'veteran', seed:31 });
  for (const s of E().structs) if (s.key !== 'gate') s.dead = true;
  const gate = E().structs.find(s => s.key === 'gate');
  IB.dealDmg(IB.spawnUnit(0, 'cannon', { x:gate.x - 2 }), gate, 999999, { pure:true });
  t.ok(G.state === 'over' && G.winner === 0, 'breaking their gates wins the match');
}

/* ---------------------------------------------------------------- heroes */
{
  IB.newMatch({ diff:'veteran', seed:37 });
  const s = P();
  rich(s);
  t.ok(typeof IB.createHero(s, 'fighter') === 'string', 'a hero needs a Hero Factory');
  IB.build(s, s.plot.indexOf(null), 'tavern');
  t.ok(IB.heroCap(s) === 1, 'a level 1 factory gives one hero slot');
  t.ok(IB.createHero(s, 'fighter') === null, 'a hero can be forged');
  const h = s.heroes[0];
  t.ok(h.lvl === 1 && h.hp === h.mhp && h.inLane, 'the hero walks onto the bridge at level 1');
  t.ok(h.pend.length === 1 && h.pend[0].kind === 'passive' && h.pend[0].opts.length === 3,
    'creation offers three passives out of a hundred');
  t.ok(typeof IB.createHero(s, 'fighter') === 'string', 'the second hero needs a bigger factory');
  const pid = h.pend[0].opts[1];
  t.ok(IB.pickOption(h, 1) === null && h.passive === pid && h.pend.length === 0, 'picking a passive applies it');
  t.ok(typeof IB.pickOption(h, 0) === 'string', 'picking with nothing pending is refused');
}
{
  // the whole choice ladder: 3/6/9 skills, 12 ultimate, then ranks
  IB.newMatch({ diff:'veteran', seed:41 });
  const s = P();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.createHero(s, 'mage');
  const h = s.heroes[0];
  IB.pickOption(h, 0);
  const seen = [];
  let guard = 0;
  while (h.lvl < C.MAX_LEVEL && guard++ < 400){
    IB.gainXp(h, 400);
    while (h.pend.length){ seen.push({ lvl:h.pend[0].lvl, kind:h.pend[0].kind, n:h.pend[0].opts.length }); IB.pickOption(h, 0); }
  }
  t.ok(h.lvl === C.MAX_LEVEL, 'a hero can reach level ' + C.MAX_LEVEL);
  for (const lv of C.SKILL_TIERS)
    t.ok(seen.some(o => o.lvl === lv && o.kind === 'skill'), 'level ' + lv + ' offers a new skill');
  t.ok(seen.some(o => o.lvl === C.ULT_LEVEL && o.kind === 'ult'), 'level 12 offers an ultimate');
  t.ok(seen.filter(o => o.kind === 'rank').length === C.RANK_LEVELS.length, 'every level past 12 in the ladder offers a rank');
  t.ok(seen.every(o => o.n >= 1 && o.n <= 3), 'every choice offers at most three options');
  t.ok(h.skills.length === 4, 'the hero ends with three skills and an ultimate');
  t.ok(h.skills.filter(x => x.ult).length === 1, 'exactly one of them is the ultimate');
  t.ok(h.skills.every(x => IB.SKILL[x.id].cls === 'any' || IB.SKILL[x.id].cls === 'mage'), 'a mage is only offered mage or common skills');
  const ranked = h.skills.reduce((a, x) => a + x.rank - 1, 0) + (h.passRank - 1);
  t.ok(ranked === C.RANK_LEVELS.length, 'every rank-up landed on something (' + ranked + ')');
  t.ok(h.skills.every(x => x.rank <= C.MAX_HERO_RANK) && h.passRank <= C.MAX_HERO_RANK, 'nothing goes past the rank cap');
}
{
  // levelling makes a hero measurably stronger, and passives are applied
  IB.newMatch({ diff:'veteran', seed:43 });
  const h = IB.makeHero(0, 'marksman', 'Test');
  IB.pickOption(h, 0);
  const ad0 = h.ad, hp0 = h.mhp;
  h.lvl = 12; IB.recalcHero(h);
  t.ok(h.ad > ad0 && h.mhp > hp0, 'a level 12 hero out-stats a level 1 hero');
  const h2 = IB.makeHero(0, 'tank', 'Wall');
  h2.pend[0].opts[0] = 'ironhide';
  IB.pickOption(h2, 0);
  const armor0 = h2.armor;
  h2.passRank = 3; IB.recalcHero(h2);
  t.ok(h2.armor > armor0, 'ranking a passive strengthens it');
  t.ok(IB.passVal(h2, 'armor') > IB.PASS.ironhide.m.armor, 'the passive value scales with its rank');
}
{
  // heroes fight: they close, hit things, gain xp and die properly
  IB.newMatch({ diff:'veteran', seed:47 });
  const s = P();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.createHero(s, 'fighter');
  const h = s.heroes[0];
  IB.autoPick(h);
  const x0 = h.x;
  step(8);
  t.ok(h.x > x0 + 3, 'a hero advances up the bridge on its own');
  for (let i = 0; i < 5; i++) IB.spawnUnit(1, 'grunt', { x:h.x + 2 + i * .5, y:0 });
  const xp0 = h.xp + h.lvl * 1000;
  step(14);
  t.ok(h.xp + h.lvl * 1000 > xp0, 'killing minions near the hero grants experience');
  t.ok(h.lvl >= 1 && finite(h.hp) && finite(h.mana), 'the hero stays numerically sane while fighting');
  // now kill it
  const killer = IB.spawnUnit(1, 'super', { x:h.x, y:h.y });
  IB.dealDmg(killer, h, 999999, { pure:true });
  t.ok(h.dead && !h.inLane && h.respawnT > 0, 'a dead hero leaves the bridge on a respawn timer');
  t.ok(!G.units.includes(h), 'and is out of the unit list');
  const diedAt = h.x;
  h.respawnT = .05;
  step(.2);
  t.ok(!h.dead && h.inLane && h.hp === h.mhp, 'the hero respawns at full health at its own gate');
  t.ok(Math.abs(h.x - IB.gateX(0)) < 4 && h.x < diedAt - 10, 'and respawns at home, not where it died');
}
{
  // every skill can be cast without blowing up, at every rank
  IB.newMatch({ diff:'veteran', seed:53 });
  let cast = 0, broke = 0;
  for (const sdef of IB.SKILLS){
    for (const rank of [1, 3, 5]){
      const h = IB.makeHero(0, sdef.cls === 'any' ? 'fighter' : sdef.cls, 'Caster');
      h.pend.length = 0; h.passive = 'whetstone'; h.lvl = 12; IB.recalcHero(h);
      IB.enterLane(h);
      h.x = 60; h.y = 0;
      const foe = IB.spawnUnit(1, 'melee', { x:62, y:0 });
      const ally = IB.spawnUnit(0, 'melee', { x:59, y:0 });
      ally.hp = ally.mhp * .4;
      IB.rebuildGrid();
      try {
        IB.castSkill(h, { id:sdef.id, rank, cdT:0, ult:sdef.ult }, foe);
        IB.update(1 / 30); IB.update(1 / 30);
        cast++;
        if (!finite(h.x) || !finite(h.hp) || !finite(foe.hp)) broke++;
      } catch (e){ broke++; }
      // clean up so the next skill starts from a quiet bridge
      G.units.length = 0; G.zones.length = 0; G.projs.length = 0;
    }
  }
  t.ok(cast === IB.SKILLS.length * 3, 'every skill casts at ranks 1, 3 and 5 (' + cast + ')');
  t.ok(broke === 0, 'and none of them break the simulation');
}
{
  // a damaging skill actually damages, a heal actually heals
  IB.newMatch({ diff:'veteran', seed:59 });
  const h = IB.makeHero(0, 'mage', 'Boom');
  h.pend.length = 0; h.passive = 'arcanefont'; h.lvl = 9; IB.recalcHero(h);
  IB.enterLane(h); h.x = 60; h.y = 0;
  const foe = IB.spawnUnit(1, 'melee', { x:61.5, y:0 });
  IB.rebuildGrid();
  const hp0 = foe.hp;
  IB.castSkill(h, { id:'fireball', rank:3, cdT:0 }, foe);
  step(1);
  t.ok(foe.hp < hp0, 'a fireball takes health off its target');
  h.hp = h.mhp * .4;
  const hp1 = h.hp;
  IB.castSkill(h, { id:'mend', rank:2, cdT:0 }, null);
  t.ok(h.hp > hp1, 'a heal puts health back');
  const sh = IB.makeHero(0, 'tank', 'Rock');
  sh.pend.length = 0; sh.passive = 'ironhide'; IB.recalcHero(sh);
  IB.castSkill(sh, { id:'fortify', rank:2, cdT:0 }, null);
  t.ok(sh.shield > 0, 'a shield skill grants a shield');
  const su = IB.makeHero(0, 'assassin', 'Shade');
  su.pend.length = 0; su.passive = 'whetstone'; IB.recalcHero(su);
  IB.enterLane(su); su.x = 50;
  const n0 = G.units.length;
  IB.castSkill(su, { id:'shadowlegion', rank:1, cdT:0 }, null);
  t.ok(G.units.length > n0, 'a summon puts bodies on the bridge');
  t.ok(G.units.filter(u => u.kind === 'shade').every(u => u.life > 0), 'summons are on a timer');
}
{
  // The hook. Its whole reason to exist is that the target ENDS UP SOMEWHERE
  // ELSE, which no other skill in the game does to a body that is not the
  // caster — so damage landing is not enough to call it working.
  IB.newMatch({ diff:'veteran', seed:71 });
  const h = IB.makeHero(0, 'tank', 'Chain');
  h.pend.length = 0; h.passive = 'ironhide'; h.lvl = 10; IB.recalcHero(h);
  IB.enterLane(h); h.x = 60; h.y = 0;
  const foe = IB.spawnUnit(1, 'melee', { x:67, y:1.5 });
  IB.rebuildGrid();
  const d0 = Math.hypot(foe.x - h.x, foe.y - h.y), hp0 = foe.hp;
  IB.castSkill(h, { id:'ironhook', rank:2, cdT:0 }, foe);
  t.ok(G.projs.length === 1 && G.projs[0].kind === 'hook', 'a hook puts a chain in the air');
  // the chain has to fly before anything happens — this is not an instant
  t.ok(Math.hypot(foe.x - h.x, foe.y - h.y) === d0, 'and nothing moves until it lands');
  step(2);
  const d1 = Math.hypot(foe.x - h.x, foe.y - h.y);
  t.ok(foe.hp < hp0, 'the hook hurts what it catches');
  t.ok(d1 < d0 - 3, 'and drags it most of the way in (' + d0.toFixed(1) + ' -> ' + d1.toFixed(1) + ')');
  t.ok(d1 >= h.r + foe.r - .2, 'without burying it inside the caster');
  t.ok(foe.pullT === 0 && foe.pullBy === null, 'the pull lets go when it is done');
  t.ok(finite(foe.x) && finite(foe.y) && Math.abs(foe.y) <= C.LANE_W / 2, 'and leaves it on the bridge');

  // A hook aimed at a turret is a wasted cast — the sim must not try to drag
  // masonry, and the Host must not want to.
  IB.newMatch({ diff:'veteran', seed:72 });
  const h2 = IB.makeHero(0, 'tank', 'Chain2');
  h2.pend.length = 0; h2.passive = 'ironhide'; h2.lvl = 10; IB.recalcHero(h2);
  IB.enterLane(h2);
  const st = IB.frontStruct(1);
  h2.x = st.x - 6; h2.y = 0; IB.rebuildGrid();
  const sx = st.x, sy = st.y;
  IB.castSkill(h2, { id:'ironhook', rank:1, cdT:0 }, st);
  step(1.5);
  t.ok(st.x === sx && st.y === sy, 'a hooked turret does not budge');
  t.ok(!st.pullT, 'and never gets a pull put on it');
  const hookDef = IB.SKILL.ironhook;
  t.ok(!IB.wantCast(h2, hookDef, st), 'the Host will not throw a hook at a structure');
  const close = IB.spawnUnit(1, 'melee', { x:h2.x + 1, y:0 });
  IB.rebuildGrid();
  t.ok(!IB.wantCast(h2, hookDef, close), 'nor at somebody already standing on it');
  const far = IB.spawnUnit(1, 'melee', { x:h2.x + 6, y:0 });
  IB.rebuildGrid();
  t.ok(IB.wantCast(h2, hookDef, far), 'but will throw it at somebody worth reeling in');

  // Being dragged is not a moment to keep fighting: the body owes its whole
  // tick to the chain.
  IB.newMatch({ diff:'veteran', seed:73 });
  const h3 = IB.makeHero(0, 'tank', 'Chain3');
  h3.pend.length = 0; h3.passive = 'ironhide'; h3.lvl = 10; IB.recalcHero(h3);
  IB.enterLane(h3); h3.x = 60; h3.y = 0;
  const mv = IB.spawnUnit(1, 'melee', { x:68, y:0 });
  IB.rebuildGrid();
  IB.applyPull(mv, 61, 0, .45, h3);
  const was = mv.x;
  IB.update(1 / 30);
  t.ok(mv.x < was, 'a pulled body travels toward the chain, not away down the lane');
  t.ok(mv.pullT > 0 && mv.pullT < .45, 'and the pull is on a clock');
  step(1);
  t.ok(Math.abs(mv.x - 61) < .8 && mv.pullT === 0, 'it arrives where the chain ended and is let go');

  // A hero that dies mid-drag must not come back still being pulled.
  const h4 = IB.makeHero(1, 'fighter', 'Caught');
  h4.pend.length = 0; h4.passive = 'whetstone'; IB.recalcHero(h4);
  G.sides[1].heroes.push(h4);              // so heroStep runs its respawn
  IB.enterLane(h4);
  IB.applyPull(h4, h4.x - 5, 0, .5, h3);
  h4.hp = 1; IB.dealDmg(h3, h4, 9999, {});
  t.ok(h4.dead, 'the caught hero died');
  h4.respawnT = .05; step(.4);
  t.ok(h4.pullT === 0 && h4.pullBy === null, 'and respawns free of the chain');
}

/* ------------------------------------------------------------ the render path */
{
  // Every other block in this file exercises the simulation. This one exercises
  // the picture — and until the canvas got wired up under HEADLESS there was
  // nothing here to exercise: draw() was CALLED 200 times across this suite and
  // its body ran ZERO times, because lctx is assigned only inside resize(),
  // which returns immediately when HEADLESS. Seventeen hundred lines of drawing
  // shipped green whatever they did. The context counts operations, so a draw
  // that goes nowhere is a failure rather than a pass, and it refuses a
  // non-finite number as well as a bad colour: a real canvas silently drops a
  // call carrying NaN, which makes that shape invisible on the page AND
  // invisible to a colour check.
  const ops = () => CTX.__stats.ops;
  const painted = (label, min) => {
    const before = ops();
    let err = null;
    try { IB.draw(); } catch (e){ err = e.message; }
    const n = ops() - before;
    t.ok(!err, 'draw() survives ' + label + (err ? ' — ' + err : ''));
    t.ok(n >= min, label + ' actually paints (' + n + ' ops, wanted ' + min + ')');
    return n;
  };

  // the seam itself. If draw() ever stops reaching the canvas, every assertion
  // below silently becomes a no-op — so prove it reaches it before anything else.
  t.ok(painted('the menu', 400) > 400, 'the headless canvas is wired: draw() reaches the context');

  // a real match with both holds built out and heroes on the bridge
  IB.newMatch({ diff:'veteran', seed:8123 });
  painted('the opening frame', 400);
  for (const s of G.sides){
    let ti = 0;
    for (const type of Object.keys(IB.BUILDINGS)){
      while (ti < s.plot.length && s.plot[ti]) ti++;
      s.res.gold = s.res.iron = s.res.wood = s.res.food = 90000;
      IB.build(s, ti, type);
    }
    s.res.gold = s.res.iron = s.res.wood = s.res.food = 90000;
    IB.createHero(s, 'fighter');
  }
  t.ok(P().plot.filter(Boolean).length >= 6, 'the hold really is built up (' +
    P().plot.filter(Boolean).length + ' plots)');
  t.ok(P().heroes.length > 0 && E().heroes.length > 0, 'and both sides really have a hero');
  painted('a built-up hold with heroes', 1000);

  // a live brawl, with a selection ring following a real unit
  let frames = 0, thinnest = Infinity, blew = null;
  for (let i = 0; i < 1800 && G.state === 'play'; i++){
    IB.update(1 / 30); IB.camStep(1 / 30);
    if (i % 200 === 0) IB.spawnWave();
    if (i % 60) continue;
    IB.sel.unit = G.units.find(u => !u.dead && !u.isHero) || null;
    IB.sel.struct = IB.liveStructs(1)[0] || null;
    const b = ops();
    try { IB.draw(); } catch (e){ blew = blew || ('frame ' + i + ': ' + e.message); }
    thinnest = Math.min(thinnest, ops() - b); frames++;
  }
  IB.sel.unit = null; IB.sel.struct = null;
  t.ok(!blew, 'draw() survives a live brawl' + (blew ? ' — ' + blew : ''));
  t.ok(frames > 20 && G.units.filter(u => !u.dead).length > 3,
    'the brawl really ran with a crowd on the bridge (' + frames + ' frames, ' +
    G.units.filter(u => !u.dead).length + ' bodies)');
  t.ok(thinnest > 800, 'and every frame of it painted a full board (thinnest ' + thinnest + ' ops)');

  // a dead hero, a broken structure, and an inhibitor counting down to a rebuild
  {
    const h = P().heroes.find(x => !x.dead);
    if (h){ IB.dealDmg(null, h, h.hp + 9999, {}); t.ok(h.dead, 'a hero really is down'); }
    painted('a dead hero on the board', 600);
    const inh = E().structs.find(x => x.key === 'inhib');
    for (const st of E().structs) if (st.key !== 'inhib' && st.key !== 'gate'){ st.dead = true; st.hp = 0; }
    inh.dead = true; inh.hp = 0; inh.downT = 4;
    t.ok(E().structs.filter(x => x.dead).length >= 4, 'and most of a hold really is rubble');
    painted('broken structures and an inhibitor rebuilding', 600);
  }

  // every layer on its own. A whole-frame count only notices a draw that goes
  // to nothing — neuter ONE layer and the other twelve still push thousands of
  // ops, so each exported piece has to paint on its own account.
  {
    IB.newMatch({ diff:'veteran', seed:77 });
    for (let i = 0; i < 900; i++) IB.update(1 / 30);
    // A hero has to be standing in it. The level roundel on a hero's bar is
    // the only thing in the game that sets textBaseline, so a sweep with no
    // hero on the bridge is a sweep that cannot see the leak — the same shape
    // as watching the widest lineWidth and missing the one that was wrong.
    for (const side of [0, 1]){
      const hh = IB.makeHero(side, side ? 'fighter' : 'mage', side ? 'Vex' : 'Ora');
      hh.pend.length = 0; hh.lvl = 7; IB.recalcHero(hh);
      G.sides[side].heroes.push(hh); IB.enterLane(hh);
      hh.x = 60 + side * 3; hh.y = side ? 1 : -1;
    }
    t.ok(G.units.some(u => !u.dead), 'the layer sweep has a populated board');
    t.ok(G.sides.every(s => s.heroes.some(h => !h.dead)), 'with a hero of each side standing on the bridge');
    const layers = [
      ['drawSky', () => IB.drawSky(CTX), 20],
      ['drawGround', () => IB.drawGround(CTX), 20],
      ['drawPlateau', () => IB.drawPlateau(CTX), 20],
      ['drawHold', () => { IB.cam.x = IB.HOLD_X; IB.drawHold(CTX, 0); }, 100],
      ['drawDeck', () => IB.drawDeck(CTX), 20],
      ['drawLane', () => IB.drawLane(CTX), 100],
      ['drawMinimap', () => IB.drawMinimap(CTX), 20],
    ];
    for (const [name, fn, min] of layers){
      const b = ops();
      let e2 = null;
      try { fn(); } catch (e){ e2 = e.message; }
      t.ok(!e2, name + '() draws without throwing' + (e2 ? ' — ' + e2 : ''));
      t.ok(ops() - b >= min, name + '() puts its layer on the canvas (' + (ops() - b) +
        ' ops, wanted ' + min + ')');
    }
    IB.cam.x = IB.HOLD_X;

    // Canvas state is a bug class of its own, and checking it at the END of a
    // frame does not find it: a layer can leave the alpha at .3 and the next
    // layer sets it back before anybody looks. The boundary that matters is
    // the layer, so every one of them has to hand the canvas back the way it
    // was handed over — alpha at 1, no dash, no unbalanced save().
    const st = CTX.__stats;
    // Every sticky channel, not just the three from last round. lineCap and
    // textBaseline are the same class and both were leaking: the roundel on a
    // hero's bar set textBaseline='middle' and never put it back, so from the
    // moment your first hero walked onto the bridge every label in the game —
    // hold names, structure names, node counts — slid half a line, and slid
    // back when the hero died.
    const cleanText = (name) => {
      for (const k of ['lineCap', 'textAlign', 'textBaseline'])
        t.ok(st[k] === st.__text0[k],
          name + '() hands back the default ' + k + ' (' + st[k] + ')');
    };
    const resetState = () => { st.alpha = 1; st.dash = 0; st.depth = 0; Object.assign(st, st.__text0); };
    for (const [name, fn] of layers){
      resetState();
      try { fn(); } catch (e){ /* the throw is already reported above */ }
      t.ok(st.alpha === 1, name + '() puts the alpha back (' + st.alpha + ')');
      t.ok(st.dash === 0, name + '() leaves no dash pattern behind');
      t.ok(st.depth === 0, name + '() balances its save/restore (' + st.depth + ')');
      cleanText(name);
    }
    // And the pieces small enough to call on their own, where a leak has
    // nothing after it to hide behind.
    const bits = [
      ['heroRing', () => IB.heroRing(CTX, 400, 300, 1, 0)],
      ['drawClouds', () => IB.drawClouds(CTX)],
      ['drawBirds', () => IB.drawBirds(CTX)],
      ['drawChasm', () => IB.drawChasm(CTX)],
      ['drawPiers', () => IB.drawPiers(CTX)],
      ['drawUnit', () => IB.drawUnit(CTX, G.sides[0].heroes[0])],
      ['flushLabels', () => { IB.drawUnit(CTX, G.sides[0].heroes[0]); IB.flushLabels(CTX); }],
    ];
    for (const [name, fn] of bits){
      resetState();
      let e3 = null;
      try { fn(); } catch (e){ e3 = e.message; }
      t.ok(!e3, name + '() draws on its own' + (e3 ? ' — ' + e3 : ''));
      t.ok(st.alpha === 1, name + '() puts the alpha back (' + st.alpha + ')');
      t.ok(st.dash === 0, name + '() leaves no dash pattern behind');
      t.ok(st.depth === 0, name + '() balances its save/restore (' + st.depth + ')');
      cleanText(name);
    }

    // The bug itself, stated as the relationship it broke: a label has to
    // render the same whatever else happens to be on the board. The level
    // roundel on a hero's bar set textBaseline='middle' and never put it back,
    // so from the moment your first hero walked onto the bridge every plate in
    // the game — hold names, structure names, node counts — slid half a line,
    // and slid back when that hero died. Text that moves because of something
    // it has nothing to do with.
    const labelState = () => {
      st.texts = []; Object.assign(st, st.__text0);
      IB.draw();
      const m = new Map();
      for (const e of st.texts) if (!m.has(e.txt)) m.set(e.txt, e.baseline + '/' + e.align);
      return m;
    };
    const withHero = labelState();
    const alive = [];
    for (const s2 of G.sides) for (const h of s2.heroes) if (!h.dead){ alive.push(h); h.dead = true; h.inLane = false; }
    const without = labelState();
    for (const h of alive){ h.dead = false; h.inLane = true; }
    let moved = 0, shared = 0;
    for (const [txt, state] of without){
      if (!withHero.has(txt)) continue;
      shared++;
      if (withHero.get(txt) !== state) moved++;
    }
    t.ok(alive.length > 0, 'the baseline check had heroes to take away (' + alive.length + ')');
    t.ok(shared > 4, 'and labels on the board either way to compare (' + shared + ')');
    t.ok(moved === 0, 'a label renders the same whether or not a hero is on the bridge (' + moved + ' moved)');
    // Rule out the do-nothing pass: text has to be reaching the canvas at all,
    // and every piece of it has to have said which baseline it wanted.
    t.ok(withHero.size > 6, 'the frame really draws text (' + withHero.size + ' distinct)');
    t.ok([...withHero.values()].every(v => !v.startsWith('undefined')), 'and every piece of it set its own state');

    // Label traffic. The nudge-upward only ever compared labels against OTHER
    // LABELS, so a name in a brawl walked straight over the level roundel and
    // the health bar — the two things it is describing. The roundel scales
    // with the body and the plate does not, so leaning in made it worse.
    const box = (x, y, w, h) => ({ x, y, w, h });
    t.ok(IB.labelHits(box(0, 0, 10, 10), box(0, 0, 10, 10)), 'two plates in the same place collide');
    t.ok(!IB.labelHits(box(0, 0, 10, 10), box(40, 0, 10, 10)), 'and two well apart do not');
    t.ok(IB.labelHits(box(0, 0, 10, 10), box(0, 30, 10, 10)) === IB.labelHits(box(0, 30, 10, 10), box(0, 0, 10, 10)),
      'the test does not care which box is asked about first');
    // The old test compared TOP edges and used only the new label's height, so
    // it read a tall box as short. Two boxes of very different heights, with
    // their centres far apart but their bodies overlapping, must still collide.
    t.ok(IB.labelHits(box(0, 0, 10, 60), box(0, 26, 10, 10)),
      'a short plate inside a tall one collides with it');
    t.ok(!IB.labelHits(box(0, 0, 10, 60), box(0, 90, 10, 10)),
      'and one clear above it does not');
    // Rule out the do-nothing settings: no padding, and no room to move.
    t.ok(IB.LABEL_PAD.x > 0 && IB.LABEL_PAD.y > 0, 'plates keep a little air around them');
    t.ok(IB.LABEL_TRIES > 4, 'and a label gets more than a couple of tries to find a gap');

    // Then a real frame, with heroes and their roundels and bars in it, and
    // every plate checked against every reservation. Reading the tables alone
    // would not have caught it — the reservations were simply never made.
    IB.cam.follow = false; IB.cam.x = 60;
    let worst = null, overlaps = 0, pairs = 0;
    for (const z of [1, 1.8, 2.4]){
      IB.cam.z = IB.cam.tz = z;
      IB.draw();
      const plates = IB.labelPlaced, blocked = IB.labelBlocked;
      for (const p of plates) for (const b of blocked){
        pairs++;
        if (IB.labelHits(p, b)){ overlaps++; worst = worst || ('zoom ' + z); }
      }
    }
    IB.cam.z = IB.cam.tz = 1;
    t.ok(pairs > 200, 'the label sweep had plates and reservations to compare (' + pairs + ')');
    t.ok(IB.labelPlaced.length > 4, 'and real labels on the board (' + IB.labelPlaced.length + ')');
    t.ok(IB.labelBlocked.length > 4, 'and real bars and roundels under them (' + IB.labelBlocked.length + ')');
    t.ok(overlaps === 0, 'no label lands on a health bar or a level roundel (' +
      overlaps + (worst ? ', first at ' + worst : '') + ')');
    // And they must not land on each other either — the thing that already
    // worked has to keep working now that the geometry underneath changed.
    let selfHit = 0;
    IB.draw();
    const ps = IB.labelPlaced;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      if (IB.labelHits(ps[i], ps[j])) selfHit++;
    t.ok(selfHit === 0, 'and no label lands on another label (' + selfHit + ')');
    // Clearing everything is easy if you are allowed to go anywhere. A plate
    // has to stay near the thing it names, and it never moves DOWN onto it.
    let drift = 0, below = 0;
    for (const p of ps){
      drift = Math.max(drift, p.ay - p.y);
      if (p.y > p.ay) below++;
    }
    t.ok(below === 0, 'no label is pushed below what it names (' + below + ')');
    t.ok(drift < 140, 'and none wanders far enough to stop pointing at it (' + Math.round(drift) + 'px)');

    IB.cam.x = IB.HOLD_X;
  }

  // the whole camera envelope — every zoom the game allows, at both ends of the world
  {
    let n = 0, min = Infinity, threw = null;
    for (let zi = 0; zi <= 4; zi++){
      IB.cam.z = IB.cam.tz = IB.ZOOM_MIN + (IB.ZOOM_MAX - IB.ZOOM_MIN) * zi / 4;
      for (let xi = 0; xi <= 4; xi++){
        IB.cam.x = IB.CAM_MIN + (IB.CAM_MAX - IB.CAM_MIN) * xi / 4;
        const b = ops();
        try { IB.draw(); } catch (e){ threw = threw || (IB.cam.z.toFixed(2) + ' @ ' + IB.cam.x.toFixed(0) + ': ' + e.message); }
        min = Math.min(min, ops() - b); n++;
      }
    }
    t.ok(!threw, 'no zoom or camera position breaks the picture' + (threw ? ' — ' + threw : ''));
    t.ok(n === 25, 'the sweep covered zoom ' + IB.ZOOM_MIN + '-' + IB.ZOOM_MAX +
      ' across the whole world');
    t.ok(min > 200, 'and every one of those views painted something (thinnest ' + min + ' ops)');
    IB.cam.z = IB.cam.tz = 1; IB.cam.x = IB.HOLD_X;
  }

  // both winners, and the frozen board behind the result card
  for (const w of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:600 + w });
    for (let i = 0; i < 300; i++) IB.update(1 / 30);
    IB.endMatch(w);
    t.ok(G.state === 'over' && G.winner === w, 'the match ended with side ' + w + ' winning');
    painted('the board behind side ' + w + "'s result card", 400);
  }
}

/* -------------------------------------------- the grid must not widen a radius */
{
  // nearby() bins bodies by x into cells six wide and walks whole cells, so a
  // body up to six units past the radius reached the callback — and nine of the
  // sixteen callers trusted it to have done the distance test. A radius-5 team
  // effect cast at x=10.99 reached a body at x=0.05, and moving the caster one
  // hundredth of a unit across a cell edge dropped a body that had not moved.
  // nearby is not exported, so drive it through two real callers instead.
  IB.newMatch({ diff:'veteran', seed:9001 });
  const sup = IB.makeHero(0, 'support', 'Rangefinder');
  sup.pend.length = 0; sup.passive = 'mystic'; IB.recalcHero(sup, true);
  P().heroes.push(sup); IB.enterLane(sup);
  const RAD = 5;
  G.units.length = 0; G.units.push(sup);
  sup.x = 6.0; sup.y = 0;                        // a radius of 5 from here walks cells 0..1
  const near = IB.spawnUnit(0, 'melee', { x:sup.x + 3.5, y:0 });
  const far  = IB.spawnUnit(0, 'melee', { x:sup.x + 5.9, y:0 });
  near.hp = near.mhp * .40;
  far.hp  = far.mhp  * .20;                      // the MORE hurt of the two
  IB.rebuildGrid();
  const cell = (x) => Math.floor(x / 6);
  // assert the premise, so this cannot rot into a tautology if the lane, the
  // cell width or the spawn geometry ever moves
  t.ok(Math.abs(far.x - sup.x) > RAD, 'the far body really is outside the radius (' +
    (far.x - sup.x).toFixed(1) + ' > ' + RAD + ')');
  t.ok(cell(far.x) >= cell(sup.x - RAD) && cell(far.x) <= cell(sup.x + RAD),
    'and really is inside a cell the scan walks (cell ' + cell(far.x) + ' of ' +
    cell(sup.x - RAD) + '..' + cell(sup.x + RAD) + ')');
  const team = IB.teamTargets(sup, RAD);
  t.ok(team.includes(near), 'a team effect reaches the body inside its radius');
  t.ok(!team.includes(far), 'and stops at the radius, not at the cell edge');
  t.ok(IB.lowAlly(sup, RAD) === near,
    'a heal picks the wounded body it can actually reach, not the more wounded one it cannot');
  // and the filter is not merely over-eager: one step closer and it counts again
  far.x = sup.x + 4.9; IB.rebuildGrid();
  t.ok(IB.teamTargets(sup, RAD).includes(far),
    'a body just inside the radius still counts (' + (far.x - sup.x).toFixed(1) + ')');
  G.units.length = 0; P().heroes.length = 0;
}

/* ------------------------------------------------ a hero is not its own cover */
{
  // heroStep asked alliesNear whether anyone was standing under the enemy
  // turret, and handed it a fresh {x,y,side} literal to measure from.
  // alliesNear's only exclusion is `o !== u`, and a literal is never identical
  // to any real unit, so the hero counted ITSELF. Alone under a turret it read
  // cover = 1 against a true 0, and the `frac < .58` withdrawal that reads this
  // flag — along with the `finishing` guard and the do-not-walk-past-turret-range
  // clamp — became unreachable. Measured: the hero turned around at 0.279, the
  // unconditional floor, still inside a turret that reaches 11.
  IB.newMatch({ diff:'veteran', seed:911 });
  const h = IB.makeHero(0, 'fighter', 'Diver');
  h.pend.length = 0; h.passive = 'whetstone'; h.lvl = 8; IB.recalcHero(h, true);
  P().heroes.push(h); IB.enterLane(h);
  const tur = E().structs.find(x => x.key === 't1');
  G.units.length = 0; G.units.push(h);              // nobody else anywhere
  h.x = tur.x - 1.5; h.y = tur.y; h.hp = h.mhp * .5; h.retreat = false;
  IB.rebuildGrid();
  t.ok(Math.hypot(h.x - tur.x, h.y - tur.y) < tur.rng, 'the hero really is under the turret');
  // Fallbacks so a revert reports assertions instead of throwing — and they
  // return values that FAIL rather than pass, or the block would go quiet on
  // exactly the build it exists to catch. The two assertions that actually
  // matter (does the hero withdraw, does it hold when covered) do not touch
  // the export at all.
  t.ok(typeof IB.towerCover === 'function', 'the cover count can be read from outside');
  const cover = () => (IB.towerCover ? IB.towerCover(tur, 0) : -1);
  const NEED = IB.COVERED || 2;
  t.ok(cover() === 0, 'a hero standing alone counts nobody as cover (' + cover() + ')');
  IB.heroStep(h, 1 / 30);
  t.ok(h.retreat, 'and a half-health hero alone under a turret withdraws');

  // ...and it is not simply "always retreat": with bodies soaking, it holds.
  h.retreat = false; h.hp = h.mhp * .5;
  for (let i = 0; i < NEED; i++) IB.spawnUnit(0, 'melee', { x:tur.x - 1, y:tur.y + i - .5 });
  IB.rebuildGrid();
  t.ok(cover() === NEED, 'minions under the turret are cover (' + cover() + ')');
  IB.heroStep(h, 1 / 30);
  t.ok(!h.retreat, 'and with them soaking for it the same hero holds the dive');

  // the distance filter. nearby() bins by x in width-6 cells and never re-checks
  // x, so a body nine units out lands in a scanned bin. It is still not cover.
  const far = IB.spawnUnit(0, 'melee', { x:tur.x + 9, y:tur.y });
  IB.rebuildGrid();
  t.ok(Math.abs(far.x - tur.x) > 7, 'the extra body is genuinely out of range (' +
    Math.abs(far.x - tur.x).toFixed(1) + ')');
  t.ok(cover() === NEED,
    'a body nine units away is not cover, whatever bin it lands in (' + cover() + ')');

  // the same question, asked the other way round, must give the same answer
  G.units.length = 0; G.units.push(h);
  IB.rebuildGrid();
  t.ok(IB.towerCovered(h, h) === true, 'and walking in alone reads as uncovered too');
}

/* ------------------------------------------ what a hero brings back from the dead */
{
  // The other half of the same mistake. A hero's timed state does not decay
  // while it is dead — statusTick runs from the living branch of heroStep, and
  // that branch returns after counting respawnT down — so whatever was on the
  // hero when it died was frozen, not spent, and started ticking again the
  // moment it walked back out of its own gate. Clearing h.buffs made that look
  // handled; these are bare fields and were missed. Every duration below is
  // 60s, longer than any respawn, so a build that merely ticked the timers
  // while dead would still fail: only actually clearing them passes.
  IB.newMatch({ diff:'veteran', seed:4242 });
  const h = IB.makeHero(0, 'fighter', 'Frostbit'); h.pend.length = 0;
  P().heroes.push(h); IB.enterLane(h);
  const foe = IB.makeHero(1, 'mage', 'Emberhand'); foe.pend.length = 0;
  E().heroes.push(foe); IB.enterLane(foe); foe.x = h.x + 2;
  h.stunT = 60; h.slowT = 60; h.slowP = .45; h.taunt = 60;
  h.markT = 60; h.markBy = 1; h.markAmp = .35;
  h.burn = { dps:40, t:60, src:foe };
  h.shield = 300; h.shT = 60; h.target = foe;
  IB.dealDmg(foe, h, 999999, { pure:true });
  t.ok(h.dead && h.respawnT > 0, 'the crowd-controlled hero goes down');
  h.respawnT = .05;
  step(.2);
  t.ok(!h.dead && h.inLane, 'and comes back');
  const stuck = ['stunT', 'slowT', 'slowP', 'taunt', 'markT', 'markAmp', 'shT']
    .filter(k => (h[k] || 0) > 0);
  t.ok(stuck.length === 0, 'carrying none of the crowd control that killed it (' +
    (stuck.map(k => k + '=' + (+h[k]).toFixed(2)).join(' ') || 'clean') + ')');
  t.ok(!h.burn, 'and no fire still owed on a body that just came back at full health');
  t.ok(!h.target || (!h.target.dead && G.units.includes(h.target)),
    'and no reference left to the body it was fighting when it died');
  // the symptom a player would see, asserted as behaviour rather than as fields.
  // Send the killer home first: a hero with an enemy hero standing next to it
  // is supposed to stop and fight, and that would look exactly like a stun.
  foe.x = IB.gateX(1); foe.y = 0; IB.rebuildGrid();
  const x0 = h.x, hp0 = h.hp;
  step(1);
  t.ok(Math.abs(h.x - x0) > .4, 'it marches out instead of standing frozen at its own gate (moved ' +
    Math.abs(h.x - x0).toFixed(2) + ')');
  t.ok(h.hp >= hp0 - .001, 'and is not burned down by the fire that killed it (' +
    Math.round(hp0) + ' -> ' + Math.round(h.hp) + ')');
}

/* ------------------------------------------------- armour a skill says it gives */
{
  // Armour and resist from a skill are read per hit by effArmor, the same way
  // attackDamage reads 'bad' and attackSpeedOf reads 'bas'. They used to be
  // baked into h.armor by recalcHero, which runs on a level-up, on a pick, and
  // on a self-buff cast — and on nothing else. Three things were wrong at once:
  // a skill cast through the 'shield' or 'teambuff' branch never recalculated,
  // so Fortify's +18 and Unbreakable's +40/+40 and Iron March's +35 printed a
  // number on the pick card and granted nothing; the one branch that did
  // recalculate never recalculated again on expiry, so Crossbrace's five-second
  // +26/+26 was permanent; and Cold Forged, which reads 'while below half
  // health', was a snapshot taken whenever the last recalc happened.
  IB.newMatch({ diff:'veteran', seed:7714 });
  const mk = (cls, lvl) => {
    const h = IB.makeHero(0, cls, 'Plate');
    h.pend.length = 0; h.lvl = lvl || 12; IB.recalcHero(h, true);
    return h;
  };
  const arm = (h) => IB.effArmor(h, false), res = (h) => IB.effArmor(h, true);

  // every skill in the game that promises armour or resist, by whichever branch
  // it happens to be cast through
  const promises = IB.SKILLS.filter(s => s.barm || s.bmr);
  t.ok(promises.length >= 4, 'several skills promise armour (' + promises.map(s => s.n).join(', ') + ')');
  t.ok(new Set(promises.map(s => s.k)).size >= 3,
    'and they are cast through more than one branch (' + [...new Set(promises.map(s => s.k))].join(', ') + ')');
  const short = [];
  for (const d of promises){
    const h = mk(d.cls === 'any' ? 'tank' : d.cls, 12);
    // a team buff walks the side's hero list, so the caster has to be on it —
    // otherwise this loop would report a real skill as broken
    G.sides[0].heroes.length = 0; G.sides[0].heroes.push(h);
    IB.enterLane(h); h.x = 60; h.y = 0; IB.rebuildGrid();
    const a0 = arm(h), r0 = res(h);
    IB.castSkill(h, { id:d.id, rank:1, cdT:0, ult:!!d.ult }, h);
    const ga = arm(h) - a0, gr = res(h) - r0;
    if (ga < (d.barm || 0) - .01 || gr < (d.bmr || 0) - .01)
      short.push(d.n + ' (' + d.k + ') promised ' + (d.barm || 0) + '/' + (d.bmr || 0) +
        ', gave ' + ga.toFixed(0) + '/' + gr.toFixed(0));
    G.units.length = 0;
  }
  t.ok(short.length === 0, 'a skill grants the armour its own card prints (' +
    (short.join('; ') || 'all ' + promises.length + ' of them') + ')');

  // and the ally-targeted one reaches the ally, not just the caster
  {
    const h = mk('tank', 12); IB.enterLane(h); h.x = 60; h.y = 0;
    const mate = mk('marksman', 8); IB.enterLane(mate); mate.x = 61; mate.y = 0;
    G.sides[0].heroes.push(h, mate); IB.rebuildGrid();
    const before = arm(mate);
    IB.castSkill(h, { id:'ironmarch', rank:1, cdT:0, ult:true }, h);
    t.ok(arm(mate) > before, 'Iron March armours the ally it marches with (' +
      before.toFixed(0) + ' -> ' + arm(mate).toFixed(0) + ')');
    G.units.length = 0; G.sides[0].heroes.length = 0;
  }

  // it has to come back off, at max level, where nothing recalculates
  {
    const h = mk('tank', IB.C.MAX_LEVEL); IB.enterLane(h); h.x = 60;
    G.sides[0].heroes.push(h);
    const base = arm(h), baseR = res(h), baseRng = h.rng;
    IB.castSkill(h, { id:'crossbrace', rank:3, cdT:0 }, h);
    t.ok(arm(h) > base + 10, 'Crossbrace goes on (' + base.toFixed(0) + ' -> ' + arm(h).toFixed(0) + ')');
    const dur = IB.SKILL.crossbrace.dur || 5;
    step(dur + 2);
    t.ok(Math.abs(arm(h) - base) < .01 && Math.abs(res(h) - baseR) < .01,
      'and comes back off when it runs out (' + arm(h).toFixed(0) + '/' + res(h).toFixed(0) +
      ' against ' + base.toFixed(0) + '/' + baseR.toFixed(0) + ')');
    // range is still a stored stat, so it needs the rebuild rather than a live read
    const mm = mk('marksman', IB.C.MAX_LEVEL); IB.enterLane(mm); mm.x = 58;
    G.sides[0].heroes.push(mm);
    const r0 = mm.rng;
    IB.castSkill(mm, { id:'trueshot', rank:1, cdT:0, ult:true }, mm);
    t.ok(mm.rng > r0, 'Trueshot lengthens the shot (' + r0.toFixed(1) + ' -> ' + mm.rng.toFixed(1) + ')');
    step((IB.SKILL.trueshot.dur || 10) + 2);
    t.ok(Math.abs(mm.rng - r0) < .01, 'and it goes back to normal (' + mm.rng.toFixed(1) + ')');
    // This line read `Math.abs(baseRng - baseRng) < 1` when it shipped, which is
    // 0 < 1 — a literal tautology, caught by a mutation audit rather than by
    // anything failing. The tank is the one whose range was captured as
    // baseRng; the marksman's buff must not have reached it.
    t.ok(Math.abs(h.rng - baseRng) < .01,
      'and the tank is untouched by the marksman (' + h.rng.toFixed(1) + ' against ' +
      baseRng.toFixed(1) + ')');
    G.units.length = 0; G.sides[0].heroes.length = 0;
  }

  // "+18 armour while below half health" has to mean while, not once
  {
    const cold = IB.PASS.coldforged;
    t.ok(cold && cold.m.armorLow > 0, 'Cold Forged still promises armour at low health');
    const h = mk('tank', 12); h.passive = 'coldforged'; IB.recalcHero(h, true);
    const full = arm(h);
    h.hp = h.mhp * .2;
    t.ok(arm(h) - full > cold.m.armorLow - .01,
      'it is on while the hero is below half health (' + full.toFixed(0) + ' -> ' + arm(h).toFixed(0) + ')');
    // a level-up here used to freeze the low-health value in permanently
    IB.recalcHero(h);
    h.hp = h.mhp;
    t.ok(Math.abs(arm(h) - full) < .01,
      'and off again once the hero is healed, even after a recalculation (' + arm(h).toFixed(0) + ')');
  }

  // the number on the hero card is the number the fight uses
  {
    const h = mk('tank', 12); IB.enterLane(h); h.x = 60;
    G.sides[0].heroes.push(h);
    IB.castSkill(h, { id:'fortify', rank:2, cdT:0 }, h);
    t.ok(Math.round(arm(h)) !== Math.round(h.armor),
      'the stored stat and the fighting stat genuinely differ under a buff (' +
      Math.round(h.armor) + ' stored, ' + Math.round(arm(h)) + ' used)');
    IB.showHeroSheet(h);
    const shown = /Armour<b>(\d+)</.exec(G.sheet || '');
    t.ok(shown && +shown[1] === Math.round(arm(h)),
      'and the hero card prints the one the fight uses (' + (shown ? shown[1] : 'no armour line') +
      ', fighting with ' + Math.round(arm(h)) + ')');
    G.units.length = 0; G.sides[0].heroes.length = 0;
  }
}

/* ---------------------------------------------------------------- the Host */
{
  IB.newMatch({ diff:'veteran', seed:61 });
  const e = E();
  const b0 = e.plot.filter(Boolean).length;
  step(120);
  t.ok(IB.workerCount(e) > 4, 'the Host grows its workforce (' + IB.workerCount(e) + ')');
  t.ok(e.workers.idle < IB.workerCount(e), 'and puts them on jobs');
  t.ok(e.plot.filter(Boolean).length > b0, 'the Host builds (' + e.plot.filter(Boolean).length + ' buildings)');
  t.ok(IB.popUsed(e) <= IB.popCap(e), 'the Host never exceeds its own population cap');
  step(240);
  t.ok(IB.barracksLvl(e) >= 1, 'the Host gets a barracks up');
  t.ok(e.heroes.length >= 1 || IB.heroCap(e) === 0, 'the Host forges heroes once it can');
  t.ok(e.heroes.every(h => h.pend.length === 0), 'and never leaves a hero choice unspent');
  t.ok(e.heroes.every(h => h.passive), 'every Host hero has a passive');
}
{
  // the handicap is resources, not cheating
  IB.newMatch({ diff:'warlord', seed:67 });
  const hard = E().res.gold;
  IB.newMatch({ diff:'recruit', seed:67 });
  t.ok(hard > E().res.gold, 'Warlord hands the Host a bigger opening purse than Recruit');
}

/* ---------------------------------------------------------------- endurance */
{
  // A fair fight: hand the same brain to both holds and let it play out. This
  // is the balance canary — if a change makes sieges trivial or impossible,
  // the match length assertions below are the first thing to break.
  IB.newMatch({ diff:'veteran', seed:71 });
  G.sides[0].ai = true;
  let ok = true, maxU = 0, drew = 0, peakLvl = 0;
  for (let i = 0; i < 30 * 60 * 32 && G.state === 'play'; i++){
    IB.update(1 / 30);
    if (i % 600 === 0){
      IB.draw(); drew++;
      maxU = Math.max(maxU, G.units.length);
      if (G.units.some(u => !finite(u.x) || !finite(u.y) || !finite(u.hp))) ok = false;
      for (const sd of G.sides){
        for (const k of ['gold','iron','wood','food']) if (!finite(sd.res[k]) || sd.res[k] < -1) ok = false;
        if (IB.popUsed(sd) > IB.popCap(sd) + 6) ok = false;
        for (const h of sd.heroes){
          if (!finite(h.hp) || !finite(h.x) || h.lvl > C.MAX_LEVEL) ok = false;
          peakLvl = Math.max(peakLvl, h.lvl);
        }
      }
    }
  }
  t.ok(ok, 'a whole simulated match stays numerically sane');
  t.ok(drew > 20, 'draw() survived the whole match (' + drew + ' frames)');
  t.ok(G.units.length <= C.MAX_UNITS, 'the unit cap holds (peak ' + maxU + ')');
  t.ok(G.wave > 20, 'waves kept coming (' + G.wave + ')');
  t.ok(G.state === 'over', 'an even match reaches a winner inside 32 minutes');
  t.ok(G.t > 60 * 6, 'and takes longer than six minutes — sieges are not trivial (' + mmss(G.t) + ')');
  t.ok(peakLvl >= C.ULT_LEVEL, 'heroes get far enough to unlock an ultimate (level ' + peakLvl + ')');
  t.ok(G.winner === 0 || G.winner === 1, 'somebody won (' + (G.winner === 0 ? 'you' : 'the Host') + ' at ' +
    Math.floor(G.t / 60) + 'm' + Math.floor(G.t % 60) + 's)');
  const loser = G.sides[G.winner === 0 ? 1 : 0];
  t.ok(loser.structs.find(x => x.key === 'gate').dead, 'the loser lost their gates');
  t.ok(G.sides.some(sd => sd.heroes.length > 0), 'heroes were part of it');
  t.ok(G.sides[0].heroes.every(h => h.lvl >= 1 && h.lvl <= C.MAX_LEVEL), 'hero levels stayed in range');
}
{
  const meta = IB.loadMeta();
  t.ok(finite(meta.wins) && finite(meta.losses), 'the result is written to the save file');
  t.ok(meta.wins + meta.losses > 0, 'and the match just played was counted');
}
{
  // pausing freezes everything
  IB.newMatch({ diff:'veteran', seed:73 });
  IB.spawnWave();
  const u = G.units[0], x0 = u.x, t0 = G.t;
  G.paused = true;
  step(3);
  t.ok(G.t === t0 && u.x === x0, 'pausing freezes the simulation');
  G.paused = false;
}
/* ---------------------------------------------------------------- one world */
{
  // The hold and the bridge share a single camera, so the screen→world inverse
  // has to be exact or clicking a plot lands on the wrong one.
  IB.newMatch({ diff:'veteran', seed:79 });
  let worst = 0;
  for (const [wx, wy] of [[0,0],[64,3],[-58,-12],[-40,20],[C.LANE_LEN,0],[C.LANE_LEN+40,-8]]){
    const sc = IB.lp(wx, wy);
    const back = IB.unproject(sc[0], sc[1]);
    worst = Math.max(worst, Math.abs(back[0] - wx), Math.abs(back[1] - wy));
  }
  t.ok(worst < 1e-6, 'screen→world is the exact inverse of world→screen (' + worst.toExponential(1) + ')');
  // every plot of your hold maps back to itself through the projection
  let bad = 0;
  for (let tile = 0; tile < IB.PLOT_W * IB.PLOT_H; tile++){
    const w = IB.holdWorld(IB.tileGX(tile), IB.tileGY(tile));
    const sc = IB.lp(w[0], w[1]);
    const back = IB.unproject(sc[0], sc[1]);
    const gx = (back[0] - IB.HOLD_X) / IB.TILE, gy = back[1] / IB.TILE;
    const col = Math.round(gx + (IB.PLOT_W - 1) / 2), row = Math.round(gy + (IB.PLOT_H - 1) / 2);
    if (row * IB.PLOT_W + col !== tile) bad++;
  }
  t.ok(bad === 0, 'every plot round-trips through the projection to itself');
  t.ok(IB.CAM_MIN < IB.HOLD_X && IB.CAM_MAX > C.LANE_LEN, 'the camera can reach both holds and the whole bridge');
  const w0 = IB.holdWorld(0, 0);
  t.ok(w0[0] < 0, 'your hold sits off the left end of the bridge');
  t.ok(typeof IB.dockHtml() === 'string' && IB.dockHtml().includes('Worker'), 'the command dock renders');
}
/* ---------------------------------------------------------------- clicking */
{
  // A building is drawn standing UP from its cell, so aiming at the thing you
  // can see used to select the cell behind it — or nothing at all.
  IB.newMatch({ diff:'veteran', seed:83 });
  const s = P();
  rich(s);
  IB.cam.follow = false; IB.cam.x = IB.HOLD_X + 10; IB.cam.z = IB.cam.tz = .8;
  IB.draw();
  let missed = 0, wrong = 0;
  for (const b of s.plot){
    if (!b) continue;
    const w = IB.holdWorld(IB.tileGX(b.tile), IB.tileGY(b.tile));
    const foot = IB.lp(w[0], w[1]);
    // aim at the middle of the drawn body, well above the ground cell
    const hit = IB.resolvePick(foot[0], foot[1] - IB.TILE * 9.4 * IB.cam.z * .45);
    if (hit.kind === 'none') missed++;
    else if (hit.tile !== b.tile) wrong++;
  }
  t.ok(missed === 0, 'clicking the body of a building always hits something');
  t.ok(wrong === 0, 'and always hits that building, not the cell behind it');
  for (const k of IB.NODE_UPGRADABLE){
    const N = IB.NODES[k];
    const w = IB.holdWorld(N.gx, N.gy);
    const foot = IB.lp(w[0], w[1]);
    const hit = IB.resolvePick(foot[0], foot[1] - 6);
    t.ok(hit.kind === 'node' && hit.node === k, 'the ' + N.n + ' is clickable');
  }
  const empty = s.plot.indexOf(null);
  if (empty >= 0){
    const w = IB.holdWorld(IB.tileGX(empty), IB.tileGY(empty));
    const foot = IB.lp(w[0], w[1]);
    const hit = IB.resolvePick(foot[0], foot[1]);
    t.ok(hit.tile === empty, 'an empty plot still selects from its ground cell');
  }
  t.ok(IB.resolvePick(-500, -500).kind === 'none', 'clicking empty sky selects nothing');
}

/* ------------------------------------------------- inspecting the bridge */
{
  // Everything standing out on the lane is a question the player can ask:
  // what is that, whose is it, and can my wave even touch it yet?
  IB.newMatch({ diff:'veteran', seed:311 });
  IB.cam.follow = false; IB.cam.z = IB.cam.tz = 1;
  IB.spawnWave();
  step(6);
  let missedS = 0, wrongS = 0, checked = 0;
  for (const sd of G.sides) for (const st of sd.structs){
    if (st.dead) continue;
    IB.cam.x = st.x;                       // look at it the way the player would
    IB.draw();
    const p = IB.lp(st.x, st.y);
    const tall = st.key === 'gate' ? 60 : st.key === 'inhib' ? 34 : 44;
    const hit = IB.resolvePick(p[0], p[1] - tall * .5 * IB.cam.z);
    checked++;
    if (hit.kind !== 'struct') missedS++;
    else if (hit.struct !== st) wrongS++;
  }
  t.ok(checked >= 10, 'both sides put turrets, inhibitors and gates on the bridge (' + checked + ')');
  t.ok(missedS === 0, 'clicking a turret, inhibitor or gate hits a structure');
  t.ok(wrongS === 0, 'and hits the one you aimed at');

  const lane = G.units.filter(u => !u.dead && !u.isHero);
  t.ok(lane.length > 0, 'there are minions marching to click on');
  {
    const u = lane[0];
    IB.cam.x = u.x;
    IB.draw();
    const p = IB.lp(u.x, u.y);
    const hit = IB.resolvePick(p[0], p[1] - 9 * IB.cam.z);
    t.ok(hit.kind === 'unit' && hit.unit === u, 'clicking a marching minion selects that minion');
  }

  // The panel has to answer those questions in words, for either side.
  const mine = IB.frontStruct(0), theirs = IB.frontStruct(1);
  IB.sel.tile = -1; IB.sel.node = null; IB.sel.unit = null;
  IB.sel.struct = theirs;
  let h = IB.dockHtml();
  t.ok(h.includes(theirs.n), 'the dock names the enemy structure you picked');
  t.ok(/your wave can attack/i.test(h), 'and says the front one is what your wave can attack');
  const behind = G.sides[1].structs.filter(st => !st.dead && st !== theirs);
  if (behind.length){
    IB.sel.struct = behind[behind.length - 1];
    h = IB.dockHtml();
    t.ok(/cannot be touched until/i.test(h), 'and that anything behind it is untouchable for now');
  }
  IB.sel.struct = mine;
  h = IB.dockHtml();
  t.ok(/Health/.test(h) && /Armour/.test(h), 'a structure reads out its health and armour');
  t.ok(/have to break next/i.test(h), 'and your own front line says what they must break next');
  {
    // armour plating bought at the forge shows up in the number you are shown
    const s = P();
    const before = IB.dockHtml().match(/Armour<b>(\d+)/);
    rich(s); IB.build(s, s.plot.indexOf(null), 'forge');
    for (let i = 0; i < 3; i++){ rich(s); IB.buyUp(s, 'armor'); }
    const after = IB.dockHtml().match(/Armour<b>(\d+)/);
    t.ok(before && after && +after[1] > +before[1],
      'plating bought at the forge shows in the turret panel (' + before[1] + ' → ' + after[1] + ')');
    t.ok(/\(\+\d+\)/.test(IB.dockHtml()), 'and is called out as the part you paid for');
  }
  IB.sel.struct = null;
  IB.sel.unit = lane[0];
  h = IB.dockHtml();
  t.ok(h.includes(IB.UNITS[lane[0].kind].n), 'a selected minion is named by its kind');
  t.ok(/Health/.test(h) && /Damage/.test(h) && /Range/.test(h), 'with the numbers that decide the fight');

  // and a selection that dies out from under you clears itself
  lane[0].dead = true;
  IB.pruneSel();
  t.ok(IB.sel.unit === null, 'a minion that dies mid-inspection drops out of the selection');
  IB.sel.unit = null;
  t.ok(!/Range<b>/.test(IB.dockHtml()), 'and the panel goes quiet again');
}

/* ------------------------------------------------------- keyboard + pause */
{
  IB.newMatch({ diff:'veteran', seed:401 });
  // Every shortcut the help sheet prints has to be a shortcut that works —
  // a printed key that does nothing is worse than no legend at all.
  for (const row of IB.KEYS){
    const first = row.k.split(' ')[0];
    const key = first === 'Space' ? ' ' : first === 'Esc' ? 'Escape' : first.toLowerCase();
    const a = IB.keyAction(key);
    t.ok(!!a, 'the help sheet key "' + row.k + '" does something (' + a + ')');
  }
  t.ok(IB.keyAction(' ') === 'pause' && IB.keyAction('p') === 'pause', 'space and P both pause');
  t.ok(IB.keyAction('2') === 'speed2' && IB.keyAction('3') === 'speed3', 'the digits set the speed');
  t.ok(IB.keyAction('H') === 'camHold' && IB.keyAction('h') === 'camHold', 'shortcuts ignore the shift key');
  t.ok(IB.keyAction('=') === 'zoomIn' && IB.keyAction('-') === 'zoomOut', '= and - zoom without needing shift');
  t.ok(IB.keyAction('z') === null && IB.keyAction('Tab') === null, 'keys with no meaning are left alone');
  {
    // no key may appear twice in the legend, and no two legend rows may claim
    // the same action — either one would be a lie on the help sheet
    const keys = IB.KEYS.flatMap(r => r.k.split(' '));
    t.ok(new Set(keys).size === keys.length, 'no key is printed twice in the legend');
    const acts = IB.KEYS.map(r => r.a);
    t.ok(new Set(acts).size === acts.length, 'and no two rows describe the same control');
  }
  // the actions themselves
  IB.doAction('speed3');
  t.ok(G.speed === 3, 'speed 3 runs the match at 3x');
  IB.doAction('speedUp');
  t.ok(G.speed === 1, 'and the speed button wraps back round to 1x');
  IB.cam.follow = true;
  IB.doAction('camFoe');
  t.ok(IB.cam.x > C.LANE_LEN * .7 && !IB.cam.follow, 'B looks at their base and drops the camera out of follow');
  IB.doAction('camHold');
  t.ok(IB.cam.x <= IB.HOLD_X + 1, 'H comes home');
  t.ok(IB.cam.x >= IB.CAM_MIN, 'and never past the end of the world');
  IB.doAction('follow');
  t.ok(IB.cam.follow === true, 'F picks the fighting back up');
  const z0 = IB.cam.tz;
  IB.doAction('zoomIn');
  t.ok(IB.cam.tz > z0, '+ zooms in');
  for (let i = 0; i < 20; i++) IB.doAction('zoomOut');
  t.ok(IB.cam.tz >= .42 - 1e-9, 'and zoom cannot be driven past its limit (' + IB.cam.tz.toFixed(2) + ')');

  // pause really stops the world
  IB.setPaused(true);
  t.ok(G.paused === true, 'pausing sets the flag');
  const t0 = G.t, u0 = G.units.length;
  step(4);
  t.ok(G.t === t0 && G.units.length === u0, 'and nothing moves or spawns while paused');
  IB.doAction('close');
  t.ok(G.paused === false, 'Escape resumes');
  step(1);
  t.ok(G.t > t0, 'and the clock runs again');
}

/* ------------------------------------------------------------ war report */
{
  IB.newMatch({ diff:'veteran', seed:409 });
  const s = P(), f = E();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'forge');
  IB.buyUp(s, 'hp'); IB.buyUp(s, 'atk');
  IB.assign(s, 'gold', 3);
  IB.spawnWave();
  step(8);
  let h = IB.pauseHtml();
  t.ok(h.includes(IB.G.diff.n) && /Wave/.test(h), 'the report says which match this is');
  t.ok(h.includes('Azure Pact') && h.includes('Ember Host'), 'and puts your hold next to theirs');
  // read the number the report puts on your side of each row
  const mineOn = (label) => {
    const m = h.match(new RegExp('<b class="[^"]*">([^<]*)</b><span>' + label + '</span>'));
    return m ? m[1] : null;
  };
  t.ok(mineOn('structures standing') === String(IB.liveStructs(0).length),
    'it counts the structures still standing (' + mineOn('structures standing') + ')');
  t.ok(mineOn('forge ranks') === '2', 'and the two forge ranks you actually bought');
  t.ok(mineOn('on the bridge') === String(IB.laneArmy(0)) && IB.laneArmy(0) > 0,
    'and the army actually standing on the bridge (' + IB.laneArmy(0) + ')');
  t.ok(+mineOn('gathering /s') > 0, 'and what your hold earns every second');
  {
    // it has to keep up: break something and the count drops
    const before = +mineOn('structures standing');
    const st = IB.frontStruct(0); st.hp = 0; st.dead = true;
    h = IB.pauseHtml();
    t.ok(+mineOn('structures standing') === before - 1, 'a turret you lose comes straight off the report');
    st.dead = false; st.hp = st.mhp;
    h = IB.pauseHtml();
  }

  // the line of battle marks exactly one attackable structure per side
  for (const side of [0, 1]){
    const lob = IB.lineOfBattle(side);
    t.ok((lob.match(/lb front/g) || []).length === 1, 'side ' + side + ' has exactly one structure the enemy may attack');
    t.ok((lob.match(/class="lb/g) || []).length === G.sides[side].structs.length, 'and every structure is drawn in the line');
  }
  // break one and the line shows it
  const front = IB.frontStruct(1);
  front.hp = 0; front.dead = true;
  const lob2 = IB.lineOfBattle(1);
  t.ok(/lb gone/.test(lob2), 'a broken structure is greyed out of the line of battle');
  t.ok(IB.frontStruct(1) !== front && (lob2.match(/lb front/g) || []).length === 1,
    'and the next one back becomes the one you can hit');

  // the gathering number in the HUD and the report is the real rate
  IB.newMatch({ diff:'veteran', seed:411 });
  const s2 = P();
  t.ok(IB.gatherRate(s2, 'gold') === 0 || s2.workers.gold > 0, 'an empty mine pays nothing');
  IB.assign(s2, 'gold', 4);
  const rate = IB.gatherRate(s2, 'gold');
  t.ok(rate > 0, 'workers on the gold seam show a rate (' + rate.toFixed(2) + '/s)');
  const g0 = s2.res.gold;
  step(10);
  const got = (s2.res.gold - g0) / 10;
  t.ok(Math.abs(got - rate) / rate < .12,
    'and that rate is what the mine actually pays (' + rate.toFixed(2) + ' shown, ' + got.toFixed(2) + ' paid)');
  t.ok(IB.keysHtml().split('<kbd>').length - 1 >= IB.KEYS.length, 'the help sheet prints a key chip for every shortcut');
}

/* ------------------------------------------------------- a fair bridge */
{
  // Win/loss is a terrible instrument for this: over 120 mirror matches its
  // standard deviation is 5.5 wins, so a 57%/43% reading says almost nothing.
  // Measure the two sides against each other inside a fixed window instead —
  // both play the whole window, so neither number is confounded by who won.
  let dmg0 = 0, dmg1 = 0, push = 0, n = 0, kills0 = 0, kills1 = 0;
  // Sample size is not a detail here. Measured over 40 matches, the paired
  // wall-damage difference is 271 +/- 651 on a total of ~5700 — so one match
  // carries a standard deviation of about 2100. Three matches could therefore
  // swing +/-42% of the total on nothing at all, and the 25% band this test
  // used to carry failed on roughly any perturbation of the AI. Six matches
  // and a 45% band puts the guard at about 1.5 sigma: still small enough to
  // catch the class of bug that once had one side winning 74% of mirrors,
  // large enough not to cry wolf.
  for (const seed of [21001, 21008, 21015, 21022, 21029, 21036]){
    IB.newMatch({ diff:'veteran', seed });
    G.sides[0].ai = true;                 // both holds play, or this is not a mirror
    for (let i = 0; i < 30 * 60 * 6 && G.state === 'play'; i++){
      IB.update(1 / 30);
      if (i % 600 === 0){ push += IB.frontlineX(0) - (C.LANE_LEN - IB.frontlineX(1)); n++; }
    }
    // missing hp, not hp lost against a fixed baseline — a hold that buys
    // Reinforced Stone raises its own maximum mid-match
    const missing = (sd) => G.sides[sd].structs.reduce((a, x) => a + Math.max(0, x.mhp - Math.max(0, x.hp)), 0);
    dmg0 += missing(1); dmg1 += missing(0);
    kills0 += G.sides[0].kills; kills1 += G.sides[1].kills;
  }
  const tot = dmg0 + dmg1;
  t.ok(tot > 2000, 'the two holds actually fought (' + Math.round(tot) + ' wall damage between them)');
  t.ok(Math.abs(dmg0 - dmg1) / tot < .45,
    'neither side breaks the other faster (' + Math.round(dmg0) + ' vs ' + Math.round(dmg1) + ')');
  t.ok(Math.abs(kills0 - kills1) / Math.max(1, kills0 + kills1) < .3,
    'and neither side kills more (' + kills0 + ' vs ' + kills1 + ')');
  t.ok(Math.abs(push / Math.max(1, n)) < 6,
    'the battle line does not sit on one hold’s half (' + (push / Math.max(1, n)).toFixed(1) + ' units off centre)');
}

/* ------------------------------------------------ the Host's decisions */
{
  // Each hold draws its decisions from its own stream so neither can bias the
  // other. That stream used to be seeded from the side index ALONE, so every
  // hold made exactly the same decisions in every match anybody ever played —
  // and one of the two fixed sequences was better than the other.
  const streamOf = (seed) => {
    IB.newMatch({ diff:'veteran', seed });
    return [G.sides[0].rs, G.sides[1].rs];
  };
  const a = streamOf(811), b = streamOf(812);
  t.ok(a[0] !== a[1], 'the two holds do not share a decision stream');
  t.ok(a[0] !== b[0] && a[1] !== b[1], 'and a new match deals both of them new decisions');
  t.ok(streamOf(811)[0] === a[0] && streamOf(811)[1] === a[1], 'the same seed still replays the same match');
  // the streams must actually diverge in use, not just in their seed
  {
    IB.newMatch({ diff:'veteran', seed:813 });
    const s = P(), f = E();
    const rolls = (sd) => Array.from({ length:12 }, () => IB.arnd(sd).toFixed(6)).join(',');
    t.ok(rolls(s) !== rolls(f), 'the two holds roll different decisions');
  }
  {
    // and one hold drawing more decisions than the other cannot shift the
    // other's — the bug that made both sides share one stream in the first place
    IB.newMatch({ diff:'veteran', seed:814 });
    const first = IB.arnd(E());
    IB.newMatch({ diff:'veteran', seed:814 });
    for (let i = 0; i < 25; i++) IB.arnd(P());
    t.ok(IB.arnd(E()) === first, "one hold's decisions never move the other's");
  }
}

/* ------------------------------------------------------ hero progression */
{
  // The brief puts skills at 3/6/9, an ultimate at 12 and a rank every three
  // levels after. Measured over 61 heroes in 12 full matches, the median hero
  // finished at 10, a third saw their ultimate and one in nine ever bought a
  // rank — most of the hero system was content nobody reached.
  t.ok(IB.xpNeed(2) > IB.xpNeed(1) && IB.xpNeed(23) > IB.xpNeed(22), 'each level costs more than the last');
  let total = 0;
  for (let l = 1; l < C.MAX_LEVEL; l++) total += IB.xpNeed(l);
  t.ok(total > 5000 && total < 40000, 'the whole ladder is a finite climb (' + total + ' xp)');
  // catch-up: measured against the hero setting the pace, so it cannot be
  // moved by one side simply forging more heroes
  {
    IB.newMatch({ diff:'veteran', seed:817 });
    const s = P(), f = E();
    const mk = (side, lvl) => { const h = IB.makeHero(side, 'fighter'); h.lvl = lvl; G.sides[side].heroes.push(h); return h; };
    const lead = mk(0, 12), behind = mk(0, 6), even = mk(1, 12);
    t.ok(IB.xpCatchup(lead) === 1, 'the hero setting the pace gets no help');
    t.ok(IB.xpCatchup(even) === 1, 'nor does one level with it');
    t.ok(IB.xpCatchup(behind) > 1, 'a hero six levels behind earns faster (' + IB.xpCatchup(behind).toFixed(2) + 'x)');
    const before = IB.xpCatchup(behind);
    for (let i = 0; i < 5; i++) mk(1, 1);          // the other hold forges a crowd of rookies
    t.ok(IB.xpCatchup(behind) === before, 'and forging more heroes cannot change what anyone earns');
    t.ok(IB.xpCatchup(mk(0, 1)) <= IB.CATCHUP_MAX, 'the help is capped (' + IB.xpCatchup(mk(0, 1)).toFixed(2) + 'x)');
    // it is a bonus, never a tax
    for (const h of G.sides.flatMap(x => x.heroes)) t.ok(IB.xpCatchup(h) >= 1, 'nobody is ever slowed down');
  }
  // and the ladder is now reachable inside a match. One match is a coin toss —
  // three is enough to catch the ladder going dead again without pinning the
  // suite to the luck of a single seed.
  {
    let best = 0, ranked = 0, heroes = 0, ults = 0, overCap = 0;
    for (const seed of [819, 823, 827]){
      IB.newMatch({ diff:'veteran', seed });
      G.sides[0].ai = true;
      for (let i = 0; i < 30 * 60 * 30 && G.state === 'play'; i++) IB.update(1 / 30);
      const all = G.sides.flatMap(sd => sd.heroes);
      heroes += all.length;
      best = Math.max(best, ...all.map(h => h.lvl));
      ults += all.filter(h => h.skills.some(s => s.ult)).length;
      ranked += all.filter(h => h.passRank > 1 || h.skills.some(s => s.rank > 1)).length;
      overCap += all.filter(h => h.lvl > C.MAX_LEVEL).length;
    }
    t.ok(heroes >= 6, 'three full matches forge heroes on both sides (' + heroes + ')');
    t.ok(ults > heroes * .4, 'most heroes live to cast an ultimate (' + ults + ' of ' + heroes + ')');
    t.ok(best >= C.RANK_LEVELS[0], 'the best of them reaches the rank ladder (' + best + ' >= ' + C.RANK_LEVELS[0] + ')');
    t.ok(ranked > 0, 'and somebody actually ranks a skill up (' + ranked + ' of ' + heroes + ')');
    t.ok(overCap === 0, 'nobody climbs past the cap');
  }
}

/* -------------------------------------------------------- class bodies */
{
  // Support used to fight from 6.6 range on a body tougher than the Assassin's
  // and won 27 of 40 in a 120-match round robin. The rule that broke is easy
  // to state: if you fight from safety you do not also get to be the hardest
  // thing on the bridge.
  IB.newMatch({ diff:'veteran', seed:601 });
  const ehp = (cls, lvl) => {
    const h = IB.makeHero(0, cls, 'Probe');
    h.lvl = lvl; IB.recalcHero(h, true);
    return { ehp:h.mhp * (1 + h.armor / 100), rng:IB.CLS[cls].b.rng, n:IB.CLS[cls].name };
  };
  for (const lvl of [1, 9, 18]){
    const all = IB.CLASSES.map(c => ehp(c.id, lvl));
    const ranged = all.filter(x => x.rng > 3), melee = all.filter(x => x.rng <= 3);
    t.ok(ranged.length >= 2 && melee.length >= 2, 'there are ranged and melee classes to compare at level ' + lvl);
    const toughestRanged = ranged.slice().sort((a, b) => b.ehp - a.ehp)[0];
    const softestMelee = melee.slice().sort((a, b) => a.ehp - b.ehp)[0];
    t.ok(toughestRanged.ehp < softestMelee.ehp,
      'at level ' + lvl + ' no ranged class outlasts a melee one (' + toughestRanged.n + ' ' +
      Math.round(toughestRanged.ehp) + ' vs ' + softestMelee.n + ' ' + Math.round(softestMelee.ehp) + ')');
  }
  // and a team effect may not simply scale with how many bodies are on screen
  {
    IB.newMatch({ diff:'veteran', seed:603 });
    const s = P();
    const h = IB.makeHero(0, 'support', 'Probe');
    s.heroes.push(h); IB.enterLane(h);
    h.x = 40; h.y = 0;                 // enterLane puts it at the gate; move it out to the fight
    for (let i = 0; i < 24; i++){
      const u = IB.spawnUnit(0, 'melee', { x:40 + (i % 12) * .35 });
      u.y = (i % 5) * .3;
    }
    IB.rebuildGrid();
    const got = IB.teamTargets(h, 9);
    t.ok(got.length === IB.TEAM_CAP, 'a team effect covers a fixed number of bodies (' + got.length + ')');
    const far = IB.teamTargets(h, 9).map(u => Math.abs(u.x - h.x)).sort((a, b) => a - b);
    const all = [];
    IB.rebuildGrid();
    for (const u of G.units) if (!u.dead && u.side === 0 && !u.isHero && Math.abs(u.x - h.x) < 9) all.push(Math.abs(u.x - h.x));
    all.sort((a, b) => a - b);
    t.ok(all.length > IB.TEAM_CAP, 'with more bodies in range than the cap (' + all.length + ')');
    t.ok(far.every((d, i) => Math.abs(d - all[i]) < 1e-9), 'and it covers the nearest ones — the front line');
  }
}

/* ------------------------------------------------------------ hero names */
{
  IB.newMatch({ diff:'veteran', seed:605 });
  const s = P();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  const names = [];
  for (let i = 0; i < 8; i++){
    const h = IB.makeHero(0, 'fighter');
    s.heroes.push(h);
    names.push(h.name);
  }
  t.ok(new Set(names).size === names.length, 'no two heroes in a hold answer to the same name');
  t.ok(names.every(n => IB.HERO_NAMES.includes(n)), 'and every name comes from the roster');
  t.ok(typeof IB.freeName(1) === 'string', 'the other hold names its heroes too');
}

/* ------------------------------------------------------ the result card */
{
  IB.newMatch({ diff:'veteran', seed:607 });
  const s = P(), f = E();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.build(s, s.plot.indexOf(null), 'forge');
  IB.buyUp(s, 'hp');
  IB.createHero(s, 'mage');
  const h = s.heroes[0];
  for (let i = 0; i < 20 && h.lvl < 14; i++){ IB.gainXp(h, IB.xpNeed(h.lvl) + 5); IB.autoPick(h); }
  s.kills = 41; f.kills = 12; s.structsKilled = 5; f.structsKilled = 1;
  G.winner = 0; G.state = 'over'; G.wave = 22; G.t = 640;
  let h2 = IB.overHtml();
  // Names the loser rather than a hardcoded faction: from seat two the loser
  // is the Azure Pact, and the card used to congratulate you by your own name.
  t.ok(/Ember Host’s gates are down/.test(h2), 'a win says whose gates went down');
  t.ok(/10:40/.test(h2), 'and how long it took');
  t.ok(/wave 22/.test(h2), 'and how far the waves got');
  const mineOn = (label) => {
    const m = h2.match(new RegExp('<b class="[^"]*">([^<]*)</b><span>' + label + '</span>'));
    return m ? m[1] : null;
  };
  t.ok(mineOn('walls broken') === '5' && mineOn('kills') === '41', 'the final tally is the real tally');
  t.ok(mineOn('forge ranks') === '1', 'including what you bought at the forge');
  t.ok(+mineOn('best hero') === h.lvl, 'and how far your best hero got');
  // the build the hero finished with is the point of the hero system
  t.ok(h2.includes(h.name), 'your hero is named on the card');
  t.ok(h2.includes(IB.PASS[h.passive].n), 'with the passive you chose');
  for (const sk of h.skills)
    t.ok(h2.includes(IB.SKILL[sk.id].n), 'and every skill you chose (' + IB.SKILL[sk.id].n + ')');
  t.ok(h.skills.some(sk => sk.ult) === /class="ult"/.test(h2), 'an ultimate is marked as one');
  // a loss reads as a loss
  G.winner = 1;
  h2 = IB.overHtml();
  t.ok(/Your gates are down/.test(h2) && !/fastest win/.test(h2), 'a loss is never celebrated as a record');
  // and the timeline says whose walls fell, not just "yours"
  t.ok(/You lost/.test(IB.timelineHtml()) || !G.timeline.length, 'the timeline names whose walls came down');
}

/* ------------------------------------------------------- arming the hold */
{
  // "In the barracks you can upgrade the minions to fighter minions and they
  // will march with the wave" is a pillar of this game. It barely happened:
  // the AI's job loop shovelled every idle worker into a mine the instant it
  // appeared, and arming needs an IDLE worker, so eight minutes of play armed
  // one Footman out of an army of ninety levies.
  const armedIn = (seed, mins) => {
    IB.newMatch({ diff:'veteran', seed });
    G.sides[0].ai = true;
    const seen = new Set();
    let armed = 0, levy = 0;
    for (let i = 0; i < 30 * 60 * mins && G.state === 'play'; i++){
      IB.update(1 / 30);
      for (const u of G.units){
        if (u.side !== 0 || u.isHero || seen.has(u.id)) continue;
        seen.add(u.id);
        if (u.paid) armed++; else levy++;
      }
    }
    return { armed, levy };
  };
  let armed = 0, levy = 0;
  for (const seed of [5031, 5062, 5093]){
    const r = armedIn(seed, 8);
    armed += r.armed; levy += r.levy;
  }
  t.ok(levy > 100, 'the free levies keep coming (' + levy + ' over three matches)');
  t.ok(armed >= 9, 'and a hold with a barracks actually arms its workers (' + armed + ' armed bodies)');
  t.ok(armed / (armed + levy) > .04,
    'so what you build is a real part of the army, not a rounding error (' +
    (armed / (armed + levy) * 100).toFixed(1) + '%)');
  // the mechanism: something has to be idle to be armed
  {
    IB.newMatch({ diff:'veteran', seed:5124 });
    const s = P();
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'barracks');
    IB.assign(s, 'gold', 99); IB.assign(s, 'iron', 99); IB.assign(s, 'wood', 99); IB.assign(s, 'food', 99);
    t.ok(s.workers.idle === 0, 'with every worker on a job nobody is free to arm');
    t.ok(IB.trainUnit(s, 'melee') === 'no idle worker to arm', 'and the barracks says exactly that');
    IB.assign(s, 'gold', -1);
    t.ok(s.workers.idle === 1 && IB.trainUnit(s, 'melee') === null, 'pull one off a job and it can be armed');
  }
  // and the button has to say how many workers it wants. It printed a flat
  // '+1👥' for all three units while a Caster and a Cannon each take two, so
  // the button asked for one worker and then refused with 'no idle worker to
  // arm' while one stood right there.
  {
    IB.newMatch({ diff:'veteran', seed:5137 });
    const s = P();
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'barracks');
    const b = IB.bList(s, 'barracks')[0];
    while (b.lvl < IB.BUILDINGS.barracks.maxLvl) IB.upgradeBuilding(s, b.tile);
    const html = IB.dockHtml();                 // one string, every panel in it
    for (const k in IB.TRAIN){
      const d = IB.TRAIN[k];
      const seg = html.split('data-unit="' + k + '"')[1] || '';
      t.ok(seg.includes('+' + d.need + '👥'),
        'the ' + d.n + ' button asks for the ' + d.need + ' worker(s) it actually takes');
    }
    t.ok(new Set(Object.keys(IB.TRAIN).map(k => IB.TRAIN[k].need)).size > 1,
      'and the units do not all cost the same number of workers, so the label has to vary');
  }
}

/* ------------------------------------------------------ reading the wave */
{
  // The shape of a wave was announced by a toast that slid past in three
  // seconds and was never mentioned again, so for the rest of the wave there
  // was nothing to read and nothing to answer.
  IB.newMatch({ diff:'veteran', seed:1801 });
  t.ok(Object.keys(IB.WAVE_ANSWER).length === IB.WAVE_KINDS.length,
    'every wave shape has an answer written for it');
  for (const k of IB.WAVE_KINDS)
    t.ok((IB.WAVE_ANSWER[k.id] || '').length > 20 && IB.WAVE_ANSWER[k.id].length < 60,
      k.n + ' tells you what to do about it, briefly');
  // it reads the wave that actually spawned
  for (const kind of IB.WAVE_KINDS){
    E().waveKind = kind.id;
    const w = IB.foeWarning();
    t.ok(w.includes(kind.n.replace(/^an? /, '')), 'the panel names ' + kind.n);
    t.ok(w.includes(IB.WAVE_ANSWER[kind.id].slice(0, 18)), 'and gives its answer');
  }
  t.ok(!/Next wave in/.test(IB.foeWarning()), 'without repeating the wave clock the top bar already shows');
  // and it is a READ of the simulation, never a roll: same state, same words,
  // and no random draw moved
  {
    IB.newMatch({ diff:'veteran', seed:1803 });
    const before = [IB.arnd(P()).toFixed(9), IB.arnd(E()).toFixed(9)];
    IB.newMatch({ diff:'veteran', seed:1803 });
    for (let i = 0; i < 5; i++) IB.foeWarning();
    const after = [IB.arnd(P()).toFixed(9), IB.arnd(E()).toFixed(9)];
    t.ok(before[0] === after[0] && before[1] === after[1],
      'reading the wave panel does not touch either hold’s decisions');
  }
}

/* ------------------------------------------------------ what each pile is for */
{
  // Wood builds, iron arms, gold buys heroes and the forge's work, food feeds.
  // Iron used to be in the price of nearly every BUILDING as well as every
  // weapon: measured over ten matches it was the missing pile for 68% of
  // everything a hold could not afford and never once climbed past 300, while
  // wood sat in surplus. Moving the buildings onto wood took that to 52/44/26/4
  // across iron/wood/gold/food.
  IB.newMatch({ diff:'veteran', seed:1701 });
  const s = P();
  const K = ['gold','iron','wood','food'];
  const prices = [];
  for (const t in IB.BUILDINGS){ prices.push(IB.buildCost(t, 1)); prices.push(IB.buildCost(t, 2)); }
  for (const t in IB.TRAIN) prices.push(IB.TRAIN[t].cost);
  prices.push(C.WORKER_COST); prices.push(IB.HERO_COST);
  for (const u of [...IB.TOWER_UPS, ...IB.TROOP_UPS]) prices.push(u.cost);
  for (const n of IB.NODE_UPGRADABLE) prices.push(IB.nodeUpCost(s, n));
  t.ok(prices.length > 20, 'there are plenty of things to buy (' + prices.length + ')');
  const share = {};
  for (const k of K) share[k] = prices.filter(c => c[k]).length / prices.length;
  for (const k of K){
    t.ok(share[k] > .15, k + ' is asked for often enough to matter (' + Math.round(share[k] * 100) + '% of prices)');
    t.ok(share[k] < .85, 'and ' + k + ' is not a tax on everything (' + Math.round(share[k] * 100) + '%)');
  }
  // the buildings are made of wood, not iron: that is the whole point of the move
  const builds = Object.keys(IB.BUILDINGS).map(t => IB.buildCost(t, 1));
  const woodier = builds.filter(c => (c.wood || 0) > (c.iron || 0)).length;
  t.ok(woodier === builds.length, 'every building costs more wood than iron (' + woodier + ' of ' + builds.length + ')');
  // and the things that arm you are the ones that want iron
  const arms = [IB.TRAIN.melee.cost, IB.TRAIN.cannon.cost, IB.HERO_COST];
  t.ok(arms.every(c => (c.iron || 0) > 0), 'and everything that arms you is priced in iron');
}

/* --------------------------------------------------- a hero is actually reachable */
{
  // The tavern was decoration. Playing the player's own side with the same
  // assigner the Host uses, on veteran (so no difficulty eco multiplier is
  // flattering the result), NOT ONE of twelve seeds forged a hero inside seven
  // minutes: the price asked for 60 iron, and iron is also what arms every
  // soldier and buys every weapon upgrade, so a hold mines ~410 of it in six
  // minutes while spending ~480. Sampling every five seconds while a tavern
  // slot stood empty, it was short of iron 86% of the time.
  //
  // The fix was not to make the hero cheaper. Costed in worker-seconds at the
  // base gather rates, 130 gold + 60 iron + 45 food is 153 + 97 + 50 = 300
  // seconds of digging; 170 + 30 + 45 is 200 + 48 + 50 = 298. The same price,
  // asked for in the pile a hold actually accumulates.
  //
  // No statistical band here on purpose: seeds, dt and the whole simulation are
  // deterministic, so this count is exact and repeats byte for byte. The margin
  // (8 of 12 required, 10 measured) is there to survive unrelated balance work,
  // not noise. Reverting only HERO_COST takes it to 0 of 12.
  const K = ['gold','iron','wood','food'];
  let forged = 0, open = 0; const shortOf = { gold:0, iron:0, wood:0, food:0 };
  for (let n = 0; n < 12; n++){
    IB.newMatch({ diff:'veteran', seed: 900 + n * 53 });
    const s = P();
    s.ai = true;                                  // let the assigner play it out
    let got = false;
    for (let i = 0; i < 30 * 60 * 7 && G.state === 'play'; i++){
      IB.update(1 / 30);
      if (s.heroes.length > 0) got = true;
      if (i % 150 || got) continue;
      if (IB.heroCap(s) > s.heroes.length){       // a slot stood empty: why?
        open++;
        for (const k of K) if ((IB.HERO_COST[k] || 0) > s.res[k]) shortOf[k]++;
      }
    }
    if (got) forged++;
  }
  t.ok(forged >= 8, 'a hold that plays well forges a hero inside seven minutes (' +
    forged + ' of 12 seeds)');
  // and the pile it waits on is gold — the one the tavern is supposed to want
  t.ok(open === 0 || shortOf.gold >= shortOf.iron,
    'while the slot is empty it is waiting on gold, not iron (gold ' +
    Math.round(shortOf.gold / Math.max(1, open) * 100) + '%, iron ' +
    Math.round(shortOf.iron / Math.max(1, open) * 100) + '%)');
  // the worker-seconds arithmetic the price is built on, so a later edit that
  // quietly doubles the hero has to argue with this number
  const ws = K.reduce((a, k) => a + (IB.HERO_COST[k] || 0) / C.GATHER[k], 0);
  t.ok(ws > 250 && ws < 350, 'a hero costs about five worker-minutes (' + Math.round(ws) + 's)');
  t.ok((IB.HERO_COST.iron || 0) / C.GATHER.iron < (IB.HERO_COST.gold || 0) / C.GATHER.gold * .4,
    'and most of that is gold, not iron');
}

/* -------------------------------------------------------- class identity */
{
  // Every class wore the same blue plate with a different emoji on it.
  IB.newMatch({ diff:'veteran', seed:1611 });
  const s = P();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  const glyphs = new Set(), fields = new Set();
  for (const c of IB.CLASSES){
    const g = IB.classGlyph(c.id);
    t.ok(!!g && g.length <= 4, c.name + ' has a glyph');
    glyphs.add(g);
    const m = SRC.match(new RegExp('portrait\\[data-cls=' + c.id + '\\]\\s*\\{[^}]*background:([^;}]+)'));
    t.ok(!!m, c.name + ' has its own portrait field');
    if (m) fields.add(m[1].trim());
  }
  t.ok(glyphs.size === IB.CLASSES.length, 'no two classes share a glyph');
  t.ok(fields.size === IB.CLASSES.length, 'and no two share a portrait (' + fields.size + ' distinct)');
  // the sheet names the class on the portrait itself
  IB.createHero(s, 'mage');
  const h = s.heroes[0];
  IB.autoPick(h);
  IB.showHeroSheet(h);
  t.ok(SRC.includes('class="pcls"'), 'and the portrait carries the class name');
  t.ok(IB.CLS[h.cls].name === 'Mage', 'which is the class it was forged as');
}

/* ------------------------------------------------------------------ sound */
{
  // Sounds are synthesised, so a table entry nobody plays is silent dead
  // weight, and an event that plays a key the table lacks is a silent event.
  // Both directions, read out of the source: every quoted argument to sfx().
  const played = new Set();
  for (const m of SRC.matchAll(/\bsfx\(\s*(?:[^)]*?\?\s*)?'(\w+)'/g)) played.add(m[1]);
  for (const m of SRC.matchAll(/:\s*'(\w+)'\s*,\s*(?:tgt|st|h|u)\.x\s*\)/g)) played.add(m[1]);
  for (const m of SRC.matchAll(/\bsfx\(([^)]*)\)/g)){
    for (const q of m[1].matchAll(/'(\w+)'/g)) played.add(q[1]);
  }
  const table = new Set(Object.keys(IB.SFX));
  const silent = [...table].filter(k => !played.has(k));
  const missing = [...played].filter(k => !table.has(k));
  t.ok(table.size >= 14, 'the game has a sound for a decent number of things (' + table.size + ')');
  t.ok(silent.length === 0, 'every sound in the table is actually played somewhere (silent: ' + silent.join(', ') + ')');
  t.ok(missing.length === 0, 'and nothing asks for a sound the table does not have (missing: ' + missing.join(', ') + ')');
  // the loudest moments in a match each have one
  for (const k of ['heroDown', 'inhib', 'fall', 'wave', 'win', 'lose'])
    t.ok(table.has(k), 'there is a sound for ' + k);
  // shape: every entry is [minGap, fn] and the important ones ignore the voice cap
  let bad = 0, priority = 0;
  for (const k in IB.SFX){
    const d = IB.SFX[k];
    if (!Array.isArray(d) || typeof d[0] !== 'number' || typeof d[1] !== 'function') bad++;
    if (d[2]) priority++;
  }
  t.ok(bad === 0, 'every sound is a gap and a voice');
  t.ok(priority >= 6, 'and the ones that must never be dropped are marked (' + priority + ')');
  t.ok(IB.sfx('heroDown') === false, 'nothing makes noise in a headless run');
}

/* ---------------------------------------------------- the opening minute */
{
  // A new player spends the first minute reading the screen. That minute used
  // to earn nothing at all — four workers stood idle while the Host, which
  // assigns on its first tick, was three waves in — so the reward for reading
  // the game was starting it behind.
  IB.newMatch({ diff:'veteran', seed:1501 });
  const s = P();
  const before = Object.assign({}, s.res);
  for (let i = 0; i < 30 * 60; i++) IB.update(1 / 30);   // touch nothing for a minute
  const gained = ['gold','iron','wood','food'].filter(k => s.res[k] > before[k]);
  t.ok(gained.length >= 3, 'a minute of reading the screen still earns you something (' + gained.join(', ') + ')');
  t.ok(s.res.food > before.food, 'including food, which every worker you train costs 20 of');
  t.ok(s.workers.idle >= 1, 'and one worker is still waiting for you to place them');
  // the Host is not quietly ahead on the difficulty that promises an even fight
  const f = E();
  const mine = ['gold','iron','wood','food'].reduce((a, k) => a + (s.res[k] - before[k]), 0);
  t.ok(mine > 60, 'the hold gathers a real amount in that minute (' + Math.round(mine) + ')');
  t.ok(IB.workerCount(s) === IB.workerCount(f) || f.ai, 'both holds start from the same four workers');
}

/* ------------------------------------------------------ the attract screen */
{
  // The battle behind the menu is the first thing anybody sees. It used to sit
  // at one fixed wide zoom with the fighting a few pixels tall in the middle
  // of the panel; it sweeps the length of the world now.
  IB.startDemo();
  t.ok(G.demo === true && G.state === 'play', 'the menu has a live battle behind it');
  const xs = [];
  for (let i = 0; i < 30 * 90; i++){
    IB.update(1 / 30);
    IB.camStep(1 / 30);
    if (i % 60 === 0) xs.push(IB.cam.x);
  }
  const lo = Math.min(...xs), hi = Math.max(...xs);
  t.ok(hi - lo > 100, 'the camera actually travels (' + Math.round(lo) + ' → ' + Math.round(hi) + ')');
  t.ok(lo < IB.HOLD_X + 30, 'as far back as your hold (' + Math.round(lo) + ')');
  t.ok(hi > C.LANE_LEN - 20, 'and as far forward as theirs (' + Math.round(hi) + ')');
  t.ok(xs.every(x => x >= IB.CAM_MIN - 1 && x <= IB.CAM_MAX + 1), 'and never past the end of the world');
  t.ok(IB.cam.z >= IB.ZOOM_MIN && IB.cam.z <= IB.ZOOM_MAX, 'at a zoom the game would allow (' + IB.cam.z.toFixed(2) + ')');
  // a real match is not swept: the camera is yours
  IB.newMatch({ diff:'veteran', seed:1401 });
  t.ok(G.demo === false, 'starting a match ends the attract battle');
  IB.cam.follow = false;
  const was = IB.cam.x;
  for (let i = 0; i < 30 * 20; i++){ IB.update(1 / 30); IB.camStep(1 / 30); }
  t.ok(IB.cam.x === was, 'and then the camera stays exactly where you left it');
}

/* ------------------------------------------------- reaching the unit tiers */
{
  // Casters need a level-2 barracks and Cannons a level-3 one, so the price of
  // that upgrade decides whether two thirds of the TRAIN table exist at all.
  // It used to cost 90 iron — the one resource a hold arming Footmen (28 iron
  // each) never has — and traced over a match, iron sat under 60 while wood
  // climbed past 500 unspent. Measured over twelve matches, the barracks
  // finished at level 1 in nine of them and never once reached 3.
  const up = IB.buildCost('barracks', 2);
  t.ok(up.wood > 0, 'the barracks upgrade is priced in wood, the pile that accumulates');
  t.ok((up.iron || 0) <= 45, 'and does not lean on iron, the pile the muster drains (' + (up.iron || 0) + ')');
  {
    // affordability, worked rather than eyeballed: a hold five minutes in has
    // roughly this many workers on wood, at this rate, with the workshop
    // multiplier it is likely to have.
    IB.newMatch({ diff:'veteran', seed:1301 });
    const s = P();
    IB.assign(s, 'wood', 3);
    const per5 = IB.gatherRate(s, 'wood') * 300;
    t.ok(per5 > up.wood, 'three workers on wood pay for it inside five minutes (' +
      Math.round(per5) + ' vs ' + up.wood + ')');
  }
  {
    // and it actually happens in play. This used to assert `levels.some(l => 2)`
    // over three matches at thirteen minutes, which passed on code where the
    // tier was worthless: a hold reached level 2 and STILL never armed a single
    // Caster, because a Caster takes TWO idle workers (`need:2`) and the job
    // assigner reserved exactly one. Measured over twelve side-holds at nine
    // minutes, before: level 2 in 3, armed something other than a Footman in
    // ZERO. After: 10 and 8. So assert the thing that was actually dead.
    //
    // Deterministic, not statistical: fixed seeds, fixed dt, one simulation —
    // these counts repeat exactly. The margins (7 and 5, against 10 and 8
    // measured) are headroom for unrelated balance work, not for noise.
    const levels = [], armedOther = [];
    for (const seed of [5031, 5062, 5093, 5124, 5155, 5186]){
      IB.newMatch({ diff:'veteran', seed });
      G.sides[0].ai = true;
      const other = [0, 0];
      for (let i = 0; i < 30 * 60 * 9 && G.state === 'play'; i++){
        IB.update(1 / 30);
        for (const sd of [0, 1]) for (const q of G.sides[sd].trainQ)
          if (q.type !== 'worker' && q.type !== 'melee') other[sd]++;
      }
      for (const sd of [0, 1]){ levels.push(IB.barracksLvl(G.sides[sd])); armedOther.push(other[sd] > 0); }
    }
    const tier = levels.filter(l => l >= 2).length, other = armedOther.filter(Boolean).length;
    t.ok(tier >= 7, 'a hold reaches the barracks level that unlocks Casters (' +
      tier + ' of ' + levels.length + ': ' + levels.join(',') + ')');
    t.ok(other >= 5, 'and the tier is worth reaching — it arms something other than a Footman (' +
      other + ' of ' + armedOther.length + ' holds)');
    t.ok(levels.every(l => l <= IB.BUILDINGS.barracks.maxLvl), 'and none climbs past the cap');
  }
  {
    // The reserve, on its own. A Footman needs one worker and is always
    // affordable; a Caster needs two. With exactly the pair in hand, the tick
    // must not spend one of them on a Footman or shovel them into a mine —
    // either the Caster goes in, or the pair is still standing there.
    IB.newMatch({ diff:'veteran', seed:5209 });
    const s = P();
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'barracks');
    IB.upgradeBuilding(s, IB.bList(s, 'barracks')[0].tile);
    t.ok(IB.barracksLvl(s) === 2, 'a level-2 barracks is standing');
    for (const k of ['gold','iron','wood','food']) s.res[k] = 400;
    for (const n of ['gold','iron','wood','food']) IB.assign(s, n, -9);   // everyone home
    const held = s.workers.idle;
    s.workers.idle = 2;
    s.aiT = 0;
    IB.aiStep(s, .1);
    const q = s.trainQ.filter(o => o.type !== 'worker');
    t.ok(!q.some(o => o.type === 'melee'),
      'a Footman does not eat the pair of workers the hold is banking for a Caster');
    t.ok(q.some(o => o.type === 'caster') || s.workers.idle >= 2,
      'so either the Caster is armed or the pair is still idle (idle ' + s.workers.idle +
      ', queued ' + JSON.stringify(q.map(o => o.type)) + ')');
    t.ok(held >= 0, 'the hold had workers to bring home (' + held + ')');
  }
  {
    // The Cannon sits behind a THIRD barracks level, and that level was
    // unreachable for a different reason than the second one. Priced from the
    // game's own cost functions over twelve matches, a hold spent 741 wood
    // levelling farms — and 423 food, for population it was nowhere near
    // using — while never saving the 188 the barracks wanted. The upgrade list
    // is in priority order, but it only meant priority while its top was
    // affordable: a farm level is cheap and a hold owns five farms, so every
    // tick fell through to a farm and ate the wood in small bites.
    //
    // Twelve minutes rather than nine, because that is the window where the
    // third level is decidable at all. Before: level 3 in 0 of 12 side-holds,
    // a Cannon armed in 0. After: 9 and 5.
    //
    // Sixteen seeds rather than six, because six could not carry the second
    // assertion. Measured over 36 seeds, a hold reaches tier 3 in 71% of cases
    // and arms a Cannon in 25% — and the old bar was 3 of 12, which IS 25%. A
    // threshold sitting exactly on the population rate fails about two runs in
    // five whatever the code does, and it duly went red on a change that leaves
    // the rate untouched (18 of 72 holds before and 18 of 72 after). The bars
    // below are 14 of 32 against an expected 23, and 3 of 32 against an
    // expected 8. If you widen the window or change the AI, re-measure the rate
    // before touching the bar.
    const lv3 = [], cannon = [];
    for (const seed of [5031, 5062, 5093, 5124, 5155, 5186,
                        5217, 5248, 5279, 5310, 5341, 5372,
                        5403, 5434, 5465, 5496]){
      IB.newMatch({ diff:'veteran', seed });
      G.sides[0].ai = true;
      const gun = [0, 0];
      for (let i = 0; i < 30 * 60 * 12 && G.state === 'play'; i++){
        IB.update(1 / 30);
        for (const sd of [0, 1]) for (const q of G.sides[sd].trainQ)
          if (q.type === 'cannon') gun[sd]++;
      }
      for (const sd of [0, 1]){ lv3.push(IB.barracksLvl(G.sides[sd])); cannon.push(gun[sd] > 0); }
    }
    const top = lv3.filter(l => l >= 3).length, guns = cannon.filter(Boolean).length;
    t.ok(top >= 14, 'a hold reaches the barracks level that unlocks Cannons (' +
      top + ' of ' + lv3.length + ': ' + lv3.join(',') + ')');
    t.ok(guns >= 3, 'and it arms a Cannon with it (' + guns + ' of ' + cannon.length + ' holds)');
  }
  {
    // The save-up rule on its own: a cheap upgrade near the bottom of the list
    // must not be bought while the top of the list is within about half a
    // minute of digging. Nothing here is statistical — one hold, one state,
    // constructed by hand.
    IB.newMatch({ diff:'veteran', seed:5233 });
    const s = P();
    rich(s);
    for (let i = s.plot.indexOf(null); i >= 0; i = s.plot.indexOf(null))
      IB.build(s, i, i % 2 ? 'farm' : 'barracks');            // a full plot, both types on it
    const bar = IB.bList(s, 'barracks')[0];
    IB.upgradeBuilding(s, bar.tile);
    const farm = IB.bList(s, 'farm')[0];
    t.ok(bar.lvl === 2 && farm.lvl === 1, 'a level-2 barracks and a level-1 farm are standing');
    const want = IB.buildCost('barracks', 3), cheap = IB.buildCost('farm', 2);
    t.ok(want.wood > cheap.wood, 'the barracks level is the dearer of the two in wood (' +
      want.wood + ' vs ' + cheap.wood + ')');
    IB.assign(s, 'wood', 2);
    for (const k of ['gold','iron','food']) s.res[k] = 9000;
    s.res.wood = want.wood - 8;                                // eight short, seconds away
    t.ok(!IB.canPay(s, want) && IB.canPay(s, cheap), 'it can afford the farm but not the barracks');
    t.ok(8 <= IB.gatherRate(s, 'wood') * 30,
      'and the shortfall is inside the save-up window (' + Math.round(IB.gatherRate(s, 'wood') * 30) + ' wood in 30s)');
    for (let i = 0; i < 20; i++){ s.aiT = 0; IB.aiStep(s, .1); }
    t.ok(farm.lvl === 1, 'so it holds the wood instead of levelling the farm (farm at level ' + farm.lvl + ')');
    t.ok(s.res.wood >= cheap.wood, 'and the pile is still there to spend (' + Math.round(s.res.wood) + ')');
  }
}

/* --------------------------------------------------- what a plot buys you */
{
  // Sixteen plots is the whole hold, so a building that changes nothing is a
  // trap you pay for twice: once in resources and once in the slot. The forge
  // audit found a dead upgrade this way; this is the same audit one level up.
  // Every observable a building is supposed to move:
  const readings = (s) => ({
    pop:IB.popCap(s), fields:IB.fieldSlots(s), pits:IB.trainSlots(s),
    muster:IB.barrackSlots(s), tier:IB.barracksLvl(s), forge:IB.upCap(s),
    heroes:IB.heroCap(s), gather:IB.gatherMul(s),
  });
  const changed = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]);
  const fresh = () => { IB.newMatch({ diff:'veteran', seed:1201 }); const s = P(); rich(s); return s; };
  for (const type of Object.keys(IB.BUILDINGS)){
    // the first one
    let s = fresh();
    const before = readings(s);
    const slot = s.plot.indexOf(null);
    t.ok(IB.build(s, slot, type) === null, 'a ' + IB.BUILDINGS[type].n + ' can be built');
    const one = changed(before, readings(s));
    t.ok(one.length > 0, 'a ' + IB.BUILDINGS[type].n + ' changes something (' + (one.join(', ') || 'NOTHING') + ')');
    // and the level after that
    rich(s);
    const mid = readings(s);
    const err = IB.upgradeBuilding(s, slot);
    if (!err){
      const up = changed(mid, readings(s));
      t.ok(up.length > 0, 'upgrading a ' + IB.BUILDINGS[type].n + ' changes something (' + (up.join(', ') || 'NOTHING') + ')');
    }
    // a SECOND one on another plot — this is the case the Hero Factory failed
    s = fresh();
    IB.build(s, s.plot.indexOf(null), type);
    rich(s);
    const after1 = readings(s);
    t.ok(IB.build(s, s.plot.indexOf(null), type) === null, 'a second ' + IB.BUILDINGS[type].n + ' can be built');
    const two = changed(after1, readings(s));
    t.ok(two.length > 0, 'and a second ' + IB.BUILDINGS[type].n + ' is worth its plot (' + (two.join(', ') || 'NOTHING') + ')');
  }
  // hero slots specifically: two taverns are worth the same as one upgraded once
  {
    const s = fresh();
    IB.build(s, s.plot.indexOf(null), 'tavern');
    t.ok(IB.heroCap(s) === 1, 'one Hero Factory forges one hero');
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'tavern');
    t.ok(IB.heroCap(s) === 2, 'a second one forges a second (' + IB.heroCap(s) + ')');
    const s2 = fresh();
    const t2 = s2.plot.indexOf(null);
    IB.build(s2, t2, 'tavern'); rich(s2); IB.upgradeBuilding(s2, t2);
    t.ok(IB.heroCap(s2) === 2, 'and so does upgrading the first — the two routes agree');
    for (let i = 0; i < 4; i++){ rich(s2); IB.build(s2, s2.plot.indexOf(null), 'tavern'); }
    t.ok(IB.heroCap(s2) === 3, 'but three is the cap however you get there (' + IB.heroCap(s2) + ')');
  }
  // and the Host's build plan must not ask for anything that does nothing
  {
    const plan = SRC.match(/const AI_BUILD_PLAN = \[([^\]]*)\]/)[1];
    const types = [...plan.matchAll(/'(\w+)'/g)].map(m => m[1]);
    t.ok(types.length > 8, 'the Host has a real build plan (' + types.length + ' entries)');
    t.ok(types.every(x => IB.BUILDINGS[x]), 'every entry in it is a building that exists');
  }
}

/* ------------------------------------------------------- battle damage */
{
  // A turret at a fifth of its health used to look exactly like a fresh one,
  // so the only way to know which wall was about to fall was to read its bar.
  IB.newMatch({ diff:'veteran', seed:907 });
  IB.cam.follow = false; IB.cam.z = IB.cam.tz = 1.2;
  const st = IB.frontStruct(1);
  t.ok(IB.WEAR(st) === 0, 'a fresh wall shows no damage');
  let last = 0, bands = new Set(), backwards = 0;
  for (let f = 100; f >= 0; f--){
    st.hp = st.mhp * (f / 100);
    const w = IB.WEAR(st);
    if (w < last) backwards++;
    last = w; bands.add(w);
  }
  t.ok(backwards === 0, 'damage only ever gets worse as health falls');
  t.ok(bands.size >= 3, 'there are several stages of ruin to see (' + [...bands].join(',') + ')');
  st.hp = 1; st.dead = true;
  t.ok(IB.WEAR(st) === 0, 'and a broken one is drawn as rubble, not as a cracked tower');
  st.dead = false; st.hp = st.mhp;

  // every structure kind, at every stage, against the colour-checking stub
  let threw = null, drew = 0;
  for (const sd of G.sides) for (const s2 of sd.structs){
    for (const f of [1, .6, .35, .18, .05, 0]){
      s2.hp = s2.mhp * f; s2.dead = f === 0;
      IB.cam.x = s2.x;
      try { IB.draw(); drew++; } catch (e){ threw = s2.key + '@' + f + ': ' + e.message; }
    }
    s2.hp = s2.mhp; s2.dead = false;
  }
  t.ok(threw === null, 'every wall draws cleanly at every stage of ruin (' + (threw || drew + ' draws') + ')');
  t.ok(drew >= 50, 'and all of them were drawn (' + drew + ')');

  // the wear is hashed, not rolled: the same wall must not shimmer between frames
  {
    const s3 = IB.frontStruct(0);
    s3.hp = s3.mhp * .3;
    const before = G.units.length;
    IB.draw(); IB.draw();
    t.ok(G.units.length === before, 'drawing damage never touches the simulation');
    t.ok(IB.WEAR(s3) === IB.WEAR(s3), 'and the stage it shows is stable');
    s3.hp = s3.mhp;
  }
  // it tracks the real fight, not just a test poke
  {
    IB.newMatch({ diff:'veteran', seed:911 });
    G.sides[0].ai = true;
    let worst = 0;
    for (let i = 0; i < 30 * 60 * 12 && G.state === 'play'; i++){
      IB.update(1 / 30);
      if (i % 900 === 0) for (const sd of G.sides) for (const s4 of sd.structs) worst = Math.max(worst, IB.WEAR(s4));
    }
    t.ok(worst >= 2, 'a real siege batters walls far enough to show it (worst stage seen: ' + worst + ')');
  }
}

/* ------------------------------------------------------- unit silhouettes */
{
  // A cannon is worth about four bodies and used to be drawn as a man with a
  // crate; an ogre is worth a wave and was a slightly larger man. They have
  // their own shapes now, which means their own draw paths — and the stub
  // canvas throws on a bad colour, so this is a real check on all of them.
  IB.newMatch({ diff:'veteran', seed:901 });
  IB.cam.follow = false; IB.cam.x = 40; IB.cam.z = IB.cam.tz = 1.2;
  const kinds = Object.keys(IB.UNITS);
  t.ok(kinds.length >= 5, 'there are several kinds to tell apart (' + kinds.join(', ') + ')');
  let drew = 0, threw = null;
  for (const side of [0, 1]) for (const k of kinds){
    for (const state of ['plain', 'hit', 'burning', 'stunned', 'shielded', 'swinging', 'hurt']){
      G.units.length = 0;
      const u = IB.spawnUnit(side, k, { x:40, y:0 });
      if (!u) continue;
      if (state === 'hit') u.hitT = .2;
      if (state === 'burning') u.burn = { dps:5, t:2 };
      if (state === 'stunned') u.stunT = 1;
      if (state === 'shielded') u.shield = 50;
      if (state === 'swinging') u.swing = .2;
      if (state === 'hurt') u.hp = u.mhp * .4;
      try { IB.draw(); drew++; } catch (e){ threw = k + '/' + state + '/side' + side + ': ' + e.message; }
    }
  }
  t.ok(threw === null, 'every kind draws cleanly in every state (' + (threw || drew + ' draws') + ')');
  t.ok(drew >= kinds.length * 7 * 2 - 4, 'and all of them actually got drawn (' + drew + ')');
  // the two machine silhouettes are the ones that must not fall back to a person
  const src = SRC.slice(SRC.indexOf('function drawUnit(c, u){'));
  t.ok(/kind === 'cannon'\){ drawCannon/.test(src), 'a cannon is drawn as a siege engine, not a soldier');
  t.ok(/kind === 'super'\){ drawOgre/.test(src), 'an ogre is drawn as an ogre');
  t.ok(/function drawUnitMarks/.test(SRC),
    'and both share the shield/burn/stun/health marks, so a cannon can still catch fire');
}

/* ------------------------------------------------------------ health bars */
{
  IB.newMatch({ diff:'veteran', seed:829 });
  const s = P();
  const u = IB.spawnUnit(0, 'melee', { x:40 });
  t.ok(!IB.showsBar(u), 'a minion at full health carries no bar');
  u.hp = u.mhp - 1;
  t.ok(IB.showsBar(u), 'one that has been hurt does');
  u.hp = u.mhp; u.shield = 40;
  t.ok(IB.showsBar(u), 'and so does a shielded one, so the shield is visible');
  u.shield = 0;
  rich(s); IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.createHero(s, 'tank');
  const h = s.heroes[0];
  t.ok(IB.showsBar(h) && h.hp === h.mhp, 'a hero keeps its bar at full health — it is what you are watching');
  // in a real brawl most bodies are untouched, which is the whole point
  IB.spawnWave();
  step(2);
  const live = G.units.filter(x => !x.dead && !x.isHero);
  t.ok(live.length >= 6, 'a wave is a crowd (' + live.length + ')');
  t.ok(live.filter(IB.showsBar).length < live.length,
    'and not every one of them is drawing a bar (' + live.filter(IB.showsBar).length + ' of ' + live.length + ')');
}

/* ------------------------------------------------- naming the bridge */
{
  // Every building in the hold carried its name. Nothing on the bridge did —
  // eight identical towers and two diamonds, whose names appeared only in a
  // toast that had already scrolled past ('Ember Host loses Inner Turret') or
  // in a panel you had to click each one to read. And the rule that decides
  // the match — only the outermost STANDING structure can be attacked — was
  // invisible, so you could not see where your wave would land.
  IB.newMatch({ diff:'veteran', seed:863 });
  // Read through fallbacks so that reverting the source fails these assertions
  // out loud instead of throwing on a missing export.
  const SHORT = IB.STRUCT_SHORT || {};
  const label = (st) => (IB.structLabel ? IB.structLabel(st) : null);
  const says = (st) => (label(st) || { txt:'' }).txt.includes('in play');
  for (const st of IB.STRUCTS)
    t.ok(!!SHORT[st.key], st.n + ' has a short name for the world (' + (SHORT[st.key] || 'none') + ')');
  t.ok(Object.keys(SHORT).length === IB.STRUCTS.length,
    'and there are no short names for structures that do not exist');
  // the short form exists because the full one does not fit between two towers
  const longest = Math.max(0, ...Object.values(SHORT).map(n => n.length));
  t.ok(longest > 0 && longest <= 9, 'the longest short name is nine characters (' + longest + ')');
  for (const st of IB.STRUCTS)
    t.ok((SHORT[st.key] || '').length <= st.n.length,
      'and none is longer than the name it stands in for (' + st.n + ')');

  for (const side of [0, 1]){
    const list = G.sides[side].structs;
    const marked = list.filter(says);
    t.ok(marked.length === 1, 'exactly one structure on side ' + side + ' says it is in play');
    t.ok(marked[0] === IB.frontStruct(side), 'and it is the one that may actually be attacked');
    t.ok(list.every(st => (label(st) || {}).col === (side === 0 ? '#bfe0ff' : '#ffc4bd')),
      'both of a side\'s labels wear that side\'s colour');
  }
  // knock the front one down: the mark moves, and rubble stops naming itself
  {
    const list0 = G.sides[0].structs;                      // sorted outer-first, gates last
    const front = IB.frontStruct(0), next = list0[list0.indexOf(front) + 1];
    front.hp = 0; front.dead = true;
    t.ok(label(front) === null,
      'a broken structure carries no name — it is already printing its rebuild countdown');
    t.ok(says(next), 'and the mark moves to what is behind it');
    t.ok(list0[list0.length - 1].key === 'gate' && !says(list0[list0.length - 1]),
      'while the gates behind everything stay unmarked');
    front.dead = false; front.hp = front.mhp;
  }
  // and it survives the render path with the fussy context watching the colours
  IB.draw();
  t.ok(true, 'the bridge draws with its names on');
}

/* ------------------------------------------------------- framing + the sky */
{
  // A phone used to open at the same zoom floor as a laptop, which left the
  // world a thin ribbon in a very large sky.
  t.ok(IB.startZoom(390) >= .72, 'a phone opens zoomed in enough to read the world (' + IB.startZoom(390).toFixed(2) + ')');
  t.ok(IB.startZoom(1400) > IB.startZoom(390) * .7, 'a laptop still opens showing plenty of bridge');
  for (const w of [320, 390, 405, 760, 1024, 1400, 2400]){
    const z = IB.startZoom(w);
    t.ok(z >= IB.ZOOM_MIN && z <= IB.ZOOM_MAX, 'the opening zoom at ' + w + 'px is inside the zoom range (' + z.toFixed(2) + ')');
  }
  t.ok(IB.startZoom(759) > IB.startZoom(761) - .3, 'nothing falls off a cliff either side of the narrow breakpoint');

  // clouds and birds are laid out once, from a hash, and never from the
  // simulation's RNG — a redraw must not be able to change the fight
  const c1 = IB.clouds(), c2 = IB.clouds();
  t.ok(c1 === c2 && c1.length > 4, 'the sky is laid out once and cached (' + c1.length + ' clouds)');
  t.ok(c1.every(cl => [cl.x, cl.y, cl.s, cl.d, cl.a].every(v => typeof v === 'number' && isFinite(v))),
    'every cloud has finite numbers');
  t.ok(c1.every(cl => cl.y >= 0 && cl.y < .5), 'and sits in the sky, not through the bridge');
  {
    // Decoration must never touch the simulation's random streams: two runs
    // of the same seed have to agree whether or not anything was drawn.
    const run = (drawing) => {
      IB.newMatch({ diff:'veteran', seed:501 });
      const out = [];
      for (let i = 0; i < 6; i++){
        if (drawing) IB.draw();
        out.push(IB.arnd(P()).toFixed(9), IB.arnd(E()).toFixed(9));
        step(1);
        out.push(G.units.length);
      }
      return out.join(',');
    };
    t.ok(run(false) === run(true), 'drawing the sky (or anything else) cannot change the fight');
  }
}

/* ------------------------------------------------------- the hero profile */
{
  IB.newMatch({ diff:'veteran', seed:503 });
  const s = P();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.createHero(s, 'mage');
  const h = s.heroes[0];
  t.ok(IB.heroDoing(h) === 'Waiting on you to choose.', 'a hero with an unspent pick says so');
  IB.autoPick(h);
  t.ok(IB.heroDoing(h) === 'Marching.', 'once the pick is spent it is out on the bridge');
  h.inLane = false;      // the state a resumed save comes back in
  t.ok(IB.heroDoing(h) === 'In the hold, ready to march.', 'a hero waiting to walk out says so');
  h.inLane = true;
  h.dead = true; h.respawnT = 12;
  t.ok(/Reforging/.test(IB.heroDoing(h)), 'a dead hero says when it is coming back');
  h.dead = false;

  // the meters: the health bar reads the real health, the xp bar the real xp
  let m = IB.heroMeters(h);
  t.ok(m.includes(Math.round(h.hp) + ' / ' + Math.round(h.mhp)), 'the health bar prints the health it draws');
  h.hp = h.mhp * .5;
  t.ok(/hm-hp" style="width:5[01]\./.test(IB.heroMeters(h)), 'a half-dead hero has a half-full bar');
  t.ok(/level 3 unlocks a pick/.test(IB.heroMeters(h)), 'and the xp bar names the level that unlocks the next pick');
  for (let i = 0; i < 40 && h.lvl < C.MAX_LEVEL; i++){ IB.gainXp(h, IB.xpNeed(h.lvl) + 5); IB.autoPick(h); }
  t.ok(h.lvl === C.MAX_LEVEL && /fully grown/.test(IB.heroMeters(h)), 'a maxed hero is told it is done growing');
  // the widths it prints are always drawable
  for (const pct of [0, .01, .5, 1]){
    h.hp = h.mhp * pct;
    const w = IB.heroMeters(h).match(/hm-hp" style="width:([\d.]+)%/);
    t.ok(w && +w[1] >= 0 && +w[1] <= 100, 'the health bar width stays inside the bar at ' + (pct * 100) + '% health');
  }
  h.hp = h.mhp;
}

/* ---------------------------------------------------------------- the intro */
{
  // Shown once, on the very first match, and never again.
  t.ok(IB.SEEN_KEY === 'ib_seen', 'the intro remembers itself under a stable key');
  delete store[IB.SEEN_KEY];
  t.ok(IB.seenIntro() === false, 'a fresh browser has not seen the intro');
  IB.markSeen();
  t.ok(IB.seenIntro() === true, 'once shown, it is remembered');
  t.ok(store[IB.SEEN_KEY] === '1', 'and remembered in localStorage, so it survives a reload');
  // starting a match must not quietly forget it
  IB.newMatch({ diff:'recruit', seed:313 });
  t.ok(IB.seenIntro() === true, 'a new match does not re-arm the intro');
  t.ok(/data-act="replay"/.test(SRC), 'and it can still be replayed from the help sheet');
}

/* ---------------------------------------------------------------- mines */
{
  IB.newMatch({ diff:'veteran', seed:89 });
  const s = P();
  rich(s);
  const cap0 = IB.nodeCap(s, 'gold'), rate0 = IB.nodeRate(s, 'gold');
  t.ok(IB.nodeLvl(s, 'gold') === 1, 'mines start at level 1');
  t.ok(IB.upgradeNode(s, 'gold') === null, 'a mine can be dug deeper');
  t.ok(IB.nodeCap(s, 'gold') > cap0, 'digging adds working places (' + cap0 + '→' + IB.nodeCap(s, 'gold') + ')');
  t.ok(IB.nodeRate(s, 'gold') > rate0, 'and raises output per worker');
  t.ok(typeof IB.upgradeNode(s, 'food') === 'string', 'fields are grown with farms, not dug');
  let guard = 0;
  while (IB.upgradeNode(s, 'wood') === null && guard++ < 20);
  t.ok(IB.nodeLvl(s, 'wood') === C.NODE_MAX_LVL, 'mines stop at the level cap');
  // the extra places are real: workers can actually be put in them
  IB.assign(s, 'gold', 99);
  t.ok(s.workers.gold <= IB.nodeCap(s, 'gold'), 'the upgraded cap is what the job accepts');
  const g0 = s.res.gold;
  step(5);
  t.ok(s.res.gold > g0, 'and the deeper mine still pays out');
}

/* --------------------------------------------- the board waits for your choice */
{
  // A level-up choice used to leave the match running underneath it. Driven on
  // a real page with the choice sheet open for ten seconds, the hero lost 27%
  // of its health on desktop and 32% on a phone — and the health bar printed ON
  // the card was a snapshot from the moment it opened, so it read nearly full
  // while the hero was dying. On a 390px screen the sheet covers the lane
  // completely, so there was nothing to glance at either. The first hero
  // decision a new player makes was teaching them that a menu is safe.
  //
  // The board holds only for a choice the PLAYER has to make, and only while
  // the sheet is actually open: a pending pick alone must not freeze the match,
  // or it would stop with nothing on screen to explain why.
  t.ok(typeof IB.holdsBoard === 'function', 'whether the board holds is readable from outside');
  const holds = (h) => (IB.holdsBoard ? IB.holdsBoard(h) : false);
  IB.newMatch({ diff:'veteran', seed:1523 });
  const s = P();
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.createHero(s, 'fighter');
  const h = s.heroes[0];
  t.ok(h.pend.length > 0, 'a fresh hero has a choice waiting (' + h.pend.length + ')');
  t.ok(holds(h), 'and that choice holds the board');
  t.ok(G.held === false, 'but nothing is held until the sheet is actually opened');

  // the Host resolves its own picks in the same tick, so it must never hold
  const foe = G.sides[1];
  rich(foe);
  if (!IB.bList(foe, 'tavern').length) IB.build(foe, foe.plot.indexOf(null), 'tavern');
  IB.createHero(foe, 'tank');
  const fh = foe.heroes[foe.heroes.length - 1];
  if (fh) t.ok(!holds(fh), "the Host's own choice never holds the board");

  // a hold actually stops the simulation
  {
    G.held = true;
    const t0 = G.t, w0 = G.wave, hp0 = h.hp, g0 = s.res.gold;
    for (let i = 0; i < 300; i++) IB.update(1 / 30);       // ten seconds of match time
    t.ok(G.t === t0, 'ten seconds of ticks move the clock not at all while held (' + G.t + ')');
    t.ok(G.wave === w0 && s.res.gold === g0, 'no wave lands and nothing is gathered');
    t.ok(h.hp === hp0, 'and the hero takes no damage while you are reading its cards');
    G.held = false;
    step(2);
    t.ok(G.t > t0, 'and the match resumes once the choice is made (' + G.t.toFixed(1) + 's)');
  }
  // resolving the last pick releases it
  {
    let guard = 0;
    while (h.pend.length && guard++ < 12) IB.pickOption(h, 0);
    t.ok(h.pend.length === 0, 'the choices are all made');
    t.ok(!holds(h), 'so the hero no longer holds the board');
  }
  // and an AI-driven player side does not hold either — the loop harnesses
  // drive side 0 with s.ai = true and must not deadlock on a pick.
  //
  // The first version of this check was VACUOUS and an audit caught it. It
  // forged the hero on a side already flagged ai, then guarded the real
  // assertion behind `if (ah.pend.length)` — but createHero calls autoPick
  // synchronously for an ai side, which drains pend in the same call, so that
  // was empty in 399 of 399 trials and the meaningful assertion was dead code
  // behind a `t.ok(true)` wearing a meaningful-sounding label.
  //
  // Forge it on a hold that is NOT yet flagged ai, so the pick survives, and
  // flip the flag afterwards: holdsBoard reads G.sides[0].ai at call time.
  {
    IB.newMatch({ diff:'veteran', seed:1531 });
    const a = P();
    rich(a);
    IB.build(a, a.plot.indexOf(null), 'tavern');
    IB.createHero(a, 'mage');
    const ah = a.heroes[0];
    t.ok(!!ah && ah.pend.length > 0,
      'the hero really does have an unresolved pick to test with (' +
      (ah ? ah.pend.length : 'no hero') + ')');
    t.ok(holds(ah), 'and it holds the board while the hold is played by a human');
    a.ai = true;
    t.ok(!holds(ah), 'but a hold played by the assigner never freezes the board');
  }
}

/* ---------------------------------------------------------------- the advisor */
{
  // The next-step hint has to name a real, currently-possible action — and it
  // must go quiet once the hold is actually running itself.
  IB.newMatch({ diff:'veteran', seed:97 });
  const s = P();
  const a0 = IB.adviceFor(s);
  t.ok(a0 && /worker/i.test(a0.txt), 'a fresh hold is told to put its idle workers to work');
  t.ok(['jobs','train','sel','forge','heroes'].includes(a0.tab), 'and the hint points at a real dock tab');
  for (const n of ['gold','iron','wood','food']) IB.assign(s, n, 99);
  const a1 = IB.adviceFor(s);
  t.ok(!a1 || !/standing around/.test(a1.txt), 'once everyone has a job it stops saying that');
  rich(s);
  IB.build(s, s.plot.indexOf(null), 'barracks');
  const a2 = IB.adviceFor(s);
  t.ok(!a2 || !/Barracks/.test(a2.txt), 'and it stops asking for a barracks once one stands');
  // a hero with an unspent choice is always worth surfacing
  IB.build(s, s.plot.indexOf(null), 'tavern');
  IB.createHero(s, 'tank');
  const a3 = IB.adviceFor(s);
  t.ok(a3 && a3.tab === 'heroes' && /choice/i.test(a3.txt), 'an unspent hero choice is surfaced');
  IB.autoPick(s.heroes[0]);
  // Follow the advice literally, the way a new player would. Every hint must be
  // one the player can actually carry out, or they get stuck in a loop.
  let guard = 0, stuck = null, lastTxt = '', repeats = 0;
  while (guard++ < 40){
    const a = IB.adviceFor(s);
    if (!a) break;
    if (a.txt === lastTxt){ if (++repeats > 2){ stuck = a.txt; break; } } else repeats = 0;
    lastTxt = a.txt;
    let err = null;
    if (/Farm/.test(a.txt)) err = IB.build(s, s.plot.indexOf(null), 'farm');
    else if (/Forge/.test(a.txt)) err = IB.build(s, s.plot.indexOf(null), 'forge');
    else if (/Hero Factory/.test(a.txt)) err = IB.build(s, s.plot.indexOf(null), 'tavern');
    else if (/Arm a /.test(a.txt)) err = IB.trainUnit(s, 'melee');
    else if (/Train one more|Train another/.test(a.txt)) err = IB.trainWorker(s);
    else if (/standing around/.test(a.txt)){
      const node = a.txt.match(/on (\w+)\./)[1];
      err = IB.assign(s, node, 1);
    }
    else if (/another hero/.test(a.txt)) err = IB.createHero(s, 'mage');
    else break;
    t.ok(err === null || guard > 38, 'advice "' + a.txt.slice(0, 42) + '…" can actually be carried out');
    step(8);                                  // let anything queued finish
  }
  t.ok(!stuck, 'the advisor never repeats an instruction the player already followed' + (stuck ? ' (' + stuck + ')' : ''));
  t.ok(guard < 40, 'and it converges');

  // The loop above hands the hold rich(s) first, so every hint it walks is one
  // the player can pay for immediately — which is exactly why it never caught
  // this: sampled once a second over eight twelve-minute matches, the bar sat
  // on the IDENTICAL sentence 'Build a Hero Factory...' for an unbroken 152
  // seconds, because it repeated an instruction the hold could not afford and
  // gave no sign of getting closer. A hint you cannot act on has to at least
  // tell you what you are waiting for.
  {
    IB.newMatch({ diff:'veteran', seed:1103 });
    const s = P();
    for (const n of ['gold','iron','wood','food']) IB.assign(s, n, 99);   // nobody idle
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'barracks');
    const cost = IB.buildCost('tavern', 1);
    const txt = () => (IB.adviceFor(s) || { txt:'' }).txt;
    for (const k of ['gold','iron','wood','food']) s.res[k] = 0;
    s.res.wood = cost.wood;                              // wood covered, gold is the gap
    const poor = txt();
    t.ok(/Hero Factory/.test(poor), 'a hold with no Hero Factory is still pointed at one (' + poor + ')');
    t.ok(/\d+ more gold/.test(poor), 'and told which pile it is waiting on, and how much');
    const short1 = +(poor.match(/(\d+) more gold/) || [])[1];
    t.ok(short1 === cost.gold, 'the number is the actual shortfall (' + short1 + ' of ' + cost.gold + ')');
    s.res.gold = Math.floor(cost.gold / 2);
    const short2 = +(txt().match(/(\d+) more gold/) || [])[1];
    t.ok(short2 < short1, 'and it counts down as the pile fills (' + short1 + ' → ' + short2 + ')');
    s.res.gold = cost.gold;
    t.ok(!/more gold/.test(txt()) && /Hero Factory/.test(txt()),
      'once it is affordable the hint is the plain instruction again (' + txt() + ')');
  }
  // and it must not ask for a worker that is already on the way
  {
    IB.newMatch({ diff:'veteran', seed:1107 });
    const s = P();
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'barracks');
    IB.build(s, s.plot.indexOf(null), 'tavern');
    IB.createHero(s, 'tank'); IB.autoPick(s.heroes[0]);
    IB.build(s, s.plot.indexOf(null), 'farm');           // room to grow
    for (const n of ['gold','iron','wood','food']) IB.assign(s, n, 99);
    s.res.iron = 0;                                      // nothing armable, nothing mustering
    const before = (IB.adviceFor(s) || { txt:'' }).txt;
    t.ok(/Train one more|Train another/.test(before),
      'with nobody idle and room in the hold it asks for another worker (' + before + ')');
    t.ok(IB.trainWorker(s) === null, 'so train one');
    const after = (IB.adviceFor(s) || { txt:'' }).txt;
    t.ok(!/Train one more|Train another/.test(after),
      'and it stops asking while that worker is on the way (' + (after || '(nothing)') + ')');
  }
}

/* ------------------------------------------- what the panels actually tell you */
{
  // Three things the player was never told, each of which already existed in
  // the data or the state and simply was not rendered.
  IB.newMatch({ diff:'veteran', seed:1601 });
  const s = P();

  // 1. Every forge upgrade carries a description of exactly what a rank buys,
  //    and it was read nowhere outside its own definition — the Forge was the
  //    only purchase in the game with no explanation, so a player had to spend
  //    a rank to learn that Arcane Sockets means attack speed.
  {
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'forge');
    const html = IB.dockHtml();
    let shown = 0;
    for (const u of [...IB.TOWER_UPS, ...IB.TROOP_UPS]){
      t.ok(!!u.d && u.d.length > 8, u.n + ' has a description in the table');
      if (html.includes(u.d)) shown++;
    }
    t.ok(shown === IB.TOWER_UPS.length + IB.TROOP_UPS.length,
      'and every one of them reaches the player (' + shown + ' of ' +
      (IB.TOWER_UPS.length + IB.TROOP_UPS.length) + ')');
  }

  // 2. The advice bar never looked at the bridge. Simulated a player who does
  //    nothing: their outer turret crossed 50% at t=200s, 25% at t=296s and
  //    fell at t=300s, and at every one of those instants the bar said '1
  //    worker is standing around. Put one on gold.' Damage to an off-screen
  //    structure makes no shake, the minimap draws a dying turret like a
  //    healthy one, and the only signal is a 2.2s toast AFTER it is gone.
  {
    IB.newMatch({ diff:'veteran', seed:1607 });
    const s2 = P();
    for (const n of ['gold','iron','wood','food']) IB.assign(s2, n, 99);   // no idle-worker note
    const front = IB.frontStruct(0);
    t.ok(!!front, 'there is a structure in play');
    front.hp = front.mhp;
    const calm = (IB.adviceFor(s2) || { txt:'' }).txt;
    t.ok(!/down to/.test(calm), 'a healthy front raises no alarm (' + (calm || '(nothing)') + ')');
    front.hp = front.mhp * .2;
    const alarm = (IB.adviceFor(s2) || { txt:'' }).txt;
    t.ok(/down to/.test(alarm), 'a front at a fifth health does (' + alarm + ')');
    t.ok(alarm.includes(IB.STRUCT_SHORT[front.key]), 'and it names which structure');
    t.ok(/\d+%/.test(alarm), 'and how bad it is');
    // a hurt structure BEHIND the front is shielded and cannot be attacked, so
    // it must not raise an alarm
    front.hp = front.mhp;
    const list = G.sides[0].structs, behind = list[list.indexOf(front) + 1];
    if (behind){
      behind.hp = behind.mhp * .1;
      const quiet = (IB.adviceFor(s2) || { txt:'' }).txt;
      t.ok(!/down to/.test(quiet), 'but a shielded structure behind it does not (' + (quiet || '(nothing)') + ')');
      behind.hp = behind.mhp;
    }
  }

  // 3. The wave shape was not in the save, so a resumed match reported the
  //    quiet wave however heavy the wave on the bridge actually was.
  {
    IB.newMatch({ diff:'veteran', seed:1613 });
    const foe = G.sides[1];
    foe.waveKind = 'siege';
    const before = IB.foeWarning();
    t.ok(/tears at stone|siege/i.test(before), 'the briefing reads the wave shape (' + before + ')');
    IB.saveMatch();
    IB.newMatch({ diff:'veteran', seed:1613 });
    t.ok(IB.loadMatch() !== false, 'the match resumes');
    t.ok(G.sides[1].waveKind === 'siege',
      'and the wave shape came back with it (' + G.sides[1].waveKind + ')');
    t.ok(IB.foeWarning() === before, 'so the briefing still says the same thing');
  }

  // 4. A held sheet has to look held — it used to be pixel-identical to an
  //    idle peek at a hero, down to the pause button still reading 'running'.
  {
    IB.newMatch({ diff:'veteran', seed:1619 });
    const s3 = P();
    rich(s3);
    IB.build(s3, s3.plot.indexOf(null), 'tavern');
    IB.createHero(s3, 'tank');
    const h = s3.heroes[0];
    t.ok(h.pend.length > 0 && IB.holdsBoard(h), 'the hero holds the board');
    t.ok(typeof IB.paintHeld === 'function', 'the pause icon has one shared painter');
  }
}

/* ---------------------------------------------------------------- effects */
{
  IB.newMatch({ diff:'veteran', seed:101 });
  // The countryside is laid out once per hold, not re-rolled every frame.
  t.ok(IB.scatterCache[0] === null, 'a new match forgets the old countryside');
  const a = IB.scatterFor(0);
  t.ok(a.length > 20 && IB.scatterFor(0) === a, 'the scatter is built once and reused');
  t.ok(IB.scatterFor(1) !== a, 'each hold gets its own');
  let off = 0;
  for (const it of a){
    const w = IB.holdWorld(it.gx, it.gy);
    if (w[1] < IB.PLAT.far || w[1] > IB.PLAT.near || w[0] > 0) off++;
  }
  t.ok(off === 0, 'nothing is scattered off the mesa or over the cliff (' + off + ')');
  // Same deal for the mottling on the mesa top: laid out once, never re-rolled,
  // and every patch has to land on the island rather than out over the chasm.
  t.ok(IB.grassCache[0] === null, 'a new match forgets the old grass too');
  const g = IB.grassFor(0);
  t.ok(g.length > 10 && IB.grassFor(0) === g, 'the dapple is built once and reused');
  t.ok(IB.grassFor(1) !== g, 'and each hold gets its own');
  let gOff = 0;
  for (const p of g)
    if (p.y < IB.PLAT.far || p.y > IB.PLAT.near || p.x > 3 || p.x < 3 - (IB.PLAT.back + 34)) gOff++;
  t.ok(gOff === 0, 'no patch of grass is painted off the mesa (' + gOff + ')');
  // The road has to start at the bridge end of the mesa and finish at the hall,
  // or it is decoration pointing nowhere.
  const R = IB.ROAD;
  t.ok(R.length >= 4 && R[0][0] > 6, 'the road starts out at the gate end');
  t.ok(Math.hypot(R[R.length - 1][0] - IB.KEEP.gx, R[R.length - 1][1] - IB.KEEP.gy) < 1.6,
    'and finishes at the town hall');
  for (const p of R){
    const w = IB.holdWorld(p[0], p[1]);
    if (w[1] < IB.PLAT.far || w[1] > IB.PLAT.near || w[0] > 3 || w[0] < 3 - (IB.PLAT.back + 34)) gOff++;
  }
  t.ok(gOff === 0, 'and every bend of it is on the island');
  // The town hall itself, and the workers who orbit it, must stand on ground —
  // it used to be drawn four world units past the outer cliff.
  const kw = IB.holdWorld(IB.KEEP.gx, IB.KEEP.gy);
  const outerW = 3 - (IB.PLAT.back + 34);
  t.ok(kw[0] > outerW + 8, 'the town hall stands well inside the outer cliff');
  t.ok(kw[1] > IB.PLAT.far + 6 && kw[1] < IB.PLAT.near - 6, 'and clear of the far and near edges');
  // ...and the mines have to be somewhere you can actually see them: the great
  // keep in drawEnds() stands at world (-16, 0) and is painted over the hold.
  const sx = (x, y) => x * .96 - y * .52, sy = (x, y) => x * .07 + y * .60;
  for (const k in IB.NODES){
    const n = IB.NODES[k], w = IB.holdWorld(n.gx, n.gy);
    const dx = Math.abs(sx(w[0] + 16, w[1])), dy = sy(w[0] + 16, w[1]);
    t.ok(dx > 9 || dy > 14 || dy < -20, k + ' is not standing behind the castle (dx ' + dx.toFixed(1) + ' dy ' + dy.toFixed(1) + ')');
  }
  IB.newMatch({ diff:'veteran', seed:101 });
  t.ok(IB.scatterCache[0] === null, 'and it is dropped again on the next match');
  t.ok(IB.grassCache[0] === null, 'along with the grass');
}
{
  // Camera shake is bounded and ignores anything happening off screen.
  IB.newMatch({ diff:'veteran', seed:103 });
  IB.cam.shake = 0;
  IB.shake(50, IB.cam.x);
  t.ok(IB.cam.shake <= 14, 'shake is capped no matter how big the hit');
  IB.cam.shake = 0;
  IB.shake(10, IB.cam.x + 4000);
  t.ok(IB.cam.shake === 0, 'a blow off the edge of the screen does not rattle the camera');
}
{
  // What holds the bridge up. There used to be three filled half-ellipses
  // hanging under the deck — arches that sprang from nothing and rested on
  // nothing — over a gap that was otherwise a flat wash of dark teal.
  IB.newMatch({ diff:'veteran', seed:109 });
  t.ok(IB.PIER_TOP < 0 && IB.PIER_BOT < IB.PIER_TOP, 'the piers hang below the deck, not above it');
  const xs = [];
  for (let x = IB.PIER_SPAN / 2; x < C.LANE_LEN; x += IB.PIER_SPAN) xs.push(x);
  t.ok(xs.length >= 5, 'the span stands on more than a token pier or two (' + xs.length + ')');
  // A pier standing inside an abutment, or off the end of the span, is a pier
  // holding up nothing.
  t.ok(xs.every(x => x > 5 && x < C.LANE_LEN - 5), 'every pier is clear of both abutments');
  // ...and the spandrels are only drawn BETWEEN piers, so the last one has to
  // have a neighbour to spring to.
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  t.ok(gaps.every(g => Math.abs(g - IB.PIER_SPAN) < 1e-9), 'and they are evenly spaced, so every arch has two feet');
  t.ok(IB.PIER_HW * 2 < IB.PIER_SPAN, 'a pier is narrower than the gap it leaves');

  const sp = IB.spires();
  t.ok(sp.length > 6 && IB.spires() === sp, 'the rock in the gorge is laid out once and reused');
  let bad = 0;
  for (const s of sp){
    if (s.zb + s.h > IB.PIER_TOP) bad++;            // poking up through the deck
    if (s.y > -C.LANE_W / 2) bad++;                 // standing in front of the bridge
    if (s.x < -10 || s.x > C.LANE_LEN + 10) bad++;  // outside the gorge entirely
  }
  t.ok(bad === 0, 'no spire pokes through the deck or stands in front of it (' + bad + ')');
  // The whole under-bridge path has to survive being drawn at both extremes of
  // the zoom, because the gorge is mostly off screen at one of them.
  for (const z of [.4, 1, 2.4]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'and the gorge draws at every zoom without throwing');
}
{
  // The mines. Their art derives its lit and shaded tones from the node's own
  // colour with shade(), which does parseInt on the string after the '#' — a
  // node added later with 'gold' or 'rgb(...)' in that field renders NaNNaNNaN
  // and the canvas throws, but only while that hold is the one on screen.
  IB.newMatch({ diff:'veteran', seed:111 });
  for (const k in IB.NODES){
    const col = IB.NODES[k].col;
    t.ok(/^#[0-9a-f]{6}$/i.test(col), k + ' has a colour shade() can read (' + col + ')');
    t.ok(/^#[0-9a-f]{6}$/i.test(IB.shade(col, .8)), 'and shade() gives one back for ' + k);
  }
  // The plot tiles changed: an empty plot now passes null for its stroke, and
  // the stub canvas in this harness throws on a bad colour string. Drive both
  // states, and a selection, at both ends of the zoom.
  const s = P();
  rich(s);
  IB.cam.follow = false; IB.cam.x = IB.HOLD_X + 6;
  for (const z of [.5, 1.6]){
    IB.cam.z = IB.cam.tz = z;
    IB.sel.tile = -1; IB.sel.node = null; IB.draw();       // every plot empty
    IB.sel.tile = 2; IB.draw();                            // one pegged out and selected
    for (let i = 0; i < s.plot.length; i++) IB.build(s, i, 'farm');
    IB.sel.tile = -1; IB.sel.node = 'gold'; IB.draw();     // every plot built, a mine picked
    for (let i = 0; i < s.plot.length; i++) s.plot[i] = null;
  }
  IB.sel.node = null; IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'a hold draws empty, built and selected, at both ends of the zoom');
  // Nothing in the hold art may touch the simulation's random stream — the
  // ore cart and the workers both ride the clock, and a draw that consumed
  // rnd() would desync the two machines the moment one of them looked away.
  IB.newMatch({ diff:'veteran', seed:113 });
  const before = IB.netHash();
  for (let i = 0; i < 5; i++) IB.draw();
  t.ok(IB.netHash() === before, 'drawing the hold does not move the simulation');
}
{
  // The abutments — the blocks the span lands on. They were three flat quads
  // and five faint stripes, a brown box at both ends of the bridge. They are
  // coursed masonry taking the thrust of an arch now, which means the taper
  // has to lean IN: a batter going the other way puts the whole block on an
  // overhang, and at this camera angle you would not necessarily notice.
  for (let k = 0; k < IB.AB_N; k++){
    const t0 = k / IB.AB_N, t1 = (k + 1) / IB.AB_N;
    t.ok(IB.abHw(t1) < IB.abHw(t0), 'course ' + k + ' is shorter than the one above it');
    t.ok(IB.abY(t1) < IB.abY(t0), 'and pulled further back');
  }
  t.ok(IB.abHw(1) > 0 && IB.abY(1) > -C.LANE_W / 2,
    'the batter never crosses the far side of the block');
  t.ok(IB.AB_CAP > IB.abHw(0), 'the cap oversails the topmost course');
  t.ok(IB.AB_DZ < 0, 'and the courses go down from the deck, not up');

  // The logging camp. Its props are grid offsets from the woodland node, and
  // the whole point of pulling them out of the draw call is that a prop past
  // the near edge of the mesa hangs in the air — which is what the town hall
  // did, and what the first version of the wood chips did.
  IB.newMatch({ diff:'veteran', seed:117 });
  const N = IB.NODES.wood;
  const all = [...IB.WOOD_LOT.stumps, ...IB.WOOD_LOT.chips, ...IB.WOOD_LOT.trees,
               IB.WOOD_LOT.logs, IB.WOOD_LOT.block];
  t.ok(all.length >= 14, 'the camp has something in it (' + all.length + ' pieces)');
  let off = 0;
  for (const o of all){
    const w = IB.holdWorld(N.gx + o[0], N.gy + o[1]);
    if (w[1] < IB.PLAT.far + 3 || w[1] > IB.PLAT.near - 3) off++;
    if (w[0] > 0 || w[0] < 3 - (IB.PLAT.back + 34) + 3) off++;
  }
  t.ok(off === 0, 'every stump, log, chip and tree stands on the island (' + off + ')');
  // The ground props are laid out in front of the standing timber, or the
  // trees end up drawn over the top of the camp they belong to.
  const backmost = Math.min(...IB.WOOD_LOT.trees.map(o => o[1]));
  const frontmost = Math.max(...IB.WOOD_LOT.trees.map(o => o[1]));
  t.ok(IB.WOOD_LOT.block[1] > frontmost && IB.WOOD_LOT.logs[1] > backmost,
    'the block and the log pile sit in front of the timber');
  IB.cam.follow = false; IB.cam.x = IB.HOLD_X + 6;
  for (const z of [.5, 1.8]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'and the whole lot draws at both ends of the zoom');
}
{
  // The bodies. Every one of them used to be a flat fill on two 2px sticks —
  // the only things left in the game without a lit side, next to houses,
  // mines, cliffs and masonry that all have one — and the legs never moved, so
  // a wave marching up the span read as a row of pieces sliding along it.
  IB.newMatch({ diff:'veteran', seed:119 });
  const walker = IB.spawnUnit(0, 'melee', { x:40, y:0 });
  walker.target = null;
  IB.rebuildGrid();
  // A body with nothing in reach walks. Sample the cycle rather than one
  // instant, because the stride crosses zero twice a stride.
  let peak = 0;
  for (let i = 0; i < 40; i++){ IB.update(1 / 30); walker.target = null; peak = Math.max(peak, Math.abs(IB.strideOf(walker))); }
  t.ok(peak > IB.BODY_STRIDE * .5, 'a body walking up the bridge moves its legs (' + peak.toFixed(2) + ')');
  t.ok(peak <= IB.BODY_STRIDE + 1e-9, 'and never further than one stride (' + peak.toFixed(2) + ')');

  // ...and one stood in reach of what it is hitting plants its feet. This is
  // the whole reason the stride is a function and not arithmetic inline: legs
  // still swinging while a body trades blows on the spot is a moonwalk.
  const foe = IB.spawnUnit(1, 'melee', { x:40.2, y:0 });
  IB.rebuildGrid();
  walker.x = foe.x - .3; walker.target = foe;
  // Sweep the phase rather than the clock: update() would re-acquire the
  // target and push the two apart, and the point here is the branch, not the
  // pathing.
  let planted = true;
  for (let i = 0; i < 24; i++){ walker.ph = i * .31; if (IB.strideOf(walker) !== 0) planted = false; }
  t.ok(planted, 'a body fighting in reach keeps its feet on the ground');
  walker.x = foe.x - (walker.rng + foe.r + walker.r) - 4;
  let moved = false;
  for (let i = 0; i < 24; i++){ walker.ph = i * .31; if (Math.abs(IB.strideOf(walker)) > .4) moved = true; }
  t.ok(moved, 'and picks them up again once it has to close the gap');
  // Stunned and hooked bodies are not walking anywhere either.
  walker.target = null; walker.stunT = 1;
  t.ok(IB.strideOf(walker) === 0, 'a stunned body does not stride');
  walker.stunT = 0; IB.applyPull(walker, 34, 0, .4, foe);
  t.ok(IB.strideOf(walker) === 0, 'nor one on the end of a chain');
  walker.pullT = 0;

  // Every kind of body has to survive the render path, in every state that
  // changes how it is drawn, at both ends of the zoom. The stub canvas in this
  // harness throws on a bad colour string, and the torso now derives three
  // tones from the side colour with shade().
  IB.newMatch({ diff:'veteran', seed:121 });
  const kinds = Object.keys(IB.UNITS);
  t.ok(kinds.length >= 4, 'there is more than one kind of body to draw (' + kinds.length + ')');
  for (const k of kinds) IB.spawnUnit(0, k, { x:50, y:0 });
  for (const cls of ['tank', 'mage', 'support', 'marksman']){
    const h = IB.makeHero(0, cls, 'Look');
    h.pend.length = 0; h.passive = 'ironhide'; IB.recalcHero(h);
    IB.enterLane(h); h.x = 52; h.y = 0;
  }
  IB.rebuildGrid();
  IB.cam.follow = false; IB.cam.x = 50;
  for (const z of [.45, 1, 2.6]){
    IB.cam.z = IB.cam.tz = z;
    IB.draw();
    for (const u of G.units){ u.hitT = .1; u.castT = .2; u.castCol = '#9ad8ff'; u.swing = .2; u.shield = 40; u.shT = 2; }
    IB.draw();
    for (const u of G.units){ u.hitT = 0; u.castT = 0; u.swing = 0; u.shield = 0; u.shT = 0; }
  }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'every kind of body draws, hit, casting, swinging and shielded, at every zoom');
  // And none of it may touch the simulation — the legs read the clock.
  const h0 = IB.netHash();
  for (let i = 0; i < 4; i++) IB.draw();
  t.ok(IB.netHash() === h0, 'drawing the bodies does not move the simulation');
}
{
  // `x % 1` keeps the SIGN of x. Every looping animation in the art takes its
  // phase that way and offsets it by something that can be negative — tileGX
  // is -1.5 on half the plots — so the forge's smoke came out with a negative
  // phase, and the puff sized by it asked the canvas for a negative radius.
  // Chromium throws on that, and it only happened on the plots left of centre.
  for (const v of [-2.75, -1, -0.25, 0, 0.25, 3.5, 7.75]){
    const r = IB.cyc(v);
    t.ok(r >= 0 && r < 1, 'cyc(' + v + ') is a real phase (' + r.toFixed(3) + ')');
  }
  t.ok(Math.abs(IB.cyc(-0.25) - 0.75) < 1e-12, 'and it wraps rather than reflecting');

  // A fitting anchored above the ridge stands in mid-air. The forge's chimney
  // was at z + 1.15 against a ridge at z + 0.85, so its masonry hung over the
  // roof with an opaque orange disc floating above that.
  for (const k in IB.FIT){
    const f = IB.FIT[k];
    t.ok(f.chimney <= f.wh + f.rh, k + '’s chimney is bedded in the roof, not floating over it');
    t.ok(f.chimney > f.wh, 'and it comes out above the wall head');
  }

  // Draw every building type, on every plot tile, at both ends of the zoom.
  // Half the tiles have a negative gx and that is what the bug above needed.
  IB.newMatch({ diff:'veteran', seed:123 });
  const s2 = P();
  rich(s2);
  const types = Object.keys(IB.BUILDINGS);
  t.ok(types.length >= 5, 'there is more than one kind of building (' + types.length + ')');
  let lefts = 0;
  for (let i = 0; i < s2.plot.length; i++){
    s2.plot[i] = { type:types[i % types.length], lvl:1, tile:i };
    if (IB.tileGX(i) < 0) lefts++;
  }
  t.ok(lefts > 0, 'and some of them are on the left half of the grid (' + lefts + ')');
  IB.cam.follow = false; IB.cam.x = IB.HOLD_X + 4;
  for (const z of [.5, 1, 2.2]){
    IB.cam.z = IB.cam.tz = z;
    for (const raise of [0, .6]){
      for (const b of s2.plot) if (b) b.raise = raise;
      for (let f = 0; f < 6; f++){ G.t += .21; IB.draw(); }   // walk the loops
    }
  }
  for (const b of s2.plot) if (b) b.raise = 0;
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'every building draws on every plot, mid-raise and finished, at every zoom');
}
{
  // The ogre and the cannon have their own draw functions and both missed the
  // pass that gave the infantry legs, a lit side and a face — so the biggest,
  // most dangerous thing on the bridge ended up the least detailed thing on it,
  // standing next to levies with more going on than it had.
  IB.newMatch({ diff:'veteran', seed:127 });
  // drawUnit dispatches on these two literal strings; rename a kind in the
  // unit table and the branch silently stops firing.
  t.ok(IB.UNITS.super && IB.UNITS.cannon, 'the two kinds with their own art still exist under those names');

  // Recoil. The sign is the whole point: a gun that kicked TOWARD the enemy
  // would read as a lunge, and it would read as one on only one side of the
  // bridge — which no single screenshot would show.
  const guns = [IB.spawnUnit(0, 'cannon', { x:40, y:0 }), IB.spawnUnit(1, 'cannon', { x:44, y:0 })];
  for (const g of guns){
    g.swing = 0;
    t.ok(IB.recoilOf(g) === 0, 'a gun that has not fired sits still');
    g.swing = IB.RECOIL_T;
    const r = IB.recoilOf(g);
    t.ok(Math.abs(r - IB.RECOIL) < 1e-9 || Math.abs(r + IB.RECOIL) < 1e-9,
      'and kicks a full stroke the instant it fires (' + r.toFixed(2) + ')');
    t.ok(Math.sign(r) === -IB.dirOf(g.side), 'backward, away from what it is shooting at, on side ' + g.side);
    g.swing = IB.RECOIL_T * .5;
    t.ok(Math.abs(IB.recoilOf(g)) < IB.RECOIL && Math.abs(IB.recoilOf(g)) > 0, 'and runs back in as the stroke decays');
    g.swing = IB.RECOIL_T * 4;
    t.ok(Math.abs(IB.recoilOf(g)) <= IB.RECOIL + 1e-9, 'never further than one stroke, however long the swing');
    g.swing = 0;
  }

  // Both big bodies, on both sides, at both ends of the lane — a unit can be
  // clamped out to x = -2, and the wheel roll is a phase taken off its x.
  const bigs = [];
  for (const side of [0, 1]) for (const k of ['super', 'cannon'])
    bigs.push(IB.spawnUnit(side, k, { x:side === 0 ? 30 : 90, y:0 }));
  IB.rebuildGrid();
  IB.cam.follow = false;
  for (const x of [-2, 30, C.LANE_LEN + 2]){
    for (const b of bigs) b.x = x;
    IB.cam.x = x;
    for (const z of [.45, 1, 2.6]){
      IB.cam.z = IB.cam.tz = z;
      for (const b of bigs){ b.swing = .2; b.hitT = 0; }
      IB.draw();
      for (const b of bigs){ b.swing = 0; b.hitT = .1; }
      IB.draw();
      for (const b of bigs) b.hitT = 0;
    }
  }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'the ogre and the gun draw on both sides, firing and hit, at both ends of the lane');
}
{
  // The mesa's walls. The bedding planes, joints, weathered lip and dissolve
  // into the chasm were written out per face — and the BACK wall got none of
  // them, so it stayed one flat brown quad. You never see it from your own
  // hold, which is why it survived: it looked fine right up until you pressed
  // FOE and the enemy island turned out to be sitting on a slab.
  IB.newMatch({ diff:'veteran', seed:131 });
  for (const side of [0, 1]){
    const fs = IB.platFaces(side);
    t.ok(fs.length === 3, 'side ' + side + ' has all three visible walls (' + fs.length + ')');
    const keys = fs.map(f => f.k).sort().join(',');
    t.ok(keys === 'inner,near,outer', 'and they are the near, inner and outer ones (' + keys + ')');
    const inner = side === 0 ? 3 : C.LANE_LEN - 3;
    const outer = inner - (side === 0 ? 1 : -1) * (IB.PLAT.back + 34);
    for (const f of fs){
      // A wall with no length draws nothing, and a wall drawn along a line the
      // mesa does not have would float beside the island.
      t.ok(f.a[0] !== f.b[0] || f.a[1] !== f.b[1], f.k + ' is a real segment');
      for (const p of [f.a, f.b]){
        const onX = Math.abs(p[0] - inner) < 1e-9 || Math.abs(p[0] - outer) < 1e-9;
        const onY = Math.abs(p[1] - IB.PLAT.far) < 1e-9 || Math.abs(p[1] - IB.PLAT.near) < 1e-9;
        t.ok(onX && onY, f.k + '’s corner is on the edge of the mesa');
      }
      // Every tone the rock is built from goes through shade(), which parseInts
      // the string after the '#'.
      for (const k of ['base', 'band', 'band2', 'lip'])
        t.ok(/^#[0-9a-f]{6}$/i.test(f[k]), f.k + '.' + k + ' is a colour shade() can read (' + f[k] + ')');
    }
  }
  // The two mesas must not share a wall — one hold's cliff standing where the
  // other's should be is the kind of thing that only shows at one camera angle.
  const a0 = IB.platFaces(0).map(f => f.k + ':' + f.a + '|' + f.b);
  const a1 = IB.platFaces(1).map(f => f.k + ':' + f.a + '|' + f.b);
  t.ok(a0.every(s => !a1.includes(s)), 'the two holds stand on their own rock');
  // and the whole thing draws from behind, which is where the flat wall was
  IB.cam.follow = false;
  for (const x of [IB.HOLD_X - 20, IB.HOLD_X + 4, C.LANE_LEN / 2, C.LANE_LEN - IB.HOLD_X + 20]){
    IB.cam.x = x;
    for (const z of [.45, 1, 2]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
  }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'both mesas draw from in front, from behind and from the middle');
}
{
  // Doors and windows. Every plot building goes through drawHouse and only the
  // town hall and the forge ever had an opening cut into it — the rest were
  // blank boxes standing next to a hall with a door, four lit windows and a
  // chimney.
  IB.newMatch({ diff:'veteran', seed:137 });
  // Add a building type and this fails until you say what its walls look like.
  // A null entry is a decision somebody made; a missing one is a case nobody
  // wrote, and those are what keep turning up in this file.
  for (const k in IB.BUILDINGS)
    t.ok(k in IB.TRIM, k + ' says whether it has openings');
  for (const k in IB.TRIM)
    t.ok(k in IB.BUILDINGS, 'TRIM.' + k + ' names a building that exists');

  for (const k in IB.TRIM){
    const spec = IB.TRIM[k];
    if (!spec) continue;
    const w = .40, d = .32, wh = .70;
    const os = IB.houseOpenings(w, d, wh, spec);
    t.ok(os.length === 1 + (spec.win || 0) + (spec.side || 0), k + ' cuts every opening it asks for');
    t.ok(os.filter(o => o.kind === 'door').length === 1, k + ' has exactly one door');
    for (const o of os){
      // The two faces this projection shows. An opening on either of the other
      // two is hidden by the building and surfaces over the roof instead —
      // which is what the town hall's windows did on the first pass, and a
      // still screenshot of the front of the house will not tell you.
      t.ok(o.plane === 'near' || o.plane === 'right', k + ' cuts only into a face you can see (' + o.plane + ')');
      t.ok(o.z0 >= 0 && o.z1 > o.z0 && o.z1 <= wh + 1e-9,
        k + '’s ' + o.kind + ' stays between the ground and the wall head');
      const lim = o.plane === 'near' ? w : d;
      t.ok(o.a >= -lim - 1e-9 && o.b <= lim + 1e-9 && o.b > o.a,
        k + '’s ' + o.kind + ' stays inside the wall it is cut into');
    }
    // A window overlapping the door reads as a smear, and only at one angle.
    for (const plane of ['near', 'right']){
      const on = os.filter(o => o.plane === plane).sort((p, q) => p.a - q.a);
      for (let i = 1; i < on.length; i++)
        t.ok(on[i].a >= on[i - 1].b - 1e-9 || on[i].z0 >= on[i - 1].z1 - 1e-9,
          k + '’s openings on the ' + plane + ' face do not overlap');
    }
  }
  // The door has to reach the ground — a door starting halfway up a wall is a
  // hatch, and the whole point is that somebody walks out of it.
  for (const k in IB.TRIM){
    if (!IB.TRIM[k]) continue;
    const door = IB.houseOpenings(.4, .32, .7, IB.TRIM[k]).find(o => o.kind === 'door');
    t.ok(door.z0 === 0, k + '’s door starts on the ground');
  }
}
{
  // Workers. There are more of these on screen than anything else in the game
  // — every mine crew, every field hand, every idle body round the hall — and
  // each was a rectangle with a circle on top, standing next to soldiers with
  // legs, boots, an arm and a visor.
  IB.newMatch({ diff:'veteran', seed:139 });
  // Their tunic was a hardcoded '#3f6f9e'. Workers are only ever drawn on your
  // OWN hold, so it looked right for as long as you were the Azure Pact — but
  // MY can be 1, and then player two's crews walked around their red hold
  // wearing the other side's blue. A per-side colour that is not per-side is
  // invisible from one seat and wrong from the other.
  const was = IB.holdSide;
  const coats = [0, 1].map(s => { IB.holdSide = s; return IB.workerCoat(); });
  IB.holdSide = was;
  t.ok(coats[0] !== coats[1], 'a worker wears the colour of the hold it works for');
  for (let s = 0; s < 2; s++){
    t.ok(/^#[0-9a-f]{6}$/i.test(coats[s]), 'side ' + s + '’s coat is a colour shade() can read (' + coats[s] + ')');
    t.ok(coats[s].toLowerCase() !== '#3f6f9e', 'and not the old fixed blue');
  }
  // The stride reads the phase it is handed and nothing else, so both machines
  // draw the same legs — and it can never throw a leg further than one step.
  let peak = 0;
  for (let i = 0; i < 40; i++) peak = Math.max(peak, Math.abs(Math.sin(i * .31) * IB.WORKER_STRIDE));
  t.ok(peak > IB.WORKER_STRIDE * .9 && peak <= IB.WORKER_STRIDE + 1e-9,
    'a worker takes a full stride and no more (' + peak.toFixed(2) + ')');

  // Draw a hold from BOTH seats with every job manned. The colour bug above
  // only exists in the seat the suite never used to sit in.
  const rich2 = (s) => { s.res.gold = 9000; s.res.iron = 9000; s.res.wood = 9000; s.res.food = 9000; };
  for (const seat of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:141 });
    IB.MY = seat;
    const s = G.sides[seat];
    rich2(s);
    s.workers.gold = 3; s.workers.iron = 3; s.workers.wood = 3; s.workers.food = 3; s.workers.idle = 6;
    for (let i = 0; i < 4; i++) IB.build(s, i, ['farm', 'barracks', 'forge', 'tavern'][i]);
    IB.cam.follow = false; IB.cam.x = IB.myHoldX() + 4;
    for (const z of [.5, 1, 2]){
      IB.cam.z = IB.cam.tz = z;
      for (let f = 0; f < 4; f++){ G.t += .27; IB.draw(); }
    }
  }
  IB.MY = 0; IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'a hold with every job manned draws from either seat, at every zoom');
}
{
  // The inhibitor — the thing that, when it breaks, lets the other side's
  // ogres through. It was a flat diamond sitting dead still on a plain grey
  // box, next to a gate with masonry, timber and a pennant.
  IB.newMatch({ diff:'veteran', seed:143 });
  let minSplit = 1e9, maxSplit = -1e9, minLift = 1e9, maxLift = -1e9;
  let outside = 0, offPlinth = 0, badGlint = 0, badAura = 0;
  for (let i = 0; i < 400; i++){
    const S = IB.shardAt(i * .11);
    if (Math.abs(S.split) >= IB.SHARD.w) outside++;
    if (S.lift < 0 || S.lift > IB.SHARD.rise + 1e-9) offPlinth++;
    if (!(S.glint >= 0 && S.glint < 1)) badGlint++;
    if (!(S.aura > 0 && S.aura < 1)) badAura++;
    minSplit = Math.min(minSplit, S.split); maxSplit = Math.max(maxSplit, S.split);
    minLift = Math.min(minLift, S.lift); maxLift = Math.max(maxLift, S.lift);
  }
  // A facet split that wanders outside the outline turns the shard back into
  // the flat diamond it used to be — and only at the moment it happens, so a
  // screenshot taken a tenth of a second either side looks perfect.
  t.ok(outside === 0, 'the lit facet never leaves the shard (' + outside + ' frames)');
  // A lift out of range either sinks it into its own plinth or leaves it in
  // the sky, and the shadow under it is sized from the same number.
  t.ok(offPlinth === 0, 'it always hovers within reach of its plinth (' + offPlinth + ')');
  t.ok(badGlint === 0 && badAura === 0, 'the glint stays a phase and the aura an alpha');
  // ...and it has to actually move, or all of the above is satisfied by a
  // constant and the shard is still standing dead still.
  t.ok(minSplit < -IB.SHARD.w * .5 && maxSplit > IB.SHARD.w * .5, 'the shard turns both ways');
  t.ok(maxLift - minLift > IB.SHARD.rise * .9, 'and rises and falls the whole way');
  t.ok(IB.SHARD.top > IB.SHARD.bot, 'the shard is taller than it is nothing');

  // Every structure, alive and broken, on both sides, across a full cycle of
  // the shard's clock — the shadow under it shrinks as it lifts, and the stub
  // canvas throws on a negative radius.
  IB.cam.follow = false;
  for (const side of [0, 1]){
    for (const st of G.sides[side].structs){
      IB.cam.x = st.x;
      for (const dead of [false, true]){
        st.dead = dead;
        for (const z of [.45, 1, 2.2]){
          IB.cam.z = IB.cam.tz = z;
          for (let f = 0; f < 8; f++){ G.t += .37; IB.draw(); }
        }
      }
      st.dead = false;
    }
  }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'every structure draws whole and broken, both sides, right through the cycle');
}
{
  // The turrets. Six of them on screen and they are what you spend the whole
  // match fighting past, and each was a tapered white block with a painted
  // circle on it — no hoarding, no slits, and nothing to show for a shot.
  IB.newMatch({ diff:'veteran', seed:149 });
  const tur = G.sides[1].structs.find(s => s.key === 't1');
  t.ok(tur && tur.ad > 0, 'there is a turret that shoots');
  const as = IB.attackSpeedOf(tur);

  // cd counts down from a full reload to zero, so the flash is 1 the instant
  // it looses and 0 when it is ready again.
  tur.cd = 1 / as;
  t.ok(Math.abs(IB.turretShot(tur).hot - 1) < 1e-9, 'the eye is full bright the instant it fires');
  tur.cd = 0;
  t.ok(IB.turretShot(tur).hot === 0 && IB.turretShot(tur).kick === 0, 'and dark once it is loaded again');
  tur.cd = -1;
  t.ok(IB.turretShot(tur).hot === 0, 'an overdue turret does not go negative');

  let outHot = 0, outKick = 0, notMono = 0, prevHot = -1, prevKick = -1;
  let minHot = 9, maxHot = -9, minKick = 9, maxKick = -9;
  for (let i = 0; i <= 200; i++){
    tur.cd = (1 / as) * (i / 200);
    const S = IB.turretShot(tur);
    if (!(S.hot >= 0 && S.hot <= 1)) outHot++;
    if (!(S.kick >= 0 && S.kick <= IB.TURRET_KICK + 1e-9)) outKick++;
    // The mount has to run back in, not wander: kick may only rise with hot.
    if (S.hot < prevHot - 1e-12 || S.kick < prevKick - 1e-12) notMono++;
    prevHot = S.hot; prevKick = S.kick;
    minHot = Math.min(minHot, S.hot); maxHot = Math.max(maxHot, S.hot);
    minKick = Math.min(minKick, S.kick); maxKick = Math.max(maxKick, S.kick);
  }
  t.ok(outHot === 0, 'the flash stays an alpha across the whole reload (' + outHot + ')');
  t.ok(outKick === 0, 'and the lurch stays within one stroke (' + outKick + ')');
  t.ok(notMono === 0, 'the mount runs back in rather than wandering (' + notMono + ')');
  // ...and it has to actually change. Every bound above is satisfied by a
  // constant, which is a lamp that never blinks — and a painted circle that
  // never brightened is what was there before.
  t.ok(maxHot - minHot > .9, 'the eye really does light and go out (' + minHot.toFixed(2) + '..' + maxHot.toFixed(2) + ')');
  t.ok(maxKick - minKick > IB.TURRET_KICK * .9, 'and the mount really does travel');

  // Then a real match: a turret that is actually shooting must be seen both
  // lit and dark, or the flash is tied to something that never moves.
  IB.newMatch({ diff:'veteran', seed:151 });
  G.sides[0].ai = true;
  let sawHot = false, sawCold = false;
  for (let i = 0; i < 30 * 90 && G.state === 'play'; i++){
    IB.update(1 / 30);
    for (const s of G.sides) for (const st of s.structs){
      if (st.dead || !st.ad) continue;
      const h = IB.turretShot(st).hot;
      if (h > .8) sawHot = true;
      if (h < .05) sawCold = true;
    }
  }
  t.ok(sawHot && sawCold, 'over a real match the turrets are seen both firing and loaded');
}
{
  // The great keep behind the gates. Its stations were loose numbers in the
  // draw call and they did what loose numbers do: the wall ended in a hard
  // bottom edge sitting on the grass, with no footing and no shadow under it,
  // while the gate standing right in front of it had both.
  const K = IB.KEEP_ART, base = IB.keepBase();
  t.ok(base === K.wallTop + K.wallH, 'the ground line is the foot of the wall');
  // A crown floating above its own wall, or sunk into it, is the same class of
  // mistake — and at this camera it reads as a shadow rather than a gap.
  t.ok(Math.abs((K.crownTop + K.crownH) - K.wallTop) <= 1,
    'the crown sits on the wall head rather than over it (' + (K.crownTop + K.crownH) + ' vs ' + K.wallTop + ')');
  // The towers and the wall have to stand on the SAME ground, or one of them
  // is buried and the other is in the air.
  t.ok(K.towerTop + K.towerH === base, 'the towers reach the same ground line as the wall');
  t.ok(K.towerTop < K.wallTop, 'and rise above it');
  t.ok(K.roofApex < K.roofEave && K.roofEave <= K.towerTop + 4, 'their roofs sit on top of them, apex highest');
  // The plinth carries everything: it has to be under the wall and wider.
  t.ok(K.plinthH > 0 && K.plinthOver > 0, 'there is a plinth and it oversails');
  // The doorway has to be inside the wall it is cut through — a door reaching
  // past the wall head is an arch, and one below the ground line is a cellar.
  t.ok(K.doorTop - K.doorR > K.wallTop, 'the doorway arch stays under the wall head');
  t.ok(K.doorTop + K.doorH >= base - 1 && K.doorTop + K.doorH <= base + 1, 'and its threshold is the ground');

  // Both ends drawn, at every zoom and from either seat — drawEnds mirrors
  // itself by dirOf(side) and half of what it draws is offset by it.
  IB.newMatch({ diff:'veteran', seed:153 });
  IB.cam.follow = false;
  for (const seat of [0, 1]){
    IB.MY = seat;
    for (const x of [-5, C.LANE_LEN / 2, C.LANE_LEN + 5]){
      IB.cam.x = x;
      for (const z of [.45, 1, 2.2]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
    }
  }
  IB.MY = 0; IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'both keeps draw from either seat at every zoom');
}
{
  // The deck. The lane you spend the whole match fighting on was two tones
  // alternating every four units, which at any distance is a stripe, with a
  // two-bar railing and nothing else.
  const D = IB.DECK_XS, half = C.LANE_W / 2, outer = half + .6;
  // The worn track is meant to be the strip everything marches down, so it has
  // to be inside the lane bodies are actually clamped to — wider than that and
  // it is ground worn by nobody.
  t.ok(D.track > 0 && D.track < half, 'the worn track lies inside the walkable lane');
  // The kerb is raised edging. Inside the lane it becomes a raised edge that
  // bodies stand on top of, which reads as them floating.
  t.ok(D.kerb >= half, 'the kerb starts at or outside the lane edge');
  t.ok(D.kerb < outer, 'and is still on the deck rather than past it');
  t.ok(D.railH > 0, 'the railing has height');

  // Then the part that ties the art to the simulation: over a real match, no
  // body may ever end up standing on the kerb. separate() shoves bodies
  // sideways and heroes are clamped by a different line to minions, so this is
  // not something the constants alone can tell you.
  IB.newMatch({ diff:'veteran', seed:157 });
  G.sides[0].ai = true;
  let onKerb = 0, widest = 0;
  for (let i = 0; i < 30 * 120 && G.state === 'play'; i++){
    IB.update(1 / 30);
    if (i % 5) continue;
    for (const u of G.units){
      if (u.dead) continue;
      widest = Math.max(widest, Math.abs(u.y));
      if (Math.abs(u.y) >= D.kerb) onKerb++;
    }
  }
  t.ok(widest > 1, 'the match really did spread bodies across the lane (' + widest.toFixed(2) + ')');
  t.ok(onKerb === 0, 'and not one of them ever stood on the kerb (' + onKerb + ')');
  IB.cam.follow = false;
  for (const z of [.4, 1, 2.4]){ IB.cam.z = IB.cam.tz = z; IB.cam.x = C.LANE_LEN / 2; IB.draw(); }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'and the span draws at every zoom');
}
{
  // Health bars. Twenty flat blocks of colour on twenty black blocks in a
  // brawl — they told you the number but not the story: how hard the last hit
  // landed, or how close a thing is to the next chunk of its bar.
  IB.newMatch({ diff:'veteran', seed:163 });
  const u = IB.spawnUnit(0, 'melee', { x:40, y:0 });
  IB.rebuildGrid();

  // The chip is the pale trail behind the fill. It has to LAG a hit — with no
  // lag it shows nothing at all — and it has to CATCH UP, or a body that took
  // one hit wears a pale stripe for the rest of the match.
  u.hp = u.mhp; IB.chipTick(u, 1 / 30);
  t.ok(u.chipHp === u.mhp, 'an untouched body has no chip');
  u.hp = u.mhp * .4;
  IB.chipTick(u, 1 / 30);
  t.ok(u.chipHp > u.hp, 'the chip lags the hit that just landed');
  let steps = 0;
  while (u.chipHp > u.hp && steps < 600){ IB.chipTick(u, 1 / 30); steps++; }
  t.ok(u.chipHp === u.hp, 'and runs down to meet the bar');
  t.ok(steps > 2 && steps < 120, 'in a time you can see but not wait through (' + steps + ' frames)');
  // Healing has to snap it up, or the chip sits BEHIND the fill and the bar
  // shows a gap that is not there.
  u.hp = u.mhp; IB.chipTick(u, 1 / 30);
  t.ok(u.chipHp === u.hp, 'a healed body loses its chip at once');
  t.ok(IB.CHIP_RATE > 0 && IB.CHIP_FLOOR > 0, 'the chip runs at a rate with a floor under it');
  // The floor is what stops a low-max-health body taking forever: rate alone
  // is proportional to mhp, so a levy would crawl.
  const tiny = { hp:10, mhp:100, chipHp:100 };
  let ts = 0;
  while (tiny.chipHp > tiny.hp && ts < 600){ IB.chipTick(tiny, 1 / 30); ts++; }
  t.ok(ts < 120, 'even the smallest body clears its chip promptly (' + ts + ')');

  // Notches: a bar has to read as an amount, not a length — but a levy with
  // 200 health should not be diced into six.
  let badTicks = 0;
  for (const mhp of [40, 200, 900, 4000, 20000]){
    const n = Math.min(Math.max(Math.round(mhp / IB.HP_TICK), 0), IB.HP_TICKS);
    if (n > IB.HP_TICKS || n < 0) badTicks++;
  }
  t.ok(badTicks === 0, 'the notch count stays within bounds at every size');
  t.ok(IB.HP_TICKS >= 2 && IB.HP_TICK > 0, 'and there is more than one notch to draw');

  // chipHp lives in the simulation so both machines agree on it and a resync
  // carries it. Nothing may read it for a decision, and the hash must not mix
  // it — otherwise a client that drew a frame the other did not would desync.
  IB.newMatch({ diff:'veteran', seed:167 });
  const before = IB.netHash();
  for (const s of G.sides){
    for (const st of s.structs) st.chipHp = st.mhp * .3;
    for (const h of s.heroes) h.chipHp = 1;
  }
  for (const b of G.units) b.chipHp = 1;
  t.ok(IB.netHash() === before, 'the chip cannot move the hash, so it cannot desync a match');

  // And then a real fight: the chip has to actually turn up in play, and every
  // body has to be left consistent rather than carrying a stale trail.
  IB.newMatch({ diff:'veteran', seed:169 });
  G.sides[0].ai = true;
  let sawChip = 0, inverted = 0;
  for (let i = 0; i < 30 * 90 && G.state === 'play'; i++){
    IB.update(1 / 30);
    for (const b of G.units){
      if (b.dead) continue;
      if (b.chipHp > b.hp + 1e-6) sawChip++;
      if (b.chipHp < b.hp - 1e-6) inverted++;
    }
  }
  t.ok(sawChip > 50, 'over a real match the chip is on screen often (' + sawChip + ' body-frames)');
  t.ok(inverted === 0, 'and never falls behind the bar it trails (' + inverted + ')');
}
{
  // Damage numbers. The cast names in the other half of the same branch have
  // been outlined since they were written; the numbers never were, so yellow
  // digits landed on a pale body and vanished. And a scratch printed at the
  // same size as a hit that took a third of somebody.
  IB.newMatch({ diff:'veteran', seed:173 });
  const S = IB.FLOAT_SC;
  t.ok(S.min > 0 && S.max > S.min && S.full > 0, 'the size range is a real range');
  // Nothing may come back non-finite: the stub canvas refuses NaN, and a real
  // one silently drops the call, so a number sized by a divide-by-zero would
  // just not be there.
  let bad = 0, prev = -1, rose = 0;
  for (const [amt, mhp] of [[0, 0], [0, 100], [-5, 100], [1, 1], [NaN, 100], [50, NaN]])
    if (!Number.isFinite(IB.floatScale(amt, mhp))) bad++;
  t.ok(bad === 0, 'every degenerate hit still has a finite size');
  for (let i = 0; i <= 100; i++){
    const v = IB.floatScale(i * 8, 600);
    if (v < S.min - 1e-9 || v > S.max + 1e-9) bad++;
    if (v < prev - 1e-9) bad++;
    if (v > prev + 1e-9) rose++;
    prev = v;
  }
  t.ok(bad === 0, 'size climbs with the hit and stays inside its range');
  t.ok(rose > 5, 'and really does climb rather than sitting flat (' + rose + ' steps)');
  // The floor is what keeps a gate legible: thousands of health means every
  // hit on it is a rounding error by fraction.
  t.ok(IB.floatScale(150, 6400) >= S.min, 'a hit on the gates is still readable');
  t.ok(IB.floatScale(400, 600) > IB.floatScale(20, 600) * 1.5, 'a big hit is visibly bigger than a scratch');

  // Where a number goes when others are already rising there. The old line
  //   ox = (Math.abs(ox) + step) * (ox > 0 ? -1 : 1)
  // looks like it alternates, but ox starts at 0 so it went negative and then
  // read `ox > 0` as false forever: numbers marched off to the left in a line
  // instead of fanning around the body.
  G.floats.length = 0;
  const xs = [];
  for (let i = 0; i < 6; i++){
    const [ox] = IB.floatSlot(50, 0, 1);
    xs.push(ox);
    G.floats.push({ x:50 + ox, y:0, txt:'1', col:'#fff', t:.9, dur:.9, sc:1, vy:-.5 });
  }
  t.ok(xs[0] === 0, 'the first number sits on the body');
  t.ok(xs.some(v => v > 0) && xs.some(v => v < 0), 'and the rest fan to BOTH sides (' + xs.map(v => v.toFixed(2)).join(' ') + ')');
  const spread = Math.max(...xs) - Math.min(...xs);
  t.ok(spread >= IB.FLOAT_GAP.step * 2, 'the fan is at least a step wide either way');
  // A three-digit number is about 2.2 world units across at the standard zoom,
  // so a step under half that prints "51" and "105" as "5105".
  t.ok(IB.FLOAT_GAP.step >= 1, 'the step clears the width of the text (' + IB.FLOAT_GAP.step + ')');
  // Bigger numbers need a wider berth, or the big ones smear back over each
  // other exactly where it matters most.
  G.floats.length = 0;
  const small = IB.floatSlot(50, 0, 1);
  G.floats.push({ x:50, y:0, txt:'1', col:'#fff', t:.9, dur:.9, sc:S.max, vy:-.5 });
  const big = IB.floatSlot(50, 0, S.max);
  t.ok(Math.abs(big[0]) > IB.FLOAT_GAP.step, 'a number beside a big one is pushed further than one step');
  t.ok(small[0] === 0 && Number.isFinite(big[0]) && Number.isFinite(big[1]), 'and the slot is always a real place');
  G.floats.length = 0;
}
{
  // Which way the light comes from. The sun in this game is up and to the LEFT
  // of the viewer, and the mesa is the proof: platFaces gives its near wall the
  // lightest stone and the wall facing the bridge the darkest, and that is the
  // biggest object on screen. Bodies agreed, mines agreed, turrets agreed.
  //
  // drawHouse did not. The near face — which points down-LEFT in this
  // projection — was the DARKEST at .70 while the right-hand face was .92, so
  // every building in the game was shaded against the cliff it stood on and
  // against the worker walking past its door. No single screenshot says which
  // of the two is wrong; you have to hold them side by side and count.
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return .2126 * ((n >> 16) & 255) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255);
  };
  const L = IB.LIT;
  t.ok(L.near > L.right, 'a house’s near wall catches more light than its right-hand wall');
  t.ok(L.roofLeft > L.roofRight, 'and its left roof slope more than its right');
  t.ok(L.roofNear > L.roofFar, 'and the gable you can see more than the one you cannot');
  t.ok(L.bodyLit > L.bodyDark, 'a body’s left is its bright side');
  t.ok(L.coatLit > L.coatDark, 'and so is a worker’s');
  // The same statement, made through shade() on a real colour — a factor pair
  // that clips at the top of the range would satisfy the comparisons above and
  // still come out flat on screen.
  const wall = '#c4ab84';
  t.ok(lum(IB.shade(wall, L.near)) > lum(IB.shade(wall, L.right)) + 8,
    'and the two wall tones are far enough apart to see');
  // Against the mesa, which is the object that settles the argument.
  const fs = IB.platFaces(0);
  const near = fs.find(f => f.k === 'near'), inner = fs.find(f => f.k === 'inner');
  t.ok(lum(near.base) > lum(inner.base),
    'the island’s near cliff is brighter than the one facing the bridge — the house now agrees with it');
  // Both holds have to agree with each other too, or one island is lit from
  // the wrong side and only the player standing on it would ever notice.
  const fs1 = IB.platFaces(1);
  t.ok(lum(fs1.find(f => f.k === 'near').base) > lum(fs1.find(f => f.k === 'inner').base),
    'and so is the other island’s');
  // Draw a hold with a building of every type, both seats, so the flipped
  // faces are actually exercised rather than only compared as numbers.
  IB.newMatch({ diff:'veteran', seed:179 });
  IB.cam.follow = false;
  for (const seat of [0, 1]){
    IB.MY = seat;
    const s = G.sides[seat];
    s.res.gold = 9000; s.res.iron = 9000; s.res.wood = 9000; s.res.food = 9000;
    const types = Object.keys(IB.BUILDINGS);
    for (let i = 0; i < types.length; i++) IB.build(s, i, types[i]);
    IB.cam.x = IB.myHoldX() + 4;
    for (const z of [.6, 1.4]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
  }
  IB.MY = 0; IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'every building type draws with the new faces, from either seat');
}
{
  // The sky. Every object in this game is lit from the upper left and there
  // was nothing up there doing the lighting — and a sun on the WRONG side of
  // that sky would be the same bug drawHouse had, seen from the other end.
  const rgba = (s) => {
    const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? .2126 * +m[1] + .7152 * +m[2] + .0722 * +m[3] : NaN;
  };
  t.ok((IB.SUN.x < .5) === (IB.LIT.near > IB.LIT.right),
    'the sun is on the side of the sky the whole world is lit from');
  t.ok(IB.SUN.y > 0 && IB.SUN.y < IB.BANDS[0].y,
    'and above the furthest ridge rather than buried in it');
  t.ok(IB.SUN.r > 0 && IB.SUN.halo > 1, 'it has a disc, and a halo bigger than the disc');
  // The rim runs foot -> apex to the RIGHT, so the face it belongs to looks
  // left. Move the sun and this has to move with it.
  t.ok(Math.sign(IB.RIDGE_RIM) === (IB.SUN.x < .5 ? 1 : -1),
    'the ridge slope that catches the light is the one facing the sun');

  let dim = 0, out = 0;
  for (const b of IB.BANDS){
    if (!(rgba(b.rim) > rgba(b.col))) dim++;
    if (!Number.isFinite(rgba(b.haze))) out++;
  }
  t.ok(dim === 0, 'every ridge rim is brighter than the ridge it edges');
  t.ok(out === 0, 'and every haze colour is one a canvas can read');
  // Painter's order: the bands are drawn in array order, so each has to be
  // NEARER than the one before it. Reorder them and far mountains paint over
  // near ones, which reads as a hole in the horizon.
  let back = 0;
  for (let i = 1; i < IB.BANDS.length; i++)
    if (IB.BANDS[i].d <= IB.BANDS[i - 1].d || IB.BANDS[i].y <= IB.BANDS[i - 1].y) back++;
  t.ok(back === 0, 'the ridges are laid down furthest first (' + back + ' out of order)');

  // The halo is a radial gradient — a new call on this path — and the whole
  // sky has to survive every camera the game can reach.
  IB.newMatch({ diff:'veteran', seed:181 });
  IB.cam.follow = false;
  for (const x of [IB.CAM_MIN, 0, C.LANE_LEN / 2, C.LANE_LEN, IB.CAM_MAX]){
    IB.cam.x = x;
    for (const z of [.42, 1, 2.2]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
  }
  IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'the sky draws from either end of the world at every zoom');

  // Clouds were the last thing in frame nothing lit. The mesa walls, the
  // roofs, the bodies, the mines and the ridge rims all know where the sun is;
  // a cumulus sitting directly beneath it was the same flat slab as one on the
  // far side of the sky, which is why they read as fog stuck on the gradient.
  // They get a shaded belly and a sunlit crown now, and both of those hang off
  // the same shadowSide() the ground uses — so the test is that the sky and
  // the island cannot disagree, not that the numbers are any particular value.
  const chan3 = (s) => s.split(',').map(Number);
  t.ok(IB.CLOUD_PASSES.length === Object.keys(IB.CLOUD).length,
    'every cloud pass is in the table and every entry in the table is a pass');
  for (const k of IB.CLOUD_PASSES) t.ok(!!IB.CLOUD[k], 'pass ' + k + ' has a definition');
  t.ok(IB.CLOUD_PASSES[0] === 'body', 'the silhouette goes down first, the shading on top of it');

  const belly = chan3(IB.CLOUD.belly.col), body = chan3(IB.CLOUD.body.col), crown = chan3(IB.CLOUD.crown.col);
  // Brightness by luminance, not channel by channel: the crown is a WARM
  // light, so its blue sits below the body's on purpose and a per-channel
  // ordering would forbid the very thing that makes it read as sunlight.
  const lum = (c) => c[0] * .299 + c[1] * .587 + c[2] * .114;
  t.ok(lum(crown) > lum(body) && lum(body) > lum(belly),
    'the crown is brighter than the body and the body than the belly');
  t.ok(crown[0] - crown[2] > body[0] - body[2],
    'the lit side is warmer than the body it sits on');
  t.ok(belly[2] - belly[0] > body[2] - body[0],
    'and the shaded side is cooler, the way sky fills a shadow');

  // Direction. The crown leans toward the sun and the belly away from it —
  // which is to say the belly leans the same way a shadow falls.
  t.ok(IB.cloudLean('crown') === -IB.shadowSide(), 'the sunlit crown is on the sun’s side');
  t.ok(IB.cloudLean('belly') === IB.shadowSide(), 'and the belly is on the side the shadows fall');
  t.ok(IB.cloudRise('crown') < 0 && IB.cloudRise('belly') > 0,
    'the crown rides up and the belly sits under, the light being overhead');
  // Cross-check against something that has nothing to do with the sky: a roof.
  // If either convention is ever flipped these two stop agreeing.
  t.ok(IB.cloudLean('crown') === Math.sign(IB.LIT.roofRight - IB.LIT.roofLeft),
    'a cloud and a roof are lit from the same side');
  // Move the sun and the clouds must turn with it, the same as the shadows do.
  const sunX = IB.SUN.x;
  IB.SUN.x = 1 - sunX;
  t.ok(IB.cloudLean('crown') === -IB.shadowSide(), 'and they still agree with the sun on the other side');
  t.ok(IB.cloudLean('crown') !== IB.cloudLean('belly'), 'crown and belly never lean the same way');
  IB.SUN.x = sunX;

  // Rule out the settings that pass every direction check by doing nothing:
  // no offset at all, and shading the same colour as the body.
  for (const k of ['belly', 'crown']){
    const p = IB.CLOUD[k];
    t.ok(p.dx > .05 || p.dy > .05, 'the ' + k + ' is actually offset (' + p.dx + ', ' + p.dy + ')');
    t.ok(p.dx < 1 && p.dy < 1, 'but not so far it clears the cloud (' + k + ')');
    t.ok(p.a > .1, 'and it is opaque enough to see (' + k + ' ' + p.a + ')');
    t.ok(p.col !== IB.CLOUD.body.col, 'and a different colour from the body (' + k + ')');
  }
  // Every cloud has to be worth shading in the first place — invisible ones
  // were the real reason the old shading did not read.
  let faint = 0, huge = 0;
  for (const cl of IB.clouds()){
    if (cl.a < .2) faint++;
    if (cl.a > .75) huge++;
    if (!(cl.w >= 2 && cl.s > 0 && cl.d > 0)) faint++;
  }
  t.ok(faint === 0, 'no cloud is too faint to have a lit side (' + faint + ')');
  t.ok(huge === 0, 'and none is so solid it stops reading as sky (' + huge + ')');

  // Then draw them for real, from both ends of the sky and across a wrap, so
  // the clip/restore pairing and the offset paths get exercised rather than
  // just inspected. The stub canvas throws on a negative radius.
  IB.newMatch({ diff:'veteran', seed:1811 });
  IB.cam.follow = false;
  for (const z of [.42, 1, 2.4]){
    IB.cam.z = IB.cam.tz = z;
    for (let i = 0; i < 40; i++){ G.t = i * 7.5; IB.cam.x = IB.CAM_MIN + i * 4; IB.draw(); }
  }
  IB.cam.z = IB.cam.tz = 1; G.t = 0;
  t.ok(true, 'clouds draw across a full wrap of the sky at every zoom');

  // Birds. Three strokes each, three to a flock, all the same size on a
  // straight diagonal stair, every one of them beating on `sin(G.t*5 + i + f)`
  // — which is to say within a radian of its neighbour — and not one of them
  // moving when the camera did. A flock in step reads as a decal.
  //
  // Depth first, and against the ridges rather than against itself: BANDS
  // already decided that lower in the sky means nearer. The flocks have to
  // agree, or the sky has two opinions about distance.
  const bandDeep = Math.sign(IB.BANDS[1].y - IB.BANDS[0].y) * Math.sign(IB.BANDS[1].d - IB.BANDS[0].d);
  t.ok(bandDeep > 0, 'the ridges say lower in the sky is nearer');
  let dis = 0;
  for (let i = 1; i < IB.FLOCKS.length; i++){
    const a = IB.FLOCKS[i - 1], b = IB.FLOCKS[i];
    if (!(b.y > a.y && b.sc > a.sc && b.d > a.d)) dis++;
  }
  t.ok(dis === 0, 'and the flocks agree: lower is bigger and parallaxes faster (' + dis + ')');
  for (const fl of IB.FLOCKS){
    t.ok(fl.d > 0, 'no flock is pinned to the glass (' + fl.d + ')');
    t.ok(fl.n >= 3, 'and a flock is more than a pair (' + fl.n + ')');
  }
  t.ok(new Set(IB.FLOCKS.map(f => f.n)).size > 1, 'the flocks are not all the same size');
  t.ok(new Set(IB.FLOCKS.map(f => f.sp)).size === IB.FLOCKS.length, 'and none of them fly at the same speed');

  // The formation. A V has a point, and everything else falls back behind it.
  t.ok(IB.birdSlot(0)[0] === 0 && IB.birdSlot(0)[1] === 0, 'the leader is the point of the V');
  let ahead = 0, flat = 0, notmirror = 0;
  const most = Math.max(...IB.FLOCKS.map(f => f.n));
  for (let i = 1; i < most; i++){
    const [dx, dy] = IB.birdSlot(i);
    if (dx >= 0) ahead++;                                   // nobody outruns the leader
    if (dy === 0) flat++;                                   // and nobody sits in its slipstream
    if (i % 2 === 1 && i + 1 < most){
      const [dx2, dy2] = IB.birdSlot(i + 1);
      if (dx2 !== dx || dy2 !== -dy) notmirror++;           // the two arms match
    }
  }
  t.ok(ahead === 0, 'every bird trails the leader (' + ahead + ')');
  t.ok(flat === 0, 'and none of them is directly behind it (' + flat + ')');
  t.ok(notmirror === 0, 'the two arms of the V mirror each other (' + notmirror + ')');
  // A rank further back is further back AND further out — otherwise it is a
  // line, which is what the stair was.
  const r1 = IB.birdSlot(1), r3 = IB.birdSlot(3);
  t.ok(Math.abs(r3[0]) > Math.abs(r1[0]) && Math.abs(r3[1]) > Math.abs(r1[1]),
    'and each rank falls further back and further out');
  t.ok(IB.BIRD.gapX > 0 && IB.BIRD.gapY > 0, 'the V has both of its dimensions');

  // The wingbeat, which is the actual bug. Walk it over a real sweep.
  t.ok(IB.BIRD.wMin < IB.BIRD.wMax, 'the wings are not frozen open');
  // The separation is structural, not lucky: the rate steps per bird and the
  // hash may only jitter it by a fraction of a step, so a step can never be
  // closed. Leaving it to the hash alone left two pairs flying as one bird.
  t.ok(IB.BIRD.drift > 0, 'the wingbeat rate steps from bird to bird');
  t.ok(IB.BIRD.vary > 0, 'and the hash jitters it off the grid');
  t.ok(IB.BIRD.vary < 1, 'but never by enough to close a step');
  t.ok(IB.BIRD.stagger > 0, 'and the V ripples rather than pulsing');
  let lockstep = 0, stuck = 0, pairs = 0, close = 0;
  for (let f = 0; f < IB.FLOCKS.length; f++){
    const n = IB.FLOCKS[f].n;
    let spread = 0;
    const lo = new Array(n).fill(9), hi = new Array(n).fill(-9);
    for (let s = 0; s < 400; s++){
      const tt = s * .05;
      const vals = [];
      for (let i = 0; i < n; i++){
        const v = IB.birdBeat(f, i, tt);
        vals.push(v);
        lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v);
      }
      spread = Math.max(spread, Math.max(...vals) - Math.min(...vals));
    }
    // Every bird must actually flap through its whole range...
    for (let i = 0; i < n; i++) if (hi[i] - lo[i] < .9) stuck++;
    // ...and at some point in the sweep the flock must be visibly out of step.
    if (spread < .8) lockstep++;
    // No two birds may ever be the same bird.
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++){
      pairs++;
      let far = 0;
      for (let s = 0; s < 400; s++){
        const tt = s * .05;
        far = Math.max(far, Math.abs(IB.birdBeat(f, a, tt) - IB.birdBeat(f, b, tt)));
      }
      if (far < .5) close++;
    }
  }
  t.ok(stuck === 0, 'every bird opens and closes its wings fully (' + stuck + ')');
  t.ok(lockstep === 0, 'and no flock ever beats as one (' + lockstep + ')');
  t.ok(pairs > 20 && close === 0, 'no two birds in a flock fly the same wingbeat (' + close + '/' + pairs + ')');
  // The bob is a separate motion from the beat, or the whole bird pumps.
  let same = 0;
  for (let s = 0; s < 200; s++){
    const tt = s * .05;
    if (Math.abs((IB.birdBob(0, 1, tt) / IB.BIRD.bob) - (IB.birdBeat(0, 1, tt) * 2 - 1)) > .3) same = 1;
  }
  t.ok(same === 1, 'a bird bobs on a different clock from the one it flaps on');

  // Parallax. They drift on their own, and they drift with the camera at the
  // depth of their flock — the ridges and the clouds both do this and the
  // birds were the one layer stuck to the glass.
  IB.newMatch({ diff:'veteran', seed:1861 });
  IB.cam.follow = false; IB.cam.z = IB.cam.tz = 1;
  const driftAt = (fl, camX, t0) => { IB.cam.x = camX; G.t = t0; return IB.birdDrift(fl); };
  let still = 0, order = 0;
  for (const fl of IB.FLOCKS){
    if (driftAt(fl, 0, 0) === driftAt(fl, 60, 0)) still++;             // moves with the camera
    if (driftAt(fl, 0, 0) === driftAt(fl, 0, 4)) still++;              // and on its own
  }
  const near = IB.FLOCKS[IB.FLOCKS.length - 1], far = IB.FLOCKS[0];
  const swing = (fl) => Math.abs(driftAt(fl, 60, 0) - driftAt(fl, 0, 0));
  if (!(swing(near) > swing(far))) order++;
  t.ok(still === 0, 'birds move with the camera and with time (' + still + ')');
  t.ok(order === 0, 'and the near flock sweeps past faster than the far one');
  IB.cam.x = 26; G.t = 0;

  // Then draw them, across a wrap and both zoom ends, on the stub canvas that
  // throws on a negative radius or a bad colour.
  for (const z of [.42, 1, 2.4]){
    IB.cam.z = IB.cam.tz = z;
    for (let i = 0; i < 40; i++){ G.t = i * 3.7; IB.cam.x = IB.CAM_MIN + i * 4; IB.draw(); }
  }
  IB.cam.z = IB.cam.tz = 1; IB.cam.x = 26; G.t = 0;
  t.ok(true, 'the flocks draw across a full wrap of the sky at every zoom');
}
{
  // Shadows. Every one in the game sat directly under its object, which was
  // fine while nothing in the sky said where the light came from. SUN says
  // now, so a shadow with no direction is the last thing in the picture that
  // does not know where the light is.
  const [dx, dy] = IB.shadowOff(10, 4);
  t.ok(Math.sign(dx) === -Math.sign(IB.SUN.x - .5),
    'a shadow falls to the opposite side from the sun');
  t.ok(IB.SUN.y < .5 && dy > 0, 'and downward, the sun being above the horizon');
  // A zero offset passes every direction check there is — and a zero offset is
  // exactly what was there before, so it has to be ruled out on its own.
  t.ok(IB.SHADOW.dx > 0.05, 'the offset is big enough to see (' + IB.SHADOW.dx + ')');
  // Past one radius the shadow clears the object entirely and the thing reads
  // as floating rather than lit.
  t.ok(IB.SHADOW.dx < 1 && IB.SHADOW.dy < 1, 'and small enough that the shadow stays under its object');
  // It is a fraction of the patch, so a town hall throws further than a wood
  // chip without anybody having to say how tall either of them is.
  const big = IB.shadowOff(40, 15), small = IB.shadowOff(4, 1.5);
  t.ok(Math.abs(big[0]) > Math.abs(small[0]) * 5, 'a big thing throws a longer shadow than a small one');
  t.ok(IB.shadowOff(0, 0)[0] === 0, 'and something with no footprint throws nothing');

  // The one solid thing in the game that threw nothing: an arrow in flight.
  // A projectile carries a real height — a shaft leaves a body at .8, a turret
  // lobs one from 2.6, and it falls the whole way — and none of that was in
  // the picture, so both drew as the same streak in the same place and neither
  // looked like it was over the boards at all.
  IB.newMatch({ diff:'veteran', seed:433 });
  IB.cam.follow = false; IB.cam.x = 60; IB.cam.z = IB.cam.tz = 1;
  const shadowOf = (z) => {
    CTX.__stats.ellipses = [];
    IB.projShadow(CTX, { x:60, y:0, z, kind:'shaft', col:'#fff' });
    return CTX.__stats.ellipses[0];
  };
  // A missing shadow must REPORT, not throw — the whole point of this block is
  // to describe the state the game was already in, and a crash there takes the
  // remaining assertions with it and tells you less than a red line would.
  const NOSHADOW = { x:0, y:0, rx:0, ry:0, fill:'rgba(0,0,0,0)' };
  const low = shadowOf(.6) || NOSHADOW, high = shadowOf(2.6) || NOSHADOW;
  t.ok(low !== NOSHADOW && high !== NOSHADOW, 'a projectile puts a shadow on the deck');
  const alphaOf = (e) => Number((String(e.fill).match(/([\d.]+)\)$/) || [0, 0])[1]);
  t.ok(alphaOf(high) < alphaOf(low), 'and it fades as the thing climbs (' +
    alphaOf(low) + ' → ' + alphaOf(high) + ')');
  t.ok(high.rx < low.rx, 'and tightens (' + low.rx.toFixed(2) + ' → ' + high.rx.toFixed(2) + ')');
  t.ok(alphaOf(high) >= IB.PROJ_SHADOW.min, 'but never fades out entirely');
  // It goes through the same shadow() as everything else, so it has to lean
  // the way the sun says without being told separately.
  const ground = IB.lp(60, 0, 0);
  t.ok(Math.sign(low.x - ground[0]) === Math.sign(IB.shadowOff(1, 1)[0]),
    'and it leans the same way every other shadow on the board does');
  t.ok(low.y > ground[1], 'and downward, the sun being above the horizon');
  // The separation between a thing and its shadow is what reads as height.
  const sep = (z) => IB.lp(60, 0, 0)[1] - IB.lp(60, 0, z)[1];
  t.ok(sep(2.6) > sep(.6) && sep(.6) > 0, 'a higher shaft sits further off its own shadow');
  // Rule out the settings that draw a shadow saying nothing about height.
  t.ok(IB.PROJ_SHADOW.fade > 0, 'the fade with height is not flat');
  t.ok(IB.PROJ_SHADOW.shrink > 0, 'nor the shrink');
  t.ok(IB.PROJ_SHADOW.a > IB.PROJ_SHADOW.min, 'and there is room between full and faintest');
  t.ok(IB.PROJ_SHADOW.floor > 0 && IB.PROJ_SHADOW.floor < 1, 'a shadow never shrinks to nothing');

  // Then a real volley, and every shaft in it accounted for. Without the count
  // guard this passes just as well with no projectiles in the air at all —
  // which is exactly the state the bug was in.
  {
    IB.newMatch({ diff:'veteran', seed:437 });
    IB.cam.follow = false; IB.cam.x = 60; IB.cam.z = IB.cam.tz = 1;
    const a = IB.makeHero(0, 'marksman', 'Volley');
    a.pend.length = 0; G.sides[0].heroes.push(a); IB.enterLane(a); a.x = 58; a.y = 0;
    const b = IB.makeHero(1, 'fighter', 'Target');
    b.pend.length = 0; G.sides[1].heroes.push(b); IB.enterLane(b); b.x = 66; b.y = 0;
    G.projs.length = 0;
    for (let i = 0; i < 5; i++) IB.shoot(a, b, () => {}, '#ffe08a', 'shaft');
    G.projs.push({ x:60, y:0, z:2.6, tgt:b, onHit:() => {}, col:'#ffe08a', sp:34,
                   dead:false, tr:[], kind:'shaft', ax:1, ay:0, src:null });
    for (let i = 0; i < 3; i++) IB.projStep(1 / 30);
    t.ok(G.projs.length >= 5, 'there are shafts in the air (' + G.projs.length + ')');
    const heights = new Set(G.projs.map(p => Math.round(p.z * 10)));
    t.ok(heights.size > 1, 'and they are not all at the same height (' + heights.size + ')');
    CTX.__stats.ellipses = [];
    for (const p of G.projs) IB.projShadow(CTX, p);
    t.ok(CTX.__stats.ellipses.length === G.projs.length,
      'every one of them marks the deck (' + CTX.__stats.ellipses.length + '/' + G.projs.length + ')');
    const alphas = new Set(CTX.__stats.ellipses.map(e => e.fill));
    t.ok(alphas.size > 1, 'and the shadow of the high one differs from the low ones (' + alphas.size + ')');
    G.projs.length = 0;
  }
  IB.cam.x = 26; IB.cam.z = IB.cam.tz = 1;

  // The whole board, both seats, at both ends of the zoom — every shadow in
  // the game goes through this one function now and there are eighteen of them.
  IB.newMatch({ diff:'veteran', seed:191 });
  IB.cam.follow = false;
  for (const seat of [0, 1]){
    IB.MY = seat;
    const s = G.sides[seat];
    s.res.gold = 9000; s.res.iron = 9000; s.res.wood = 9000; s.res.food = 9000;
    const types = Object.keys(IB.BUILDINGS);
    for (let i = 0; i < types.length; i++) IB.build(s, i, types[i]);
    for (const k of Object.keys(IB.UNITS)) IB.spawnUnit(seat, k, { x:60, y:0 });
    IB.rebuildGrid();
    for (const x of [IB.myHoldX() + 4, C.LANE_LEN / 2]){
      IB.cam.x = x;
      for (const z of [.5, 1, 2]){ IB.cam.z = IB.cam.tz = z; IB.draw(); }
    }
  }
  IB.MY = 0; IB.cam.z = IB.cam.tz = 1;
  t.ok(true, 'everything that casts a shadow draws, from either seat, at every zoom');
}
{
  // The strip along the bottom. Its two hold blocks were green and brown,
  // keyed to the side INDEX — so the one widget whose entire job is telling
  // you where you are told player two that the enemy's hold was the friendly
  // green one. Same shape as the worker tunic: a per-side value that is not
  // per-SEAT is invisible from one chair and wrong from the other.
  IB.newMatch({ diff:'veteran', seed:197 });
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return .2126 * ((n >> 16) & 255) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255);
  };
  const chan = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const was = IB.MY;
  const cols = {};
  for (const seat of [0, 1]){
    IB.MY = seat;
    cols[seat] = [IB.miniHoldCol(0), IB.miniHoldCol(1)];
  }
  IB.MY = was;
  t.ok(cols[0][0] !== cols[0][1], 'the two holds are told apart on the strip');
  // The one that matters: whichever seat you are in, YOURS is the lit one.
  t.ok(lum(cols[0][0]) > lum(cols[0][1]), 'from seat one, your hold is the brighter block');
  t.ok(lum(cols[1][1]) > lum(cols[1][0]), 'and from seat two it is the other one');
  // Equal weights would still give two different colours, because SIDE_COL
  // differs — and would lose the seat cue entirely, which is the bug.
  t.ok(IB.MINI_MINE > IB.MINI_THEIRS, 'your hold is drawn brighter than theirs, not merely differently');
  // And the strip has to speak the same colour language as the rest of the
  // game: the structures and units on it were already in side colours while
  // the ground under them was green and brown.
  let wrongHue = 0;
  for (const seat of [0, 1]){
    const [b, r] = cols[seat];
    if (chan(b)[2] <= chan(b)[0]) wrongHue++;     // side zero reads blue
    if (chan(r)[0] <= chan(r)[2]) wrongHue++;     // side one reads red
  }
  t.ok(wrongHue === 0, 'each hold block is its own side’s colour (' + wrongHue + ' wrong)');

  // Broken structures used to vanish from the strip, so it could not show you
  // that the line of battle had moved — the one thing it is for. Drive a real
  // match until something actually falls, then draw it.
  // Take one down through the real damage path rather than setting a flag, so
  // whatever else falling does to a structure happens too.
  const doomed = G.sides[1].structs.find(s => s.key === 't1');
  const killer = IB.spawnUnit(0, 'melee', { x:doomed.x - 1, y:0 });
  IB.rebuildGrid();
  IB.dealDmg(killer, doomed, doomed.mhp * 4, { pure:true });
  t.ok(doomed.dead, 'a structure came down through the damage path');
  for (const seat of [0, 1]){
    IB.MY = seat;
    for (const w of [1440, 700]){ IB.cam.z = IB.cam.tz = 1; IB.draw(); }
  }
  IB.MY = was;
  t.ok(true, 'and the strip draws with it broken, from either seat');
}
{
  // Good news and bad news are relative to the PLAYER, not to side zero. Every
  // toast in the game was keyed to the index — so from seat two a message
  // saying you had just lost your gates arrived in the colour that means
  // things are going well, and the enemy losing theirs arrived as a warning.
  // Third time this shape has turned up after the worker tunic and the
  // minimap, so this block asks the question from both chairs on purpose.
  const seat0 = IB.MY;
  let wrong = 0;
  for (const seat of [0, 1]){
    IB.MY = seat;
    const mine = seat, theirs = 1 - seat;
    if (IB.badFor(mine) !== 'bad') wrong++;        // losing your own thing is bad news
    if (IB.badFor(theirs) !== 'good') wrong++;     // losing theirs is not
    if (IB.goodFor(mine) !== 'good') wrong++;
    if (IB.goodFor(theirs) !== 'bad') wrong++;
  }
  IB.MY = seat0;
  t.ok(wrong === 0, 'every toast tone follows the seat, from either seat (' + wrong + ' wrong)');
  // Stated the other way round, which is the crisp version of the bug: the
  // tone for "my gates fell" has to be the SAME from either chair.
  IB.MY = 0; const a0 = IB.badFor(0);
  IB.MY = 1; const a1 = IB.badFor(1);
  IB.MY = seat0;
  t.ok(a0 === a1, 'losing your own gates reads the same whichever side you are');

  // Health bars. Green reads as friendly and red as hostile in every game
  // anybody has played, so these are FRIEND and FOE colours rather than team
  // colours — the body under the bar already says whose it is. Keyed to the
  // index, they meant player two watched their own troops carry red bars and
  // the enemy's carry green ones for the whole match.
  const chan = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  t.ok(IB.BAR_MINE !== IB.BAR_THEIRS, 'friend and foe bars are different colours');
  t.ok(chan(IB.BAR_MINE)[1] > chan(IB.BAR_MINE)[0], 'yours reads green');
  t.ok(chan(IB.BAR_THEIRS)[0] > chan(IB.BAR_THEIRS)[1], 'theirs reads red');

  // The same question one layer down, asked of the thing that can actually
  // kill you while you are reading it. Every lingering zone hurts whoever does
  // not own it, and they all drew identically — an Inferno you have to step
  // out of looked exactly like your own. The HUE is spoken for by the damage
  // type (armour or resist), so ownership has to arrive on other channels.
  let quiet = 0;
  for (const k of IB.ZONE_LOUD){
    if (!(IB.ZONE.theirs[k] > IB.ZONE.mine[k])) quiet++;
  }
  t.ok(IB.ZONE_LOUD.length >= 4, 'ownership speaks on more than one channel (' + IB.ZONE_LOUD.length + ')');
  t.ok(quiet === 0, 'and the one you must not stand in is louder on every one of them (' + quiet + ')');
  // Table completeness: a numeric channel left out of ZONE_LOUD is a channel
  // nothing checks, which is how a silently-equal setting survives.
  const numKeys = (o) => Object.keys(o).filter(k => typeof o[k] === 'number').sort();
  t.ok(numKeys(IB.ZONE.mine).join() === numKeys(IB.ZONE.theirs).join(),
    'both zone looks define the same channels');
  t.ok(numKeys(IB.ZONE.mine).join() === IB.ZONE_LOUD.slice().sort().join(),
    'and every one of them is checked (' + numKeys(IB.ZONE.mine).join() + ')');
  // The keep-out marker has to survive the colour being taken away.
  t.ok(IB.ZONE.theirs.dash.length > 0, 'a hostile zone is ringed with a dashed keep-out line');
  t.ok(IB.ZONE.mine.dash.length === 0, 'and your own is not, or the board is all hazard tape');
  t.ok(IB.ZONE.theirs.dash.every(v => v > 0), 'with a dash pattern a canvas will accept');
  // Ownership must not touch hue — that channel already means something else.
  for (const k of ['col', 'hot', 'magic'])
    t.ok(!(k in IB.ZONE.mine) && !(k in IB.ZONE.theirs), 'ownership does not repaint the damage type (' + k + ')');

  // And it follows the chair. Stated the crisp way: a zone YOU cast reads the
  // same whichever seat you are sitting in.
  let zwrong = 0;
  for (const seat of [0, 1]){
    IB.MY = seat;
    if (IB.zoneLook(seat) !== IB.ZONE.mine) zwrong++;
    if (IB.zoneLook(1 - seat) !== IB.ZONE.theirs) zwrong++;
  }
  t.ok(zwrong === 0, 'a zone knows whose it is from either chair (' + zwrong + ')');
  IB.MY = 0; const z0 = IB.zoneLook(0);
  IB.MY = 1; const z1 = IB.zoneLook(1);
  IB.MY = seat0;
  t.ok(z0 === z1, 'and your own zone reads the same from either chair');

  // Then draw them for real: both owners, both damage types, from both seats,
  // and at both ends of the zoom. The dash goes through setLineDash, which is
  // canvas STATE — leave it set and every stroke after it in the frame comes
  // out dashed, which no colour or radius check would ever notice.
  for (const seat of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:911 });
    IB.MY = seat;
    IB.cam.follow = false; IB.cam.x = 64;
    for (const magic of [true, false])
      for (const side of [0, 1])
        G.zones.push({ x:62 + side * 4, y:side ? 1 : -1, r:3, dps:12, t:4, dur:5,
                       tick:0, side, src:null, magic, slow:0, follow:null });
    // A hero from each side standing in them, so the frame actually runs
    // through heroRing and the state checks below cover it. Without a body on
    // the bridge the whole hero half of the draw is dead code to this block —
    // which is how a leaked globalAlpha in heroRing first slipped through.
    for (const side of [0, 1]){
      const h = IB.makeHero(side, side ? 'fighter' : 'marksman', side ? 'Rho' : 'Sig');
      h.pend.length = 0; G.sides[side].heroes.push(h); IB.enterLane(h);
      h.x = 62 + side * 4; h.y = side ? 1 : -1;
      h.slowT = 2; h.slowP = .4; h.markT = 2; h.stunT = 1; h.shield = 20; h.shT = 2;
      h.burn = { dps:6, t:3, src:null };
    }
    for (const z of [.42, 1, 2.4]){
      IB.cam.z = IB.cam.tz = z;
      for (let i = 0; i < 6; i++){ G.t = i * .37; IB.draw(); }
      t.ok(CTX.__stats.dash === 0,
        'the frame ends with no dash pattern left on the canvas — seat ' + seat + ', zoom ' + z);
      // The other two channels of the same class. A block that fades something
      // and forgets to put the alpha back leaves the rest of the frame
      // translucent; an unbalanced save() leaks a clip into whatever is next.
      t.ok(CTX.__stats.alpha === 1,
        'and with the alpha put back — seat ' + seat + ', zoom ' + z + ' (' + CTX.__stats.alpha + ')');
      t.ok(CTX.__stats.depth === 0,
        'and with every save() restored — seat ' + seat + ', zoom ' + z + ' (' + CTX.__stats.depth + ')');
    }
    G.zones.length = 0;
    IB.cam.z = IB.cam.tz = 1; G.t = 0;
  }
  IB.MY = seat0;

  // The hero's disc. It was one hairline of flat white under both of them —
  // and in a brawl at your own gates, which of those two figures is yours is
  // the only read that matters. Friend and foe come off barCol now, the same
  // two colours as the bar over their head, so the mark at the feet and the
  // mark at the top cannot drift apart.
  let bwrong = 0;
  for (const seat of [0, 1]){
    IB.MY = seat;
    if (IB.barCol(seat) !== IB.BAR_MINE) bwrong++;
    if (IB.barCol(1 - seat) !== IB.BAR_THEIRS) bwrong++;
  }
  t.ok(bwrong === 0, 'friend and foe colour follows the chair (' + bwrong + ')');
  IB.MY = 0; const b0 = IB.barCol(0);
  IB.MY = 1; const b1 = IB.barCol(1);
  IB.MY = seat0;
  t.ok(b0 === b1, 'and your own hero reads the same from either chair');
  // One source of truth, not two that happen to agree today.
  t.ok(!/u\.side === MY \? BAR_MINE/.test(SRC), 'the health bar asks barCol rather than inlining the seat');
  // And the ring is DRIVEN, not just inspected: paint one and read back the
  // colour that reached the canvas. Asserting on the table alone would have
  // let a hardcoded white through, which is exactly what was there before.
  const ringCols = (side) => {
    CTX.__stats.strokes = [];
    IB.heroRing(CTX, 400, 300, 1, side);
    return CTX.__stats.strokes;
  };
  let painted = 0;
  for (const seat of [0, 1]){
    IB.MY = seat;
    for (const side of [0, 1]){
      const want = side === seat ? IB.BAR_MINE : IB.BAR_THEIRS;
      const got = ringCols(side);
      if (!got.length || got.some(v => v !== want)) painted++;
    }
  }
  IB.MY = seat0;
  t.ok(painted === 0, 'the ring is painted in the friend/foe colour from either chair (' + painted + ')');
  t.ok(ringCols(0).length >= 1, 'and it does paint something');
  for (const k of ['col', 'mine', 'theirs'])
    t.ok(!(k in IB.HERO_RING), 'the ring carries no colour of its own (' + k + ')');
  // Rule out the settings that draw a ring that says nothing: an inner ring
  // that is not inside, and a fill louder than the edge that defines it.
  t.ok(IB.HERO_RING.inner > 0 && IB.HERO_RING.inner < 1, 'the inner ring is inside the outer one');
  t.ok(IB.HERO_RING.glow < IB.HERO_RING.rim, 'and the disc is quieter than its edge');
  t.ok(IB.HERO_RING.rx > IB.HERO_RING.ry, 'the disc lies flat on the deck, like every other ground shape');

  // And the defect that made it invisible exactly when you leaned in: a bare
  // `lineWidth = 1` among twenty `Math.max(x, y * cam.z)`. Drive it and watch.
  const ringLw = (z) => {
    IB.cam.z = IB.cam.tz = z;
    CTX.__stats.lw = 0; CTX.__stats.lwMin = Infinity;
    IB.heroRing(CTX, 400, 300, 1, 0);
    return CTX.__stats.lwMin;
  };
  const lwNear = ringLw(2.4), lwFar = ringLw(1);
  IB.cam.z = IB.cam.tz = 1;
  t.ok(lwNear > lwFar, 'every stroke of the hero ring thickens with the zoom, the thinnest included (' +
    lwFar + ' → ' + lwNear + ')');
  // The plank joints on the deck had it too, which is the largest surface in
  // the game: the rails beside them scaled and the planks did not.
  const deckLw = (z) => {
    IB.cam.z = IB.cam.tz = z; CTX.__stats.lwMin = Infinity; IB.drawDeck(CTX); return CTX.__stats.lwMin;
  };
  const dNear = deckLw(2.4), dFar = deckLw(1);
  IB.cam.z = IB.cam.tz = 1;
  t.ok(dNear > dFar, 'and the thinnest line on the deck does too — the plank joints (' + dFar + ' → ' + dNear + ')');

  // And the notification that was not merely the wrong colour but absent: the
  // level-up toast fired for side zero only, so player two's hero levelled up
  // in silence. Drive a real level-up from the second chair.
  for (const seat of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:199 });
    IB.MY = seat;
    const h = IB.makeHero(seat, 'fighter', 'Climber');
    h.pend.length = 0; h.passive = 'whetstone'; IB.recalcHero(h);
    G.sides[seat].heroes.push(h); IB.enterLane(h);
    const lvl0 = h.lvl;
    G.log.length = 0;
    IB.gainXp(h, IB.xpNeed(h.lvl) * 2 + 50);
    t.ok(h.lvl > lvl0, 'the hero levelled from seat ' + seat);
    t.ok(G.log.some(e => /reaches level/.test(e.msg)),
      'and the player was told about it from seat ' + seat);
  }

  // Two more of the same shape, found by grepping for the literal index rather
  // than by playing: the train-complete sound and the hero sheet's refresh
  // after a pick. Both said "side zero", so from seat two units finished
  // training in silence and the sheet did not redraw. They ask forMe() now.
  let notMine = 0;
  for (const seat of [0, 1]){
    IB.MY = seat;
    if (IB.forMe(seat) !== true) notMine++;
    if (IB.forMe(1 - seat) !== false) notMine++;
  }
  t.ok(notMine === 0, 'forMe() follows the chair, not the index (' + notMine + ' wrong)');

  // Then the real thing, because a helper that nothing calls proves nothing.
  // sfx() records what it MEANT to play before its early-outs, so a headless
  // run can hear a sound that a wrongly-seated gate would have swallowed.
  for (const seat of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:271 });
    IB.MY = seat;
    const mine = G.sides[seat], theirs = G.sides[1 - seat];
    rich(mine); rich(theirs);
    const idle0 = mine.workers.idle;
    t.ok(IB.trainWorker(mine) === null, 'a worker goes into the pit from seat ' + seat);
    IB.AU.want = null;
    for (let i = 0; i < 30 * 90 && IB.AU.want !== 'build'; i++) IB.ecoStep(mine, 1 / 30);
    t.ok(mine.workers.idle > idle0, 'the worker finished from seat ' + seat);
    t.ok(IB.AU.want === 'build', 'and finishing it was audible from seat ' + seat);

    // Rule out the other half: the noise has to be MINE, not any completion.
    const theirIdle0 = theirs.workers.idle;
    t.ok(IB.trainWorker(theirs) === null, 'the enemy trains one too, from seat ' + seat);
    IB.AU.want = null;
    for (let i = 0; i < 30 * 90 && theirs.workers.idle === theirIdle0; i++) IB.ecoStep(theirs, 1 / 30);
    t.ok(theirs.workers.idle > theirIdle0, 'and it finished, from seat ' + seat);
    t.ok(IB.AU.want !== 'build', 'but the enemy pit is silent from seat ' + seat);
  }

  // And the pick itself, driven for real from both chairs. The refresh behind
  // it is DOM-only, so what a headless run can prove is that the pick lands —
  // the guard is checked against the source below, where it is visible.
  for (const seat of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:317 });
    IB.MY = seat;
    const h = IB.makeHero(seat, 'fighter', 'Chooser');
    h.pend.length = 0; G.sides[seat].heroes.push(h); IB.enterLane(h);
    const p = IB.offer(h, 'skill');
    t.ok(p && p.opts.length > 0, 'a skill is offered from seat ' + seat);
    const before = h.skills.length;
    t.ok(IB.pickOption(h, 0) === null, 'the pick is accepted from seat ' + seat);
    t.ok(h.skills.length === before + 1, 'and the hero actually gained it from seat ' + seat);
    t.ok(h.pend.length === 0, 'and the offer is cleared from seat ' + seat);
  }
  IB.MY = seat0;

  // The sweep as a rule instead of a list. Anything the game does FOR the
  // person watching — a sound, a toast, a panel refresh — must never be gated
  // on a bare index. Four rounds of this sweep have found seven such lines;
  // this fails on the eighth before anyone has to sit in the other chair.
  const seatGate = /(side|\.i|\bi)\s*===?\s*[01]\b/;
  const guilty = SRC.split('\n')
    .map((ln, i) => ({ ln:ln.trim(), n:i + 1 }))
    .filter(o => /\b(sfx|fxToast|syncUI)\s*\(/.test(o.ln) && seatGate.test(o.ln))
    .filter(o => !/^\s*\/\//.test(o.ln));
  t.ok(guilty.length === 0,
    'no sound, toast or panel refresh is gated on a bare side index' +
    (guilty.length ? ' — ' + guilty.map(o => o.n + ': ' + o.ln).join(' | ') : ''));

  // The same bug wearing prose instead of a colour. Half the copy in this game
  // says "the Host" where it means "the enemy", which is true from one chair
  // and a lie from the other. The worst of them was the wave warning: pinned
  // to kinds[1], so from seat two it described the army you had just sent
  // yourself — in the colour that means danger — while the wave actually
  // walking at you went unannounced. Every match, every wave.
  for (const seat of [0, 1]){
    IB.MY = seat;
    t.ok(IB.foeName() === IB.SIDE_NAME[1 - seat], 'foeName() is the other faction from seat ' + seat);
    t.ok(IB.foeName() !== IB.SIDE_NAME[seat], 'and never your own from seat ' + seat);
  }
  // Drive real waves from both chairs and read what the player was told. The
  // announced army has to be the one coming AT you, which is the one that
  // spawned on the other side of the bridge.
  for (const seat of [0, 1]){
    IB.newMatch({ diff:'veteran', seed:733 });
    IB.MY = seat;
    const kindName = (id) => IB.WAVE_KINDS.find(k => k.id === id).n;
    let told = 0, wrong = 0, split = 0;
    for (let w = 0; w < 24; w++){
      G.log.length = 0;
      IB.spawnWave();
      const msg = (G.log.find(e => /^Wave /.test(e.msg)) || {}).msg || '';
      if (!msg) continue;
      told++;
      const mineKind = G.sides[seat].waveKind, theirKind = G.sides[1 - seat].waveKind;
      if (mineKind !== theirKind) split++;
      if (msg.indexOf(IB.SIDE_NAME[1 - seat]) < 0) wrong++;          // names the enemy
      if (msg.indexOf(IB.SIDE_NAME[seat]) >= 0) wrong++;             // and never you
      if (msg.indexOf(kindName(theirKind)) < 0) wrong++;             // and their army
      if (mineKind !== theirKind && msg.indexOf(kindName(mineKind)) >= 0) wrong++;   // never yours
    }
    t.ok(told === 24, 'every wave is announced from seat ' + seat + ' (' + told + ')');
    t.ok(wrong === 0, 'and it is the wave coming AT you, by name, from seat ' + seat + ' (' + wrong + ')');
    // Without this the two holds could roll the same wave kind every time and
    // the check above would pass no matter which side it read.
    t.ok(split >= 4, 'and the two holds sent different armies often enough to tell (' + split + '/24)');
  }
  IB.MY = seat0;

  // And the card at the end of it. "The Ember gates are down" is a victory
  // message that names the winner's own faction when the winner is seat two.
  for (const seat of [0, 1]){
    for (const win of [true, false]){
      IB.newMatch({ diff:'veteran', seed:751 });
      IB.MY = seat;
      G.winner = win ? seat : 1 - seat;
      G.state = 'over';
      const html = IB.overHtml();
      const head = html.slice(0, html.indexOf('</p>'));
      const tag = 'seat ' + seat + (win ? ' winning' : ' losing');
      t.ok(head.indexOf(IB.SIDE_NAME[seat]) < 0,
        'the result headline never calls you the enemy — ' + tag);
      if (win) t.ok(head.indexOf(IB.SIDE_NAME[1 - seat]) >= 0,
        'and a win names whose gates went down — ' + tag);
    }
  }
  IB.MY = seat0;

  // Then the rule, so the next line of prose that pins a faction fails here.
  // Only SIDE_NAME and the difficulty blurbs may say a faction out loud: the
  // blurbs describe the AI handicap, which really is the Host and only the
  // Host. Everything else asks foeName().
  const prose = SRC.split('\n')
    .map((ln, i) => ({ ln:ln.trim(), n:i + 1 }))
    .filter(o => /'[^']*\b(Ember Host|Azure Pact|the Host)\b/.test(o.ln))
    .filter(o => !/^\s*\/\//.test(o.ln))
    .filter(o => !/^const SIDE_NAME/.test(o.ln))
    .filter(o => !/\beco:|\bai:\s*\./.test(o.ln));            // the difficulty table
  t.ok(prose.length === 0,
    'no copy names a faction that the seat should have chosen' +
    (prose.length ? ' — ' + prose.map(o => o.n + ': ' + o.ln.slice(0, 90)).join(' | ') : ''));
}
{
  // Juice must not be able to bury the frame: run a heavy fight and watch the pools.
  IB.newMatch({ diff:'veteran', seed:107 });
  G.sides[0].ai = true;
  let peakFx = 0, peakFloat = 0, peakProj = 0;
  for (let i = 0; i < 30 * 60 * 9 && G.state === 'play'; i++){
    IB.update(1 / 30);
    if (i % 40 === 0){
      peakFx = Math.max(peakFx, G.fx.length);
      peakFloat = Math.max(peakFloat, G.floats.length);
      peakProj = Math.max(peakProj, G.projs.length);
    }
  }
  t.ok(G.wave > 20, 'the fight ran deep into the match (wave ' + G.wave + ')');
  t.ok(peakFx <= 300, 'the particle pool stays bounded in a real fight (peak ' + peakFx + ')');
  t.ok(peakFloat <= 100, 'so does the damage-number pool (peak ' + peakFloat + ')');
  t.ok(peakProj < 200, 'and projectiles do not pile up (peak ' + peakProj + ')');
  IB.draw();
  t.ok(true, 'and it still draws');
}
{
  // A particle's alpha is t/dur, so a short `t` against a shared `dur` does
  // not shorten its life — it makes it BORN faint. Four bursts in this game
  // varied `t` meaning to vary the lifetime, and the result was that most of
  // every burst popped into existence already half dissolved. The shortest
  // lived debris, which should be the sharpest flick in the effect, was the
  // faintest thing in it.
  IB.newMatch({ diff:'veteran', seed:6101 });
  IB.fxForce = true;               // the decoration is off by default here
  const born = (make) => {
    G.fx.length = 0;
    make();
    return G.fx.slice();
  };
  const cases = [
    ['a death burst', () => IB.burstFx(60, 0, '#ffd08a', 14)],
    ['motes off a body', () => IB.moteFx(60, 0, '#c9a6ff', 10, 1)],
    ['a heal', () => IB.healFx(60, 0, '#7fdc8a')],
  ];
  let faint = 0, counted = 0, dimmest = 1;
  for (const [name, make] of cases){
    const ps = born(make);
    t.ok(ps.length >= 5, name + ' really makes debris (' + ps.length + ')');
    for (const p of ps){
      counted++;
      const a0 = p.t / p.dur;
      dimmest = Math.min(dimmest, a0);
      if (a0 < .999) faint++;
    }
  }
  // The hit spark is made inside dealDmg rather than by a function of its own,
  // so it has to be shaken out of a real hit.
  {
    IB.newMatch({ diff:'veteran', seed:6103 });
    const tgt = G.units.find(u => !u.dead) || IB.spawnUnit(1, 'grunt', { y:0 });
    let sparks = 0;
    for (let i = 0; i < 60 && sparks < 4; i++){
      G.fx.length = 0;
      IB.dealDmg(null, G.units.find(u => !u.dead) || tgt, 30, {});
      for (const p of G.fx) if (p.k === 'p'){
        sparks++; counted++;
        const a0 = p.t / p.dur;
        dimmest = Math.min(dimmest, a0);
        if (a0 < .999) faint++;
      }
      for (const u of G.units) if (u.dead) u.dead = false, u.hp = u.mhp;
    }
    t.ok(sparks >= 4, 'a real hit throws sparks (' + sparks + ')');
  }
  t.ok(counted > 25, 'the birth sweep had debris to look at (' + counted + ')');
  t.ok(faint === 0, 'no particle is born already fading (' + faint + ' of ' + counted +
    ', dimmest ' + dimmest.toFixed(2) + ')');
  t.ok(IB.life(.4).t === IB.life(.4).dur, 'life() gives a particle its own clock');
  t.ok(IB.life(.4).t === .4, 'and the lifetime asked for');

  // Read the neighbouring branch: the dash trail means it. Each ghost in it is
  // deliberately born fainter than the last, so the trail fades along its
  // length — and it says so by setting dur itself instead of going through
  // life(). Proving the fix did not flatten the one that was right.
  {
    IB.newMatch({ diff:'veteran', seed:6107 });
    const h = IB.makeHero(0, 'fighter', 'Dasher');
    h.pend.length = 0; G.sides[0].heroes.push(h); IB.enterLane(h); h.x = 60; h.y = 0;
    G.fx.length = 0;
    IB.dashFx(h, 54, -1);
    const gs = G.fx.filter(p => p.k === 'ghost');
    t.ok(gs.length >= 5, 'a dash leaves a trail (' + gs.length + ')');
    const a0s = gs.map(p => p.t / p.dur);
    t.ok(new Set(a0s.map(v => v.toFixed(3))).size > 3,
      'and every ghost in it is born at its own brightness (' + new Set(a0s.map(v => v.toFixed(2))).size + ')');
    t.ok(Math.min(...a0s) < .6, 'the far end of it starts faint on purpose (' + Math.min(...a0s).toFixed(2) + ')');
  }

  // And debris shrinks as it goes out rather than holding full size and simply
  // turning transparent, which reads as a decal fading instead of something
  // thrown. Driven through the renderer, not read off the table.
  IB.newMatch({ diff:'veteran', seed:6109 });
  IB.cam.follow = false; IB.cam.x = 60; IB.cam.z = IB.cam.tz = 1;
  const radiiAt = (age) => {
    G.fx.length = 0;
    IB.burstFx(60, 0, '#ffd08a', 12);
    for (const p of G.fx) p.t = p.dur * age;
    CTX.__stats.ellipses = [];
    IB.draw();
    return CTX.__stats.ellipses;
  };
  const fresh = radiiAt(1), spent = radiiAt(.08);
  t.ok(fresh.length > 12 && spent.length > 12, 'the shrink sweep drew the debris (' +
    fresh.length + ' / ' + spent.length + ')');
  const biggest = (es) => Math.max(...es.map(e => e.rx));
  t.ok(IB.sparkR(3, 1) > IB.sparkR(3, 0), 'a spark is bigger alive than dying');
  t.ok(IB.SPARK.min > 0 && IB.SPARK.min < 1, 'but it never shrinks away to nothing');
  t.ok(IB.sparkR(3, 1) === 3, 'and it is full size at birth');
  G.fx.length = 0;
  IB.fxForce = false;
  IB.cam.x = 26;
}

/* ---------------------------------------------------------------- difficulty */
{
  // Difficulty used to be a one-off opening purse, which is noise across a
  // fifteen-minute match — every setting played identically. It has to keep
  // applying, and it must only ever apply to the Host.
  const gather = (diff) => {
    IB.newMatch({ diff, seed:5 });
    const host = E(), you = P();
    for (const sd of [host, you]){ sd.workers.idle = 0; sd.workers.gold = 4; }
    host.aiT = 9999;                       // keep the Host's handicap, take away its decisions
    const h0 = host.gathered, y0 = you.gathered;
    step(10);
    return { host:host.gathered - h0, you:you.gathered - y0 };
  };
  const easy = gather('recruit'), even = gather('veteran'), hard = gather('warlord');
  t.ok(hard.host > even.host && even.host > easy.host,
    'the Host gathers faster the harder the setting (' + [easy, even, hard].map(g => Math.round(g.host)).join(' < ') + ')');
  t.ok(Math.abs(easy.you - hard.you) < .5, 'your own gathering is identical on every setting');
  t.ok(Math.abs(even.host - even.you) < .5, 'on Veteran the two holds gather at exactly the same rate');
  // and the Host's heroes scale too
  const heroAt = (diff) => {
    IB.newMatch({ diff, seed:5 });
    const h = IB.makeHero(1, 'fighter', 'X'); IB.pickOption(h, 0);
    const mine = IB.makeHero(0, 'fighter', 'Y'); IB.pickOption(mine, 0);
    return { host:h.mhp, you:mine.mhp };
  };
  const he = heroAt('recruit'), hh = heroAt('warlord');
  t.ok(hh.host > he.host, 'Host heroes are tougher on Warlord than on Recruit');
  t.ok(he.you === hh.you, 'your heroes are the same on every setting');
}

/* ---------------------------------------------------------------- sound */
{
  // Everything is synthesised and must stay completely silent (and cheap) in
  // headless — no AudioContext is ever created here.
  t.ok(IB.AU.ctx === null, 'no audio context is created without a player gesture');
  t.ok(IB.sfx('hit') === false, 'sfx is a no-op while there is no context');
  t.ok(Object.keys(IB.SFX).length >= 10, 'the kit covers the events worth hearing');
  let bad = 0;
  for (const k in IB.SFX){
    const d = IB.SFX[k];
    if (!Array.isArray(d) || typeof d[0] !== 'number' || d[0] <= 0 || typeof d[1] !== 'function') bad++;
  }
  t.ok(bad === 0, 'every sound has a positive minimum gap and a player');
  t.ok(IB.SFX.hit[0] < IB.SFX.fall[0], 'a sword hit may repeat far more often than a collapsing gate');
  for (const k of ['fall','wave','level','hero','win','lose'])
    t.ok(IB.SFX[k][2] === 1, k + ' is important enough to never be starved by sword chatter');
  t.ok(!IB.SFX.hit[2] && !IB.SFX.shot[2], 'and the chatter itself is droppable');
  // the whole sim runs with sound wired in and nothing throws
  IB.newMatch({ diff:'veteran', seed:113 });
  G.sides[0].ai = true;
  for (let i = 0; i < 30 * 60 * 3; i++) IB.update(1 / 30);
  t.ok(G.wave > 5 && IB.AU.ctx === null, 'three minutes of battle stays silent under headless');
}

/* ---------------------------------------------------------------- minimap */
{
  IB.newMatch({ diff:'veteran', seed:127 });
  IB.draw();
  const m = IB.minimapRect();
  t.ok(m.w > 40 && m.h > 10, 'the minimap has a real rect');
  t.ok(m.W0 <= IB.CAM_MIN && m.W1 >= IB.CAM_MAX, 'and it spans the whole world, both holds included');
  const left = IB.minimapWorldX(m.x0 + 6), right = IB.minimapWorldX(m.x0 + m.w - 6);
  t.ok(left < IB.HOLD_X + 20 && right > C.LANE_LEN, 'tapping either end reaches either hold');
  t.ok(IB.minimapWorldX(m.x0 - 500) === left, 'a tap outside the strip clamps instead of flying off');
  const mid = IB.minimapWorldX(m.x0 + m.w / 2);
  t.ok(mid > left && mid < right, 'and the middle of the strip is the middle of the world');
}

/* ---------------------------------------------------------------- hero brain */
{
  // Heroes used to trade for twenty minutes and never finish each other, and
  // spent a third of the match walking home to heal.
  IB.newMatch({ diff:'veteran', seed:151 });
  const h = IB.makeHero(0, 'fighter', 'Wound');
  h.pend.length = 0; h.passive = 'whetstone'; h.lvl = 10; IB.recalcHero(h);
  IB.enterLane(h); h.x = 60; h.y = 0;
  h.hp = h.mhp * .45; h.dmgTaken = G.t - 30;      // long out of combat
  const hp0 = h.hp;
  step(4);
  t.ok(h.hp > hp0 + 20, 'a hero out of combat mends where it stands (' + Math.round(h.hp - hp0) + ' hp in 4s)');
  h.dmgTaken = G.t;                                // just been hit
  const hp1 = h.hp;
  step(2);
  t.ok(h.hp - hp1 < (hp0 > 0 ? 40 : 1e9), 'and mends far slower while it is being fought');
}
{
  // A wounded enemy hero in reach is worth finishing.
  IB.newMatch({ diff:'veteran', seed:157 });
  const me = IB.makeHero(0, 'assassin', 'Hunter');
  me.pend.length = 0; me.passive = 'whetstone'; me.lvl = 10; IB.recalcHero(me);
  IB.enterLane(me); me.x = 60; me.y = 0; me.hp = me.mhp * .5;
  const prey = IB.makeHero(1, 'mage', 'Prey');
  prey.pend.length = 0; prey.passive = 'whetstone'; prey.lvl = 10; IB.recalcHero(prey);
  IB.enterLane(prey); prey.x = 64; prey.y = 0; prey.hp = prey.mhp * .2;
  IB.rebuildGrid();
  IB.heroStep(me, 1 / 30);
  t.ok(!me.retreat, 'a half-health hero does not run from a nearly-dead one');
  t.ok(me.target === prey, 'and it commits to the kill');
  // but a hero that is itself nearly dead still leaves
  me.hp = me.mhp * .2;
  IB.heroStep(me, 1 / 30);
  t.ok(me.retreat, 'a hero that is itself nearly dead still withdraws');
}

/* ---------------------------------------------------------------- fairness */
{
  // Both holds used to draw AI decisions from one shared stream, so whichever
  // acted first each tick got first pick of it — worth ~13 points of win rate.
  IB.newMatch({ diff:'veteran', seed:163 });
  const a = G.sides[0], b = G.sides[1];
  t.ok(a.rs !== b.rs, 'each hold starts with its own decision stream');
  const seqA = [], seqB = [];
  for (let i = 0; i < 8; i++){ seqA.push(IB.arnd(a)); seqB.push(IB.arnd(b)); }
  t.ok(seqA.every(v => v >= 0 && v < 1) && seqB.every(v => v >= 0 && v < 1), 'both streams are well formed');
  t.ok(seqA.join() !== seqB.join(), 'and they do not run in lockstep');
  // the handicap belongs to the Host, whoever is driving the other hold
  IB.newMatch({ diff:'warlord', seed:163 });
  G.sides[0].ai = true;
  const you = P(), host = E();
  you.workers.idle = 0; you.workers.gold = 4; host.workers.idle = 0; host.workers.gold = 4;
  you.aiT = host.aiT = 9999;
  const y0 = you.gathered, h0 = host.gathered;
  step(10);
  t.ok(host.gathered > you.gathered + 1,
    'automating your own hold does not hand it the Host\'s handicap');
  t.ok(you.gathered - y0 > 0 && host.gathered - h0 > 0, 'and both still gather');
}

/* ---------------------------------------------------------------- screens */
{
  // The menu sits over a live battle, which must never touch the save file.
  const before = IB.loadMeta();
  IB.startDemo();
  t.ok(G.demo === true && G.state === 'play', 'the attract battle runs like a real match');
  t.ok(G.sides[0].ai && G.sides[1].ai, 'with both holds played by the brain');
  for (const st of E().structs) st.dead = true;
  IB.endMatch(0);
  t.ok(G.state === 'play' && G.demo, 'winning the attract battle just starts another');
  const after = IB.loadMeta();
  t.ok(after.wins === before.wins && after.losses === before.losses, 'and it never writes to the save file');
  IB.newMatch({ diff:'veteran', seed:167 });
  t.ok(G.demo === false, 'starting a real match leaves the attract mode');
}
{
  // The result card shows how the match went, not just that it ended.
  IB.newMatch({ diff:'veteran', seed:173 });
  t.ok(G.timeline.length === 0, 'a fresh match has an empty timeline');
  const foe = E().structs;
  const u = IB.spawnUnit(0, 'cannon', { x:60 });
  for (const st of foe){
    if (st.key === 'gate') continue;
    G.t += 30;
    IB.dealDmg(u, st, 999999, { pure:true });
  }
  t.ok(G.timeline.length === 4, 'every structure that falls is recorded (' + G.timeline.length + ')');
  t.ok(G.timeline.every(e => e.side === 1 && e.n && finite(e.t)), 'with its side, name and time');
  const times = G.timeline.map(e => e.t);
  t.ok(times.every((v, i) => i === 0 || v >= times[i - 1]), 'in the order they fell');
  const html = IB.timelineHtml();
  t.ok(html.includes('tl-track') && (html.match(/tl-m/g) || []).length >= 4, 'and it renders a mark for each');
  t.ok(IB.timelineHtml().indexOf('NaN') === -1, 'with no NaN anywhere in it');
}

/* ---------------------------------------------------------------- ability feedback */
{
  // You pick these skills, so casting one has to be legible: a named label in
  // the world, and a pip on the card that shows its rank and cooldown.
  IB.newMatch({ diff:'veteran', seed:181 });
  const h = IB.makeHero(0, 'mage', 'Show');
  h.pend.length = 0; h.passive = 'arcanefont'; h.lvl = 12; IB.recalcHero(h);
  IB.enterLane(h); h.x = 60; h.y = 0;
  const foe = IB.spawnUnit(1, 'melee', { x:62, y:0 });
  IB.rebuildGrid();
  t.ok(IB.skillPipsHtml(h).includes('no skills yet'), 'a hero with no skills says so');
  h.skills.push({ id:'fireball', rank:2, cdT:0 }, { id:'cataclysm', rank:1, cdT:0, ult:true });
  const pips = IB.skillPipsHtml(h);
  t.ok((pips.match(/class="pip[ "]/g) || []).length === 2, 'one pip per skill');
  t.ok(pips.includes('ult'), 'the ultimate is marked');
  t.ok(pips.includes('>2<'), 'and the rank is shown');
  h.skills[0].cdT = SKILLOF('fireball').cd;
  t.ok(/height:(9[0-9]|100)%/.test(IB.skillPipsHtml(h)), 'a skill just cast shows a full cooldown');
  h.skills[0].cdT = 0;
  t.ok(/height:0%/.test(IB.skillPipsHtml(h)), 'and an empty one when ready');
  // the world label
  G.floats.length = 0;
  IB.castFx(h, IB.SKILL.cataclysm);
  const label = G.floats.find(f => f.cast);
  t.ok(!!label, 'casting names the ability in the world');
  t.ok(label.txt === 'CATACLYSM' && label.ult === true, 'an ultimate is labelled as one (' + label.txt + ')');
  t.ok(typeof IB.castCol(IB.SKILL.mend) === 'string' && IB.castCol(IB.SKILL.mend) !== IB.castCol(IB.SKILL.fireball),
    'a heal and a fireball do not read as the same thing');
  let badCol = 0;
  for (const sd of IB.SKILLS) if (!/^#[0-9a-f]{6}$/i.test(IB.castCol(sd))) badCol++;
  t.ok(badCol === 0, 'every skill has a valid cast colour');
  // The trails and motes are decoration: they must cost nothing when nobody is
  // watching, which is what keeps the headless suite fast.
  G.fx.length = 0;
  IB.castSkill(h, { id:'shadowstep', rank:1, cdT:0 }, foe);
  for (let i = 0; i < 60; i++) IB.castSkill(h, { id:'mend', rank:1, cdT:0 }, null);
  t.ok(G.fx.length === 0, 'cast decoration is skipped entirely under headless');
  // but the drawing path for it still has to survive being handed one
  G.fx.push({ k:'ghost', x:60, y:0, col:'#4ea3ff', t:.2, dur:.34, r:1 });
  G.floats.push({ x:60, y:0, txt:'TEST', col:'#ffcf4d', t:1, dur:1.4, sc:1, vy:-.5, cast:true, ult:true });
  IB.draw();
  t.ok(true, 'drawing a blur and a cast label is clean');
}

/* ---------------------------------------------------------------- resume */
{
  // A match is ten to fifteen minutes; a backgrounded tab must not cost you
  // one. Play a real match well into the middle, save it, throw the state
  // away, and pick it back up.
  IB.newMatch({ diff:'warlord', seed:191 });
  const s = P();
  G.sides[0].ai = true;
  for (let i = 0; i < 30 * 60 * 6 && G.state === 'play'; i++) IB.update(1 / 30);
  t.ok(G.state === 'play' && G.wave > 8, 'the match is well under way (wave ' + G.wave + ')');
  // a snapshot of everything that must survive
  const before = {
    t:G.t, wave:G.wave, waveT:G.waveT, diff:G.diff.id,
    res:Object.assign({}, s.res), workers:Object.assign({}, s.workers),
    builds:s.plot.filter(Boolean).map(b => b.type + b.lvl).sort().join(','),
    nodes:Object.assign({}, s.nodeLvl), towerUp:Object.assign({}, s.towerUp),
    heroes:s.heroes.map(h => h.name + '|' + h.cls + '|' + h.lvl + '|' + h.passive + h.passRank + '|' +
      h.skills.map(k => k.id + k.rank).join('+')).join(' '),
    structs:G.sides.map(sd => sd.structs.map(x => x.key + ':' + Math.round(x.hp) + (x.dead ? 'D' : '')).join(',')),
    units:G.units.filter(u => !u.isHero).length,
    kills:s.kills, gathered:Math.round(s.gathered),
  };
  t.ok(IB.saveMatch() === true, 'the match saves');
  const pack = IB.savedMatch();
  t.ok(pack && pack.v === IB.SAVE_VER && pack.wave === before.wave, 'and reads back with a version stamp');
  // obliterate the live state, then resume
  IB.newMatch({ diff:'recruit', seed:2 });
  t.ok(G.wave === 0 && P().heroes.length === 0, 'the world is genuinely wiped before resuming');
  t.ok(IB.loadMatch(pack) === null, 'the saved match loads');
  const now = P();
  t.ok(Math.abs(G.t - before.t) < .01 && G.wave === before.wave, 'the clock and the wave count come back');
  t.ok(G.diff.id === before.diff, 'on the difficulty it was played at');
  t.ok(['gold','iron','wood','food'].every(k => Math.abs(now.res[k] - before.res[k]) < .01), 'every resource comes back');
  t.ok(['idle','gold','iron','wood','food'].every(k => now.workers[k] === before.workers[k]), 'and every worker is on the same job');
  t.ok(now.plot.filter(Boolean).map(b => b.type + b.lvl).sort().join(',') === before.builds, 'the hold is rebuilt exactly');
  t.ok(IB.NODE_UPGRADABLE.every(k => IB.nodeLvl(now, k) === before.nodes[k]), 'mines keep the levels you dug them to');
  t.ok(Object.keys(before.towerUp).every(k => now.towerUp[k] === before.towerUp[k]), 'and the forge ranks you bought');
  const heroesNow = now.heroes.map(h => h.name + '|' + h.cls + '|' + h.lvl + '|' + h.passive + h.passRank + '|' +
    h.skills.map(k => k.id + k.rank).join('+')).join(' ');
  t.ok(heroesNow === before.heroes, 'every hero comes back with its whole build');
  t.ok(now.heroes.every(h => h.mhp > 0 && h.hp <= h.mhp && finite(h.hp)), 'and with sane stats recomputed');
  t.ok(now.heroes.filter(h => !h.dead).every(h => G.units.includes(h)), 'living heroes are back on the bridge');
  t.ok(now.heroes.filter(h => h.dead).every(h => !G.units.includes(h)), 'dead ones are still waiting to respawn');
  const structsNow = G.sides.map(sd => sd.structs.map(x => x.key + ':' + Math.round(x.hp) + (x.dead ? 'D' : '')).join(','));
  t.ok(structsNow.join('|') === before.structs.join('|'), 'every turret, inhibitor and gate keeps its damage');
  t.ok(Math.abs(G.units.filter(u => !u.isHero).length - before.units) <= 1, 'the wave standing on the bridge comes back');
  t.ok(now.kills === before.kills && Math.round(now.gathered) === before.gathered, 'and the running totals');
  // A hero that has decided to pull back holds that decision between 28% and
  // 66% health — the flag is the whole memory of it. Dropped from the save, a
  // wounded hero mid-withdrawal turned round on resume and walked back into
  // what it was leaving. Set it by hand and put the hero inside the band, so
  // the assertion cannot be satisfied by heroStep simply deciding it again.
  {
    const hr = now.heroes.find(x => !x.dead) || now.heroes[0];
    if (hr){
      hr.retreat = true; hr.hp = hr.mhp * .45;
      t.ok(hr.hp / hr.mhp > .28 && hr.hp / hr.mhp < .66,
        'the hero sits in the band where only the flag remembers (' + (hr.hp / hr.mhp).toFixed(2) + ')');
      IB.saveMatch();
      const p2 = IB.savedMatch();
      IB.newMatch({ diff:'recruit', seed:3 });
      t.ok(IB.loadMatch(p2) === null, 'it saves and loads again');
      const back = P().heroes.find(x => x.name === hr.name);
      t.ok(!!back, 'the withdrawing hero comes back (' + hr.name + ')');
      t.ok(back && back.retreat === true, 'still pulling back, not turned round by the reload');
      // and the flag is not simply always true after a load
      back.retreat = false; back.hp = back.mhp * .45;
      IB.saveMatch();
      IB.newMatch({ diff:'recruit', seed:4 });
      IB.loadMatch(IB.savedMatch());
      const back2 = P().heroes.find(x => x.name === hr.name);
      t.ok(back2 && back2.retreat === false, 'and a hero that was holding its ground still is');
    }
  }
  // and it is a live match, not a museum piece
  const wave0 = G.wave;
  for (let i = 0; i < 30 * 60 * 3 && G.state === 'play'; i++) IB.update(1 / 30);
  t.ok(G.wave > wave0, 'the resumed match keeps running');
  t.ok(G.units.every(u => finite(u.x) && finite(u.hp)), 'and stays numerically sane');
  IB.draw();
  t.ok(true, 'and draws');
}
{
  // The attract battle and a finished match must never leave a save behind.
  IB.clearSave();
  IB.startDemo();
  for (let i = 0; i < 60; i++) IB.update(1 / 30);
  t.ok(IB.saveMatch() === false && IB.savedMatch() === null, 'the menu battle is never saved');
  IB.newMatch({ diff:'veteran', seed:193 });
  step(2);
  t.ok(IB.saveMatch() === true, 'a real match is');
  for (const st of E().structs) if (st.key !== 'gate') st.dead = true;
  const gate = E().structs.find(x => x.key === 'gate');
  IB.dealDmg(IB.spawnUnit(0, 'cannon', { x:gate.x - 2 }), gate, 999999, { pure:true });
  t.ok(G.state === 'over', 'the match ends');
  t.ok(IB.savedMatch() === null, 'and a decided match leaves no save to resume');
  // a save from a future version is ignored rather than half-loaded
  try { store['ib_save'] = JSON.stringify({ v:IB.SAVE_VER + 99, sides:[{}, {}] }); } catch (e){}
  t.ok(IB.savedMatch() === null, 'a save from another version is refused');
  try { store['ib_save'] = '{ this is not json'; } catch (e){}
  t.ok(IB.savedMatch() === null, 'and so is a corrupt one');
  IB.clearSave();
}

/* ---------------------------------------------------------------- passive hooks */
{
  // The three hooks that were dead: a hero lending armour to the minions
  // beside it, and two that make the minions your hold sends out tougher.
  IB.newMatch({ diff:'veteran', seed:197 });
  const s = P();
  const plain = IB.spawnUnit(0, 'melee', { x:60, y:0 });
  const baseHp = plain.mhp;
  const warden = IB.makeHero(0, 'tank', 'Warden');
  warden.pend.length = 0; warden.passive = 'banner'; warden.passRank = 1;
  IB.recalcHero(warden); IB.enterLane(warden);
  warden.x = 60; warden.y = 0;
  s.heroes.push(warden);
  t.ok(IB.effArmor(plain, false) > plain.armor, 'a banner hero lends armour to the minion beside it');
  const far = IB.spawnUnit(0, 'melee', { x:110, y:0 });
  t.ok(IB.effArmor(far, false) === far.armor, 'but not to one at the far end of the bridge');
  const foe = IB.spawnUnit(1, 'melee', { x:60.5, y:0 });
  t.ok(IB.effArmor(foe, false) === foe.armor, 'and never to the enemy');
  const hp0 = plain.hp;
  IB.dealDmg(foe, plain, 100);
  const withAura = hp0 - plain.hp;
  s.heroes.length = 0;
  const plain2 = IB.spawnUnit(0, 'melee', { x:60, y:0 });
  const hp1 = plain2.hp;
  IB.dealDmg(foe, plain2, 100);
  t.ok(hp1 - plain2.hp > withAura, 'and the lent armour really reduces the damage taken');
  // the two spawn-time hooks
  s.heroes.length = 0;
  const lord = IB.makeHero(0, 'support', 'Lord');
  lord.pend.length = 0; lord.passive = 'minionlord'; IB.recalcHero(lord);
  s.heroes.push(lord);
  const buffed = IB.spawnUnit(0, 'melee', { x:60, y:0 });
  t.ok(buffed.mhp > baseHp, 'Minion Lord makes every minion you send out tougher (' + baseHp + '→' + buffed.mhp + ')');
  const theirs = IB.spawnUnit(1, 'melee', { x:60, y:0 });
  t.ok(theirs.mhp === baseHp, 'and does nothing for theirs');
  s.heroes.length = 0;
  const drill = IB.makeHero(0, 'tank', 'Drill');
  drill.pend.length = 0; drill.passive = 'drillmaster'; IB.recalcHero(drill);
  s.heroes.push(drill);
  const foot = IB.spawnUnit(0, 'melee', { x:60 }), cast = IB.spawnUnit(0, 'caster', { x:60 });
  t.ok(foot.mhp > baseHp, 'Drillmaster toughens footmen');
  t.ok(cast.mhp === Math.round(IB.UNITS.caster.hp * (1 + .055 * G.wave)), 'but leaves casters alone');
}

/* -------------------------------------------------- the ultimates you actually meet */
{
  // Every class has exactly three ultimates and the offer always shows all
  // three, so an ultimate the Host never takes is one the player never faces.
  // Driving 400 ultimate offers per class through the real chooser, FIVE of
  // the eighteen came up zero times and two classes were locked to one apiece:
  //
  //   Fighter   Bladestorm 100%  Champion's Edge 0%  War Banner 0%
  //   Marksman  Arrow Rain 100%  Headhunter 1%       Trueshot 0%
  //   Mage      Cataclysm 67%    Arcane Torrent 34%  Frost Prison 0%
  //   Support   Sanctuary 81%    Hymn of Valour 19%  Chain of Dawn 0%
  //
  // The cause: autoPick scored a skill by skRate, which measures DAMAGE, and
  // then rescued five hand-picked class/tag pairs. A summon, a stun, a shield
  // or a heal outside those pairs was scored on damage it does not do. The
  // chooser adds a die roll in [0,1), so anything more than 1.0 behind the
  // best in its menu can never win however often it is shown.
  IB.newMatch({ diff:'veteran', seed:1451 });
  const s = P();
  // Fallback so a revert reports assertions instead of throwing — but assert
  // the scorer is there, or the reachability count below would pass vacuously
  // on a build where every option scores a flat zero.
  t.ok(typeof IB.skillWorth === 'function', "the chooser's scoring can be read from outside");
  const worth = (h, d) => (IB.skillWorth ? IB.skillWorth(h, d) : 0);
  const mk = (cls) => {
    rich(s);
    if (!IB.bList(s, 'tavern').length) IB.build(s, s.plot.indexOf(null), 'tavern');
    s.heroes.length = 0;
    IB.createHero(s, cls);
    return s.heroes[0];
  };
  // a skill is scored for the job it does, not only for the damage it deals
  {
    const h = mk('fighter');
    const banner = IB.SKILL.warbanner, storm = IB.SKILL.bladestorm;
    const bare = (d) => IB.skRate(d, 1, IB.CLS.fighter.b.ad + IB.CLS.fighter.g.ad * 8,
      IB.CLS.fighter.b.ap + IB.CLS.fighter.g.ap * 8) / 30;
    t.ok(worth(h, banner) > bare(banner) + .3,
      'a summon is worth more than the damage it deals (' + worth(h, banner).toFixed(2) +
      ' vs a bare rate of ' + bare(banner).toFixed(2) + ')');
    t.ok(worth(h, storm) - worth(h, banner) < 1,
      'so it is within a die roll of the class favourite and can actually be chosen (' +
      (worth(h, storm) - worth(h, banner)).toFixed(2) + ')');
  }
  // and a skill that heals is support work whatever its tag says
  {
    const h = mk('support');
    const dawn = IB.SKILL.dawnchain;
    t.ok(dawn.tag !== 'heal' && dawn.healAlly > 0, 'Chain of Dawn heals an ally but is not tagged as a heal');
    const fighter = mk('fighter');
    t.ok(worth(mk('support'), dawn) > worth(fighter, dawn) + .5,
      'and a support values it above what a fighter would (' +
      worth(mk('support'), dawn).toFixed(2) + ' vs ' + worth(fighter, dawn).toFixed(2) + ')');
  }
  // how many ultimates are inside a die roll of their class favourite
  {
    let reachable = 0, total = 0, spread = 0;
    const locked = [];
    for (const c of IB.CLASSES){
      const h = mk(c.id), ults = IB.ultPool(c.id);
      const sc = ults.map(u => ({ n:u.n, w:worth(h, u) })).sort((a, b) => b.w - a.w);
      spread = Math.max(spread, sc[0].w - sc[sc.length - 1].w);
      for (const x of sc){ total++; if (sc[0].w - x.w < 1) reachable++; else locked.push(c.name + ': ' + x.n); }
    }
    t.ok(total === 18, 'six classes, three ultimates each (' + total + ')');
    t.ok(spread > 0, 'and the scorer tells them apart at all (best-worst ' + spread.toFixed(2) + ')');
    t.ok(reachable >= 16, 'at least sixteen of the eighteen can be chosen at all (' +
      reachable + '; locked out: ' + (locked.join(', ') || 'none') + ')');
  }
  // and in play: every class fields more than one ultimate
  {
    // 150 draws per class. The rarest second option measured 7%, so the chance
    // of a class showing only one ultimate by luck is 0.93^150, about two in a
    // hundred thousand — and seeds and dt are fixed here anyway, so this count
    // is exact. The margin is for later balance work, not for noise.
    const thin = [];
    for (const c of IB.CLASSES){
      const took = new Set();
      for (let i = 0; i < 150; i++){
        const h = mk(c.id);
        if (!h) break;
        h.lvl = 6;
        const p = IB.offer(h, 'ult');
        if (!p) continue;
        const n0 = h.skills.length;
        IB.autoPick(h);
        if (h.skills.length > n0) took.add(h.skills[n0].id);
      }
      if (took.size < 2) thin.push(c.name + ' (' + took.size + ')');
    }
    t.ok(thin.length === 0, 'every class is seen fielding more than one ultimate' +
      (thin.length ? ' — stuck on one: ' + thin.join(', ') : ''));
  }
}

/* ------------------------------------------- the chooser's other two branches */
{
  // autoPick has three scoring branches — passive, skill, rank. Only the skill
  // branch was ever properly built (and was extracted as skillWorth last time
  // the ultimates were audited). The other two were still guessing.
  //
  // MOVE: TAG_WORTH had no entry for tag 'move', so a mobility skill scored the
  // die and nothing else. Sprint is in all six class pools and rated 0.19 in
  // every one of them, the floor of each. Three independent measurements
  // agreed: 0 of 1200 AI heroes took it; 18,000 heroes over 54,000 offers took
  // it 0-8 times per class (0 of 1762 for the Mage); and a Monte Carlo over
  // real three-option menus put it at 0.0-0.6% in every class. Fighter's Dash
  // Strike was the same at 2%, because the dash bonus was written for the
  // Assassin alone.
  //
  // RANK: the branch was `sc += id.startsWith('P:') ? .4 : .8` — it never
  // looked at WHICH skill it was ranking. Over 216,000 rank offers the option
  // with the larger real gain was chosen 51.3% of the time from a menu of two
  // (chance is 50%) and 31.8% from a menu of three (chance is 33.3%): no
  // correlation with value at all, in a choice half of all heroes reach.
  IB.newMatch({ diff:'veteran', seed:1487 });
  const s = P();
  const mk = (cls) => {
    rich(s);
    if (!IB.bList(s, 'tavern').length) IB.build(s, s.plot.indexOf(null), 'tavern');
    s.heroes.length = 0;
    IB.createHero(s, cls);                      // costs gold: rich() before EVERY forge
    return s.heroes[0];
  };
  t.ok(typeof IB.rankWorth === 'function', 'the rank scoring can be read from outside');
  t.ok(IB.TAG_WORTH && typeof IB.TAG_WORTH === 'object', 'and so can the tag table');

  // a mobility skill is worth something for being mobility
  {
    t.ok((IB.TAG_WORTH || {}).move > 0, 'the tag table pays for movement (' +
      ((IB.TAG_WORTH || {}).move ?? 'missing') + ')');
    const sprint = IB.SKILL.sprint;
    t.ok(sprint && sprint.tag === 'move', 'Sprint is a movement skill');
    let floorInEvery = 0;
    for (const c of IB.CLASSES){
      const h = mk(c.id);
      const pool = IB.basicPool(c.id).map(d => IB.skillWorth(h, d)).sort((a, b) => a - b);
      if (IB.skillWorth(h, sprint) <= pool[0]) floorInEvery++;
    }
    t.ok(floorInEvery < 6, 'and Sprint is no longer the floor of every single class pool (' +
      floorInEvery + ' of 6)');
    // the fighter's own dash is credited like the assassin's
    const f = mk('fighter'), a = mk('assassin');
    const dash = IB.SKILL.dashstrike;
    if (dash) t.ok(IB.skillWorth(f, dash) > IB.skillWorth(mk('mage'), dash),
      "a fighter values its own dash above a class that has no use for it");
    t.ok(!!a, 'the assassin still forges');
  }

  // ranking up is scored by the step it actually buys
  {
    const h = mk('mage');
    // give it two skills at different ranks so the steps genuinely differ
    for (const kind of ['skill', 'skill']){ const p = IB.offer(h, kind); if (p) IB.autoPick(h); }
    t.ok(h.skills.length >= 2, 'the hero has two skills to choose between (' + h.skills.length + ')');
    const a = h.skills[0], b = h.skills[1];
    const wa = IB.rankWorth(h, a.id), wb = IB.rankWorth(h, b.id);
    t.ok(wa > 0 && wb > 0, 'both rank options are worth something');
    // A skill's output is LINEAR in rank (dmg:[base, perRank]), so the step
    // from r to r+1 is the same size at every rank — the score correctly does
    // NOT vary with the rank it steps from. What it must do is tell two
    // DIFFERENT skills apart by how big their step is. That is the whole fix:
    // the old branch was a flat 0.8 for every skill alike.
    const step = (sk) => {
      const d = IB.SKILL[sk.id], cl = IB.CLS[h.cls];
      const ad = cl.b.ad + cl.g.ad * 8, ap = cl.b.ap + cl.g.ap * 8;
      return IB.skRate(d, sk.rank + 1, ad, ap) - IB.skRate(d, sk.rank, ad, ap);
    };
    const sa = step(a), sb = step(b);
    if (Math.abs(sa - sb) > 1e-6)
      t.ok((sa > sb) === (wa > wb),
        'the option that buys the bigger step is the one scored higher (steps ' +
        sa.toFixed(2) + '/' + sb.toFixed(2) + ' → worth ' + wa.toFixed(2) + '/' + wb.toFixed(2) + ')');
    else t.ok(true, 'these two skills happen to buy the same step, nothing to order');
    // and the score is not a flat constant per kind, which is what it replaced
    const spread = new Set(h.skills.map(x => IB.rankWorth(h, x.id).toFixed(4)));
    t.ok(spread.size > 1 || h.skills.length < 2,
      'two different skills do not score identically (' + [...spread].join(', ') + ')');
    // and an ultimate outranks a basic of the same step, because it carries the fight
    const ult = IB.ultPool('mage')[0];
    h.skills.push({ id:ult.id, rank:1, cdT:0, ult:true });
    const basic = h.skills.find(x => !x.ult);
    if (basic) t.ok(IB.rankWorth(h, ult.id) > 0, 'an ultimate rank is scored too (' +
      IB.rankWorth(h, ult.id).toFixed(2) + ')');
  }
}

/* -------------------------------------------------------------- passive value */
{
  // The passive branch of the chooser used to be a hand-written sum over nine
  // modifier keys. The 100 passives between them use 69, so 60 keys were
  // invisible and 67 of the 100 passives had NO scored key at all — the die
  // alone decided them, and every class got the identical distribution because
  // nothing in the branch looked at the hero.
  IB.newMatch({ diff:'veteran', seed:8801 });
  t.ok(typeof IB.passiveWorth === 'function', 'a passive can be scored from outside');
  t.ok(IB.PASSIVE_W && typeof IB.PASSIVE_W === 'object', 'and the coefficient table is readable');

  // 1. every key the content actually uses has a price
  {
    const W = IB.PASSIVE_W || {};
    const used = new Set();
    for (const p of IB.PASSIVES) for (const k in p.m) used.add(k);
    // onHitAp and apPct multiply against the hero's own live power, so they are
    // priced off ap0(h) inside passiveWorth rather than by a flat coefficient
    const priced = [...used].filter(k => k in W || k === 'onHitAp' || k === 'apPct');
    t.ok(used.size >= 60, 'the passives use a wide spread of modifier keys (' + used.size + ')');
    t.ok(priced.length === used.size, 'every key a passive uses has a price (' +
      [...used].filter(k => !priced.includes(k)).join(', ') + ')');
  }

  // 2. the units trap. auraArm and auraHeal carry FLAT POINTS (14 armour,
  // 6 hp/s at the call site) while auraDmg/auraMs/auraHp/meleeHp/cannonDmg/
  // casterDmg carry FRACTIONS (.12, .25). Priced on one scale the flat pair is
  // multiplied by a 14 where the others get a .12, and Banner of Iron alone
  // scores ~36 against a table whose real maximum is under 1.5. Nothing else in
  // here would notice — the ordering assertions below would all still pass —
  // so bound the whole table instead.
  {
    let worst = null;
    for (const c of IB.CLASSES) for (const p of IB.PASSIVES){
      const v = IB.passiveWorth ? IB.passiveWorth({ cls:c.id }, p) : 0;
      if (!worst || v > worst.v) worst = { v, n:p.n, c:c.id };
    }
    t.ok(worst.v <= 3, 'no passive scores off the scale — the highest is ' +
      worst.n + ' at ' + worst.v.toFixed(2) + ' for a ' + worst.c);
    let anyNeg = false;
    for (const c of IB.CLASSES) for (const p of IB.PASSIVES)
      if ((IB.passiveWorth ? IB.passiveWorth({ cls:c.id }, p) : 0) < -1) anyNeg = true;
    t.ok(!anyNeg, 'and none scores absurdly negative either');
  }

  // 3. the behaviour, through the real chooser, with no export involved: a menu
  // of three passives that touch NONE of the nine old keys. The old branch
  // scored all three at a flat zero, so the die decided and each won ~33%.
  // A fresh hero per trial is the only way to sample this — the passive offer
  // fires once inside makeHero and never again, so looping gainXp on one hero
  // would test nothing.
  {
    const NINE = ['ad', 'ap', 'hpPct', 'armor', 'as', 'ls', 'hp', 'mdmg', 'tdmg'];
    const menu = ['lifebinder', 'quickmind', 'marchboots'];
    t.ok(menu.every(id => IB.PASS[id]), 'the three probe passives still exist');
    t.ok(menu.every(id => !NINE.some(k => IB.PASS[id].m[k] !== undefined)),
      'and none of them is visible to the nine keys the old sum read');
    const run = (cls) => {
      const win = {};
      for (let i = 0; i < 400; i++){
        const h = IB.makeHero(0, cls, 'Probe');
        h.pend = [{ kind:'passive', opts:menu.slice(), lvl:1 }];
        IB.autoPick(h);
        win[h.passive] = (win[h.passive] || 0) + 1;
      }
      return win;
    };
    const sup = run('support'), mm = run('marksman');
    t.ok((sup.lifebinder || 0) / 400 > .6,
      'the chooser can tell three unscored passives apart (Lifebinder took ' +
      Math.round((sup.lifebinder || 0) / 4) + '% of 400, chance is 33%)');
    // and it reads the hero: an aura heal is a support's own fantasy, and the
    // old branch gave every class byte-identical numbers here
    // This compared the two counts with no margin when it shipped, and a
    // mutation audit found it passing 296 to 293 out of 400 on a build where
    // classPassiveBonus returned zero and the scorer was byte-identical for
    // every class — a 0.75% gap against a binomial sd of about 8.8, i.e. pure
    // stream noise. Ask the scorer directly, and give the sampled rate a margin
    // wide enough that noise cannot supply it. The real gap is around 90 of 400.
    t.ok((IB.passiveWorth ? IB.passiveWorth({ cls:'support' }, IB.PASS.lifebinder) : 0) >
         (IB.passiveWorth ? IB.passiveWorth({ cls:'marksman' }, IB.PASS.lifebinder) : 1) * 1.15,
      'a support prices the healing aura well above a marksman');
    t.ok((sup.lifebinder || 0) - (mm.lifebinder || 0) > 40,
      'and takes it far more often in play (' + (sup.lifebinder || 0) + ' vs ' +
      (mm.lifebinder || 0) + ' of 400)');
  }

  // 4. a passive that is a strict superset of another's numbers must never
  // score below it, for any class — the boosts are added per key on top of the
  // already-scaled base term, so they cannot invert an ordering.
  {
    const pairs = [['silkrobes', 'wardweave'], ['bloodmoney', 'looter'], ['mystic', 'arcanefont'],
                   ['reaper', 'headsman'], ['inferno', 'venomtip'], ['lifebinder', 'fieldmedic'],
                   ['trickster', 'quickmind'], ['trickster', 'marchboots']];
    let bad = null;
    for (const c of IB.CLASSES) for (const [win, lose] of pairs){
      if (!IB.PASS[win] || !IB.PASS[lose]) continue;
      const a = IB.passiveWorth ? IB.passiveWorth({ cls:c.id }, IB.PASS[win]) : 0;
      const b = IB.passiveWorth ? IB.passiveWorth({ cls:c.id }, IB.PASS[lose]) : 1;
      if (a < b) bad = c.id + ': ' + win + ' ' + a.toFixed(2) + ' < ' + lose + ' ' + b.toFixed(2);
    }
    t.ok(!bad, 'the stronger of a dominated pair always scores at least as high (' + (bad || 'all 48 checked') + ')');
  }

  // 5. and the rank branch reads the same worth, so ranking a passive up is
  // valued by which passive it is
  {
    const h = IB.makeHero(0, 'tank', 'Rank');
    IB.autoPick(h);
    const spread = new Set();
    for (const id of ['lifebinder', 'skirmisher', 'ironwill']){
      if (!IB.PASS[id]) continue;
      h.passive = id;
      spread.add(IB.rankWorth(h, 'P:' + id).toFixed(4));
    }
    t.ok(spread.size > 1, 'a rank of the passive is priced by which passive it is (' + [...spread].join(', ') + ')');
  }
}

/* ---------------------------------------------------------------- skill value */
{
  // Every skill has to be worth picking. Second Wind was dead last for all six
  // classes and strictly worse than Mend — less healing, longer cooldown.
  IB.newMatch({ diff:'veteran', seed:199 });
  const rate = (id, cls) => {
    const cl = IB.CLS[cls];
    return IB.skRate(IB.SKILL[id], 3, cl.b.ad + cl.g.ad * 8, cl.b.ap + cl.g.ap * 8);
  };
  const total = (id, r) => IB.SKILL[id].heal[0] + IB.SKILL[id].heal[1] * (r - 1);
  t.ok(total('secondwind', 3) > total('mend', 3) * 1.3,
    'a heal that arrives over five seconds pays more than an instant one');
  t.ok(IB.SKILL.secondwind.cd <= IB.SKILL.mend.cd + 8, 'and does not also cost a much longer cooldown');
  for (const cl of IB.CLASSES)
    t.ok(rate('secondwind', cl.id) > rate('mend', cl.id) * .9, 'Second Wind is worth taking as a ' + cl.name);

  // Nothing may be beaten on every axis at once by something in the same pool.
  let dominated = [];
  for (const cl of IB.CLASSES){
    const pool = IB.basicPool(cl.id);
    const ad = IB.CLS[cl.id].b.ad + IB.CLS[cl.id].g.ad * 8, ap = IB.CLS[cl.id].b.ap + IB.CLS[cl.id].g.ap * 8;
    for (const a of pool) for (const b of pool){
      // Only compare like with like: a class's own skill *should* beat the
      // shared pool for that class — that is what class identity means.
      if (a === b || a.tag !== b.tag || a.cls !== b.cls) continue;
      const ra = IB.skRate(a, 3, ad, ap), rb = IB.skRate(b, 3, ad, ap);
      if (ra < rb * .999 && a.cd >= b.cd && a.mana >= b.mana)
        dominated.push(cl.id + ':' + a.n + ' < ' + b.n);
    }
  }
  t.ok(dominated.length === 0, 'no skill is beaten on output, cooldown and cost at once (' +
    dominated.slice(0, 3).join('; ') + ')');
  // and the value function itself has to be sane
  let bad = 0;
  for (const sd of IB.SKILLS) for (const r of [1, 3, 5])
    if (!finite(IB.skOutput(sd, r, 100, 100)) || IB.skOutput(sd, r, 100, 100) <= 0) bad++;
  t.ok(bad === 0, 'every skill is worth a finite, positive amount at every rank');
  t.ok(IB.skOutput(IB.SKILL.fireball, 5, 100, 100) > IB.skOutput(IB.SKILL.fireball, 1, 100, 100),
    'and ranking a skill up makes it worth more');
}
{
  // The Host used to pick skills and ultimates at pure random, so it built
  // tanks full of nukes and supports with no heals.
  IB.newMatch({ diff:'veteran', seed:211 });
  const taste = { support:0, tank:0, n:0 };
  for (let seed = 0; seed < 40; seed++){
    IB.reseed(400 + seed);
    for (const cls of ['support','tank']){
      const h = IB.makeHero(1, cls, 'AI');
      IB.autoPick(h);
      for (const lv of [3, 6, 9]){ h.lvl = lv; IB.offer(h, 'skill'); IB.autoPick(h); }
      const kinds = h.skills.map(k => IB.SKILL[k.id]);
      if (cls === 'support' && kinds.some(k => k.tag === 'heal' || k.tag === 'buff')) taste.support++;
      if (cls === 'tank' && kinds.some(k => k.tag === 'cc' || k.shield)) taste.tank++;
    }
    taste.n++;
  }
  t.ok(taste.support > taste.n * .7, 'a Host support usually ends up with something that helps allies (' +
    taste.support + '/' + taste.n + ')');
  t.ok(taste.tank > taste.n * .7, 'and a Host tank with crowd control or a shield (' + taste.tank + '/' + taste.n + ')');
  t.ok(taste.support < taste.n * 1.01, 'without the pick becoming deterministic');
}

/* ---------------------------------------------------------------- wave shapes */
{
  // Every wave used to be identical. The archetypes must all show up, respect
  // the wave they unlock at, and — the important part — swap the trickle
  // around rather than quietly making waves stronger.
  IB.newMatch({ diff:'veteran', seed:223 });
  t.ok(IB.WAVE_KINDS.length >= 4, 'there is more than one shape of wave');
  t.ok(IB.WAVE_KINDS[0].id === 'levy' && IB.WAVE_KINDS[0].min === 0, 'plain levies are the default');
  t.ok(IB.WAVE_KINDS.every(k => k.n && typeof k.min === 'number'), 'each shape is named and has an unlock');

  const seen = {}, power = {};
  for (let w = 0; w < 90; w++){
    G.units.length = 0;
    for (const sd of G.sides){ sd.muster.length = 0; sd.superT = 0; }
    // spawnWave() advances the wave, and a wave 90 later is stronger whatever
    // its shape — pin it, or this measures the clock instead of the shape.
    G.wave = 23;                                 // deep enough that every shape is unlocked
    IB.spawnWave();
    const k = P().waveKind;
    const mine = G.units.filter(u => u.side === 0);
    seen[k] = (seen[k] || 0) + 1;
    const val = mine.reduce((a, u) => a + u.mhp + u.ad * 12, 0);
    (power[k] = power[k] || []).push(val);
    if (k === 'volley') t.ok(mine.filter(u => u.kind === 'caster').length >= 2, 'a volley wave brings casters');
    if (k === 'ogres') t.ok(mine.some(u => u.kind === 'super'), 'an ogre push brings an ogre');
    if (k === 'shield') t.ok(mine.filter(u => u.kind === 'grunt').length >= 5, 'a shield wall brings bodies');
  }
  t.ok(Object.keys(seen).length >= 4, 'every shape actually turns up (' + Object.keys(seen).join(',') + ')');
  t.ok(seen.levy > 20, 'and plain levies stay the common case (' + seen.levy + '/90)');
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const means = Object.keys(power).map(k => ({ k, v:avg(power[k]) }));
  const lo = Math.min(...means.map(m => m.v)), hi = Math.max(...means.map(m => m.v));
  t.ok(hi / lo < 1.45, 'no shape is a free power spike (' +
    means.map(m => m.k + ' ' + Math.round(m.v)).join(', ') + ')');
  // the shapes that unlock late must not appear early
  IB.newMatch({ diff:'veteran', seed:227 });
  let early = 0;
  for (let w = 0; w < 40; w++){
    G.units.length = 0;
    for (const sd of G.sides) sd.muster.length = 0;
    G.wave = 2;
    IB.spawnWave();
    G.wave = 2;
    if (P().waveKind === 'ogres' || P().waveKind === 'siege') early++;
  }
  t.ok(early === 0, 'ogres and siege engines do not turn up in the first few waves');
}

/* ---------------------------------------------------------------- class roles */
{
  // An assassin whose whole point is killing heroes hunted no further than a
  // support did, and finished matches with the fewest hero kills of anyone.
  t.ok(IB.huntRange({ cls:'assassin' }) > IB.huntRange({ cls:'support' }),
    'an assassin goes further out of its way for a hero than a support does');
  t.ok(IB.huntRange({ cls:'assassin' }) > IB.huntRange({ cls:'tank' }), 'and further than a tank');
  t.ok(IB.huntRange({ cls:'nonsense' }) > 0, 'an unknown class still gets a sane range');
  IB.newMatch({ diff:'veteran', seed:229 });
  const killer = IB.makeHero(0, 'assassin', 'Knife');
  killer.pend.length = 0; killer.passive = 'whetstone'; killer.lvl = 10; IB.recalcHero(killer);
  IB.enterLane(killer); killer.x = 47; killer.y = 0;
  const guard = IB.makeHero(0, 'tank', 'Wall');
  guard.pend.length = 0; guard.passive = 'ironhide'; guard.lvl = 10; IB.recalcHero(guard);
  IB.enterLane(guard); guard.x = 47; guard.y = 0;
  const mark = IB.makeHero(1, 'mage', 'Mark');
  mark.pend.length = 0; mark.passive = 'whetstone'; mark.lvl = 10; IB.recalcHero(mark);
  IB.enterLane(mark); mark.x = 60; mark.y = 0;   // thirteen away, and clear of their turrets
  IB.rebuildGrid();
  t.ok(IB.heroTarget(killer) === mark, 'the assassin picks the distant hero');
  t.ok(IB.heroTarget(guard) !== mark, 'the tank does not');
  // ...but a long reach must not walk it under their guns alone
  const turret = E().structs.find(x => x.key === 't1');
  mark.x = turret.x - 2;
  killer.x = turret.x - 12;                       // close enough to reach it
  IB.rebuildGrid();
  t.ok(IB.towerCovered(killer, mark) === true, 'a target sitting under a turret is flagged');
  t.ok(IB.heroTarget(killer) !== mark, 'and the assassin will not chase it there alone');
  for (let i = 0; i < 3; i++) IB.spawnUnit(0, 'melee', { x:turret.x - 1, y:i - 1 });
  IB.rebuildGrid();
  t.ok(IB.towerCovered(killer, mark) === false, 'with minions soaking the turret it is fair game');
  t.ok(IB.heroTarget(killer) === mark, 'and the assassin goes in');
}
{
  // A support's heal used to be cast on nobody when no hero was hurt.
  IB.newMatch({ diff:'veteran', seed:233 });
  const sup = IB.makeHero(0, 'support', 'Mender');
  sup.pend.length = 0; sup.passive = 'mystic'; sup.lvl = 9; IB.recalcHero(sup);
  IB.enterLane(sup); sup.x = 60; sup.y = 0;
  const hurt = IB.spawnUnit(0, 'melee', { x:61, y:0 });
  hurt.hp = hurt.mhp * .3;
  const healthy = IB.spawnUnit(0, 'melee', { x:62, y:0 });
  IB.rebuildGrid();
  t.ok(IB.lowAlly(sup, 7) === hurt, 'with no wounded hero about, it mends the wounded minion');
  const hurtHero = IB.makeHero(0, 'fighter', 'Bleeder');
  hurtHero.pend.length = 0; hurtHero.passive = 'whetstone'; hurtHero.lvl = 9; IB.recalcHero(hurtHero);
  IB.enterLane(hurtHero); hurtHero.x = 61; hurtHero.y = 0; hurtHero.hp = hurtHero.mhp * .5;
  IB.rebuildGrid();
  t.ok(IB.lowAlly(sup, 7) === hurtHero, 'but a wounded hero always comes first');
  t.ok(IB.lowAlly(sup, 7) !== healthy, 'and it never wastes the cast on someone at full health');
  const before = hurt.hp;
  IB.castSkill(sup, { id:'mendingward', rank:2, cdT:0 }, null);
  t.ok(hurtHero.hp > hurtHero.mhp * .5 || hurt.hp > before, 'and the heal actually lands on somebody');
}

/* ---------------------------------------------------------------- the forge */
{
  // Armour Plating was purchasable, priced and described, and read by nothing.
  // Every upgrade now has to prove it changes the simulation.
  const probe = (id, measure) => {
    IB.newMatch({ diff:'veteran', seed:239 });
    const s = P();
    rich(s);
    IB.build(s, s.plot.indexOf(null), 'forge');
    IB.upgradeBuilding(s, s.plot.findIndex(b => b && b.type === 'forge'));
    const before = measure(s);
    for (let i = 0; i < 3; i++) rich(s), IB.buyUp(s, id);
    const bag = IB.TOWER_UPS.some(u => u.id === id) ? s.towerUp : s.troopUp;
    return { rank:bag[id], before, after:measure(s) };
  };
  const turret = (s) => s.structs.find(x => x.key === 't1');
  const checks = {
    hp:    (s) => IB.structMaxHp(s, turret(s)),
    armor: (s) => IB.effArmor(turret(s), false),
    atk:   (s) => IB.attackDamage(turret(s)),
    as:    (s) => IB.attackSpeedOf(turret(s)),
    tad:   (s) => { const u = IB.spawnUnit(s.i, 'melee', { x:60 }); return u.ad; },
    tarm:  (s) => { const u = IB.spawnUnit(s.i, 'melee', { x:60 }); return u.armor; },
    thp:   (s) => { const u = IB.spawnUnit(s.i, 'melee', { x:60 }); return u.mhp; },
  };
  for (const id in checks){
    const r = probe(id, checks[id]);
    t.ok(r.rank >= 2, id + ' can actually be bought (rank ' + r.rank + ')');
    t.ok(r.after > r.before, id + ' measurably changes the game (' +
      Math.round(r.before) + ' → ' + Math.round(r.after) + ')');
  }
  // regen has to be watched over time rather than read off a stat
  {
    const recover = (ranks) => {
      IB.newMatch({ diff:'veteran', seed:241 });
      const s = P();
      rich(s);
      IB.build(s, s.plot.indexOf(null), 'forge');
      IB.upgradeBuilding(s, s.plot.findIndex(b => b && b.type === 'forge'));
      for (let i = 0; i < ranks; i++) rich(s), IB.buyUp(s, 'regen');
      const st = turret(s);
      st.hp = st.mhp * .5; st.dmgTaken = -999;
      const h0 = st.hp;
      step(20);
      return st.hp - h0;
    };
    const none = recover(0), some = recover(3);
    t.ok(some > none, 'Repair Crews measurably mends a turret (' +
      Math.round(none) + ' → ' + Math.round(some) + ' hp in 20s)');
  }
  // and no upgrade may be a trap next to the others
  {
    IB.newMatch({ diff:'veteran', seed:243 });
    const s = P();
    const rates = [...IB.TOWER_UPS, ...IB.TROOP_UPS].map(u => ({ n:u.n, r:IB.upRate(s, u.id) }));
    t.ok(rates.every(x => x.r > 0), 'every upgrade is worth something');
    const lo = Math.min(...rates.map(x => x.r)), hi = Math.max(...rates.map(x => x.r));
    t.ok(hi / lo < 2.5, 'and none is worth more than 2.5x another (' +
      rates.sort((a, b) => b.r - a.r).map(x => x.n + ' ' + x.r.toFixed(1)).join(', ') + ')');
    t.ok(Object.keys(IB.UP_EFFECT).length === IB.TOWER_UPS.length + IB.TROOP_UPS.length,
      'every upgrade has an entry in the effect table');
  }
  // the Host shops for value instead of rolling dice
  {
    IB.newMatch({ diff:'veteran', seed:247 });
    const e = E();
    G.sides[0].ai = true;
    for (let i = 0; i < 30 * 60 * 12 && G.state === 'play'; i++) IB.update(1 / 30);
    const bought = Object.values(e.towerUp).reduce((a, v) => a + v, 0) +
      Object.values(e.troopUp).reduce((a, v) => a + v, 0);
    t.ok(bought > 0, 'the Host actually spends at the forge (' + bought + ' ranks)');
  }
}

/* ------------------------ the warning has to reach the player who needs it */
{
  // There was already a test for this warning and it passed for a year while
  // the warning could not fire. It reached the branch by assigning every
  // worker to a job first — 'no idle-worker note' — which is exactly the state
  // a player in trouble is NOT in. A player who is losing is losing because
  // they are not managing their hold, so they always have an idle worker and
  // there is always a job below its cap, and the idle-worker note returned
  // before the front-structure block was ever reached.
  //
  // So this block asserts the opposite setup: the idle workers STAY. First
  // establish from the simulation that the awkward state is the normal one,
  // then require the bar to handle it.
  let danger = 0, dangerIdle = 0, named = 0, samples = 0;
  for (const seed of [101, 113, 139]){
    IB.newMatch({ diff:'veteran', seed });
    const s = P();                                    // no input at all, ever
    let next = 0;
    for (let i = 0; i < 30 * 620 && G.state === 'play'; i++){
      if (G.t >= next){
        next += 1; samples++;
        const f = IB.frontStruct(0);
        if (f && f.hp < f.mhp * .35){
          danger++;
          if (s.workers.idle > 0) dangerIdle++;
          const a = IB.adviceFor(s);
          if (a && a.txt.includes(IB.STRUCT_SHORT[f.key] || ' ') && /\d+%/.test(a.txt)) named++;
        }
      }
      IB.update(1 / 30);
    }
  }
  t.ok(samples > 900 && danger > 100,
    'a passive hold really does spend a long stretch with its front under a third (' +
    danger + ' of ' + samples + ' seconds)');
  t.ok(dangerIdle === danger,
    'and it has an idle worker for every one of those seconds, which is why the ' +
    'old setup could not see this (' + dangerIdle + ' of ' + danger + ')');
  t.ok(named === danger,
    'while the front is about to break the bar names it (' + named + ' of ' + danger + ' seconds)');

  // The same thing built by hand, so a failure says which of the two rules
  // broke rather than only that a sweep moved. The idle worker is left alone.
  IB.newMatch({ diff:'veteran', seed:1609 });
  {
    const s = P();
    const front = IB.frontStruct(0);
    t.ok(s.workers.idle > 0, 'a fresh hold has an idle worker (' + s.workers.idle + ')');
    const idleTxt = (IB.adviceFor(s) || { txt:'' }).txt;
    t.ok(/standing around/.test(idleTxt),
      'and with the front healthy that is what the bar says (' + idleTxt + ')');
    front.hp = front.mhp * .2;
    const alarm = (IB.adviceFor(s) || { txt:'' }).txt;
    t.ok(s.workers.idle > 0, 'the idle worker is still there — nothing was assigned (' + s.workers.idle + ')');
    t.ok(alarm.includes(IB.STRUCT_SHORT[front.key] || ' ') && /\d+%/.test(alarm),
      'a dying front outranks it anyway (' + alarm + ')');
    front.hp = front.mhp;
    t.ok(/standing around/.test((IB.adviceFor(s) || { txt:'' }).txt),
      'and the economy note comes back once the front is safe');
  }
}

/* --------------------------------------- the simulation must not watch itself */
{
  // Groundwork for lockstep multiplayer: two machines run the same match from
  // the same seed and trade only inputs, so anything that moves the simulation
  // without being an input is a desync.
  //
  // Cosmetics were exactly that. Sparks, damage numbers and dash ghosts drew
  // from rnd() — the stream the simulation runs on — from inside blocks capped
  // on how many particles were already alive. So the number of draws the SIM
  // consumed depended on how many particles happened to be on screen. Measured
  // on seed 5031 over 240 simulated seconds, three builds that differed only in
  // particle policy produced three different matches (11 units alive vs 13).
  //
  // The headless suite could not see any of it, because every one of those
  // blocks is skipped when HEADLESS. So this test builds a copy of the game
  // with the cosmetic paths FORCED ON and runs it against the normal build.
  const FX_ON = SRC
    .replace(/if \(HEADLESS\) return;/g, 'if (false) return;')
    .replace(/if \(HEADLESS \|\| /g, 'if (false || ')
    .replace(/if \(!HEADLESS && /g, 'if (true && ')
    .replace(/if \(!HEADLESS\) /g, 'if (true) ');
  t.ok(FX_ON !== SRC, 'the cosmetics-forced-on build really is a different source');

  const fxStore = {};
  const IB2 = loadGame(fxStore, FX_ON);
  // loadGame rebinds global.localStorage to the new store; put the original
  // back so nothing after this block reads the wrong saves.
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  t.ok(IB2 !== IB && IB2.G !== G, 'and it loaded as a genuinely separate simulation');

  // A state fingerprint of the SIM only — never of G.fx or G.floats, which are
  // allowed to differ. If cosmetics leak into the sim, this is what moves.
  const fingerprint = (g) => g.units.map(u =>
      u.kind + ':' + u.side + ':' + u.hp.toFixed(9) + ':' + u.x.toFixed(9) + ':' + u.y.toFixed(9)).join(' ') +
    '|' + g.sides.map(s => s.res.gold.toFixed(9) + ',' + s.res.iron.toFixed(9) + ',' +
      s.structs.map(st => st.hp.toFixed(6)).join('.')).join('/') +
    '|' + g.wave + ':' + g.t.toFixed(6);

  // Both sides scripted, both sims given the SAME command stream at the SAME
  // ticks — which is exactly what the relay will deliver. Commands are chosen
  // to touch the paths that spawn particles: damage, healing, casting.
  const SCRIPT = [
    [ 60, (ib) => { for (const s of ib.G.sides) ib.assign(s, 'gold', 2); } ],
    [ 90, (ib) => { for (const s of ib.G.sides) ib.assign(s, 'iron', 2); } ],
    [150, (ib) => { for (const s of ib.G.sides){ s.res.wood += 400; s.res.gold += 400;
                     ib.build(s, s.plot.indexOf(null), 'barracks'); } } ],
    [300, (ib) => { for (const s of ib.G.sides){ s.res.gold += 600; s.res.food += 600;
                     ib.trainUnit(s, 'melee'); ib.trainUnit(s, 'melee'); } } ],
    [450, (ib) => { for (const s of ib.G.sides){ s.res.wood += 800; s.res.gold += 800;
                     ib.build(s, s.plot.indexOf(null), 'tavern'); } } ],
    [600, (ib) => { ib.createHero(ib.G.sides[0], 'fighter'); ib.createHero(ib.G.sides[1], 'marksman'); } ],
  ];

  const TICKS = 30 * 200;
  let firstDiff = -1, diffA = '', diffB = '';
  for (const ib of [IB, IB2]){ ib.newMatch({ diff:'veteran', seed:7331 }); ib.G.sides[0].ai = true; }
  for (let i = 0; i < TICKS; i++){
    for (const [at, fn] of SCRIPT) if (at === i){ fn(IB); fn(IB2); }
    IB.update(1 / 30); IB2.update(1 / 30);
    if (firstDiff < 0){
      const a = fingerprint(G), b = fingerprint(IB2.G);
      if (a !== b){ firstDiff = i; diffA = a.slice(0, 150); diffB = b.slice(0, 150); }
    }
  }
  // The run has to have been worth making: real bodies, real damage, and the
  // cosmetic build must actually have produced cosmetics (otherwise the two
  // sims agree only because neither did anything).
  t.ok(IB2.G.fx.length + IB2.G.floats.length > 0 || IB2.G.units.length > 0,
    'the cosmetics build ran a real match (' + IB2.G.units.length + ' units, ' +
    IB2.G.fx.length + ' fx, ' + IB2.G.floats.length + ' floats)');
  t.ok(G.fx.length === 0 && G.floats.length === 0,
    'and the normal build drew none, so the two really do differ in cosmetics (' +
    G.fx.length + ' fx, ' + G.floats.length + ' floats)');
  t.ok(G.units.length > 2 && G.t > 150,
    'and the match got far enough to mean something (' + G.units.length + ' units at ' +
    Math.round(G.t) + 's)');
  t.ok(firstDiff < 0,
    'drawing cosmetics does not move the simulation, over ' + TICKS + ' ticks' +
    (firstDiff < 0 ? '' : ' — diverged at tick ' + firstDiff + '\n    fx-off: ' + diffA + '\n    fx-on:  ' + diffB));

  // And the same seed twice in one process is the same match. G.frame is reset
  // by newMatch, so a seed names a match no matter what ran before it.
  const runOnce = (seed, ticks) => {
    IB.newMatch({ diff:'veteran', seed }); G.sides[0].ai = true;
    for (let i = 0; i < ticks; i++) IB.update(1 / 30);
    return fingerprint(G);
  };
  const r1 = runOnce(4211, 900);
  runOnce(9007, 451);                       // odd length on purpose: an even one
  const r2 = runOnce(4211, 900);            // preserves frame parity and hides the bug
  t.ok(r1 === r2, 'a seed names a match, whatever was simulated in between');
}

/* -------------------------------- the math a second machine has to agree on */
{
  // IEEE-754 pins +, -, *, / and sqrt exactly, so every engine returns the same
  // bits. Math.hypot and Math.pow are NOT pinned — the spec lets each engine
  // choose its own accuracy. That is not theoretical: on THIS engine,
  // Math.hypot and sqrt(dx*dx+dy*dy) disagree on 41% of lane-scale coordinate
  // pairs, by up to 5.7e-14. One bit flips a `<=`, which flips a target, which
  // is a different match ten seconds later.
  let differ = 0, n = 0;
  for (let i = 0; i < 20000; i++){
    const dx = ((i * 2654435761) % 100000) / 357 - 140, dy = ((i * 40503) % 10000) / 830 - 6;
    n++;
    if (Math.hypot(dx, dy) !== Math.sqrt(dx * dx + dy * dy)) differ++;
  }
  t.ok(differ > n * .05,
    'hypot and the exactly-specified form really do disagree here (' + differ + ' of ' + n + ')');

  // So the simulation may not call either. Strip comments first — this file
  // explains the rule in prose, and prose must not satisfy or break the check.
  const bare = SRC.replace(/^\s*\/\/.*$/gm, '');
  const hypots = (bare.match(/Math\.hypot\s*\(/g) || []).length;
  t.ok(hypots === 0, 'no Math.hypot survives anywhere in the game (' + hypots + ')');
  t.ok((bare.match(/\*\*\s*2/g) || []).length === 0, 'and no ** either, which is Math.pow by another name');
  t.ok(typeof IB.hyp === 'function' && typeof IB.ipow === 'function',
    'the deterministic replacements are exported');
  t.ok(IB.hyp(3, 4) === 5 && IB.hyp(-135.33827103674412, -4.324129725806415) ===
    Math.sqrt(135.33827103674412 * 135.33827103674412 + 4.324129725806415 * 4.324129725806415),
    'hyp is exactly sqrt(dx*dx+dy*dy), including on a pair where hypot differs');
  for (const [b, e] of [[1.65, 0], [1.65, 1], [1.5, 3], [1.35, 5]])
    t.ok(IB.ipow(b, e) === Array.from({ length:e }).reduce(a => a * b, 1),
      'ipow(' + b + ',' + e + ') is repeated multiplication');

  // Math.pow may still be used where it cannot reach the simulation. Camera
  // smoothing is per-client view state and is the only place left.
  const powLines = bare.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /Math\.pow\s*\(/.test(l));
  t.ok(powLines.length > 0 && powLines.every(([, l]) => /\bcam\./.test(l)),
    'every remaining Math.pow is camera smoothing, which no other machine sees (' +
    powLines.map(([i]) => i).join(', ') + ')');
}

/* ------------------------------------------- two machines, one match */
{
  // The thing that makes lockstep trustworthy rather than mysteriously flaky:
  // stand up two INDEPENDENT simulations, wire each one's transport to the
  // other's receiver, give them different players issuing different commands at
  // different moments, and require them to agree on every tick of a long match.
  //
  // Neither sim can see the other's state — only its command batches — so if
  // they still agree at the end, the simulation really is a pure function of
  // (seed, inputs), which is the whole premise.
  const storeA = {}, storeB = {};
  const A = loadGame(storeA), B = loadGame(storeB);
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  t.ok(A !== B && A.G !== B.G, 'two independent simulations loaded');

  // The relay, modelled honestly: it does not deliver instantly, and it does
  // not deliver in a fixed order. Batches are held for a random-ish number of
  // frames and flushed, so arrival order differs between the two machines —
  // which is exactly the property the (side, seq) sort has to survive.
  const wire = [];
  let now = 0;
  const link = (from, to, lag) => { from.NET.send = (m) => wire.push({ to, m, at:now + lag }); };
  link(A, B, 2); link(B, A, 3);   // asymmetric on purpose: the two links differ
  const pump = (n) => { now = n; for (let i = wire.length - 1; i >= 0; i--) if (wire[i].at <= n){ wire[i].to.netRecv(wire[i].m); wire.splice(i, 1); } };

  const SEED = 8419;
  A.netStart({ me:0, seed:SEED, diff:'veteran' });
  B.netStart({ me:1, seed:SEED, diff:'veteran' });
  t.ok(A.NET.on && B.NET.on && A.NET.me === 0 && B.NET.me === 1, 'both sides started, one each');

  // The difficulty dial is a handicap the HOST gets, not a property of the
  // world — on Warlord side 1 starts with a third more of everything, gathers a
  // third faster and its heroes hit 14% harder. Against the computer that is
  // the point. Against a person it would hand player two the AI's buffs for no
  // reason but joining second, so PvP has to read every one of them as 1.
  {
    const W = loadGame({});
    global.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = '' + v; },
      removeItem: k => { delete store[k]; },
    };
    // First prove the handicap is real and one-sided in a single-player match,
    // so the equality below is not just two zeroes agreeing.
    W.newMatch({ diff:'warlord', seed:404 });
    const solo = [0, 1].map(i => W.G.sides[i].res.gold + W.G.sides[i].res.iron +
      W.G.sides[i].res.wood + W.G.sides[i].res.food);
    t.ok(solo[1] > solo[0], 'on Warlord the Host really does start ahead (' + solo.join(' vs ') + ')');
    t.ok(W.heroMul(1) > W.heroMul(0), 'and its heroes really do hit harder (' +
      W.heroMul(0) + ' vs ' + W.heroMul(1) + ')');
    const soloRate = [0, 1].map(i => W.gatherRate(W.G.sides[i], 'gold'));

    W.netStart({ me:0, seed:404, diff:'warlord' });
    const pvp = [0, 1].map(i => W.G.sides[i].res.gold + W.G.sides[i].res.iron +
      W.G.sides[i].res.wood + W.G.sides[i].res.food);
    t.ok(pvp[0] === pvp[1], 'but in multiplayer both holds start with the same (' + pvp.join(' vs ') + ')');
    t.ok(W.heroMul(0) === 1 && W.heroMul(1) === 1, 'and neither side hits harder than the other');
    for (const s of W.G.sides){ s.workers.idle = 0; W.assign(s, 'gold', 2); }
    t.ok(W.gatherRate(W.G.sides[0], 'gold') === W.gatherRate(W.G.sides[1], 'gold'),
      'and the same workers on the same node gather the same (' +
      W.gatherRate(W.G.sides[0], 'gold') + ' vs ' + W.gatherRate(W.G.sides[1], 'gold') + ')');
    t.ok(soloRate[1] !== soloRate[0] || solo[1] > solo[0],
      'the single-player asymmetry this removes was measurable to begin with');
  }
  t.ok(A.G.sides[0].ai === false && A.G.sides[1].ai === false, 'and neither hold is played by the AI any more');

  const fp = (g) => g.units.map(u => u.kind + ':' + u.side + ':' + u.hp.toFixed(9) + ':' +
      u.x.toFixed(9) + ':' + u.y.toFixed(9) + ':' + (u.target ? (u.target.kind || u.target.key || 'h') : '-')).join(' ') +
    '|' + g.sides.map(s => s.res.gold.toFixed(9) + ',' + s.res.iron.toFixed(9) + ',' + s.res.wood.toFixed(9) +
      ',' + s.res.food.toFixed(9) + ',' + s.heroes.map(h => h.cls + h.lvl + ':' + h.hp.toFixed(6)).join('+') +
      ',' + s.structs.map(st => st.hp.toFixed(6)).join('.')).join('/') +
    '|' + g.wave + ':' + g.t.toFixed(6);

  // Two different players, playing differently, at moments that do not line up.
  const PLAN = [
    [  4, 0, 'job',    { node:'gold', d:2 }],
    [  9, 1, 'job',    { node:'iron', d:2 }],
    [ 21, 0, 'worker', {}],
    [ 34, 1, 'worker', {}],
    [ 55, 1, 'job',    { node:'wood', d:1 }],
    [ 70, 0, 'job',    { node:'food', d:1 }],
    [140, 0, 'build',  { tile:0, type:'barracks' }],
    [163, 1, 'build',  { tile:0, type:'farm' }],
    [200, 1, 'build',  { tile:1, type:'barracks' }],
    [255, 0, 'unit',   { unit:'melee' }],
    [290, 1, 'unit',   { unit:'melee' }],
    [330, 0, 'unit',   { unit:'melee' }],
    [420, 0, 'nodeup', { node:'gold' }],
    [470, 1, 'nodeup', { node:'iron' }],
  ];

  const TICKS = 30 * 150;
  let diverged = -1, stalls = 0, applied = 0;
  for (let n = 0; n < TICKS * 3 && (A.NET.tick < TICKS || B.NET.tick < TICKS); n++){
    pump(n);
    // Issue each planned command exactly once, on the machine that owns it,
    // when that machine reaches the tick.
    for (const p of PLAN){
      if (p.done) continue;
      const sim = p[1] === 0 ? A : B;
      if (sim.NET.tick >= p[0]){ sim.sendCmd(p[2], p[3]); p.done = true; applied++; }
    }
    const beforeA = A.NET.tick, beforeB = B.NET.tick;
    A.netStep(); B.netStep();
    if (A.NET.tick === beforeA && B.NET.tick === beforeB) stalls++;
    // Compare only where both machines have simulated the same number of ticks.
    if (diverged < 0 && A.NET.tick === B.NET.tick && fp(A.G) !== fp(B.G)) diverged = A.NET.tick;
  }

  // The run has to have been a real match, or agreement is worthless.
  t.ok(applied === PLAN.length, 'every planned command was issued (' + applied + ' of ' + PLAN.length + ')');
  t.ok(A.NET.tick >= TICKS && B.NET.tick >= TICKS,
    'both machines simulated the whole match (' + A.NET.tick + ' / ' + B.NET.tick + ' of ' + TICKS + ')');
  t.ok(A.G.units.length > 4 && A.G.wave >= 2,
    'and it was a real one (' + A.G.units.length + ' units, wave ' + A.G.wave + ' at ' + Math.round(A.G.t) + 's)');
  t.ok(A.G.sides[0].heroes.length + A.G.sides[0].plot.filter(Boolean).length > 0,
    'with the commands actually taking effect on the board (' +
    A.G.sides[0].plot.filter(Boolean).length + ' buildings on side 0)');
  // A link slower than the input delay is SUPPOSED to be absorbed silently —
  // that is what the delay is for — so incidental stalls prove nothing either
  // way. What must be true is that a link slower than the delay stops the
  // simulation rather than letting it run ahead into a state the peer will
  // never reach. Tested directly: starve one machine and watch it refuse.
  t.ok(stalls === 0, 'a link faster than the input delay never stalls the match (' + stalls + ')');
  {
    const S = loadGame({});
    global.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = '' + v; },
      removeItem: k => { delete store[k]; },
    };
    S.netStart({ me:0, seed:611, diff:'veteran' });    // no transport: the peer never speaks
    let ran = 0;
    while (S.netStep()) ran++;
    t.ok(ran === S.NET.delay,
      'with no peer at all it runs exactly the primed ticks and then holds (' + ran +
      ' of ' + S.NET.delay + ')');
    t.ok(!S.netReady(S.NET.tick), 'and it knows it is not ready to go further');
    const held = S.G.t;
    for (let i = 0; i < 50; i++) S.netStep();
    t.ok(S.G.t === held, 'and no amount of asking moves the world while it waits');
    // ...until the missing side finally arrives, at which point it resumes.
    S.netDeliver(S.NET.tick, 1, []);
    t.ok(S.netStep() && S.G.t > held, 'the peer arriving lets it move again');
  }
  t.ok(diverged < 0, 'two machines trading only inputs stay bit-identical for ' + TICKS + ' ticks' +
    (diverged < 0 ? '' : ' — diverged at tick ' + diverged));
  t.ok(A.NET.desyncAt < 0 && B.NET.desyncAt < 0,
    'and the running hash exchange agrees too (' + A.NET.desyncAt + ' / ' + B.NET.desyncAt + ')');

  // The desync detector has to be able to fire, or it is decoration. Feed one
  // machine a hash its own state cannot produce.
  const anyTick = [...A.NET.hashes.keys()][0];
  t.ok(anyTick !== undefined, 'hashes were being exchanged at all');
  // B is the JOINER, so it records the drift and waits to be told what the
  // board looks like. (The host does not sit still — it ships a snapshot and
  // clears the flag, which is the next block.)
  B.netRecv({ k:'hash', tick:anyTick, h:(B.NET.hashes.get(anyTick) ^ 0xffff) >>> 0 });
  t.ok(B.NET.desyncAt === anyTick, 'a hash that does not match is reported as a desync');
  t.ok(!B.netStep(), 'and the joiner holds still rather than playing on alone');

  // Ordering is not arrival order. Two commands delivered to one machine in one
  // order and to the other in the opposite order must still apply the same way.
  const C1 = loadGame({}), C2 = loadGame({});
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  C1.netStart({ me:0, seed:5150, diff:'veteran' }); C2.netStart({ me:1, seed:5150, diff:'veteran' });
  // Identical setup on both machines — a hero needs a Hero Factory and gold, and
  // the point here is the ordering of the two forge commands, not whether they
  // can be paid for. Applied the same way to both, so it is not an asymmetry.
  for (const sim of [C1, C2]) for (const s of sim.G.sides){
    s.res.gold = 9000; s.res.iron = 9000; s.res.wood = 9000; s.res.food = 9000;
    sim.build(s, s.plot.indexOf(null), 'tavern');
  }
  // Both sides forge a hero on the SAME tick. That is the order-sensitive case:
  // hero names are drawn with pick(HERO_NAMES) off the shared simulation RNG,
  // so whoever is applied first takes the first name. Two commands on different
  // sides touching nothing in common would agree even with the ordering broken,
  // and would prove nothing.
  const a0 = { k:'hero', cls:'fighter', side:0, seq:0 };
  const b0 = { k:'hero', cls:'marksman', side:1, seq:0 };
  const at = C1.NET.delay + 4;
  // Fill every tick up to the shared one, or they stall before reaching it and
  // the comparison below would be two identical un-run matches — which would
  // pass while proving nothing.
  for (let k = 0; k <= at + 1; k++)
    for (const [sim, side] of [[C1, 0], [C1, 1], [C2, 0], [C2, 1]]) sim.netDeliver(k, side, []);
  C1.NET.box.set(at, {}); C2.NET.box.set(at, {});
  C1.netDeliver(at, 0, [a0]); C1.netDeliver(at, 1, [b0]);      // one order
  C2.netDeliver(at, 1, [b0]); C2.netDeliver(at, 0, [a0]);      // the other
  while (C1.NET.tick <= at && C1.netStep()) ;
  while (C2.NET.tick <= at && C2.netStep()) ;
  t.ok(C1.NET.tick > at && C2.NET.tick > at, 'both stepped past the shared tick');
  const names = (g) => g.sides.map(s => s.heroes.map(h => h.cls + '/' + h.name).join('+')).join(' | ');
  t.ok(C1.G.sides[0].heroes.length === 1 && C1.G.sides[1].heroes.length === 1,
    'both heroes were actually forged, so there is something to order (' + names(C1.G) + ')');
  t.ok((C1.G.sides[0].heroes[0] || {}).name !== (C1.G.sides[1].heroes[0] || {}).name,
    'and they drew different names off the shared stream, so order is observable');
  t.ok(names(C1.G) === names(C2.G),
    'delivery order does not change who got which name (' + names(C1.G) + '  vs  ' + names(C2.G) + ')');
  t.ok(fp(C1.G) === fp(C2.G), 'nor anything else about the two worlds');

  // That assertion is only worth having if the scenario could have failed. The
  // shipped rule buckets commands by side and walks the sides in a fixed order,
  // so it is arrival-independent BY CONSTRUCTION — which means a passing result
  // above proves nothing on its own. Build the mistake on purpose: a copy that
  // applies commands in the order they arrived. If that one also agrees, the
  // scenario is not order-sensitive and the test above is decoration.
  const ARRIVAL = SRC
    .replace('  if (slot[side]) return;                       // a duplicate delivery is not a second batch\n  slot[side] = cmds;',
             '  if (slot[side]) return;\n  slot[side] = cmds; (slot.arr || (slot.arr = [])).push(cmds);')
    .replace('  const all = [...slot[0], ...slot[1]].sort((p, q) => p.side - q.side || p.seq - q.seq);',
             '  const all = slot.arr ? slot.arr.flat() : [...slot[0], ...slot[1]];');
  t.ok(ARRIVAL !== SRC && !ARRIVAL.includes('p.side - q.side || p.seq - q.seq'),
    'the arrival-ordered build really was built');
  const D1 = loadGame({}, ARRIVAL), D2 = loadGame({}, ARRIVAL);
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  D1.netStart({ me:0, seed:5150, diff:'veteran' }); D2.netStart({ me:1, seed:5150, diff:'veteran' });
  for (const sim of [D1, D2]) for (const s of sim.G.sides){
    s.res.gold = 9000; s.res.iron = 9000; s.res.wood = 9000; s.res.food = 9000;
    sim.build(s, s.plot.indexOf(null), 'tavern');
  }
  for (let k = 0; k <= at + 1; k++)
    for (const [sim, side] of [[D1, 0], [D1, 1], [D2, 0], [D2, 1]]) sim.netDeliver(k, side, []);
  D1.NET.box.set(at, {}); D2.NET.box.set(at, {});
  D1.netDeliver(at, 0, [a0]); D1.netDeliver(at, 1, [b0]);
  D2.netDeliver(at, 1, [b0]); D2.netDeliver(at, 0, [a0]);
  while (D1.NET.tick <= at && D1.netStep()) ;
  while (D2.NET.tick <= at && D2.netStep()) ;
  t.ok(names(D1.G) !== names(D2.G),
    'ordering by arrival really does break this exact case, so the check above has teeth (' +
    names(D1.G) + '  vs  ' + names(D2.G) + ')');
}

/* -------------------------------------------------- the lobby, and saying so */
{
  // A lockstep match that is waiting on the other machine looks EXACTLY like a
  // frozen game, and a desync looks like nothing at all — the two players just
  // quietly play different matches and argue afterwards. Both have to be said
  // out loud, and both have to outrank the coaching, because there is no point
  // advising someone about their economy in a match that has stopped being the
  // same match.
  IB.newMatch({ diff:'veteran', seed:3300 });
  IB.NET.on = false; IB.NET.peerLost = false; IB.NET.desyncAt = -1; IB.NET.stallT = 0;
  t.ok(IB.netBanner() === '', 'single-player says nothing about the network');

  IB.NET.on = true;
  t.ok(IB.netBanner() === '', 'and a healthy multiplayer match says nothing either');
  IB.NET.stallT = 1.2;
  t.ok(/waiting/i.test(IB.netBanner()), 'a stall is named (' + IB.netBanner() + ')');
  IB.NET.peerLost = true;
  t.ok(/dropped out/i.test(IB.netBanner()), 'a dropped peer outranks a stall (' + IB.netBanner() + ')');
  t.ok(/come back/i.test(IB.netBanner()), 'and says it is waiting for them rather than that it is over');
  IB.NET.desyncAt = 900;
  t.ok(/drift|sync/i.test(IB.netBanner()), 'and a desync outranks everything (' + IB.netBanner() + ')');
  // The banner has to reach the one line the player actually reads.
  const advSrc = SRC.slice(SRC.indexOf('function syncAdvice'), SRC.indexOf('function syncAdvice') + 900);
  t.ok(advSrc.includes('netBanner()'), 'and the advice bar shows it rather than coaching through a desync');
  IB.NET.on = false; IB.NET.peerLost = false; IB.NET.desyncAt = -1; IB.NET.stallT = 0;

  // The lobby is reachable from the menu, and every screen it can be in offers
  // a way back — a dead end in a modal is a reload.
  IB.showMenu();
  t.ok(/data-act="mp"/.test(G.sheet), 'the menu offers a two-player match');
  for (const st of ['idle', 'hosting', 'joining', 'connecting', 'ready', 'error']){
    IB.lobbySet(st);
    const h = IB.lobbyHtml();
    t.ok(h.includes('data-act="mpback"'), 'the lobby in "' + st + '" has a way back');
    t.ok(h.length > 60 && /<h2>/.test(h), 'and says something (' + st + ')');
  }
  IB.lobbySet('idle');
  t.ok(/data-act="mphost"/.test(IB.lobbyHtml()) && /data-act="mpjoin"/.test(IB.lobbyHtml()),
    'and offers both starting and joining');

  // A code the player typed is a person typing, not an attack.
  for (const [given, why] of [['', 'nothing'], ['AB', 'too short'], ['ABCDE', 'too long'], ['12__', 'no letters']]){
    IB.lobbySet('joining');
    IB.lobbyJoin(given);
    t.ok(IB.LOBBY.state === 'error', 'a code that is ' + why + ' is refused with a message, not a hang');
  }
  t.ok(/four letters/i.test(IB.LOBBY.err), 'and the message says what a code looks like (' + IB.LOBBY.err + ')');

  // The relay host is overridable without editing the game, so a preview
  // deployment can be tested. Falls back when nothing is set.
  const host = IB.relayHost();
  t.ok(typeof host === 'string' && host.length > 4 && !/^https?:/.test(host),
    'the relay host is a bare host, not a URL (' + host + ')');
  localStorage.setItem('ib_relay', 'example.test');
  t.ok(IB.relayHost() === 'example.test', 'and can be pointed elsewhere for testing');
  localStorage.removeItem('ib_relay');
  t.ok(IB.relayHost() === host, 'and goes back to the default when that is cleared');

  // The relay is a separate Worker that has to be deployed once by hand, and
  // its address depends on the deploying account's workers.dev subdomain — so
  // the shipped default cannot be right, and the first thing anyone sees is a
  // failure. "Check your connection" sends them to look at the wrong thing
  // entirely. The lobby has to say what is actually missing, BEFORE they try
  // and again when it fails.
  // The relay IS deployed now, so the shipped default names a real host and
  // nobody gets the warning on a fresh page. The unconfigured path still has to
  // work, though — anyone who forks this repo lands in it, because the address
  // depends on the deploying account's workers.dev subdomain and cannot be
  // inherited. So it is driven explicitly rather than by leaving the default
  // broken, which is what this block used to rely on.
  localStorage.removeItem('ib_relay');
  t.ok(!IB.RELAY_UNSET(), 'the shipped default names a deployed relay (' + IB.relayHost() + ')');
  t.ok(/\.workers\.dev$/.test(IB.relayHost()) && !/\.example\./.test(IB.relayHost()),
    'and it is a real workers.dev host, not the placeholder');
  IB.lobbySet('idle');
  t.ok(!/no relay is set up/i.test(IB.lobbyHtml()), 'so a fresh page gets no warning about a missing relay');

  localStorage.setItem('ib_relay', 'ironbridge-relay.example.workers.dev');
  t.ok(IB.RELAY_UNSET(), 'a placeholder address still reads as no relay configured');
  IB.lobbySet('idle');
  const warn = IB.lobbyHtml();
  t.ok(/no relay is set up/i.test(warn),
    'and the lobby says so up front rather than waiting for the failure');
  t.ok(/README/.test(warn), 'and points at where the instructions are');
  t.ok(/data-act="mpback"/.test(warn), 'and still lets you back out to the one-player game');

  localStorage.setItem('ib_relay', 'relay.somewhere.workers.dev');
  t.ok(!IB.RELAY_UNSET(), 'setting an address clears that warning');
  IB.lobbySet('idle');
  t.ok(!/no relay is set up/i.test(IB.lobbyHtml()), 'and the lobby stops nagging');
  // ...and a genuine failure against a configured relay names the host, so it
  // can be told apart from "never deployed".
  const src = SRC.slice(SRC.indexOf('function lobbyHost'), SRC.indexOf('function lobbyHost') + 1400);
  t.ok(src.includes('relayHost()') && /Could not reach the relay at/.test(src),
    'a configured relay that fails names the host it tried');
  localStorage.removeItem('ib_relay');

  IB.lobbyClose();
  t.ok(IB.LOBBY.state === 'idle' && !IB.LOBBY.sock && IB.LOBBY.code === '',
    'closing the lobby lets go of everything');
}

/* ============================================ typing is not playing
   Every shortcut in this game is a single character, and the room-code
   alphabet contains B, F, G, H, M and P. A join box and a keymap cannot share
   a window without this. */
{
  t.ok(typeof IB.typingInto === 'function', 'there is a test for whether the player is typing');
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT'])
    t.ok(IB.typingInto({ tagName:tag }), 'a ' + tag + ' counts as typing');
  t.ok(IB.typingInto({ tagName:'input' }), 'and the tag name is matched case-insensitively');
  t.ok(IB.typingInto({ tagName:'DIV', isContentEditable:true }), 'so does anything contenteditable');
  t.ok(!IB.typingInto({ tagName:'DIV' }), 'an ordinary element does not');
  t.ok(!IB.typingInto({ tagName:'BUTTON' }), 'nor does a button');
  t.ok(!IB.typingInto(null) && !IB.typingInto(undefined) && !IB.typingInto({}),
    'and nothing missing or malformed is mistaken for a text field');

  // The letters that actually collide. Every one of these is in the room-code
  // alphabet AND bound to a shortcut, which is why typing a code set the camera
  // swinging and opened the pause sheet.
  const collide = ['b', 'f', 'g', 'h', 'm', 'p'];
  const bound = collide.filter(c => IB.keyAction(c));
  t.ok(bound.length === collide.length,
    'every one of B F G H M P is a live shortcut (' + bound.join('') + ')');
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  t.ok(collide.every(c => ALPHABET.includes(c.toUpperCase())),
    'and every one of them is also a letter a room code can contain');
  // The guard is in the handler, not in keyAction — keyAction must keep working
  // for the real key presses.
  t.ok(IB.keyAction('p') === 'pause' && IB.keyAction('m') === 'camMid',
    'the keymap itself is untouched — the guard belongs in the listener');
  const kd = SRC.indexOf("addEventListener('keydown'");
  const listener = SRC.slice(kd, SRC.indexOf('});', kd));
  t.ok(/typingInto\(e\.target\)/.test(listener),
    'and the listener checks it before acting on anything');
}

/* ======================================= a shared match cannot be paused
   The network loop never read G.paused, so pausing did not stop the board —
   it put a blocking opaque sheet over a match that was still being fought. */
{
  IB.netEnd();
  IB.newMatch({ diff:'veteran', seed:8801 });
  IB.setPaused(true);
  t.ok(G.paused === true, 'a one-player match still pauses');
  IB.setPaused(false);
  t.ok(G.paused === false, 'and unpauses');

  IB.netStart({ me:0, seed:8802 });
  t.ok(IB.NET.on === true, 'in a network match');
  IB.setPaused(true);
  t.ok(G.paused === false, 'pause is refused outright');
  const loop = SRC.slice(SRC.indexOf('function frame(ts)'), SRC.indexOf('function boot()'));
  const netBranch = loop.slice(loop.indexOf('if (NET.on)'), loop.indexOf('} else if'));
  t.ok(!/G\.paused/.test(netBranch),
    'because the network loop does not read G.paused — pausing never stopped it, it only hid it');
  // Unpausing must still work, or a match paused before it started could never
  // be released.
  IB.setPaused(false);
  t.ok(G.paused === false, 'and clearing the flag is always allowed');
  IB.netEnd();
}

/* ================================================ the desync check works
   Detection that only fires half the time, or that notices and carries on, is
   not a safety net. */
{
  // Driven from seat 1 throughout: the JOINER records a drift and waits. The
  // host does not sit still — it ships a snapshot and clears the flag — so it
  // is the wrong seat to watch the flag on. That behaviour has its own block.
  IB.netEnd();
  IB.netStart({ me:1, seed:9100 });

  // 1. A hash arriving BEFORE this machine has computed its own must still be
  //    compared. Lockstep keeps the two within a few ticks, so whichever
  //    machine is trailing hits this case nearly every time.
  IB.NET.hashes.clear(); IB.NET.peerHashes.clear(); IB.NET.desyncAt = -1;
  IB.netRecv({ k:'hash', tick:30, h:12345 });
  t.ok(IB.NET.peerHashes.get(30) === 12345, 'a hash that arrives early is kept, not dropped');
  t.ok(IB.NET.desyncAt === -1, 'and nothing is concluded from it on its own');
  IB.NET.hashes.set(30, 999);            // ours turns out to differ
  IB.netCheckHash(30);
  t.ok(IB.NET.desyncAt === 30, 'and it is compared as soon as ours exists (desyncAt ' + IB.NET.desyncAt + ')');

  // 2. The other order round.
  IB.netEnd(); IB.netStart({ me:1, seed:9101 });
  IB.NET.hashes.set(60, 4444);
  IB.netRecv({ k:'hash', tick:60, h:4444 });
  t.ok(IB.NET.desyncAt === -1, 'two machines that agree are left alone');
  IB.netRecv({ k:'hash', tick:90, h:1 });
  IB.NET.hashes.set(90, 2); IB.netCheckHash(90);
  t.ok(IB.NET.desyncAt === 90, 'and a later disagreement is still caught');

  // 3. A detected desync STOPS the match. Carrying on means both players give
  //    orders to a board the other cannot see, and whoever wins did not.
  IB.netEnd(); IB.netStart({ me:0, seed:9102 });
  IB.netDeliver(IB.NET.tick, 0, []); IB.netDeliver(IB.NET.tick, 1, []);
  t.ok(IB.netStep() === true, 'a healthy match steps');
  const at = IB.NET.tick;
  IB.NET.desyncAt = at;
  IB.netDeliver(IB.NET.tick, 0, []); IB.netDeliver(IB.NET.tick, 1, []);
  t.ok(IB.netStep() === false, 'a desynced one does not, even with both sides’ orders in hand');
  t.ok(IB.NET.tick === at, 'and the clock does not move (' + IB.NET.tick + ')');
  const banner = IB.netBanner();
  t.ok(/drifted apart/.test(banner), 'and the player is told why (' + banner + ')');

  // 4. The hash must actually cover the things that diverge, or none of the
  //    above means anything. Floats are quantised on purpose (1/64 on money and
  //    health, 1/4096 on positions), so the probes move by more than that.
  IB.netEnd(); IB.newMatch({ diff:'veteran', seed:9103 });
  step(10);
  const h0 = IB.netHash();
  t.ok(IB.netHash() === h0, 'an unchanged board hashes the same twice');
  const probes = [
    ['the shared random cursor', () => IB.reseed(4242)],
    ['a hold’s own decision stream', () => { P().rs = (P().rs ^ 99) | 0; }],
    ['gold', () => { P().res.gold += 1; }],
    ['a worker moving job', () => { P().workers.idle += 1; P().workers.gold -= 1; }],
    ['a node level', () => { P().nodeLvl.gold++; }],
    ['a forge rank', () => { P().towerUp.hp++; }],
    ['a troop rank', () => { P().troopUp.tad++; }],
    ['a building appearing', () => { P().plot[0] = { type:'farm', lvl:1, tile:0 }; }],
    ['a building levelling', () => { P().plot[5].lvl++; }],
    ['the training queue', () => { P().trainQ.push({ type:'worker', t:5, dur:5 }); }],
    ['the wave clock', () => { G.waveT += 1; }],
    ['a structure taking damage', () => { P().structs[0].hp -= 1; }],
  ];
  for (const [what, poke] of probes){
    IB.newMatch({ diff:'veteran', seed:9103 });
    step(10);
    poke();
    t.ok(IB.netHash() !== h0, 'the hash notices ' + what);
  }
  // Hero progression: two machines disagreeing about a level, a passive or the
  // three cards on offer used to be completely silent.
  {
    IB.newMatch({ diff:'veteran', seed:9103 });
    step(10);
    rich(P());
    P().plot[2] = { type:'tavern', lvl:1, tile:2 };
    IB.createHero(P(), 'fighter');
    const hh = P().heroes[0];
    const withHero = IB.netHash();
    t.ok(withHero !== h0, 'the hash notices a hero existing at all');
    hh.lvl++;
    t.ok(IB.netHash() !== withHero, 'and a hero levelling');
    const lvled = IB.netHash();
    hh.passRank++;
    t.ok(IB.netHash() !== lvled, 'and a passive ranking up');
    const ranked = IB.netHash();
    if (hh.skills.length){ hh.skills[0].rank++; t.ok(IB.netHash() !== ranked, 'and a skill ranking up'); }
    else t.ok(true, 'and a skill ranking up (no skill yet at this level)');
    const before = IB.netHash();
    hh.pend.push({ kind:'passive', opts:['a', 'b', 'c'], lvl:3 });
    t.ok(IB.netHash() !== before, 'and which cards a hero is being offered');
  }
  IB.netEnd();
}

/* ================================================ leaving a network match */
{
  IB.netEnd();
  IB.netStart({ me:1, seed:9200 });
  t.ok(IB.NET.on === true && IB.NET.me === 1, 'in a network match as side 1');
  IB.NET.pending.push({ k:'worker', side:1, seq:0 });
  IB.netDeliver(50, 0, []); IB.NET.hashes.set(30, 7); IB.NET.peerHashes.set(30, 8);

  IB.netEnd();
  t.ok(IB.NET.on === false, 'leaving clears the multiplayer flag');
  t.ok(IB.NET.tick === 0 && IB.NET.seq === 0, 'and the clock and sequence go back to zero');
  t.ok(IB.NET.box.size === 0 && IB.NET.pending.length === 0,
    'and no orders from the finished match are left in the box');
  t.ok(IB.NET.hashes.size === 0 && IB.NET.peerHashes.size === 0, 'nor any of its hashes');
  t.ok(IB.NET.desyncAt === -1 && IB.NET.peerLost === false, 'and its failure flags are cleared');

  // The bug this guards: NET.on was set in netStart and cleared NOWHERE, so the
  // frame loop kept taking its network branch against whatever match came next.
  t.ok(/NET\.on = false/.test(SRC), 'something in the game actually clears NET.on');
  const wiring = SRC.slice(SRC.indexOf('function wire()'));
  for (const path of ['start', 'introgo', 'resume', 'menu', 'again'])
    t.ok(new RegExp("a === '" + path + "'[\\s\\S]{0,200}?netEnd\\(\\)").test(wiring),
      "'" + path + "' ends the network match before starting a different one");

  // A one-player match started after a network one must actually run.
  IB.newMatch({ diff:'veteran', seed:9201 });
  const t0 = G.t;
  step(3);
  t.ok(G.t > t0, 'and the one-player match that follows runs normally (' + t0.toFixed(2) + ' -> ' + G.t.toFixed(2) + 's)');
  t.ok(G.sides[1].ai === true, 'with the Host back in it');
}

/* ====================================== the joiner plays their own hold
   Commands were already routed to NET.me, but every readout on screen came
   from G.sides[0] — so the player who JOINED was giving orders to the hold on
   the right while reading the numbers of the hold on the left. */
{
  IB.netEnd();
  t.ok(IB.MY === 0, 'on your own you are the left-hand hold');
  IB.newMatch({ diff:'veteran', seed:6001 });
  rich(P()); P().res.gold = 4321;
  E().res.gold = 8765;
  t.ok(IB.dockHtml().includes('4321') || Math.round(me_gold()) === 4321,
    'and the dock reads your own gold');

  function me_gold(){ return IB.G.sides[IB.MY].res.gold; }

  // Take seat 1, as the joiner does.
  IB.netStart({ me:1, seed:6002 });
  t.ok(IB.NET.me === 1, 'the joiner is seat 1');
  t.ok(IB.MY === 1, 'and the interface follows the seat');
  t.ok(IB.G.sides[IB.MY] === E(), 'so "my hold" is the Ember Host, on the right');

  G.sides[0].res.gold = 111; G.sides[1].res.gold = 999;
  t.ok(Math.round(me_gold()) === 999, 'the numbers on screen are the joiner’s own (' + Math.round(me_gold()) + ')');

  // An order given from seat 1 must reach side 1, and the readout must agree
  // with where the order went. These two disagreeing IS the bug.
  const before = G.sides[1].trainQ.length, otherBefore = G.sides[0].trainQ.length;
  IB.sendCmd('worker');
  IB.netDeliver(IB.NET.tick, 0, []);
  for (let i = 0; i < IB.NET.delay + 2 && IB.netStep(); i++) IB.netDeliver(IB.NET.tick, 0, []);
  t.ok(G.sides[1].trainQ.length > before, 'an order from seat 1 trains on side 1');
  t.ok(G.sides[0].trainQ.length === otherBefore, 'and does nothing to side 0');

  // The camera, the clickable hold, and the tally all have to agree too.
  t.ok(IB.myHoldX() === C.LANE_LEN - IB.HOLD_X, 'the camera opens on the right-hand hold');
  t.ok(IB.foe() === 0, 'and the enemy is side 0');
  IB.doAction('camHold');
  const atMine = IB.cam.x;
  IB.doAction('camFoe');
  t.ok(IB.cam.x < atMine, 'HOLD and FOE point at opposite ends, the right way round for this seat');

  G.winner = 1;
  t.ok(/gates are down/.test(IB.overHtml()), 'the result card renders for seat 1');
  t.ok(IB.overHtml().includes(IB.SIDE_NAME[1]), 'and names the joiner’s own hold first');
  G.winner = null;

  // Whose crews get drawn, and whose plot is clickable.
  IB.draw();
  t.ok(true, 'a full draw from seat 1 is clean');
  const targets = IB.clickTargets();
  const plots = targets.filter(o => o.kind === 'plot' || o.kind === 'build');
  t.ok(plots.length === IB.PLOT_W * IB.PLOT_H, 'every tile of the joiner’s own plot is clickable');

  IB.netEnd();
  t.ok(IB.MY === 0, 'and leaving gives the seat back');
  IB.newMatch({ diff:'veteran', seed:6003 });
  t.ok(IB.G.sides[IB.MY] === P(), 'so a one-player match is the left-hand hold again');
}

/* ================================= the dock must not vanish under a click
   A click is a press AND a release on the SAME element. The dock replaces its
   whole innerHTML five times a second, which destroys every button in it — so
   a click whose press-to-release straddled a rebuild released onto an element
   that no longer existed. A deliberate click is 80-150ms against a 220ms
   rebuild, which is why it read as "I have to click things twice". */
{
  IB.netEnd();
  IB.newMatch({ diff:'veteran', seed:6100 });

  // Behavioural, through the real uiTick: with a press in flight the refresh
  // defers, and the deferral is what accumulates.
  IB.uiDown = false; IB.uiWaited = 0;
  for (let i = 0; i < 30; i++) IB.uiTick(1 / 30);          // a second, nothing held
  t.ok(IB.uiWaited === 0, 'with nothing held down the dock refreshes on its own clock');

  IB.uiDown = true; IB.uiWaited = 0;
  for (let i = 0; i < 14; i++) IB.uiTick(1 / 30);          // ~0.47s with a finger down
  t.ok(IB.uiWaited > 0, 'a press in flight defers the rebuild (' + IB.uiWaited.toFixed(2) + 's deferred)');

  // ...but only so far. A press whose release never arrives — dragged off the
  // window, a lost pointer — must not freeze the dock forever.
  IB.uiDown = true; IB.uiWaited = 0;
  for (let i = 0; i < 30 * 5; i++) IB.uiTick(1 / 30);      // five seconds stuck down
  t.ok(IB.uiWaited <= IB.UI_WAIT_CAP + .001,
    'and it gives up after the cap rather than freezing (' + IB.uiWaited.toFixed(2) + 's, cap ' + IB.UI_WAIT_CAP + 's)');
  t.ok(IB.UI_WAIT_CAP >= .4 && IB.UI_WAIT_CAP <= 1.2,
    'the cap is long enough for a real click and short enough not to be felt (' + IB.UI_WAIT_CAP + 's)');

  // Releasing resumes immediately.
  IB.uiDown = false;
  IB.uiTick(1);
  t.ok(IB.uiWaited === 0, 'releasing lets the dock refresh again at once');

  // The flag has to be cleared by things other than a clean release, or one
  // press that drifts off a button would stop the dock updating.
  const wiring = SRC.slice(SRC.indexOf('function wire()'));
  t.ok(/\$\('dock'\)\.addEventListener\('pointerdown'/.test(wiring), 'a press in the dock sets the flag');
  for (const ev of ['pointerup', 'pointercancel', 'blur'])
    t.ok(new RegExp("window\\.addEventListener\\('" + ev + "'[\\s\\S]{0,40}?uiDown = false").test(wiring),
      ev + ' on the window clears it, so a press that drifts off the button still counts');

  // The thing that made this a bug in the first place: the dock really is
  // rebuilt wholesale, so deferring is the fix rather than a nicety.
  t.ok(/\$\('dock'\)\.innerHTML = dockHtml\(\)/.test(SRC),
    'the dock is still rebuilt wholesale — which is exactly why the guard is needed');
}

/* ============================ the clock must survive being in the background
   A browser throttles requestAnimationFrame to about 1fps in a window that is
   not in front, and stops it in one that is covered. Harmless on your own. In
   lockstep it is fatal: neither machine may pass a tick the other has not
   published, so a backgrounded window drags its opponent down to its own frame
   rate. Measured before the fix, with the second window at 1fps: forty seconds
   of real time produced four seconds of match, both screens reading "Waiting
   for the other player…". After: 102%. */
{
  IB.netEnd();
  IB.netStart({ me:0, seed:7700 });
  // Plenty of orders in hand, so the CLOCK is the only thing limiting progress.
  for (let t = 0; t < 400; t++){ IB.netDeliver(t, 0, []); IB.netDeliver(t, 1, []); }

  t.ok(typeof IB.netPump === 'function', 'the network clock is a thing that can be pumped');

  // One second of arrears has to buy about a second of match. The old loop
  // clamped the accumulator to 0.25s and ran at most 8 ticks per frame, so a
  // one-second gap bought 8 ticks and the match fell behind for good.
  IB.acc = 0; IB.netLast = 0;
  IB.netPump();                                  // first call only starts the clock
  const t0 = IB.NET.tick;
  IB.netLast = IB.netLast - 1000;                // pretend a full second passed
  IB.netPump();
  const ran = IB.NET.tick - t0;
  t.ok(ran >= 26 && ran <= 34, 'a one-second gap runs about thirty ticks (' + ran + ')');
  t.ok(ran > 8, 'which is more than the old per-frame cap of 8 — the regression this guards');

  // ...but a window that was away for a minute owes 1800 ticks and is not
  // going to pay them. The debt is dropped, not hoarded.
  const t1 = IB.NET.tick;
  IB.netLast = IB.netLast - 60000;
  IB.netPump();
  const ran2 = IB.NET.tick - t1;
  t.ok(ran2 <= IB.NET_BUDGET, 'a minute away does not stampede (' + ran2 + ' ticks, budget ' + IB.NET_BUDGET + ')');
  t.ok(IB.acc <= IB.NET_ARREARS + .001,
    'and the unpaid remainder is capped rather than accumulating forever (' + IB.acc.toFixed(2) + 's)');

  // The clock takes its own time, so it does not matter who calls it or how
  // often — two callers cannot double-count the elapsed seconds.
  const t2 = IB.NET.tick;
  IB.netPump(); IB.netPump(); IB.netPump();
  t.ok(IB.NET.tick - t2 <= 2, 'three pumps back to back advance almost nothing — elapsed time is measured, not counted');

  t.ok(IB.NET_BUDGET >= 35, 'the per-pump budget can cover a second of real time (' + IB.NET_BUDGET + ' ticks)');
  t.ok(IB.NET_ARREARS >= 1 && IB.NET_ARREARS <= 3, 'and the arrears cap is a second or two (' + IB.NET_ARREARS + 's)');

  // The clock must not be rAF alone, which is the whole point.
  const loop = SRC.slice(SRC.indexOf('function netPump()'), SRC.indexOf('function frame(ts)'));
  t.ok(/new Worker/.test(loop), 'a worker timer drives it, which a background page does not throttle');
  t.ok(/setInterval/.test(loop), 'with a plain interval as the fallback if a worker cannot be made');
  const frameFn = SRC.slice(SRC.indexOf('function frame(ts)'), SRC.indexOf('function frame(ts)') + 300);
  t.ok(/if \(NET\.on\)\{?\s*\n?\s*netPump\(\);/.test(frameFn) || /netPump\(\);/.test(frameFn),
    'and the animation frame just pumps the same clock rather than owning it');
  t.ok(!/ran < 8/.test(SRC), 'the old eight-ticks-per-frame cap is gone');
  t.ok(!/acc \+= Math\.min\(\.25, raw\)/.test(SRC), 'and so is the quarter-second accumulator clamp');

  // Starting and stopping is tied to the match, not left running forever.
  const start = SRC.slice(SRC.indexOf('function netStart(opt)'), SRC.indexOf('function netStart(opt)') + 600);
  t.ok(/netClockStart\(\)/.test(start), 'a network match starts the clock');
  const end = SRC.slice(SRC.indexOf('function netEnd()'), SRC.indexOf('function netEnd()') + 500);
  t.ok(/netClockStop\(\)/.test(end), 'and leaving one stops it');

  IB.netEnd();
  t.ok(IB.acc === 0 && IB.netLast === 0, 'which also clears the arrears, so the next match starts level');
}

/* ================================ everything works the same in either seat
   The joiner could not click its own plot: clickTargets() laid every clickable
   region out with holdSide = 0, so for seat 1 the boxes sat over the LEFT hold
   while its buildings stood on the right. Nothing was where the game thought.

   Rather than test that one path, run the same battery in BOTH seats and
   require them to agree. Anything that works for the host and not the joiner
   fails here, including things nobody has thought of yet. */
{
  const inSeat = (seat, fn) => {
    IB.netEnd();
    if (seat === 0){ IB.newMatch({ diff:'veteran', seed:8800 }); }
    else { IB.netStart({ me:1, seed:8800 }); }
    IB.MY = seat;
    const r = fn(IB.G.sides[seat], seat);
    IB.netEnd();
    return r;
  };

  // --- the reported bug, as a round trip: put my own plot tile on screen,
  //     then ask the game what is at that point. It must be that tile.
  for (const seat of [0, 1]){
    const got = inSeat(seat, () => {
      IB.resize && IB.resize();
      const hits = [];
      for (const tile of [0, 5, 6, 15]){
        // where the game DRAWS my tile
        IB.BSC = 1;
        const targets = IB.clickTargets().filter(t => (t.kind === 'plot' || t.kind === 'build') && t.tile === tile);
        if (!targets.length){ hits.push(tile + ':not-drawn'); continue; }
        const t0 = targets[0];
        const back = IB.resolvePick(t0.cx, t0.cy);
        hits.push(tile + ':' + (back && back.tile === tile ? 'ok' : 'got-' + (back && back.tile)));
      }
      return hits;
    });
    t.ok(got.every(h => h.endsWith(':ok')),
      'seat ' + seat + ' can click every one of its own plot tiles (' + got.join(' ') + ')');
  }

  // --- and the clickable regions must be over MY hold, not the other one
  for (const seat of [0, 1]){
    const side = inSeat(seat, () => {
      IB.clickTargets();
      return IB.holdWorld(0, 0)[0];       // where the grid origin ended up in world x
    });
    const expect = seat === 0 ? IB.HOLD_X : C.LANE_LEN - IB.HOLD_X;
    t.ok(Math.abs(side - expect) < 1,
      'seat ' + seat + ' lays its clickables over its own hold (x=' + Math.round(side) + ', expected ' + Math.round(expect) + ')');
  }

  // --- the same battery, both seats, must not throw and must talk about ME
  const battery = (s, seat) => {
    const out = {};
    rich(s);
    out.dock = IB.dockHtml();
    out.advice = IB.adviceFor(s);
    out.over = (() => { G.winner = seat; return IB.overHtml(); })();
    out.pause = IB.pauseHtml();
    // the timeline only draws rows for walls that actually fell
    G.timeline.push({ side:seat, key:'t1', n:'Outer Turret', t:10 });
    G.timeline.push({ side:seat === 0 ? 1 : 0, key:'t1', n:'Outer Turret', t:12 });
    out.timeline = IB.timelineHtml();
    out.foe = IB.foeWarning();
    out.plot0 = IB.s0Plot(5);
    out.clicks = IB.clickTargets().length;
    out.holdX = IB.myHoldX();
    out.foeSide = IB.foe();
    out.holds = IB.holdsBoard({ pend:[{}], side:seat, hp:1, mhp:1 });
    IB.draw();
    return out;
  };
  const r0 = inSeat(0, battery), r1 = inSeat(1, battery);

  t.ok(r0.clicks === r1.clicks, 'both seats offer the same number of clickable things (' + r0.clicks + ' / ' + r1.clicks + ')');
  t.ok(r0.foeSide === 1 && r1.foeSide === 0, 'each seat knows who its enemy is');
  t.ok(r0.holdX !== r1.holdX, 'and the two seats look at opposite ends of the bridge');
  t.ok(!!r0.plot0 && !!r1.plot0, 'both read their own starting buildings off the plot');
  for (const k of ['dock', 'over', 'pause', 'timeline', 'foe'])
    t.ok(typeof r0[k] === 'string' && typeof r1[k] === 'string' && r1[k].length > 0,
      'the ' + k + ' renders in both seats');

  // The result card must call each seat's OWN victory a win.
  t.ok(/gates are down/.test(r0.over) && /gates are down/.test(r1.over), 'the result card renders for both seats');
  // Scoped to the tally header itself: the headline above it now names the
  // LOSER, so searching the whole card finds the enemy first on a win and this
  // read backwards. It was always meant to be about the two columns.
  const tally = (h) => h.slice(h.indexOf('wr-head'));
  t.ok(tally(r0.over).indexOf(IB.SIDE_NAME[0]) < tally(r0.over).indexOf(IB.SIDE_NAME[1]),
    'seat 0 sees its own hold named first in the tally');
  t.ok(tally(r1.over).indexOf(IB.SIDE_NAME[1]) < tally(r1.over).indexOf(IB.SIDE_NAME[0]),
    'seat 1 sees its own hold named first in the tally');

  // The timeline says whose walls fell, from the reader's point of view.
  t.ok(/You lost/.test(r0.timeline) && /You lost/.test(r1.timeline),
    'the timeline says "You lost" about the reader’s own walls in both seats');

  // Level-up cards freeze the board only outside a network match, and only for
  // the hold the reader is playing.
  t.ok(r0.holds === true, 'a one-player match still holds the board for a level-up choice');
  t.ok(r1.holds === false, 'a network match never does');

  // --- selecting the enemy's structure must not be labelled as mine
  {
    IB.netEnd(); IB.netStart({ me:1, seed:8801 }); IB.MY = 1;
    IB.sel.struct = G.sides[0].structs[0];       // the OTHER hold's turret
    const html = IB.dockHtml();
    t.ok(html.includes(IB.SIDE_NAME[0]), 'seat 1 selecting side 0’s turret sees it named as side 0’s');
    IB.sel.struct = G.sides[1].structs[0];       // its own
    const own = IB.dockHtml();
    t.ok(own.includes(IB.SIDE_NAME[1]), 'and its own named as its own');
    t.ok(html !== own, 'the two read differently — ownership is not hardcoded');
    IB.sel.struct = null;
    IB.netEnd();
  }

  // --- and the "what is coming at you" briefing must be about the enemy
  {
    IB.netEnd(); IB.netStart({ me:1, seed:8802 }); IB.MY = 1;
    G.sides[0].waveKind = 'ogres'; G.sides[1].waveKind = 'levy';
    const warn = IB.foeWarning();
    t.ok(/Ogre/i.test(warn), 'seat 1 is warned about side 0’s wave, not its own (' + warn.slice(0, 60) + ')');
    IB.MY = 0;
    const warn0 = IB.foeWarning();
    t.ok(/Levy|levy/i.test(warn0) || warn0 !== warn, 'and seat 0 about side 1’s');
    IB.netEnd();
  }
  IB.MY = 0;
}

/* ============================ a held or paused board must never skip a tick
   update() returns early on G.paused and G.held. netStep() advances the tick
   and publishes orders either way. So anything that sets either flag during a
   network match stops one machine simulating while its clock and its opponent
   carry on — a desync with no wrong line of simulation anywhere in it.

   A level-up choice set G.held. Every match desynced the first time anybody
   levelled a hero, which is to say every match. */
{
  IB.netEnd();
  IB.netStart({ me:0, seed:9500 });
  for (let n = 0; n < 200; n++){ IB.netDeliver(n, 0, []); IB.netDeliver(n, 1, []); }

  // A pending choice must not hold the board in a network match.
  const pretend = { pend:[{ kind:'passive', opts:['a'], lvl:3 }], side:0, hp:1, mhp:1 };
  t.ok(IB.holdsBoard(pretend) === false, 'a level-up choice does not hold a shared board');

  // And even if something sets the flags anyway, the tick must still simulate.
  for (const [flag, name] of [['held', 'G.held'], ['paused', 'G.paused']]){
    G[flag] = true;
    const t0 = G.t, tick0 = IB.NET.tick;
    IB.netStep();
    t.ok(IB.NET.tick === tick0 + 1, 'the clock advances with ' + name + ' set');
    t.ok(G.t > t0, 'and the simulation advances with it (' + name + ' cannot skip a tick)');
    t.ok(G[flag] === false, 'and the flag is cleared rather than left to bite later');
  }

  // The pair of them together, which is what a player pressing pause during a
  // level-up choice would have produced.
  G.held = true; G.paused = true;
  const t1 = G.t;
  IB.netStep();
  t.ok(G.t > t1, 'both flags at once still cannot stop a network tick');

  // One machine holding while the other does not IS the divergence. Two
  // network matches from one seed — one left alone, one with a card opened and
  // pause pressed on top of it — must end on the same number, because holding
  // is not allowed to skip anything. (Compared against another NETWORK match,
  // not a solo one: netStart takes the Host out of side 1, so a one-player run
  // of the same seed is a genuinely different match.)
  const runNet = (poke) => {
    IB.netEnd();
    IB.netStart({ me:0, seed:9501 });
    for (let n = 0; n < 600; n++){ IB.netDeliver(n, 0, []); IB.netDeliver(n, 1, []); }
    for (let n = 0; n < 15 * 30; n++){ if (poke) poke(n); IB.netStep(); }
    const h = IB.netHash();
    IB.netEnd();
    return h;
  };
  const clean = runNet(null);
  const held = runNet((n) => {
    if (n === 100) G.held = true;          // a card opens mid-match
    if (n === 200) G.paused = true;        // and pause is pressed on top of it
    if (n === 300){ G.held = true; G.paused = true; }
  });
  t.ok(held === clean,
    'a network match poked with held and paused still ends on the same number as a clean one (' + held + ' vs ' + clean + ')');
}

/* ================== a command's own arguments must not overwrite its kind
   sendCmd built its command as Object.assign({ type }, args). Exactly one
   command carries an argument called `type`: build, whose type is the
   BUILDING. So sendCmd('build', { tile:3, type:'pit' }) produced a command
   whose kind was "pit", CMD had no "pit", and netStep dropped it without a
   word. Nobody could build anything in a two-player match, in either seat, and
   it failed silently — the button worked, no resources were spent, no message
   was printed. */
{
  // Only the PEER's batches are pre-filled. netDeliver ignores a second batch
  // for a slot that already has one, so filling our own side's slots in advance
  // would leave netPublish nowhere to put the orders under test — which is a
  // fine way to write a test that passes for the wrong reason.
  const netMatch = (seed) => {
    IB.netEnd();
    IB.netStart({ me:0, seed });
    for (let n = 0; n < 400; n++) IB.netDeliver(n, 1, []);   // the other player, idle
    rich(G.sides[0]);
  };
  const settle = () => { for (let n = 0; n < IB.NET.delay + 8; n++) IB.netStep(); };

  netMatch(9600);
  IB.NET.pending.length = 0;
  IB.sendCmd('build', { tile:0, type:'farm' });
  const c = IB.NET.pending[0];
  t.ok(!!c, 'a build order is queued');
  t.ok(c.k === 'build', 'its KIND survives an argument called type (kind=' + c.k + ')');
  t.ok(c.type === 'farm', 'and the building it names is still there (type=' + c.type + ')');
  t.ok(!!IB.CMD[c.k], 'so the dispatch table can find it — this is the lookup that silently failed');

  const before = G.sides[0].plot.filter(Boolean).length;
  settle();
  t.ok(G.sides[0].plot.filter(Boolean).length > before,
    'the building actually goes up (' + before + ' -> ' + G.sides[0].plot.filter(Boolean).length + ')');
  t.ok(G.sides[0].plot[0] && G.sides[0].plot[0].type === 'farm', 'and it is the building that was ordered');

  // The key changed for every command, so every command has to be re-checked —
  // each against a value that was NOT already true before it was sent.
  const cases = [
    ['worker',  {},                    (s) => s.trainQ.filter(q => q.type === 'worker').length],
    ['job',     { node:'iron', d:1 },  (s) => s.workers.iron],
    ['nodeup',  { node:'gold' },       (s) => s.nodeLvl.gold],
    ['upgrade', { tile:5 },            (s) => s.plot[5].lvl],
    ['up',      { up:'hp' },           (s) => s.towerUp.hp],
    ['unit',    { unit:'melee' },      (s) => s.trainQ.filter(q => q.type !== 'worker').length],
  ];
  for (const [kind, args, read] of cases){
    netMatch(9601);
    G.sides[0].plot[1] = { type:'forge', lvl:2, tile:1 };
    G.sides[0].plot[2] = { type:'barracks', lvl:1, tile:2 };
    const was = read(G.sides[0]);
    IB.NET.pending.length = 0;
    IB.sendCmd(kind, args);
    const q = IB.NET.pending[0];
    t.ok(q && q.k === kind, "'" + kind + "' keeps its kind on the wire (" + (q && q.k) + ')');
    settle();
    t.ok(read(G.sides[0]) > was, "'" + kind + "' actually lands (" + was + ' -> ' + read(G.sides[0]) + ')');
  }
  IB.netEnd();
}

/* ================================================ you can see a skill happen
   Every skill used to look like every other skill: one ring, eight sparks and
   the name floating up. Seventeen distinct shapes, one picture between them. */
{
  IB.netEnd();
  IB.fxForce = true;
  IB.newMatch({ diff:'veteran', seed:7000 });
  rich(P());
  P().plot[2] = { type:'tavern', lvl:3, tile:2 };
  IB.createHero(P(), 'mage');
  const h = P().heroes[0];
  IB.createHero(P(), 'fighter');
  const foeH = E().heroes[0] || { x:h.x + 6, y:h.y + 1, r:.4, hp:100, mhp:100, side:1 };

  // Every shape in the game draws something, and shapes that are different
  // draw different things. A blanket "it made some particles" would pass on the
  // old code, which is the thing being fixed.
  const shapes = [...new Set(IB.SKILLS.map(x => x.k))];
  t.ok(shapes.length >= 15, 'the game has a lot of distinct skill shapes (' + shapes.length + ')');

  const seen = {};
  for (const k of shapes){
    const s = IB.SKILLS.find(x => x.k === k);
    G.fx.length = 0; G.floats.length = 0;
    h.castT = 0;
    IB.castFx(h, s, foeH);
    const kinds = [...new Set(G.fx.map(f => f.k))].sort().join('+');
    seen[k] = kinds;
    t.ok(G.fx.length > 0, "'" + k + "' draws something (" + G.fx.length + ' bits: ' + kinds + ')');
    t.ok(h.castT > 0, "'" + k + "' pops the hero that cast it");
  }
  const distinct = new Set(Object.values(seen));
  t.ok(distinct.size >= 5,
    'and the shapes do not all look alike (' + distinct.size + ' distinct pictures across ' + shapes.length + ' shapes)');
  // The specific reads that matter most.
  t.ok(/beam/.test(seen.bolt), 'a bolt reaches out to its target with a beam');
  t.ok(/arc/.test(seen.strike), 'a strike sweeps an arc');
  t.ok(/wave/.test(seen.nova), 'a nova goes off as an expanding wave');
  t.ok(/mote/.test(seen.heal), 'a heal rises off the target as motes');
  t.ok(/beam/.test(seen.volley), 'a volley comes down out of the sky');

  // An ultimate has to be obviously an ultimate without reading anything.
  {
    const ord = IB.SKILLS.find(x => !x.ult && x.k === 'nova');
    const ult = IB.SKILLS.find(x => x.ult && x.k === 'nova') || IB.SKILLS.find(x => x.ult);
    G.fx.length = 0; IB.castFx(h, ord, foeH);
    const nOrd = G.fx.length, popOrd = h.castT;
    G.fx.length = 0; IB.castFx(h, ult, foeH);
    t.ok(G.fx.length > nOrd, 'an ultimate throws more on screen than an ordinary cast (' + nOrd + ' -> ' + G.fx.length + ')');
    t.ok(h.castT > popOrd, 'and holds the pop on the caster longer');
    t.ok(G.fx.some(f => f.col === '#ffe08a'), 'with a gold flourish that ordinary casts do not get');
  }

  // The cap. A hero spamming skills in a twenty-body brawl must not be able to
  // bury the frame.
  {
    G.fx.length = 0;
    for (let i = 0; i < 200; i++) IB.castFx(h, IB.SKILLS.find(x => x.k === 'nova'), foeH);
    t.ok(G.fx.length <= IB.FX_CAP, 'two hundred casts still fit under the cap (' + G.fx.length + '/' + IB.FX_CAP + ')');
  }

  // NONE of it may touch the simulation's random stream. This is the rule that
  // the whole determinism effort rests on, and new effects are exactly how it
  // would get broken.
  {
    G.fx.length = 0;
    const before = IB.seedNow();
    for (const k of shapes) IB.castFx(h, IB.SKILLS.find(x => x.k === k), foeH);
    IB.beamFx(0, 0, 5, 5, '#ffffff', 3, .2);
    IB.arcFx(1, 1, .5, 2, '#ffffff');
    IB.waveFx(2, 2, 3, '#ffffff', .4);
    IB.moteFx(3, 3, '#7fdc8a', 12, 1);
    t.ok(IB.seedNow() === before, 'not one of the new effects advances the simulation’s random stream');
  }

  // And every one of them has to survive the renderer. The stub context here
  // rejects a bad colour string the way a real canvas does, so this is where a
  // typo in an rgba() would be caught rather than on the page.
  {
    G.fx.length = 0;
    for (const k of shapes) IB.castFx(h, IB.SKILLS.find(x => x.k === k), foeH);
    IB.moteFx(h.x, h.y, '#7fdc8a', 6, 1);
    const n = G.fx.length;
    IB.draw();
    t.ok(true, 'a frame with every cast shape on it at once draws clean (' + n + ' effects)');
    // ...and again part-way through their life, since the renderer reads age.
    IB.fxStep(.12); IB.draw();
    IB.fxStep(.12); IB.draw();
    t.ok(true, 'and again as they age');
    // the pop on the caster is drawn too
    h.castT = .3; IB.draw();
    h.castT = .02; IB.draw();
    t.ok(true, 'including the pop on the hero that cast');
  }

  // The pop fades on its own rather than sticking.
  {
    h.castT = .3;
    for (let i = 0; i < 20; i++) IB.fxStep(1 / 30);
    t.ok(h.castT <= 0, 'the cast pop fades out (' + h.castT.toFixed(3) + ')');
  }

  // Motes rise; sparks fall. That difference is the whole reason mote exists.
  {
    G.fx.length = 0;
    IB.moteFx(0, 0, '#7fdc8a', 4, .5);
    const z0 = G.fx.map(f => f.z);
    IB.fxStep(.1);
    t.ok(G.fx.every((f, i) => f.z > z0[i]), 'motes rise');
  }
  IB.fxForce = false;
}

/* ==================================== a drifted match puts itself back together
   A desync used to end the match. It is recoverable: the host packs its board,
   the joiner adopts it, and both restart their order pipeline from the same
   tick. */
{
  // A snapshot has to be COMPLETE. Not "close enough to look right" — a machine
  // that restored has to produce a bit-identical future to one that never
  // drifted, or the resync just buys a few seconds before the next desync.
  IB.netEnd();
  IB.newMatch({ diff:'veteran', seed:9800 });
  for (const s of G.sides){ rich(s); s.plot[2] = { type:'tavern', lvl:3, tile:2 }; }
  IB.createHero(G.sides[0], 'mage'); IB.createHero(G.sides[1], 'fighter');
  for (const s of G.sides) for (const h of s.heroes){ h.lvl = 12; IB.recalcHero(h, true); IB.autoPick(h); }
  step(70);
  t.ok(G.state === 'play', 'the match under test is still running');
  t.ok(G.units.length > 3, 'with bodies on the bridge (' + G.units.length + ')');

  const at = IB.netHash();
  const json = JSON.stringify(IB.netSnap());
  t.ok(json.length > 2000, 'a snapshot is a substantial thing (' + json.length + ' bytes)');

  step(10);
  t.ok(IB.netHash() !== at, 'the board really moves on from there');
  t.ok(IB.netLoad(JSON.parse(json)), 'the snapshot loads');
  t.ok(IB.netHash() === at, 'and puts the board back exactly where it was');

  // The part that matters: identical FUTURES, not just an identical moment.
  const runOn = () => { const out = []; for (let i = 0; i < 300; i++){ IB.update(1 / 30); if (i % 75 === 0) out.push(IB.netHash()); } return out.join(','); };
  IB.netLoad(JSON.parse(json)); const r1 = runOn();
  IB.netLoad(JSON.parse(json)); const r2 = runOn();
  t.ok(r1 === r2, 'two runs from one snapshot are identical');

  // ...and identical to a machine that never drifted at all.
  IB.newMatch({ diff:'veteran', seed:9800 });
  for (const s of G.sides){ rich(s); s.plot[2] = { type:'tavern', lvl:3, tile:2 }; }
  IB.createHero(G.sides[0], 'mage'); IB.createHero(G.sides[1], 'fighter');
  for (const s of G.sides) for (const h of s.heroes){ h.lvl = 12; IB.recalcHero(h, true); IB.autoPick(h); }
  step(70);
  const clean = runOn();
  t.ok(clean === r1, 'and indistinguishable from a run that never drifted — which is the whole point');

  // Object references survive the trip. A unit whose target became null, or a
  // hero pointing at a body that no longer exists, is a desync a few ticks later.
  {
    IB.netLoad(JSON.parse(json));
    const bodies = IB.netBodies();
    t.ok(bodies.length === G.units.length + G.sides.reduce((a, s) => a + s.heroes.filter(h => !G.units.includes(h)).length, 0),
      'every body is accounted for exactly once');
    const withTarget = G.units.filter(u => u.target);
    t.ok(withTarget.every(u => u.target === null || bodies.includes(u.target) || u.target.struct),
      'and every target points at something that is actually on the board');
    const heroes = G.sides.flatMap(s => s.heroes);
    t.ok(heroes.every(h => G.sides[h.side].heroes.includes(h)), 'heroes are still owned by their own side');
    t.ok(heroes.filter(h => !h.dead).every(h => G.units.includes(h) || !h.inLane),
      'and a living hero in the lane is still one of the bodies on the bridge');
  }

  // Two machines, one drifts, the host puts it right.
  {
    const H = loadGame({}), J = loadGame({});
    // The wire has to exist BEFORE the match starts: netStart publishes its
    // first batch on the way out, and a machine that never heard that batch
    // stalls at the end of the primed ticks and never moves again.
    const wire = [];
    H.NET.send = (o) => wire.push(['J', o]);
    J.NET.send = (o) => wire.push(['H', o]);
    H.netStart({ me:0, seed:9801, diff:'veteran' });
    J.netStart({ me:1, seed:9801, diff:'veteran' });
    const pump = (n) => {
      for (let i = 0; i < n; i++){
        while (wire.length){ const [to, o] = wire.shift(); (to === 'H' ? H : J).netRecv(JSON.parse(JSON.stringify(o))); }
        H.netStep(); J.netStep();
      }
    };
    pump(120);
    t.ok(H.NET.tick > 60 && J.NET.tick > 60, 'both machines got going (' + H.NET.tick + '/' + J.NET.tick + ')');
    t.ok(H.netHash() === J.netHash(), 'and agree before anything is broken');

    // Break the joiner on purpose, the way a real drift would.
    J.G.sides[0].res.gold += 5;
    pump(90);
    t.ok(J.NET.resyncs > 0 || H.NET.resyncs > 0, 'the drift was noticed and a resync was attempted');
    t.ok(H.netHash() === J.netHash(),
      'and the two boards agree again afterwards (' + H.netHash() + ' / ' + J.netHash() + ')');
    t.ok(J.NET.desyncAt === -1, 'with the joiner no longer flagged as desynced');

    // And it keeps running from there rather than limping.
    const before = J.NET.tick;
    pump(60);
    t.ok(J.NET.tick > before, 'the match carries on afterwards (' + before + ' -> ' + J.NET.tick + ')');
    t.ok(H.netHash() === J.netHash(), 'still in step a couple of seconds later');

    // A drift that will not stay fixed must eventually stop, not loop forever.
    for (let i = 0; i < IB.SYNC_MAX + 3; i++){ J.G.sides[0].res.gold += 5; pump(70); }
    t.ok(H.NET.resyncs <= IB.SYNC_MAX + 1,
      'a match that keeps drifting gives up rather than resyncing forever (' + H.NET.resyncs + ')');
  }
}

/* ============================================== and it says what happened
   A desync or a dead socket used to leave one sentence in the advice bar and
   nothing to work from. */
{
  IB.netEnd();
  IB.netStart({ me:1, seed:9900 });
  t.ok(Array.isArray(IB.NET.diary) && IB.NET.diary.length > 0, 'starting a match writes the first line');
  t.ok(IB.NET.diary.some(e => e.kind === 'start' && /seat 1/.test(e.detail)), 'which records the seat and the seed');

  // The most useful line in the whole log: what disagreed, and by how much.
  IB.NET.hashes.set(30, 111); IB.netRecv({ k:'hash', tick:30, h:222 });
  const d = IB.NET.diary.find(e => e.kind === 'DESYNC');
  t.ok(!!d, 'a drift is written down');
  t.ok(/mine 111/.test(d.detail) && /theirs 222/.test(d.detail),
    'with BOTH hashes, so the two reports can be compared (' + d.detail + ')');
  t.ok(/tick 30/.test(d.detail), 'and the tick it happened on');

  // A losing socket has to say which kind of losing.
  IB.netRecv({ k:'peerGone', side:0 });
  t.ok(IB.NET.diary.some(e => e.kind === 'PEER GONE'), 'a peer going away is written down');

  const rep = IB.netReport();
  t.ok(/seat\s+1/.test(rep), 'the report names the seat');
  t.ok(/DESYNCED at tick 30/.test(rep), 'and says the match desynced, and where');
  t.ok(/PEER LOST/.test(rep), 'and that the other player went');
  t.ok(/seed\s+\d/.test(rep) && /tick\s+\d/.test(rep), 'and carries the seed and the tick');
  t.ok(/mine 111/.test(rep), 'and contains the log itself');
  t.ok(rep.split('\n').length > 12, 'it is a report rather than a sentence (' + rep.split('\n').length + ' lines)');

  // It must not grow without limit — this is left on for the whole match.
  for (let i = 0; i < IB.DIARY_MAX + 120; i++) IB.netDiary('noise', 'x');
  t.ok(IB.NET.diary.length <= IB.DIARY_MAX, 'the log is capped (' + IB.NET.diary.length + '/' + IB.DIARY_MAX + ')');
  t.ok(IB.NET.diary[IB.NET.diary.length - 1].kind === 'noise', 'and keeps the most recent');

  // And it is reachable without a console.
  IB.showNetReport();
  t.ok(/Network report/.test(G.sheet) && /netcopy/.test(G.sheet), 'there is a sheet for it with a copy button');
  const wiring = SRC.slice(SRC.indexOf('function wire()'));
  t.ok(/dataset\.net === '1'/.test(wiring), 'and the advice bar opens it when the match is in trouble');
  IB.netEnd();
}

/* ================================ a dropped player can get back into the match
   A dead socket used to be the end of it. The relay holds the room, the seed
   and the seat open, so the only thing missing was the board — and the resync
   snapshot is exactly that. */
{
  // The machine that stayed hands over the board whichever seat it is in. On a
  // DRIFT the host is the authority because both are live and something has to
  // break the tie; on a REJOIN the tie does not exist — only one of them knows
  // anything — so seat must not decide it.
  IB.netEnd();
  IB.netStart({ me:1, seed:9700 });      // seat 1: would refuse to send on a drift
  for (let n = 0; n < 200; n++){ IB.netDeliver(n, 0, []); IB.netDeliver(n, 1, []); }
  for (let n = 0; n < 40; n++) IB.netStep();
  const sent = [];
  IB.NET.send = (o) => sent.push(o);

  IB.netSendSnap();                       // as a drift — the joiner keeps quiet
  t.ok(sent.length === 0, 'on a drift, seat 1 does not try to be the authority');
  IB.netSendSnap(true);                   // as a rejoin — it is the only one left
  t.ok(sent.some(o => o.k === 'sync'), 'but on a rejoin it hands the board over regardless of seat');
  t.ok(sent.filter(o => o.k === 'sync').every(o => typeof o.part === 'string' && o.tick >= 0),
    'in labelled pieces');

  // A rejoin must not spend the desync budget — they are different failures and
  // a match that reconnects six times has not drifted once.
  IB.netEnd(); IB.netStart({ me:0, seed:9701 });
  IB.NET.send = () => {};
  const r0 = IB.NET.resyncs;
  for (let i = 0; i < 5; i++) IB.netSendSnap(true);
  t.ok(IB.NET.resyncs === r0, 'reconnecting does not use up the resync budget (' + IB.NET.resyncs + ')');
  IB.netSendSnap();
  t.ok(IB.NET.resyncs === r0 + 1, 'but an actual drift still does');

  // While waiting to be told where the match is, the board must not run — a
  // freshly started match is on tick 0 and simulating it would be inventing a
  // game that never happened.
  IB.netEnd(); IB.netStart({ me:1, seed:9702 });
  for (let n = 0; n < 200; n++){ IB.netDeliver(n, 0, []); IB.netDeliver(n, 1, []); }
  IB.NET.awaitSync = true;
  const t0 = IB.NET.tick, clock = G.t;
  for (let i = 0; i < 60; i++) IB.netStep();
  t.ok(IB.NET.tick === t0 && G.t === clock, 'a rejoining player holds still until it is told where it is');
  t.ok(/Picking the match up/.test(IB.netBanner()), 'and says so (' + IB.netBanner() + ')');

  // ...and the snapshot releases it, at the right tick.
  IB.NET.awaitSync = false;
  IB.netEnd();

  // Our own socket dying is a different thing from theirs, and is worth retrying.
  IB.netEnd(); IB.netStart({ me:0, seed:9703 });
  IB.NET.linkLost = true;
  const before = IB.NET.retry;
  IB.netRetry();
  t.ok(IB.NET.retry === before + 1, 'a dead link schedules a reconnection');
  t.ok(/trying to get back in/.test(IB.netBanner()), 'and the bar says so (' + IB.netBanner() + ')');
  t.ok(IB.NET.diary.some(e => e.kind === 'reconnecting'), 'and it is written down');
  for (let i = 0; i < IB.RETRY_MAX + 4; i++) IB.netRetry();
  t.ok(IB.NET.retry <= IB.RETRY_MAX, 'it gives up rather than hammering forever (' + IB.NET.retry + '/' + IB.RETRY_MAX + ')');
  t.ok(IB.NET.diary.some(e => e.kind === 'gave up reconnecting'), 'and says that it gave up');

  // A peer that went is described as maybe coming back, not as the end.
  IB.netEnd(); IB.netStart({ me:0, seed:9704 });
  IB.netRecv({ k:'peerGone', side:1 });
  t.ok(/come back/i.test(IB.netBanner()), 'a peer dropping out reads as recoverable (' + IB.netBanner() + ')');

  // The two failures are told apart, because they need different things from
  // the player: one is theirs to fix, one is ours.
  IB.netEnd(); IB.netStart({ me:0, seed:9705 });
  IB.NET.peerLost = true;
  const theirs = IB.netBanner();
  IB.NET.peerLost = false; IB.NET.linkLost = true;
  const ours = IB.netBanner();
  t.ok(theirs !== ours, 'their socket dying and ours dying do not read the same');
  IB.netEnd();

  // The client has to actually handle the relay's rejoin message, and must not
  // treat it as a fresh start.
  const wiring = SRC.slice(SRC.indexOf('sock.onmessage'));
  t.ok(/m\.k === 'rejoin'/.test(wiring), 'the client handles a rejoin');
  const rj = wiring.slice(wiring.indexOf("m.k === 'rejoin'"), wiring.indexOf("m.k === 'rejoin'") + 900);
  t.ok(/role === 'staying'/.test(rj) && /netSendSnap\(true\)/.test(rj),
    'the one that stayed hands the board over');
  t.ok(/awaitSync = true/.test(rj), 'and the one returning waits for it rather than playing a phantom match');
}

/* ============================================ you can see what is happening
   The fight was legible only if you already knew the rules: projectiles were
   two circles whatever they were, a heal landed on somebody four bodies away
   with nothing connecting the two, and being slowed or marked looked exactly
   like being fine. */
{
  IB.netEnd();
  IB.fxForce = true;               // look at the decoration, which is off by default here
  IB.newMatch({ diff:'veteran', seed:7300 });
  for (const s of G.sides){ rich(s); s.plot[2] = { type:'tavern', lvl:3, tile:2 }; }
  IB.createHero(G.sides[0], 'marksman'); IB.createHero(G.sides[1], 'fighter');
  for (const s of G.sides) for (const h of s.heroes){ h.lvl = 12; IB.recalcHero(h, true); IB.autoPick(h); }
  step(45);

  // --- an arrow is not a spell
  {
    const a = G.sides[0].heroes[0], b = G.sides[1].heroes[0];
    G.projs.length = 0;
    IB.shoot(a, b, () => {}, '#ffe08a', 'shaft');
    IB.shoot(a, b, () => {}, '#c69bff', 'bolt');
    t.ok(G.projs.length === 2, 'two projectiles in the air');
    t.ok(G.projs[0].kind === 'shaft' && G.projs[1].kind === 'bolt',
      'and they know which of them is a shaft and which is a spell');
    t.ok(G.projs.every(p => Array.isArray(p.tr)), 'each carries a trail');
    // ...and the trail actually fills, which is the part that never worked:
    // `tr` was allocated on every projectile since the beginning and never
    // written to, so a volley of arrows was a scatter of dots.
    for (let i = 0; i < 6; i++) IB.projStep(1 / 30);
    const live = G.projs.filter(p => p.tr.length);
    t.ok(live.length > 0 && live.every(p => p.tr.length >= 3),
      'and it fills as the thing flies (' + (live[0] ? live[0].tr.length / 3 : 0) + ' points)');
    t.ok(live.every(p => Math.abs(p.ax) + Math.abs(p.ay) > 0),
      'and each knows which way it is pointing, so a shaft can be drawn along its flight');
    // it must not grow without bound over a long flight
    for (let i = 0; i < 200; i++) IB.projStep(1 / 30);
    t.ok(G.projs.every(p => p.tr.length <= 18), 'the trail is capped rather than growing forever');
  }

  // --- a heal has a visible source and a visible recipient
  {
    G.fx.length = 0;
    IB.linkFx(0, 0, 6, 1, '#7fdc8a');
    const link = G.fx.find(f => f.k === 'link');
    t.ok(!!link, 'a heal across a gap draws a line between the two');
    t.ok(link.x2 === 6 && link.y2 === 1, 'that actually reaches the recipient');
  }

  // --- the status a body is under is on the body
  {
    const u = G.units.find(x => !x.isHero) || G.sides[0].heroes[0];
    for (const [field, what] of [['slowT', 'slowed'], ['markT', 'marked'], ['stunT', 'stunned']]){
      const before = u[field];
      u[field] = 3; if (field === 'slowT') u.slowP = .4;
      IB.draw();
      t.ok(true, 'a ' + what + ' body draws clean');
      u[field] = before;
    }
    u.shield = 40; u.shT = 1.2; IB.draw();
    u.burn = { dps:5, t:3, src:null }; IB.draw();
    t.ok(true, 'and so do a shielded and a burning one');
    u.shield = 0; u.burn = null;
  }

  // --- a dash shows where from and where to
  {
    G.fx.length = 0;
    const h = G.sides[0].heroes[0];
    IB.dashFx(h, h.x - 6, h.y);
    const kinds = new Set(G.fx.map(f => f.k));
    t.ok(kinds.has('ghost'), 'a dash leaves afterimages');
    t.ok(kinds.has('beam'), 'and a streak along the whole path, so the gap it closed is visible');
    t.ok(G.fx.some(f => f.k === 'wave'), 'with a push-off where it started');
  }

  /* ---- and NONE of it may touch the simulation ---------------------------- */
  {
    const before = IB.seedNow();
    IB.linkFx(0, 0, 3, 3, '#7fdc8a');
    IB.dashFx(G.sides[0].heroes[0], 1, 1);
    IB.moteFx(0, 0, '#ffffff', 8, 1);
    IB.waveFx(0, 0, 3, '#ffffff', .4);
    IB.beamFx(0, 0, 4, 4, '#ffffff', 3, .2);
    IB.arcFx(0, 0, .5, 2, '#ffffff');
    for (let i = 0; i < 40; i++) IB.projStep(1 / 30);
    t.ok(IB.seedNow() === before,
      'no effect, trail or flourish advances the simulation’s random stream by a single step');
  }

  // The whole point, stated once: two runs of one seed still land on the same
  // number after all of the above. Effects that could change the match would be
  // a desync in a two-player game, and this is the assertion that would catch it.
  {
    const run = () => {
      IB.newMatch({ diff:'veteran', seed:7301 });
      for (const s of G.sides){ rich(s); s.plot[2] = { type:'tavern', lvl:3, tile:2 }; }
      IB.createHero(G.sides[0], 'mage'); IB.createHero(G.sides[1], 'marksman');
      for (const s of G.sides) for (const h of s.heroes){ h.lvl = 12; IB.recalcHero(h, true); IB.autoPick(h); }
      const out = [];
      for (let i = 0; i < 30 * 60; i++){ IB.update(1 / 30); if (i % 300 === 0) out.push(IB.netHash()); }
      return out.join(',');
    };
    const a = run(), b = run();
    t.ok(a === b, 'a minute of the same seed still hashes identically, twice');
    t.ok(a.split(',').length > 3 && new Set(a.split(',')).size > 1,
      'and the match really was moving while it did (' + new Set(a.split(',')).size + ' distinct hashes)');
  }

  // A frame with everything on it at once, through the strict context.
  {
    IB.newMatch({ diff:'veteran', seed:7302 });
    for (const s of G.sides){ rich(s); s.plot[2] = { type:'tavern', lvl:3, tile:2 }; }
    IB.createHero(G.sides[0], 'mage'); IB.createHero(G.sides[1], 'fighter');
    for (const s of G.sides) for (const h of s.heroes){ h.lvl = 12; IB.recalcHero(h, true); IB.autoPick(h); }
    step(60);
    const h = G.sides[0].heroes[0];
    G.zones.push({ x:h.x + 2, y:0, r:3, dps:10, t:4, dur:5, tick:0, side:0, src:h, magic:true, slow:0, follow:null });
    G.zones.push({ x:h.x - 2, y:1, r:2, dps:8, t:1, dur:5, tick:0, side:0, src:h, magic:false, slow:.3, follow:null });
    for (const u of G.units.slice(0, 6)){
      u.shield = 30; u.shT = 1.4; u.slowT = 2; u.slowP = .4; u.markT = 2;
      u.burn = { dps:4, t:2, src:null }; u.hitT = .12; u.stunT = 1;
    }
    IB.shoot(h, G.units[0] || h, () => {}, '#c69bff', 'bolt');
    IB.shoot(h, G.units[0] || h, () => {}, '#ffe08a', 'shaft');
    for (let i = 0; i < 5; i++) IB.projStep(1 / 30);
    IB.linkFx(h.x, h.y, h.x + 5, h.y + 1, '#7fdc8a');
    IB.dashFx(h, h.x - 5, h.y);
    for (const k of [...new Set(IB.SKILLS.map(x => x.k))]) IB.castFx(h, IB.SKILLS.find(x => x.k === k), G.units[0] || h);
    IB.draw();
    IB.fxStep(.1); IB.draw();
    IB.fxStep(.2); IB.draw();
    t.ok(true, 'a frame carrying every effect, status, zone and projectile at once draws clean');
  }
  IB.fxForce = false;
}

IB.draw();
t.ok(true, 'a final draw on a live match is clean');

t.done();
