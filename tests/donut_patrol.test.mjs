// Donut Patrol — headless brawler suite.
//
// donut_patrol/index.html is one self-contained file: markup, CSS and a
// couple of inline <script> blocks that share a scope.  This harness joins
// the blocks, stubs a DOM plus a no-op 2d context, injects a test-only
// expose hook (never shipped) and evals the result — then drives the real
// combat, launches, gas, arrests, waves and flow through the game's own
// code.  draw() is exercised in every phase and on every fighter state, so
// render-time mistakes fail here instead of on somebody's phone.
// Run: node tests/donut_patrol.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'donut_patrol', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg){ if (Math.abs(a - b) > eps) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`); }

const BOOT_TAIL = `loadSave();
makeDolls();
buildPicker();
buildWorld();
bindInput();
bindUI();
fit();
syncMute();
toTitle();
requestAnimationFrame(loop);`;

const EXPOSE = `__out.api = {
  G, cam, W, INPUT, KEYS, EDGE, TOUCH, STICK, COPS, FARMERS, FARMER_KEYS, ATK, WAVES, RANKS,
  VW, VH, STEP, GROUND_TOP, GROUND_BOT, GROUND_MID, BODY_H, SAVE_KEY, MAX_ACTIVE, ARENA_W, SEG_W,
  FARM_SKINS, COP_SKIN, SLOGANS, FARMER_YELLS, COP_YELLS, INTRO, BACKUP, MUSIC, RIG, PALETTE,
  get fighters(){ return fighters; }, set fighters(v){ fighters = v; },
  get players(){ return players; },
  get items(){ return items; }, set items(v){ items = v; },
  get fx(){ return fx; }, get clouds(){ return clouds; }, get shouts(){ return shouts; },
  get props(){ return props; }, get crowd(){ return crowd; },
  getT: () => T, setT: (v) => { T = v; },
  reseed, rng, clamp, lerp, sign, depthScale, shade, rankFor,
  mkFighter, spawnPlayer, spawnFarmer, mkProp, buildWorld, arenaX0, arenaX1,
  startAttack, attackTick, applyHit, launchBody, knockOut, bowlThrough, makeDizzy, hitProps,
  updateFighter, playerTick, aiTick, separate, findCuffTarget, doArrest, callBackup, backupTick,
  throwCanister, throwWelly, mkCloud, cloudTick, itemTick, takeItem, dropItem, spawnFx, fxTick,
  startRun, startWave, waveTick, waveClear, spawnNext, rollType, betweenTick, introTick, setPhase,
  addScore, addCombo, gainMeter, cameraTick, propsTick, timersTick, update, draw, drawHUD, drawFighter,
  poseFor, rigGeom, basePose, poseIdle, poseWalk, poseHurt, poseLaunch, poseDown, poseGetUp,
  poseDizzy, poseCuffed, poseSwing, poseCharge, poseLob, poseCuffMove, poseFarmSwing, poseCough,
  loadSave, writeSave, toTitle, beginGame, togglePause, showOver, fit, pollInput, isDown, canAct,
  attackTokens, drawPickers, TAP, KEYMAP, bindInput, get DOLLS(){ return DOLLS; },
};
`;

function makeSandbox(opts){
  opts = opts || {};
  const counts = {};
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, {
    get(t, p){
      if (p === 'measureText') return () => ({ width: 30 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      if (p === 'canvas') return { width: 640, height: 360 };
      if (typeof p === 'string' && p !== 'then' && !(p in t))
        return () => { counts[p] = (counts[p] || 0) + 1; };
      return t[p];
    },
    set(t, p, v){ t[p] = v; return true; },
  });
  const mkEl = () => {
    const e = {
      style: {}, textContent: '', innerHTML: '', width: 0, height: 0, className: '', dataset: {},
      getContext: () => ctxStub,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 120 }),
      addEventListener(){}, removeEventListener(){}, removeAttribute(){}, setAttribute(){},
      querySelectorAll: () => [], querySelector: () => null, appendChild(){},
      classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    };
    return e;
  };
  const nodes = {};
  const store = Object.assign({}, opts.store || {});
  const sandbox = {
    document: {
      documentElement: mkEl(),
      getElementById: (id) => (nodes[id] || (nodes[id] = mkEl())),
      createElement: () => mkEl(),
      querySelectorAll: () => [],
      addEventListener(){},
    },
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener(){} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    requestAnimationFrame: () => {},
    __out: {},
  };
  return { sandbox, store, counts, nodes };
}

let SRC = null;
function source(){
  if (SRC) return SRC;
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error('no inline script found in the game');
  const src = blocks.join('\n');
  if (!src.includes(BOOT_TAIL)) throw new Error('boot tail anchor missing from game script');
  SRC = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  return SRC;
}

function boot(opts){
  const { sandbox, store, counts } = makeSandbox(opts);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', '__out', source())(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined, sandbox.requestAnimationFrame, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  api._counts = counts;
  api._resetCounts = () => { for (const k in counts) delete counts[k]; };
  api.reseed(4242);
  return api;
}

const step = (api, secs) => { const n = Math.round(secs / api.STEP); for (let i = 0; i < n; i++) api.update(api.STEP); };
function stepFighter(api, f, secs){
  const n = Math.round(secs / api.STEP);
  for (let i = 0; i < n; i++) api.updateFighter(f, api.STEP);
}

/* Drops straight into a live wave with the intro skipped. */
function play(api, wave, cop){
  api.G.cop = cop == null ? 0 : cop;
  api.startRun();
  api.G.phase = 'play';
  api.INTRO.done = true;
  api.startWave(wave || 0);
  api.cam.x = api.cam.tx = api.arenaX0(wave || 0);   // no pan, the fight starts here
  const p = api.players[0];
  p.hidden = false;
  p.x = api.arenaX0(wave || 0) + 200;
  p.y = api.GROUND_MID;
  return p;
}

/* Clears the tarmac so a test owns the field. */
function clearField(api){
  api.fighters = api.players.slice();
  api.items = [];
  api.W.running = false;
  api.W.spawned = api.W.total;
}

/* ------------------------------------------------------------------ boot */
test('boots to the title screen without throwing', () => {
  const api = boot();
  assert(api.G.phase === 'title', 'phase should be title, got ' + api.G.phase);
  assert(api.WAVES.length === 10, 'ten waves');
  assert(api.players.length === 0, 'no officer on the road before the shift starts');
  assert(api.props.length > 40, 'the road got dressed: ' + api.props.length + ' props');
  assert(api.crowd.length > 200, 'and a crowd turned up: ' + api.crowd.length);
});

test('the waves ramp exactly the way the briefing promised', () => {
  const api = boot();
  const counts = api.WAVES.map((w) => w.n);
  assert(JSON.stringify(counts) === JSON.stringify([1, 3, 5, 10, 20, 50, 100, 200, 500, 1000]),
    'wave sizes are ' + counts.join(','));
  for (const w of api.WAVES){
    assert(w.name && w.sub, 'every wave is announced');
    assert(w.cap >= 1 && w.cap <= api.MAX_ACTIVE, w.name + ' cap out of range: ' + w.cap);
  }
  for (let i = 1; i < api.WAVES.length; i++){
    assert(api.WAVES[i].cap >= api.WAVES[i - 1].cap, 'caps never shrink');
    assert(api.WAVES[i].gap <= api.WAVES[i - 1].gap, 'they arrive faster each wave');
  }
});

test('both officers are playable and actually different', () => {
  const api = boot();
  assert(api.COPS.length === 2, 'a fat one and a thin one');
  const [a, b] = api.COPS;
  assert(a.hp > b.hp, 'the big one has more to lose');
  assert(b.spd > a.spd, 'the thin one is quicker');
  assert(b.reach > a.reach, 'and has longer arms');
  assert(b.chain > a.chain, 'with a longer combo');
  assert(a.dmg > b.dmg, 'the big one hits harder');
  for (const c of api.COPS){
    assert(c.bars.length === 3 && c.bars.every((v) => v > 0 && v <= 1), c.name + ' stat bars');
    assert(c.build && c.build.size > 0, c.name + ' needs a build');
    assert(c.gas >= 2, c.name + ' carries gas');
  }
});

/* ------------------------------------------------------------- data tables */
test('every attack entry is internally consistent', () => {
  const api = boot();
  for (const k in api.ATK){
    const a = api.ATK[k];
    assert(a.dur > 0, k + ' needs a duration');
    assert(a.hit[0] <= a.hit[1], k + ' hit window runs forward');
    assert(a.hit[1] <= a.dur + 1e-9, k + ' hit window ends inside the move');
    if (a.dmg > 0){ assert(a.reach > 0 && a.band > 0, k + ' needs reach and a depth band'); }
    if (a.throwAt != null) assert(a.throwAt < a.dur, k + ' throws before it ends');
    assert(['swing', 'lob', 'cuff', 'charge', 'chop', 'poke'].includes(a.pose), k + ' has a real pose: ' + a.pose);
  }
});

test('every farmer type references a real attack and can be spawned', () => {
  const api = boot();
  play(api); clearField(api);
  for (const k of api.FARMER_KEYS){
    const d = api.FARMERS[k];
    assert(api.ATK[d.atk], k + ' references a missing attack: ' + d.atk);
    assert(d.hp > 0 && d.spd > 0 && d.weight > 0 && d.score > 0, k + ' needs sane stats');
    const f = api.spawnFarmer(k, 100, api.GROUND_MID, {});
    assert(f.hp === d.hp, k + ' spawns at full health');
    assert(f.pal && f.pal.skin, k + ' got a palette');
    assert(f.weapon === d.weapon, k + ' holds its own tool');
  }
});

test('the roll favours farmhands early and the heavy mob late', () => {
  const api = boot();
  const sample = (wave) => {
    const seen = {};
    api.reseed(999);
    for (let i = 0; i < 400; i++){ const k = api.rollType(wave); seen[k] = (seen[k] || 0) + 1; }
    return seen;
  };
  const early = sample(0), late = sample(9);
  assert(!early.big && !early.pick, 'no heavies in the first wave');
  assert((late.big || 0) > 0 && (late.pick || 0) > 0, 'the last wave brings out the big units');
  assert((early.mob || 0) / 400 > 0.5, 'wave one is mostly plain farmhands');
  assert((late.mob || 0) < (early.mob || 0), 'and the mix widens later');
});

/* -------------------------------------------------------------- the rig */
test('no pose anywhere leaves the head off the body', () => {
  const api = boot();
  const f = api.mkFighter('farmer', 0, api.GROUND_MID, {});
  const poses = {
    idle: api.poseIdle(f, 1), walk: api.poseWalk(f, 1, 1), hurt0: api.poseHurt(f, 0), hurt1: api.poseHurt(f, 1),
    launch: api.poseLaunch(f, 1), down: api.poseDown(f, 1), getup0: api.poseGetUp(f, 0), getup1: api.poseGetUp(f, 1),
    dizzy: api.poseDizzy(f, 1), cuffed: api.poseCuffed(f, 1), cough: api.poseCough(f, 1),
    charge: api.poseCharge(f, 1), lob0: api.poseLob(f, 0), lob1: api.poseLob(f, 1),
    cuffMove: api.poseCuffMove(f, 0.5), swing0: api.poseSwing(f, 0), swing5: api.poseSwing(f, 0.5),
    swing9: api.poseSwing(f, 0.9), chop: api.poseFarmSwing(f, 0.5, 'chop'), poke: api.poseFarmSwing(f, 0.5, 'poke'),
  };
  for (const name in poses){
    const g = api.rigGeom(poses[name], { torso: 1, arm: 1, leg: 1 });
    const d = Math.hypot(g.head[0] - g.sh[0], g.head[1] - g.sh[1]);
    assert(d <= 14, `${name}: head floats ${d.toFixed(1)} from the shoulder`);
    assert(g.hip[1] > 0, `${name}: hips below the tarmac`);
    for (const limb of ['la', 'ra', 'll', 'rl']){
      const e = g[limb].e;
      assert(Number.isFinite(e[0]) && Number.isFinite(e[1]), `${name}: ${limb} went to NaN`);
      assert(Math.hypot(e[0], e[1]) < 60, `${name}: ${limb} stretched to ${Math.hypot(e[0], e[1]).toFixed(1)}`);
    }
  }
});

test('a body on the tarmac lies down instead of standing there', () => {
  const api = boot();
  const f = api.mkFighter('farmer', 0, api.GROUND_MID, {});
  const down = api.rigGeom(api.poseDown(f, 1), { torso: 1, arm: 1, leg: 1 });
  const stand = api.rigGeom(api.poseIdle(f, 1), { torso: 1, arm: 1, leg: 1 });
  assert(down.hip[1] < stand.hip[1] * 0.6, 'the hips drop when they go down');
  assert(Math.abs(api.poseDown(f, 1).rot) > 1.2, 'and the whole body rotates flat');
  assert(stand.sh[1] - stand.hip[1] > 10, 'a standing pose still stands');
});

test('the flinch throws the head backwards, then returns it', () => {
  const api = boot();
  const f = api.mkFighter('farmer', 0, api.GROUND_MID, {});
  const hit = api.poseHurt(f, 0), settled = api.poseHurt(f, 1);
  assert(hit.headX < -3, 'head snaps back on contact: ' + hit.headX);
  assert(hit.lean < -0.2, 'and the torso follows it');
  near(settled.headX, 0, 0.35, 'the flinch resolves back to neutral');
});

test('depth scaling keeps the back of the road smaller than the front', () => {
  const api = boot();
  assert(api.depthScale(api.GROUND_TOP) < api.depthScale(api.GROUND_BOT), 'perspective is the wrong way round');
  assert(api.depthScale(api.GROUND_TOP) > 0.8 && api.depthScale(api.GROUND_BOT) < 1.6, 'and stays sane');
});

/* -------------------------------------------------------------- combat */
test('a baton tap damages, staggers and does not launch', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const e = api.spawnFarmer('mob', 218, api.GROUND_MID, {});
  e.hp = e.hpMax = 60;                        // a farmer sturdy enough to see the stagger
  const hp0 = e.hp;
  api.startAttack(p, 'baton1');
  stepFighter(api, p, 0.3);
  assert(e.hp < hp0, 'the swing should land: ' + hp0 + ' -> ' + e.hp);
  assert(e.state === 'hurt' || e.state === 'idle', 'it staggers them, got ' + e.state);
  assert(e.state !== 'launch', 'a tap does not launch');
  assert(e.vx > 0, 'and pushes them away from the officer');
});

test('the combo finisher launches them into the air', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const e = api.spawnFarmer('fork', 218, api.GROUND_MID, {});
  e.hp = e.hpMax = 999;                       // survive the hit so we see the launch
  api.startAttack(p, 'batonX');
  stepFighter(api, p, 0.5);
  assert(e.state === 'launch', 'the finisher launches, got ' + e.state);
  assert(e.vz > 100, 'upward: ' + e.vz);
  assert(e.vx > 250, 'and hard backwards: ' + e.vx);
});

test('the chain runs three swings for the big one and four for the thin one', () => {
  const api = boot();
  for (const cop of [0, 1]){
    const p = play(api, 0, cop); clearField(api);
    p.x = 200; p.face = 1;
    const names = [];
    for (let i = 0; i < p.C.chain + 1; i++){
      api.EDGE.baton = true; api.INPUT.baton = 1;
      api.playerTick(p, api.STEP);
      names.push(p.atkName);
      p.state = 'idle'; p.atk = null;
      api.EDGE.baton = false;
    }
    const finisher = names.indexOf('batonX');
    assert(finisher === p.C.chain - 1, p.C.name + ' finisher lands on swing ' + (finisher + 1) + ' of ' + p.C.chain);
    assert(names[p.C.chain] === 'baton1', p.C.name + ' loops back to the first swing');
  }
});

test('a launched farmer bowls through the ones behind him', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const flyer = api.spawnFarmer('mob', 210, api.GROUND_MID, {});
  flyer.hp = flyer.hpMax = 999;
  const behind = [];
  for (let i = 0; i < 4; i++){
    const o = api.spawnFarmer('mob', 250 + i * 22, api.GROUND_MID, {});
    o.hp = o.hpMax = 999;
    o.entry = null;
    behind.push(o);
  }
  api.launchBody(flyer, 1, 200, 420);
  for (let i = 0; i < 60; i++) api.updateFighter(flyer, api.STEP);
  const knocked = behind.filter((o) => o.state === 'launch' || o.hp < 999 || Math.abs(o.vx) > 40);
  assert(knocked.length >= 2, 'a flying farmer should take out the crowd behind him, hit ' + knocked.length);
});

test('the officer takes damage, and running out of health ends the shift', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID;
  const e = api.spawnFarmer('pick', 214, api.GROUND_MID, {});
  e.face = -1; e.x = p.x + 14;
  const hp0 = p.hp;
  api.applyHit(e, p, api.ATK.chop, { dir: -1 });
  assert(p.hp < hp0, 'the pickaxe hurts: ' + hp0 + ' -> ' + p.hp);
  assert(p.state === 'hurt', 'and staggers the officer');
  p.hp = 1;
  p.invuln = 0;
  api.applyHit(e, p, api.ATK.chop, { dir: -1 });
  assert(p.hp === 0, 'health floors at zero');
  assert(api.G.phase === 'over', 'and the shift ends, got ' + api.G.phase);
});

test('a charge bowls a whole lane over in one go', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const line = [];
  for (let i = 0; i < 5; i++) line.push(api.spawnFarmer('mob', 214 + i * 15, api.GROUND_MID, {}));
  api.EDGE.charge = true; api.INPUT.charge = 1;
  api.playerTick(p, api.STEP);
  api.EDGE.charge = false;
  assert(p.state === 'charge', 'the charge starts, got ' + p.state);
  for (let i = 0; i < 40; i++){ api.playerTick(p, api.STEP); api.updateFighter(p, api.STEP); }
  const hit = line.filter((o) => o.dead || o.state === 'launch' || o.hp < o.hpMax);
  assert(hit.length >= 2, 'the charge should catch several, caught ' + hit.length);
});

/* ----------------------------------------------------------------- gas */
test('a gas canister lands, blooms and makes the crowd cough', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const gas0 = p.gas;
  api.EDGE.gas = true; api.INPUT.gas = 1;
  api.playerTick(p, api.STEP);
  api.EDGE.gas = false; api.INPUT.gas = 0;
  assert(p.gas === gas0 - 1, 'a canister comes off the belt');
  assert(p.state === 'attack' && p.atkName === 'lob', 'and the officer lobs it');
  stepFighter(api, p, 0.5);
  assert(api.items.some((i) => i.kind === 'canister'), 'the canister is in the air');
  const victims = [];
  for (let i = 0; i < 6; i++) victims.push(api.spawnFarmer('mob', 290 + i * 10, api.GROUND_MID, { hpScale: 1 }));
  for (const v of victims){ v.entry = null; v.baseSpd = 0; }
  step(api, 3.0);
  assert(api.clouds.length > 0 || victims.some((v) => v.dead), 'a cloud formed');
  const affected = victims.filter((v) => v.dead || v.hp < v.hpMax || v.state === 'cough');
  assert(affected.length >= 3, 'the cloud should catch a crowd, caught ' + affected.length);
});

test('the gas belt runs dry and refills from a pickup', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.gas = 0;
  api.EDGE.gas = true; api.INPUT.gas = 1;
  api.playerTick(p, api.STEP);
  assert(p.state !== 'attack', 'an empty belt throws nothing');
  api.takeItem(p, 'gasammo');
  assert(p.gas === 1, 'a pickup tops it back up');
  for (let i = 0; i < 20; i++) api.takeItem(p, 'gasammo');
  assert(p.gas === p.gasMax, 'and it never overfills: ' + p.gas);
});

/* ------------------------------------------------------------- arrests */
test('a dizzy farmer can be cuffed, and it pays better than a beating', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const e = api.spawnFarmer('mob', 214, api.GROUND_MID, {});
  e.entry = null;
  api.makeDizzy(e, 4);
  assert(api.findCuffTarget(p) === e, 'a woozy farmer is cuffable');
  const score0 = api.G.score, meter0 = p.meter;
  api.EDGE.cuff = true; api.INPUT.cuff = 1;
  api.playerTick(p, api.STEP);
  api.EDGE.cuff = false;
  stepFighter(api, p, 0.6);
  assert(e.state === 'cuffed', 'they get cuffed, state ' + e.state);
  assert(e.arrested && e.dead, 'and are out of the fight');
  assert(api.G.arrests === 1, 'the arrest is counted');
  assert(api.G.score > score0 + 100, 'arrests pay: +' + (api.G.score - score0));
  assert(p.meter > meter0, 'and fill the siren');
});

test('cuffing thin air is a shove, not an arrest', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.y = api.GROUND_MID; p.face = 1;
  const e = api.spawnFarmer('big', 216, api.GROUND_MID, {});
  e.entry = null;
  assert(api.findCuffTarget(p) === null, 'a fresh big unit is not cuffable');
  api.startAttack(p, 'cuff');
  p.cuffTarget = api.findCuffTarget(p);
  stepFighter(api, p, 0.6);
  assert(!e.arrested, 'nobody was cuffed');
  assert(e.vx > 0, 'but they got shoved: ' + e.vx);
  assert(api.G.arrests === 0, 'and no arrest was recorded');
});

test('a cuffed farmer is led away and stops existing', () => {
  const api = boot();
  const p = play(api); clearField(api);
  const e = api.spawnFarmer('mob', 214, api.GROUND_MID, {});
  e.entry = null;
  api.doArrest(p, e);
  stepFighter(api, e, 3.0);
  assert(e.gone, 'the arrested farmer leaves the road');
});

/* ---------------------------------------------------------------- items */
test('donuts heal, and the big officer gets more out of them', () => {
  const api = boot();
  const thin = play(api, 0, 1); clearField(api);
  thin.hp = 10;
  api.takeItem(thin, 'donut');
  const thinGain = thin.hp - 10;
  const fat = play(api, 0, 0); clearField(api);
  fat.hp = 10;
  api.takeItem(fat, 'donut');
  const fatGain = fat.hp - 10;
  assert(thinGain > 0 && fatGain > thinGain, 'the donut lover heals more: ' + fatGain + ' vs ' + thinGain);
  fat.hp = fat.hpMax - 1;
  api.takeItem(fat, 'donut');
  assert(fat.hp === fat.hpMax, 'and healing never overshoots');
});

test('coffee makes the officer quicker for a while', () => {
  const api = boot();
  const p = play(api); clearField(api);
  api.takeItem(p, 'coffee');
  assert(p.speedT > 5, 'the boost has a timer: ' + p.speedT);
  api.INPUT.x = 1;
  for (let i = 0; i < 25; i++) { api.playerTick(p, api.STEP); api.updateFighter(p, api.STEP); }
  const fast = Math.abs(p.vx);
  p.speedT = 0; p.vx = 0;
  for (let i = 0; i < 25; i++) { api.playerTick(p, api.STEP); api.updateFighter(p, api.STEP); }
  assert(fast > Math.abs(p.vx) + 5, 'caffeinated is faster: ' + fast.toFixed(0) + ' vs ' + Math.abs(p.vx).toFixed(0));
  api.INPUT.x = 0;
});

test('a crate breaks open and spills snacks', () => {
  const api = boot();
  const p = play(api); clearField(api);
  const crate = api.props.find((q) => q.kind === 'crate');
  assert(crate, 'there is a crate on the road');
  crate.x = p.x + 16; crate.y = p.y;
  p.face = 1;
  for (let i = 0; i < 6 && !crate.broken; i++){
    api.startAttack(p, 'baton1');
    stepFighter(api, p, 0.32);
  }
  assert(crate.broken, 'the crate gives up after a few swings');
  assert(api.items.some((i) => i.pickup), 'and drops something worth eating');
});

/* ---------------------------------------------------------------- waves */
test('a wave streams farmers in without ever exceeding its cap', () => {
  const api = boot();
  play(api, 4);                                   // 20 farmers, cap 12
  const w = api.WAVES[4];
  let peak = 0;
  for (let i = 0; i < 60 * 25; i++){
    api.update(api.STEP);
    const live = api.fighters.filter((f) => f.kind === 'farmer' && !f.dead).length;
    if (live > peak) peak = live;
    if (api.W.spawned >= api.W.total) break;
  }
  assert(api.W.spawned <= w.n, 'never spawns more than the wave holds: ' + api.W.spawned);
  assert(peak <= w.cap + 1, 'and never exceeds the on-screen cap: ' + peak + ' vs ' + w.cap);
  assert(api.W.spawned > 1, 'but it does actually spawn: ' + api.W.spawned);
});

test('a wave does not clear on the frame its last farmer arrives', () => {
  const api = boot();
  play(api, 0);                                   // one farmer, cap one
  let sawSpawn = false;
  for (let i = 0; i < 60 * 6; i++){
    api.update(api.STEP);
    if (api.W.spawned === 1) sawSpawn = true;
    if (sawSpawn) break;
  }
  assert(sawSpawn, 'the lone farmer turned up');
  assert(api.G.phase === 'play', 'and the wave is still running, got ' + api.G.phase);
  assert(api.W.down === 0, 'nobody has gone down yet');
  const f = api.fighters.find((q) => q.kind === 'farmer');
  api.knockOut(f, 1);
  api.fighters = api.fighters.filter((q) => q.kind === 'cop');
  api.update(api.STEP);
  assert(api.G.phase === 'between', 'and it clears once he is actually down');
});

test('the thousand-farmer wave really is a thousand farmers', () => {
  const api = boot();
  play(api, 9);
  assert(api.W.total === 1000, 'wave ten total: ' + api.W.total);
  assert(api.W.cap <= api.MAX_ACTIVE, 'streamed through a cap of ' + api.W.cap);
  for (let i = 0; i < 600; i++) api.update(api.STEP);
  const live = api.fighters.filter((f) => f.kind === 'farmer' && !f.dead).length;
  assert(live <= api.MAX_ACTIVE + 2, 'the road holds ' + live + ' at once, not a thousand');
  assert(api.W.spawned > 10, 'and they keep coming: ' + api.W.spawned);
});

test('clearing a wave opens the barricade and walking on starts the next', () => {
  const api = boot();
  const p = play(api, 0);
  api.W.spawned = api.W.total;
  api.fighters = api.fighters.filter((f) => f.kind === 'cop');
  api.update(api.STEP);
  assert(api.G.phase === 'between', 'the arena unlocks, got ' + api.G.phase);
  assert(api.cam.lock === null, 'and the camera comes off its leash');
  assert(api.props.some((q) => q.gate === 0 && q.opening), 'the tractors pull aside');
  p.x = api.arenaX0(1) + 90;
  api.betweenTick(api.STEP);
  assert(api.G.phase === 'play' && api.W.i === 1, 'walking up the road starts wave two');
  assert(api.cam.lock === api.arenaX0(1), 'and the camera locks to the new arena');
});

test('the officer cannot walk out of the arena mid-wave', () => {
  const api = boot();
  const p = play(api, 2);
  const x0 = api.arenaX0(2);
  p.x = x0 + 400; p.vx = 2000;
  for (let i = 0; i < 120; i++) api.updateFighter(p, api.STEP);
  assert(p.x <= x0 + api.ARENA_W, 'held inside the barricade: ' + (p.x - x0).toFixed(0));
  p.vx = -2000;
  for (let i = 0; i < 120; i++) api.updateFighter(p, api.STEP);
  assert(p.x >= x0, 'and inside the back edge too: ' + (p.x - x0).toFixed(0));
});

test('farmers walk out of the standing crowd, thinning the verge', () => {
  const api = boot();
  play(api, 3);
  const used0 = api.crowd.filter((c) => c.used).length;
  for (let i = 0; i < 40; i++) api.spawnNext();
  const used1 = api.crowd.filter((c) => c.used).length;
  assert(used1 > used0, 'the crowd loses bodies as they join in: ' + used0 + ' -> ' + used1);
  const onRoad = api.fighters.filter((f) => f.kind === 'farmer');
  assert(onRoad.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y)), 'all of them land somewhere real');
});

test('the whole shift can be fought to the end without breaking', () => {
  const api = boot();
  const p = play(api, 0);
  p.hp = 1e6; p.hpMax = 1e6;
  let guard = 0;
  while (api.G.phase !== 'win' && guard++ < 40){
    /* fast-forward each wave: everyone spawned, everyone down */
    api.W.spawned = api.W.total;
    api.fighters = api.fighters.filter((f) => f.kind === 'cop');
    api.update(api.STEP);
    if (api.G.phase === 'between'){
      p.x = api.arenaX0(api.W.i + 1) + 90;
      api.betweenTick(api.STEP);
    } else {
      for (let i = 0; i < 200; i++) api.update(api.STEP);   // let the win timer run
    }
  }
  assert(api.G.phase === 'win', 'the road gets cleared, phase ' + api.G.phase);
  assert(api.G.score > 0, 'and the shift is scored');
});

/* ----------------------------------------------------------------- flow */
test('the intro drives the car in and drops the officer off', () => {
  const api = boot();
  api.startRun();
  assert(api.G.phase === 'intro', 'the shift opens with the car');
  assert(api.players[0].hidden, 'the officer is still inside it');
  for (let i = 0; i < 60 * 6; i++){
    api.update(api.STEP);
    if (api.G.phase === 'play') break;
  }
  assert(api.G.phase === 'play', 'and the first wave starts, got ' + api.G.phase);
  assert(!api.players[0].hidden, 'with the officer out on the tarmac');
  assert(api.INTRO.car.out, 'the car has stopped');
});

test('backup empties the meter and clears the road', () => {
  const api = boot();
  const p = play(api, 5); clearField(api);
  const mob = [];
  for (let i = 0; i < 6; i++){
    const f = api.spawnFarmer('mob', api.cam.x + 120 + i * 24, api.GROUND_BOT - 12, {});
    f.entry = null; f.hp = f.hpMax = 20;
    mob.push(f);
  }
  p.meter = p.meterMax;
  api.callBackup(p);
  assert(p.meter === 0, 'the siren is spent');
  assert(api.BACKUP.on, 'and the car is on its way');
  for (let i = 0; i < 60 * 4 && api.BACKUP.on; i++) api.update(api.STEP);
  const flattened = mob.filter((f) => f.dead || f.state === 'launch' || f.hp < 20);
  assert(flattened.length >= 4, 'backup should flatten the lane, got ' + flattened.length);
  assert(!api.BACKUP.on, 'and drive off the far end');
});

test('the combo counter builds on hits and lapses when you stop', () => {
  const api = boot();
  const p = play(api); clearField(api);
  p.x = 200; p.face = 1;
  for (let i = 0; i < 5; i++){
    const e = api.spawnFarmer('mob', 216, api.GROUND_MID, {});
    e.entry = null; e.hp = e.hpMax = 999;
    api.startAttack(p, 'baton1');
    stepFighter(api, p, 0.32);
  }
  assert(api.G.combo >= 5, 'five swings, five hits: ' + api.G.combo);
  assert(api.G.comboBest >= 5, 'the best combo is remembered');
  step(api, 3);
  assert(api.G.combo === 0, 'and it lapses when the officer stops');
});

test('score, rank and the saved best all agree', () => {
  const api = boot();
  play(api);
  assert(api.rankFor(1e6)[1] === 'S', 'a huge score is an S');
  assert(api.rankFor(0)[1] === 'D', 'nothing at all is a D');
  for (let i = 1; i < api.RANKS.length; i++) assert(api.RANKS[i - 1][0] > api.RANKS[i][0], 'rank thresholds descend');
  api.G.score = 12345;
  api.setPhase('over');
  assert(api.G.best === 12345, 'the best score is kept: ' + api.G.best);
  assert(JSON.parse(api._store[api.SAVE_KEY]).best === 12345, 'and written to the save');
});

test('a fresh session reads the previous best back', () => {
  const api = boot({ store: { donut_patrol_v1: JSON.stringify({ best: 4242, cop: 1, muted: true, seen: true }) } });
  assert(api.G.best === 4242, 'best score restored');
  assert(api.G.cop === 1, 'and the chosen officer');
  assert(api.G.muted === true, 'and the sound setting');
});

test('a corrupt save is survivable', () => {
  const api = boot({ store: { donut_patrol_v1: '{{{not json' } });
  assert(api.G.best === 0, 'falls back to a fresh shift');
  assert(api.G.phase === 'title', 'and still boots');
});

test('a tap that starts and ends between two polls still swings', () => {
  const api = boot();
  play(api);
  api.pollInput();                       // clear anything latched at boot
  api.TAP.baton = 1;                     // what a keydown does
  api.KEYS.baton = 0;                    // ...and the keyup already happened
  api.pollInput();
  assert(api.EDGE.baton === true, 'the swing survives a frame-straddling tap');
  api.pollInput();
  assert(api.EDGE.baton === false, 'and it only counts once');
  assert(api.TAP.baton === 0, 'the latch is cleared after it is read');
});

/* ------------------------------------------------------------- rendering */
test('draw() survives every phase', () => {
  const api = boot();
  api.draw();                                  // title / attract
  api.startRun();
  api.draw();                                  // intro
  play(api, 6);
  for (let i = 0; i < 30; i++) api.spawnNext();
  step(api, 2);
  api.draw();                                  // a busy wave
  api.G.phase = 'between';
  api.draw();
  api.G.phase = 'over';
  api.draw();
  assert(api._counts.beginPath > 200, 'the frame actually painted something');
});

test('draw() survives every fighter state at once', () => {
  const api = boot();
  const p = play(api, 7); clearField(api);
  const states = ['idle', 'walk', 'attack', 'hurt', 'launch', 'down', 'getup', 'dizzy', 'cuffed', 'cough', 'charge'];
  states.forEach((s, i) => {
    const f = api.spawnFarmer(api.FARMER_KEYS[i % api.FARMER_KEYS.length], p.x + 20 + i * 14, api.GROUND_MID, {});
    f.entry = null;
    f.state = s; f.stateT = 0.3; f.hurtLen = 0.3; f.dizzyT = 2; f.downT = 0.6;
    if (s === 'attack') api.startAttack(f, f.atkName);
    if (s === 'launch'){ f.z = 40; f.spin = 1.2; }
  });
  api.mkCloud(p.x + 30, api.GROUND_MID);
  api.spawnFx('pop', p.x, p.y, 40, { txt: 'BONK!' });
  api.spawnFx('blood', p.x, p.y, 30, { n: 4 });
  api.spawnFx('ring', p.x, p.y, 30, {});
  api.spawnFx('dust', p.x, p.y, 0, { n: 3 });
  api.spawnFx('smoke', p.x, p.y, 10, { n: 3 });
  api.draw();
  api.drawHUD();
  for (const f of api.fighters) api.drawFighter(f);
  assert(true);
});

test('every prop kind paints without complaint', () => {
  const api = boot();
  play(api);
  const kinds = ['tractor', 'van', 'bale', 'crate', 'cone', 'brazier', 'sign', 'cow'];
  const seen = new Set(api.props.map((q) => q.kind));
  for (const k of kinds) assert(seen.has(k), 'the road is missing a ' + k);
  api.props.find((q) => q.kind === 'crate').broken = true;
  api.draw();
  assert(true);
});

test('the cop picker draws both officers', () => {
  const api = boot();
  assert(api.DOLLS.length === 2, 'two dolls on the select screen');
  api.drawPickers(0.5);
  api.drawPickers(4.0);                        // long enough to trigger a swing
  assert(api.DOLLS.every((d) => d.state === 'idle' || d.state === 'attack'), 'they idle and swing');
});

/* -------------------------------------------------------------- soak test */
test('a long busy fight never produces a NaN or loses the officer', () => {
  const api = boot();
  const p = play(api, 8);
  p.hp = 1e6; p.hpMax = 1e6;
  api.reseed(31337);
  for (let i = 0; i < 60 * 40; i++){
    /* jitter the controls so the officer really moves and swings */
    api.INPUT.x = Math.sin(i * 0.07);
    api.INPUT.y = Math.cos(i * 0.05) * 0.6;
    api.EDGE.baton = i % 17 === 0;
    api.EDGE.charge = i % 121 === 0;
    api.EDGE.gas = i % 233 === 0;
    api.EDGE.cuff = i % 53 === 0;
    api.update(api.STEP);
    if (i % 600 === 0) p.gas = p.gasMax;
  }
  assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp), 'the officer is still a real number');
  assert(api.fighters.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.z)),
    'and so is everybody else');
  assert(api.fighters.length < 120, 'bodies get cleaned up: ' + api.fighters.length);
  assert(api.fx.length <= 420, 'particles stay bounded: ' + api.fx.length);
  assert(api.G.kos > 0, 'and some farmers actually went down: ' + api.G.kos);
  api.draw();
});

test('only a handful of farmers may swing at once', () => {
  const api = boot();
  const p = play(api, 9);
  p.hp = 1e6; p.hpMax = 1e6;
  for (let i = 0; i < 24; i++){
    const f = api.spawnFarmer('mob', p.x + 14 + (i % 6), api.GROUND_MID + (i % 5) - 2, {});
    f.entry = null;
  }
  let worst = 0;
  for (let i = 0; i < 300; i++){
    api.update(api.STEP);
    const swinging = api.fighters.filter((f) => f.kind === 'farmer' && f.state === 'attack').length;
    if (swinging > worst) worst = swinging;
  }
  assert(worst > 0, 'they do attack');
  assert(worst <= api.attackTokens() + 2, 'but they take turns: ' + worst + ' at once');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
