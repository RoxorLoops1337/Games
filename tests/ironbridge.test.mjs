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

function loadGame(store){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'ironbridge', 'index.html'), 'utf8');
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
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop: (_pos, col) => stopCheck(col) });
    if (k === 'measureText') return () => ({ width: 24 });
    if (k === 'canvas') return { width: 900, height: 520 };
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
}
{
  const ids = new Set(IB.SKILLS.map(s => s.id));
  t.ok(ids.size === IB.SKILLS.length, 'every skill id is unique');
  const kinds = new Set(['strike','bolt','nova','dash','heal','shield','buff','teambuff','regen','dot','summon','chain','volley','mark','taunt','storm','teamheal']);
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

/* ---------------------------------------------------------------- economy */
{
  const s = P();
  t.ok(IB.workerCount(s) === 4 && s.workers.idle === 4, 'you open with four idle workers');
  t.ok(IB.popCap(s) === C.POP_BASE + C.POP_PER_FARM, 'the starting farm has already raised the population cap');
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
  IB.newMatch({ diff:'veteran', seed:101 });
  t.ok(IB.scatterCache[0] === null, 'and it is dropped again on the next match');
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

IB.draw();
t.ok(true, 'a final draw on a live match is clean');

t.done();
