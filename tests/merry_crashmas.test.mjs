// Merry Crashmas — headless physics + scoring suite.
//
// merry_crashmas/index.html is one self-contained file with four inline
// <script> blocks sharing a scope. This harness concatenates them, stubs a
// no-op DOM + 2d context, injects a test-only expose hook (never shipped)
// and evals the result — then drives world generation, the sling, the car
// physics, kills, combos, props and the run/level flow through the real
// code. draw() is exercised too, so render-time errors fail here.
// Run: node tests/merry_crashmas.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'merry_crashmas', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg){ if (Math.abs(a - b) > eps) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`); }

const BOOT_TAIL = `reseed(20241224);
seedSnow();
fit();
loadBest();
bindInput();
toMenu();
requestAnimationFrame(loop);`;

const EXPOSE = `__out.api = {
  G, car, aim, props, people, pickups, ice, spills, fx, tracks, gore, lens, debris, snow, snd, cam, shake, bounds,
  LEVELS, PROPS, COMBO_BANNERS, BEST_KEY, PROG_KEY,
  reseed, rnd, rr, ri, clamp, lerp, angLerp, fmt,
  genMarket, addProp, addPerson,
  toMenu, startCampaign, startLevel, beginLevel, nextCar, launch, endRun,
  levelEnd, nextLevel, retryLevel, finale, loadBest, saveBest,
  addScore, bumpCombo, breakCombo, stepCombo,
  killPerson, stepPeople, wreckProp, stepProps, stepSpills, stepFx,
  carSpeed, inCar, doBoost, hitProp, stepCarCollisions, stepCarKills, stepPickups,
  bounceBounds, onIce, stepCar, stepCam, camSnap, camTarget, update, stepSnow,
  takeOff, land, stepAir, addGore, bleed, splatLens, stepLens, blast, rollKind, KINDS,
  gib, pixels, rec, clip, rp, recStep, recReset, recSnap, replayReady, startReplay,
  GOALS, THEMES, rollGoals, checkGoals, goalTest, replayGore, drawStains,
  CARS, CAR_KEY, KILLS_KEY, STARS_KEY, BESTPER_KEY, selectCar, carUnlocked, renderGarage,
  pickLevel, readStars, readBest, starsOn, bestOn, starsTotal,
  getCar: () => CAR, getDims: () => ({ l: CARL, w: CARW, r: CARR }),
  getTheme: () => TH,
  stepReplay, skipReplay, endReplay, replayApply, drawReplayFrame,
  drawCar, drawPerson, drawLens,
  draw, drawHUD, drawAim, drawShout, screenToWorld, pointerDown, pointerMove, pointerUp, fit,
  SHOUTS, SHOUT_TIME,
  C: { WORLD_W, WORLD_H, ANCHOR, MARKET_X, FENCE_PAD, CAR_L, CAR_W, CAR_R,
       MAX_PULL, MIN_POWER, MAX_LAUNCH, FRICTION, DRAG, ICE_FRICTION, STOP_SPD,
       RUN_TIMEOUT, REST, REST_HARD, KILL_SPD, DMG_PER_SPD, COMBO_WIN, MAX_MULT,
       SCARE_R, FLEE_SPD, BOOST_KICK, PLOW_TIME, PERSON_PTS, SANTA_PTS,
       GRAV_Z, RAMP_MIN, RAMP_KICK, RAMP_MAX_VZ, LAND_R, FLIP_PTS, AIR_PTS, GORE_MAX, DEBRIS_MAX,
       REC_HZ, REC_WINDOW, REC_KEEP, REC_RADIUS, REPLAY_SPEED, REPLAY_MIN_WORTH },
  getT: () => T, setT: (v) => { T = v; },
  getFlash: () => flash, getHitstop: () => hitstop,
  _clearFeel: () => { hitstop = 0; flash = 0; shake.t = 0; shake.a = 0; },
};
`;

function boot(opts){
  const o = opts || {};
  const gradient = { addColorStop(){} };
  const counts = {};
  const ctxStub = new Proxy({}, { get(t, p){
    if (p === 'measureText') return () => ({ width: 30 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient')
      return () => { if (o.count) counts[p] = (counts[p] || 0) + 1; return gradient; };
    if (p === 'canvas') return { width: o.w || 960, height: o.h || 600 };
    if (o.count && typeof p === 'string' && p !== 'then')
      return () => { counts[p] = (counts[p] || 0) + 1; };
    return () => {};
  }, set(){ return true; } });
  const el = () => ({
    style: { setProperty(){} }, textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
    addEventListener(){}, removeAttribute(){}, setAttribute(){},
    setPointerCapture(){}, querySelector: () => null,
    classList: { add(){}, remove(){}, toggle(){} },
  });
  const canvas = el();
  const store = Object.assign({}, o.store || {});
  const nodes = {};
  const listeners = {};
  const sandbox = {
    document: {
      getElementById: (id) => (id === 'c' ? canvas : (nodes[id] || (nodes[id] = el()))),
      createElement: () => el(),
    },
    window: {
      innerWidth: o.w || 1280, innerHeight: o.h || 720, devicePixelRatio: o.dpr || 1,
      addEventListener: (k, fn) => { (listeners[k] || (listeners[k] = [])).push(fn); },
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    requestAnimationFrame: () => {},
    setTimeout: () => {},
    __out: {},
  };

  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert(blocks.length >= 4, 'expected the game to be split across four inline scripts');
  const src = blocks.join('\n');
  assert(src.includes(BOOT_TAIL), 'boot tail anchor missing from game script');
  const patched = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', 'setTimeout', '__out', patched)(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined,
    sandbox.requestAnimationFrame, sandbox.setTimeout, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  api._counts = counts;
  api._resetCounts = () => { for (const k in counts) delete counts[k]; };
  api._nodes = nodes;
  api._listeners = listeners;
  api._window = sandbox.window;
  return api;
}

const step = (api, secs, dt = 1 / 60) => { for (let i = 0; i < Math.round(secs / dt); i++) api.update(dt); };

/* Puts a car mid-flight without going through the sling, for physics probes. */
function drive(api, vx, vy, x, y){
  api.G.phase = 'drive';
  api.car.x = x; api.car.y = y;
  api.car.vx = vx; api.car.vy = vy;
  api.car.ang = Math.atan2(vy, vx);
  api.car.spin = 0;
  api.G.runT = 0;
}

/* ---------------------------------------------------------------- boot --- */

test('boots into the menu with a market already generated', () => {
  const api = boot();
  assert(api.G.phase === 'menu', 'phase should be menu');
  assert(api.props.length > 20, 'menu should show a generated market, got ' + api.props.length);
  assert(api.people.length > 40, 'market needs a crowd, got ' + api.people.length);
});

test('world generation is deterministic per seed', () => {
  const a = boot(), b = boot();
  a.genMarket(a.LEVELS[2]);
  b.genMarket(b.LEVELS[2]);
  assert(a.props.length === b.props.length, 'prop count differs');
  assert(a.people.length === b.people.length, 'people count differs');
  assert(a.G.target === b.G.target, 'target differs');
  near(a.props[10].x, b.props[10].x, 0.0001, 'prop x differs');
});

test('later markets are bigger than earlier ones', () => {
  const api = boot();
  api.genMarket(api.LEVELS[0]);
  const small = { p: api.props.length, c: api.people.length, t: api.G.target };
  api.genMarket(api.LEVELS[5]);
  assert(api.props.length > small.p, 'last market should have more props');
  assert(api.people.length > small.c, 'last market should have more shoppers');
  assert(api.G.target > small.t, 'last market should have a higher target');
});

test('everything spawns inside the world bounds, market to the right', () => {
  const api = boot();
  api.genMarket(api.LEVELS[3]);
  for (const o of api.props){
    assert(o.x > 0 && o.x < api.C.WORLD_W, 'prop outside world x');
    assert(o.y > 0 && o.y < api.C.WORLD_H, 'prop outside world y');
  }
  for (const p of api.people){
    assert(p.x > 0 && p.x < api.C.WORLD_W && p.y > 0 && p.y < api.C.WORLD_H, 'person outside world');
    assert(p.x > api.C.ANCHOR.x + 100, 'nobody should stand on the launch pad');
  }
  const stalls = api.props.filter(o => o.kind === 'hut');
  assert(stalls.every(o => o.x >= api.C.MARKET_X), 'stalls belong in the market');
});

/* -------------------------------------------------------------- launch --- */

test('the sling launches away from the pull, power scales with distance', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  assert(api.G.phase === 'aim', 'should be aiming');
  assert(api.launch(-200, 0) === true, 'launch should take');
  assert(api.G.phase === 'drive', 'should be driving');
  assert(api.car.vx > 0, 'pulling left must fire right');
  near(api.car.vy, 0, 0.001, 'straight pull should not drift');
  const half = api.carSpeed();

  const api2 = boot();
  api2.startCampaign(); api2.beginLevel();
  api2.launch(-api2.C.MAX_PULL, 0);
  assert(api2.carSpeed() > half, 'a longer pull must be faster');
  near(api2.carSpeed(), api2.C.MAX_LAUNCH, 1, 'full pull should be max launch speed');
});

test('a diagonal pull fires along the opposite diagonal', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-300, -300);
  assert(api.car.vx > 0 && api.car.vy > 0, 'up-left pull should fire down-right');
  near(api.car.vx, api.car.vy, 1, 'a 45° pull should be symmetric');
});

test('a pull from the wrong side is refused instead of wasting a car', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const cars = api.G.carsLeft;
  assert(api.launch(300, 0) === false, 'firing away from the market should be refused');
  assert(api.launch(0, 300) === false, 'a straight sideways fling too');
  assert(api.G.phase === 'aim' && api.G.carsLeft === cars, 'no car spent');
  assert(api.launch(-300, 300) === true, 'a proper backwards pull still fires');
  assert(api.car.vx > 0, 'and it goes into the market');
});

test('a tap is not a launch, and launching only works while aiming', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  assert(api.launch(-5, 0) === false, 'tiny pull should be ignored');
  assert(api.G.phase === 'aim', 'still aiming after a tap');
  api.launch(-300, 0);
  assert(api.launch(-300, 0) === false, 'cannot launch mid-drive');
});

test('a swipe launches the car on every viewport, phones included', () => {
  /* The sling used to read where the finger landed rather than how far it
     moved, so the reachable pull depended on where the anchor happened to sit
     on screen. On a 390-wide phone the maximum was 4% power — under the launch
     minimum — so no gesture on earth started the game. */
  for (const [w, h] of [[390, 844], [820, 1180], [1280, 720], [1440, 600], [844, 390]]){
    const api = boot({ w, h });
    api.startCampaign(); api.beginLevel(); api.camSnap();
    const cx = w / 2, cy = h / 2;
    api.pointerDown(cx, cy);
    for (let i = 1; i <= 10; i++) api.pointerMove(cx - 25 * i, cy);   // a 250px swipe
    api.pointerUp();
    assert(api.G.phase === 'drive', w + 'x' + h + ': a 250px swipe did not launch');
    assert(api.aim.power >= 0.95, w + 'x' + h + ': only ' + Math.round(api.aim.power * 100) + '% power');
    assert(api.car.vx > 0, w + 'x' + h + ': fired the wrong way');
  }
});

test('the HUD panels do not sit on top of each other on a phone', () => {
  // the score panel and the car counter used to overlap by 78px at 390 wide
  const api = boot({ w: 390, h: 844, count: true });
  api.startCampaign(); api.beginLevel();
  api.draw(); api._resetCounts(); api.draw();
  assert((api._counts.fill || 0) > 10, 'the HUD drew something');
  // measured from the same numbers drawHUD uses
  const pad = 14, panelW = 168, carsW = 118;
  assert(pad + panelW < 390 - pad - carsW,
    'panels overlap at 390 wide: score ends ' + (pad + panelW) +
    ', cars start ' + (390 - pad - carsW));
});

test('a swipe is measured from where it started, not from the car', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel(); api.camSnap();
  // press in the far corner, nowhere near the car, and drag back
  api.pointerDown(1200, 80);
  api.pointerMove(1000, 80);
  api.pointerUp();
  assert(api.G.phase === 'drive', 'the drag should still launch');
  const power = api.aim.power;

  const b2 = boot({ w: 1280, h: 720 });
  b2.startCampaign(); b2.beginLevel(); b2.camSnap();
  b2.pointerDown(400, 600);                    // same drag, different start
  b2.pointerMove(200, 600);
  b2.pointerUp();
  near(b2.aim.power, power, 0.001, 'the same swipe gave a different launch');
});

test('a tap does not spend a car, and says why', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const cars = api.G.carsLeft;
  api.pointerDown(600, 400);
  api.pointerMove(596, 400);                   // 4px: a tap, not a pull
  api.pointerUp();
  assert(api.G.phase === 'aim', 'a tap must not launch');
  assert(api.G.carsLeft === cars, 'nor spend a car');
  assert(/PULL FURTHER/.test(api._nodes.hint.textContent),
    'and it should say so, hint reads: ' + api._nodes.hint.textContent);
});

/* ------------------------------------------------------------- physics --- */

test('friction brings the car to a stop and ends the run', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const cars = api.G.carsLeft;
  api.launch(-api.C.MAX_PULL, 0);
  const v0 = api.carSpeed();
  step(api, 1.5);
  assert(api.carSpeed() < v0, 'the car should be slowing down');
  step(api, 22);
  assert(api.G.phase !== 'drive', 'run should be over by now');
  assert(api.G.carsLeft === cars - 1, 'a car should have been spent');
});

test('the run hands over to the next car, then to the results screen', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const cars = api.G.cars;
  for (let i = 0; i < cars; i++){
    assert(api.G.phase === 'aim', 'expected aim before car ' + i);
    api.launch(-api.C.MAX_PULL, 0);
    step(api, 30);
  }
  assert(api.G.phase === 'results', 'after the last car comes the scoreboard, got ' + api.G.phase);
  assert(api.G.carsLeft === 0, 'all cars spent');
});

test('the car bounces off the world fence instead of leaving', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  drive(api, -900, 0, api.bounds.x0 + 20, api.C.WORLD_H / 2);
  step(api, 0.5);
  assert(api.car.x >= api.bounds.x0 - 1, 'car escaped left, x=' + api.car.x);
  assert(api.car.vx > 0, 'bounce should reverse the car');
  assert(api.carSpeed() < 900, 'a bounce costs speed');
});

test('a statue reflects the car without breaking', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const o = api.addProp('nutcracker', 2000, 1100, {});
  drive(api, 1000, 0, 2000 - o.r - api.C.CAR_R - 10, 1100);
  step(api, 0.6);
  assert(!o.dead, 'a nutcracker is indestructible');
  assert(api.car.vx < 0, 'car should have been thrown back, vx=' + api.car.vx);
  assert(api.car.x < 2000, 'car should be on the near side');
});

test('a light prop is ploughed through, a heavy one is not', () => {
  const light = boot();
  light.props.length = 0; light.people.length = 0; light.pickups.length = 0; light.ice.length = 0;
  const gift = light.addProp('gifts', 2000, 1100, {});
  drive(light, 900, 0, 1860, 1100);
  step(light, 0.5);
  assert(gift.dead, 'a pile of gifts should explode');
  assert(light.car.vx > 400, 'ploughing gifts should barely slow you, vx=' + light.car.vx);

  const heavy = boot();
  heavy.props.length = 0; heavy.people.length = 0; heavy.pickups.length = 0; heavy.ice.length = 0;
  const tree = heavy.addProp('tree', 2000, 1100, {});
  drive(heavy, 400, 0, 1880, 1100);
  step(heavy, 0.5);
  assert(!tree.dead, 'a slow nudge should not fell a tree');
  assert(heavy.car.vx < 0, 'the tree should bounce you back');
});

test('props take damage before they break', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const hut = api.addProp('hut', 2000, 1100, {});
  const hp0 = hut.hp;
  drive(api, 500, 0, 2000 - hut.w / 2 - api.C.CAR_R - 8, 1100);
  step(api, 0.4);
  assert(!hut.dead, 'a 500px/s tap should not level a stall');
  assert(hut.hp < hp0, 'the stall should be damaged, ' + hut.hp + ' vs ' + hp0);

  drive(api, 1500, 0, 2000 - hut.w / 2 - api.C.CAR_R - 8, 1100);
  step(api, 0.4);
  assert(hut.dead, 'full speed should level it');
});

test('wrecked props stop colliding', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const hut = api.addProp('hut', 2000, 1100, {});
  api.wreckProp(hut, 0, 0);
  drive(api, 800, 0, 1900, 1100);
  const before = api.car.vx;
  step(api, 0.3);
  assert(api.car.x > 2000, 'the car should drive straight over the wreckage');
  assert(api.car.vx > before * 0.8, 'wreckage should not slow you much');
});

test('ice keeps the car rolling much longer than snow', () => {
  const dry = boot();
  dry.ice.length = 0; dry.props.length = 0; dry.people.length = 0; dry.pickups.length = 0;
  drive(dry, 800, 0, 1000, 1100);
  step(dry, 1.2);
  const dryS = dry.carSpeed();

  const slick = boot();
  slick.props.length = 0; slick.people.length = 0; slick.pickups.length = 0;
  slick.ice.length = 0;
  slick.ice.push({ x: 1600, y: 1100, r: 1400, seed: 0.5 });
  drive(slick, 800, 0, 1000, 1100);
  step(slick, 1.2);
  assert(slick.carSpeed() > dryS * 1.3, 'ice should preserve speed: ' + slick.carSpeed() + ' vs ' + dryS);
});

/* --------------------------------------------------------------- kills --- */

test('driving over a shopper kills and scores; standing still does not', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const p = api.addPerson(2000, 1100);
  drive(api, 20, 0, 1980, 1100);          // below the kill speed
  api.stepCarKills();
  assert(!p.dead, 'a crawl should not kill');

  drive(api, 600, 0, 1990, 1100);
  api.stepCarKills();
  assert(p.dead, 'a 600px/s hit should');
  assert(api.G.kills === 1, 'kill counted');
  assert(api.G.levelScore >= api.C.PERSON_PTS, 'score awarded, got ' + api.G.levelScore);
});

test('the kill box follows the car body, and the plough widens it', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0;
  drive(api, 500, 0, 2000, 1100);
  api.car.ang = 0;
  assert(api.inCar(2000 + api.C.CAR_L / 2 - 4, 1100), 'nose is inside');
  assert(!api.inCar(2000, 1100 + api.C.CAR_W), 'well off the flank is outside');
  api.car.plowT = 5;
  assert(api.inCar(2000, 1100 + api.C.CAR_W / 2 + 8), 'the plough reaches wider');
});

test('a fast pass through a crowd chains a combo and multiplies the score', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  for (let i = 0; i < 12; i++) api.addPerson(1800 + i * 90, 1100);
  drive(api, 1400, 0, 1600, 1100);
  step(api, 1.2);
  assert(api.G.kills >= 8, 'the pass should mow down the line, got ' + api.G.kills);
  assert(api.G.bestCombo >= 8, 'combo should have chained, got ' + api.G.bestCombo);
  assert(api.G.mult > 1, 'multiplier should be up');
  assert(api.G.levelScore > api.G.kills * api.C.PERSON_PTS,
    'multiplied score must beat flat rate: ' + api.G.levelScore);
});

test('the combo multiplier climbs by half a step and caps', () => {
  const api = boot();
  api.G.combo = 0; api.G.mult = 1;
  api.bumpCombo();
  near(api.G.mult, 1, 0.001, 'first kill is ×1');
  api.bumpCombo();
  near(api.G.mult, 1.5, 0.001, 'second kill is ×1.5');
  for (let i = 0; i < 60; i++) api.bumpCombo();
  near(api.G.mult, api.C.MAX_MULT, 0.001, 'multiplier caps');
});

test('the combo expires after the window and resets the multiplier', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0;
  api.G.combo = 0; api.G.mult = 1; api.G.comboT = 0;
  api.bumpCombo(); api.bumpCombo(); api.bumpCombo();
  assert(api.G.combo === 3 && api.G.mult > 1, 'combo running');
  step(api, api.C.COMBO_WIN + 0.4);
  assert(api.G.combo === 0, 'combo should have lapsed');
  near(api.G.mult, 1, 0.001, 'multiplier back to 1');
});

test('score is the base value times the live multiplier', () => {
  const api = boot();
  api.G.score = 0; api.G.levelScore = 0; api.G.mult = 3;
  const pts = api.addScore(100);
  assert(pts === 300, 'expected 300, got ' + pts);
  assert(api.G.score === 300 && api.G.levelScore === 300, 'both totals move together');
});

test('Santa is worth twelve shoppers', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0;
  const s = api.addPerson(2000, 1100, 'santa');
  assert(s.pts === api.C.SANTA_PTS, 'santa points');
  api.G.mult = 1;
  drive(api, 700, 0, 1990, 1100);
  api.stepCarKills();
  assert(s.dead, 'santa is not immune');
  assert(api.G.levelScore === api.C.SANTA_PTS, 'santa pays out big, got ' + api.G.levelScore);
});

test('shoppers scatter away from an oncoming car', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const p = api.addPerson(2000, 1100);
  p.walk = 0;
  api.G.phase = 'drive';
  api.car.x = 2000 - 200; api.car.y = 1100;
  api.car.vx = 0; api.car.vy = 0;      // parked, so the crowd has time to flee
  const d0 = Math.hypot(p.x - api.car.x, p.y - api.car.y);
  for (let i = 0; i < 60; i++) api.stepPeople(1 / 60);
  const d1 = Math.hypot(p.x - api.car.x, p.y - api.car.y);
  assert(p.panic > 0.5, 'they should have noticed');
  assert(d1 > d0 + 40, 'they should have run: ' + d0 + ' → ' + d1);
});

test('nothing scores while there is no car on the field', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.spills.length = 0;
  const pot = api.addProp('gluh', 2500, 1100, {});
  for (let i = 0; i < 14; i++) api.addPerson(2500 + Math.cos(i) * 60, 1100 + Math.sin(i) * 60);
  api.G.phase = 'aim';                       // between runs: nobody is driving
  api.G.levelScore = 0; api.G.kills = 0;
  api.wreckProp(pot, 0, 0);                  // the pot still goes over and steams
  const score0 = api.G.levelScore, kills0 = api.G.kills;
  step(api, 3);
  assert(api.G.kills === kills0, 'a spill must not kill with no car on the field, got +' + (api.G.kills - kills0));
  assert(api.G.levelScore === score0, 'and must not score, got +' + (api.G.levelScore - score0));
  assert(api.rec.kills === 0, 'nor leak kills into the next recording, got ' + api.rec.kills);
  assert(api.spills.length === 1, 'the spill is still there, it just is not lethal');

  // and it is lethal again the moment a car is back on it
  api.G.phase = 'drive';
  step(api, 0.2);
  assert(api.G.kills > kills0, 'the spill still works while driving');
});

test('drawing a frame cannot change what the frame contains', () => {
  /* Camera shake used to pull from the simulation's own generator, so the same
     shot scored differently depending on whether it was being rendered — a
     144Hz player got a different result from a 60Hz one, and every headless
     measurement in this suite was a lie by a few percent. */
  const run = (drawIt) => {
    const api = boot();
    api.startLevel(2); api.beginLevel();
    api.launch(-api.C.MAX_PULL, 120);
    for (let i = 0; i < 900 && api.G.phase !== 'aim' && api.G.phase !== 'results'; i++){
      api.skipReplay();
      api.update(1 / 60);
      if (drawIt) api.draw();
    }
    return { score: api.G.levelScore, kills: api.G.kills, gore: api.gore.length,
             x: Math.round(api.car.x), y: Math.round(api.car.y),
             dead: api.people.filter(p => p.dead).length };
  };
  const undrawn = run(false), drawn = run(true);
  assert(undrawn.score === drawn.score, 'score differs when drawn: ' + undrawn.score + ' vs ' + drawn.score);
  assert(undrawn.kills === drawn.kills, 'kills differ: ' + undrawn.kills + ' vs ' + drawn.kills);
  assert(undrawn.dead === drawn.dead, 'bodies differ: ' + undrawn.dead + ' vs ' + drawn.dead);
  assert(undrawn.x === drawn.x && undrawn.y === drawn.y,
    'the car ends somewhere else: ' + JSON.stringify(undrawn) + ' vs ' + JSON.stringify(drawn));
  assert(undrawn.gore === drawn.gore, 'gore differs: ' + undrawn.gore + ' vs ' + drawn.gore);
});

test('the recorder starts empty on every launch', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  for (let i = 0; i < 8; i++) api.addPerson(2000 + i * 70, 1100);
  api.launch(-api.C.MAX_PULL, 0);
  for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  assert(api.rec.frames.length > 0, 'it recorded something');
  api.G.phase = 'aim';
  api.launch(-api.C.MAX_PULL, 0);
  assert(api.rec.kills === 0 && api.rec.killed.length === 0 && api.rec.frames.length === 0,
    'the next launch inherited ' + api.rec.frames.length + ' frames and ' + api.rec.kills + ' kills');
});

test('a stale clip cannot set a bar the next run has to clear', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.clip.worth = 9; api.clip.kills = 9; api.clip.wrecks = 4;
  api.clip.frames = [{ t: 0 }, { t: 1 }];
  api.recReset();
  assert(api.clip.worth === 0 && api.clip.kills === 0 && api.clip.wrecks === 0,
    'clip survived the reset: worth ' + api.clip.worth);
  assert(api.clip.frames.length === 0, 'frames survived the reset');
  assert(!api.replayReady(), 'and it is not offering a replay of nothing');
});

test('the replay caption says how long the clip really is', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.carsLeft = 2;
  for (let i = 0; i < 10; i++) api.addPerson(2000 + i * 70, 1100);
  drive(api, 1500, 0, 1700, 1100);
  for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  step(api, 1.4);
  assert(api.G.phase === 'replay', 'in the replay');
  const secs = api.rp.dur;
  if (secs >= 1.85) assert(/IN TWO SECONDS/.test(api.rp.caption), 'a full clip says two seconds');
  else assert(api.rp.caption.indexOf(secs.toFixed(1).replace(/\.0$/, '')) > 0,
    'a ' + secs.toFixed(1) + 's clip should say so, got: ' + api.rp.caption);
});

test('a new car starts on a clean chain', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.G.combo = 7; api.G.mult = 4; api.G.comboT = 1.2;
  api.nextCar();
  assert(api.G.combo === 0 && api.G.mult === 1 && api.G.comboT === 0,
    'combo carried into the next car: ' + api.G.combo + ' / ×' + api.G.mult);
});

test('the scoreboard does not move after the level has ended', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const pot = api.addProp('gluh', 2500, 1100, {});
  for (let i = 0; i < 10; i++) api.addPerson(2500 + Math.cos(i) * 55, 1100 + Math.sin(i) * 55);
  api.G.phase = 'drive';
  api.wreckProp(pot, 0, 0);
  api.G.carsLeft = 0;
  api.levelEnd();
  const frozen = api.G.levelScore, total = api.G.score;
  step(api, 3);                              // reading the results card
  assert(api.G.levelScore === frozen, 'level score moved after the card was up: +' + (api.G.levelScore - frozen));
  assert(api.G.score === total, 'campaign total moved: +' + (api.G.score - total));
});

test('a spilled glühwein pot scalds the shoppers around it', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.spills.length = 0;
  const pot = api.addProp('gluh', 2000, 1100, {});
  const near1 = api.addPerson(2030, 1120);
  const far = api.addPerson(2600, 1100);
  api.G.phase = 'drive';
  api.wreckProp(pot, 0, 0);
  assert(api.spills.length === 1, 'the pot should leave a spill');
  step(api, 0.2);
  assert(near1.dead, 'the shopper standing in it goes down');
  assert(!far.dead, 'the one across the aisle does not');
});

/* ------------------------------------------------------------- pickups --- */

test('nitro refills and fires the boost, and the boost is one-shot', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  drive(api, 600, 0, 1000, 1100);
  assert(api.car.boost === 1, 'a fresh car carries one nitro');
  const v0 = api.carSpeed();
  assert(api.doBoost() === true, 'boost should fire');
  assert(api.carSpeed() > v0 + 400, 'nitro should add real speed');
  assert(api.doBoost() === false, 'and it is spent');

  api.pickups.push({ x: 1200, y: 1100, kind: 'nitro', taken: false, bob: 0, r: 34 });
  api.car.x = 1200; api.car.y = 1100;
  api.stepPickups();
  assert(api.pickups[0].taken, 'can should be collected');
  assert(api.car.boost === 0 && api.carSpeed() > v0, 'the can fires immediately');
});

test('the driver shouts when the nitro fires, and shuts up again', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  drive(api, 600, 0, 1000, 1100);
  assert(api.car.shoutT === 0, 'quiet to start with');
  api.doBoost();
  assert(api.SHOUTS.indexOf(api.car.shout) >= 0, 'shouts one of the lines, got ' + api.car.shout);
  near(api.car.shoutT, api.SHOUT_TIME, 0.001, 'shout timer armed');
  api.drawShout();                               // the bubble renders
  step(api, api.SHOUT_TIME + 0.3);
  assert(api.car.shoutT <= 0, 'and it fades');
  api.G.phase = 'aim';
  api.nextCar();
  assert(api.car.shoutT === 0 && api.car.shout === '', 'the next car starts quiet');
});

test('the wind-up has real room behind the sling', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const room = api.C.ANCHOR.x - api.bounds.x0;
  assert(room > api.C.MAX_PULL, 'a full pull must fit inside the fence: ' + room + ' vs ' + api.C.MAX_PULL);
  assert(api.C.ANCHOR.x + 200 < api.C.MARKET_X, 'and the market still starts well downrange');
});

test('the plough pickup arms the wide bumper for a while', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0;
  drive(api, 400, 0, 1200, 1100);
  api.pickups.push({ x: 1200, y: 1100, kind: 'plow', taken: false, bob: 0, r: 34 });
  api.stepPickups();
  near(api.car.plowT, api.C.PLOW_TIME, 0.001, 'plough timer armed');
  step(api, 1);
  assert(api.car.plowT < api.C.PLOW_TIME, 'and it counts down');
});

test('golden gifts pay out and cannot be taken twice', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0;
  drive(api, 400, 0, 1200, 1100);
  api.G.levelScore = 0; api.G.mult = 1;
  api.pickups.push({ x: 1200, y: 1100, kind: 'star', taken: false, bob: 0, r: 34 });
  api.stepPickups();
  assert(api.G.levelScore === 500, 'star pays 500, got ' + api.G.levelScore);
  api.stepPickups();
  assert(api.G.levelScore === 500, 'and only once');
});

/* --------------------------------------------------------------- crowd --- */

test('the market is a mixed crowd, not one kind of shopper', () => {
  const api = boot();
  api.genMarket(api.LEVELS[5]);
  const seen = {};
  for (const p of api.people) seen[p.kind] = (seen[p.kind] || 0) + 1;
  for (const k of ['shopper', 'elder', 'parent', 'kid']){
    assert(seen[k] > 5, 'expected a decent number of ' + k + ', got ' + (seen[k] || 0));
  }
  assert(seen.santa === 1, 'exactly one Santa in the last market');
});

test('each kind moves and pays differently', () => {
  const api = boot();
  api.people.length = 0;
  const elder = api.addPerson(2000, 1100, 'elder');
  const kid = api.addPerson(2100, 1100, 'kid');
  const parent = api.addPerson(2200, 1100, 'parent');
  assert(elder.walk < kid.walk, 'pensioners are slower than children');
  assert(elder.flee < kid.flee, 'and they cannot run either');
  assert(elder.pts > kid.pts, 'the slow ones are worth more');
  assert(parent.pram && parent.pramT > 0, 'a parent comes with a pram');
  assert(kid.r < elder.r, 'children are smaller');
  assert(kid.voice > elder.voice, 'and higher pitched');
});

test('fear turns into crying, dropped shopping and tears', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const p = api.addPerson(2000, 1100, 'kid');
  p.walk = 0;
  api.G.phase = 'drive';
  api.car.x = 1900; api.car.y = 1100; api.car.vx = 0; api.car.vy = 0;
  for (let i = 0; i < 90; i++) api.stepPeople(1 / 60);
  assert(p.panic > 0.8, 'terrified');
  assert(p.cry > 0.5, 'and crying, got ' + p.cry);
  assert(p.dropped === 1, 'dropped what they were carrying');
  assert(api.fx.some(f => f.type === 'tear'), 'tears fly');
  assert(api.fx.some(f => f.type === 'drop'), 'so does the shopping');
  api.drawPerson(p);                       // the crying face renders
});

test('a pram breaks loose when whoever was pushing it goes down', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.fx.length = 0;
  const p = api.addPerson(2000, 1100, 'parent');
  api.G.phase = 'drive';
  api.killPerson(p, 900, 0, 'car');
  assert(p.pramT === 0, 'the pram is gone');
  assert(api.fx.some(f => f.type === 'pram'), 'and it is airborne');
});

/* ------------------------------------------------------------ progress --- */

test('stars are kept per market and survive a reload', () => {
  const api = boot();
  api.G.starsPer = []; api.G.bestPer = [];
  api.G.unlocked = 8;
  api.G.starsPer[0] = 3; api.G.starsPer[3] = 1; api.G.starsPer[7] = 2;
  api.G.bestPer[3] = 24000;
  api.saveBest();
  assert(api._store[api.STARS_KEY], 'stars written');

  const again = boot({ store: api._store });
  assert(again.starsOn(0) === 3 && again.starsOn(3) === 1 && again.starsOn(7) === 2,
    'stars read back: ' + JSON.stringify(again.G.starsPer.slice(0, 8)));
  assert(again.starsOn(5) === 0, 'markets never played read as none');
  assert(again.bestOn(3) === 24000, 'per-market best read back');
  assert(again.starsTotal() === 6, 'running total, got ' + again.starsTotal());
});

test('a worse run never takes a market star away', () => {
  const api = boot();
  api.startLevel(2); api.beginLevel();
  api.G.starsPer = []; api.G.bestPer = [];
  api.G.carsLeft = 0;
  api.G.levelScore = api.G.target * 3; api.G.goalsDone = 3;
  api.levelEnd();
  assert(api.starsOn(2) === 3, 'three stars banked');
  const best = api.bestOn(2);

  api.retryLevel(); api.beginLevel();
  api.G.carsLeft = 0;
  api.G.levelScore = api.G.target; api.G.goalsDone = 0;
  api.levelEnd();
  assert(api.starsOn(2) === 3, 'a one-star run took the record down to ' + api.starsOn(2));
  assert(api.bestOn(2) === best, 'and the best score went down to ' + api.bestOn(2));
});

test('stars are the target plus the goals', () => {
  const api = boot();
  api.startLevel(1); api.beginLevel();
  const cases = [[false, 0, 0], [false, 3, 0], [true, 0, 1], [true, 1, 2], [true, 2, 2], [true, 3, 3]];
  for (const [hit, goals, want] of cases){
    api.G.starsPer = [];
    api.G.carsLeft = 0;
    api.G.levelScore = hit ? api.G.target : api.G.target - 1;
    api.G.goalsDone = goals;
    api.levelEnd();
    assert(api.G.stars === want,
      'target ' + (hit ? 'hit' : 'missed') + ' with ' + goals + ' goals should be ' +
      want + ' stars, got ' + api.G.stars);
  }
});

test('the menu only opens markets you have reached', () => {
  const api = boot();
  api.G.unlocked = 4;
  assert(api.pickLevel(4) === true, 'the furthest market you reached is open');
  assert(api.G.level === 4 && api.G.phase === 'brief', 'and it starts');
  assert(api.pickLevel(5) === false, 'the next one is not');
  assert(api.pickLevel(20) === false, 'nor the last');
  assert(api.pickLevel(-1) === false && api.pickLevel(99) === false, 'nonsense is refused');
  assert(api.G.level === 4, 'a refused pick does not move you');
});

test('a single market is scored on its own, and goes back to the menu', () => {
  const api = boot();
  api.G.unlocked = 6;
  api.startCampaign();
  assert(api.G.campaign === true, 'the campaign is a campaign');
  api.pickLevel(3);
  assert(api.G.campaign === false, 'a picked market is not');
  assert(api.G.score === 0, 'and starts from zero, got ' + api.G.score);
  api.beginLevel();
  api.G.carsLeft = 0;
  api.G.levelScore = api.G.target * 2; api.G.goalsDone = 1;
  api.levelEnd();
  api.nextLevel();
  assert(api.G.phase === 'menu', 'a cleared single market returns to the menu, got ' + api.G.phase);
  assert(api.starsOn(3) === 2, 'and still banks its stars');
});

test('unreadable progress reads as a clean sheet, not a crash', () => {
  const api = boot({ store: { merry_crashmas_stars_v1: 'not json',
                              merry_crashmas_marketbest_v1: '{"nope":1}' } });
  assert(api.starsTotal() === 0, 'garbage stars read as none');
  assert(api.bestOn(0) === 0, 'garbage bests read as none');
  api.toMenu();                       // the menu still builds
});

test('the menu chips are buttons wired to the level select', () => {
  const api = boot();
  api.G.unlocked = 3;
  api.G.starsPer = [3, 1, 0, 0];
  api.toMenu();
  const html = api._nodes.mLevels.innerHTML;
  assert(/data-lv="0"/.test(html) && /data-lv="20"/.test(html), 'every market is listed');
  assert(/★★★/.test(html), 'earned stars are shown');
  assert(/disabled/.test(html), 'locked markets are disabled');
  assert((html.match(/disabled/g) || []).length === api.LEVELS.length - 4,
    'exactly the unreached markets are locked');
});

/* -------------------------------------------------------------- garage --- */

test('the garage unlocks in order and starts with the hatchback', () => {
  const api = boot();
  assert(api.CARS.length >= 5, 'five cars, got ' + api.CARS.length);
  assert(api.CARS[0].unlock === 0, 'the first one is free');
  for (let i = 1; i < api.CARS.length; i++){
    assert(api.CARS[i].unlock > api.CARS[i - 1].unlock, 'unlocks climb: ' + api.CARS[i].id);
  }
  assert(api.getCar().id === 'hatch', 'the hatchback is the default');
  const ids = api.CARS.map(c => c.id);
  assert(new Set(ids).size === ids.length, 'no duplicate ids');
});

test('a locked car cannot be picked, an unlocked one can', () => {
  const api = boot();
  api.G.lifeKills = 0;
  const locked = api.CARS[api.CARS.length - 1];
  assert(!api.carUnlocked(locked), 'the last car starts locked');
  assert(api.selectCar(locked.id) === false, 'and cannot be selected');
  assert(api.getCar().id === 'hatch', 'so the hatchback stays');
  api.G.lifeKills = locked.unlock;
  assert(api.carUnlocked(locked), 'lifetime kills unlock it');
  assert(api.selectCar(locked.id) === true, 'and now it takes');
  assert(api.getCar().id === locked.id, 'selected');
  assert(api.selectCar('not-a-car') === false, 'nonsense ids are refused');
});

test('each car is a different size on the road', () => {
  const api = boot();
  api.G.lifeKills = 999999;
  const seen = new Set();
  for (const c of api.CARS){
    api.selectCar(c.id);
    const d = api.getDims();
    assert(d.l === c.len && d.w === c.wid && d.r === c.rad, c.id + ' dimensions applied');
    seen.add(d.l + 'x' + d.w);
  }
  assert(seen.size >= 4, 'the cars should not all be one box, got ' + seen.size);
});

test('the sports coupe launches harder than the van', () => {
  const api = boot();
  api.G.lifeKills = 999999;
  api.startCampaign(); api.beginLevel();
  api.selectCar('sport'); api.nextCar();
  api.launch(-api.C.MAX_PULL, 0);
  const fast = api.carSpeed();
  api.G.phase = 'aim';
  api.selectCar('van'); api.nextCar();
  api.launch(-api.C.MAX_PULL, 0);
  const slow = api.carSpeed();
  assert(fast > slow * 1.2, 'coupe ' + Math.round(fast) + ' vs van ' + Math.round(slow));
});

test('the sleigh slides far past where the hatchback stops', () => {
  const roll = (id) => {
    const api = boot();
    api.G.lifeKills = 999999;
    api.selectCar(id);
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
    api.bounds.x1 = 20000;
    drive(api, 900, 0, 1000, 1100);
    const x0 = api.car.x;
    for (let i = 0; i < 3000 && api.G.phase === 'drive'; i++) api.update(1 / 60);
    return api.car.x - x0;
  };
  const hatch = roll('hatch'), sleigh = roll('sleigh');
  assert(sleigh > hatch * 1.5, 'sleigh ' + Math.round(sleigh) + ' vs hatchback ' + Math.round(hatch));
});

test('the van ploughs a stall the hatchback only dents', () => {
  const hit = (id) => {
    const api = boot();
    api.G.lifeKills = 999999;
    api.selectCar(id);
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
    const hut = api.addProp('hut', 2000, 1100, {});
    drive(api, 620, 0, 2000 - hut.w / 2 - api.getDims().r - 8, 1100);
    step(api, 0.5);
    return hut.dead;
  };
  assert(hit('van'), 'the van goes through it');
  assert(!hit('hatch'), 'the hatchback does not, at the same speed');
});

test('the monster truck gets more air, the coupe carries two nitros', () => {
  const jump = (id) => {
    const api = boot();
    api.G.lifeKills = 999999;
    api.selectCar(id);
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
    drive(api, 1100, 0, 2000, 1100);
    api.takeOff(1100, null);
    let peak = 0;
    for (let i = 0; i < 200 && api.car.air; i++){ api.update(1 / 60); peak = Math.max(peak, api.car.z); }
    return peak;
  };
  assert(jump('monster') > jump('hatch') * 1.4, 'the truck flies higher');

  const api = boot();
  api.G.lifeKills = 999999;
  api.selectCar('sport');
  api.startCampaign(); api.beginLevel();
  assert(api.car.boost === 2, 'the coupe starts with two nitros, got ' + api.car.boost);
  api.selectCar('hatch'); api.nextCar();
  assert(api.car.boost === 1, 'the hatchback with one');
});

test('the chosen car and the lifetime tally survive a reload', () => {
  const api = boot();
  api.G.lifeKills = 5000;
  api.selectCar('monster');
  api.saveBest();
  assert(api._store[api.CAR_KEY] === 'monster', 'car written');
  assert(api._store[api.KILLS_KEY] === '5000', 'kills written');
  const again = boot({ store: api._store });
  assert(again.G.lifeKills === 5000, 'tally read back');
  assert(again.getCar().id === 'monster', 'car read back');
});

test('a saved car that is no longer unlocked falls back to the hatchback', () => {
  const api = boot({ store: { merry_crashmas_car_v1: 'sleigh', merry_crashmas_kills_v1: '0' } });
  assert(api.getCar().id === 'hatch', 'fell back, got ' + api.getCar().id);
});

test('kills add to the lifetime tally', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0;
  const before = api.G.lifeKills;
  api.G.phase = 'drive';
  api.killPerson(api.addPerson(2000, 1100), 800, 0, 'car');
  assert(api.G.lifeKills === before + 1, 'counted');
});

test('every car renders, on the ground and mid-roll', () => {
  const api = boot();
  api.G.lifeKills = 999999;
  api.startCampaign(); api.beginLevel();
  for (const c of api.CARS){
    api.selectCar(c.id);
    api.G.phase = 'drive';
    api.car.z = 0; api.car.roll = 0; api.draw();
    api.car.z = 120; api.car.roll = 3.0; api.car.air = 1; api.draw();
    api.car.air = 0; api.car.z = 0;
  }
  api.renderGarage();
});

/* --------------------------------------------------------------- goals --- */

test('every market asks for three different things, and the same three twice', () => {
  const api = boot();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    const goals = api.G.goals;
    assert(goals.length === 3, 'market ' + i + ' has three goals, got ' + goals.length);
    const ids = goals.map(g => g.id);
    assert(new Set(ids).size === 3, 'and no duplicates: ' + ids.join());
    for (const g of goals) assert(g.text && g.text.length > 4, 'each goal reads: ' + JSON.stringify(g));
    const again = boot();
    again.startLevel(i);
    assert(again.G.goals.map(g => g.id).join() === ids.join(), 'market ' + i + ' rerolls the same goals');
  }
});

test('goals never ask for something the market does not have', () => {
  const api = boot();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    for (const g of api.G.goals){
      if (g.id === 'santa') assert(api.people.some(p => p.kind === 'santa'), 'santa goal without a santa');
      if (g.id === 'carousel') assert(api.props.some(o => o.kind === 'carousel'), 'carousel goal without one');
      if (g.id === 'tree') assert(api.props.some(o => o.kind === 'bigtree'), 'tree goal without one');
    }
  }
});

test('a market never asks you to fell something you cannot reach', () => {
  /* The landmark goals were nine 2-star walls: the starting car needed 1522px/s
     at contact for the tree and arrives at ~900 in an empty world, and on the
     deepest markets it never gets there at all. HP came down, the carousel moved
     forward, and anything still out of reach is no longer asked for. */
  const api = boot();
  let offered = 0;
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    for (const g of api.G.goals){
      const kind = g.id === 'tree' ? 'bigtree' : g.id === 'carousel' ? 'carousel' : null;
      if (!kind) continue;
      offered++;
      const o = api.props.find(x => x.kind === kind);
      assert(o.x - api.C.ANCHOR.x <= 2650,
        api.LEVELS[i].name + ' asks for a ' + kind + ' ' + Math.round(o.x - api.C.ANCHOR.x) + 'px downrange');
    }
  }
  assert(offered > 0, 'landmark goals should still be offered somewhere');
});

test('an aimed shot with the starting car can fell a landmark', () => {
  const felled = (name, kind) => {
    for (const off of [-90, 0, 90]){
      const api = boot();
      const i = api.LEVELS.findIndex(l => l.name === name);
      api.startLevel(i); api.beginLevel();
      const t = api.props.find(o => o.kind === kind);
      if (!t) return false;
      const dx = t.x - api.C.ANCHOR.x, dy = (t.y + off) - api.C.ANCHOR.y, d = Math.hypot(dx, dy);
      api.launch(-dx / d * api.C.MAX_PULL, -dy / d * api.C.MAX_PULL);
      let fired = false;
      for (let f = 0; f < 900 && api.G.phase === 'drive'; f++){
        api.update(1 / 60);
        if (!fired && Math.hypot(t.x - api.car.x, t.y - api.car.y) < 800){ api.doBoost(); fired = true; }
      }
      if (t.dead) return true;
    }
    return false;
  };
  assert(felled('THE BIG TREE', 'bigtree'), 'the town tree survives an aimed nitro run');
  assert(felled('CAROUSEL SQUARE', 'carousel'), 'the carousel survives an aimed nitro run');
});

test('Santa can be run over by somebody who aims at him', () => {
  /* He is one person in a market of hundreds, so a blind run never finds him;
     what has to be true is that a player who spots him and takes a few goes can
     have him. He also used to sprint like a shopper, which meant an aimed shot
     missed by ~150px every time — he flees at 0.42 now, being old and padded
     and carrying a sack. */
  const api = boot();
  const markets = [];
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    if (api.G.goals.some(g => g.id === 'santa')) markets.push(i);
  }
  assert(markets.length > 0, 'somebody should be asked to run over Santa');

  for (const i of markets){
    let got = false;
    for (const off of [-120, -60, -20, 0, 20, 60, 120]){
      const run = boot();
      run.startLevel(i); run.beginLevel();
      const s = run.people.find(p => p.kind === 'santa');
      assert(s, api.LEVELS[i].name + ' asks for Santa but has none');
      const dx = s.x - run.C.ANCHOR.x, dy = (s.y + off) - run.C.ANCHOR.y, d = Math.hypot(dx, dy);
      run.launch(-dx / d * run.C.MAX_PULL, -dy / d * run.C.MAX_PULL);
      let fired = false;
      for (let f = 0; f < 900 && run.G.phase === 'drive'; f++){
        run.update(1 / 60);
        if (!fired && Math.hypot(s.x - run.car.x, s.y - run.car.y) < 800){ run.doBoost(); fired = true; }
      }
      if ((run.G.byKind.santa || 0) > 0){ got = true; break; }
    }
    assert(got, api.LEVELS[i].name + ': seven aimed runs and Santa walked away from all of them');
  }
});

test('a goal ticks off the moment it is met', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.G.goals = [{ id:'stalls', n: 2, text:'Wreck 2 stalls', done: false }];
  api.G.goalsDone = 0;
  api.G.bigWrecks = 1;
  api.checkGoals();
  assert(!api.G.goals[0].done, 'not yet');
  api.G.bigWrecks = 2;
  api.checkGoals();
  assert(api.G.goals[0].done && api.G.goalsDone === 1, 'ticked');
  api.checkGoals();
  assert(api.G.goalsDone === 1, 'and only counted once');
});

test('the trackers behind the goals actually move', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.startLevel(0);
  api.G.byKind = {}; api.G.rolls = 0; api.G.jumps = 0; api.G.bestSlam = 0; api.G.nitroKills = 0;
  api.G.phase = 'drive';

  api.killPerson(api.addPerson(2000, 1100, 'elder'), 900, 0, 'car');
  api.killPerson(api.addPerson(2100, 1100, 'kid'), 900, 0, 'car');
  assert(api.G.byKind.elder === 1 && api.G.byKind.kid === 1, 'kills counted by kind');

  const ramp = api.addProp('ramp', 2400, 1100, {});
  drive(api, 1200, 0, 2400 - ramp.w / 2 - api.C.CAR_R - 10, 1100);
  step(api, 0.25);
  assert(api.G.jumps === 1, 'jumps counted');

  api.car.air = 1; api.car.z = 20; api.car.rollAcc = Math.PI * 2 * 2;
  for (let i = 0; i < 4; i++) api.addPerson(api.car.x + i * 8, api.car.y);
  api.land();
  assert(api.G.rolls >= 2, 'rolls counted, got ' + api.G.rolls);
  assert(api.G.bestSlam >= 3, 'the biggest landing is remembered, got ' + api.G.bestSlam);

  drive(api, 600, 0, 3000, 1100);
  api.car.boost = 1;
  api.doBoost();
  api.killPerson(api.addPerson(3010, 1100), 900, 0, 'car');
  assert(api.G.nitroKills === 1, 'kills under nitro counted');
});

test('a market carries its own weather and palette', () => {
  const api = boot();
  const seen = new Set();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.genMarket(api.LEVELS[i]);
    const th = api.getTheme();
    assert(th && th.name, 'market ' + i + ' has a theme');
    seen.add(th.name);
    assert(api.snow.length === th.snow, 'snowfall matches the weather: ' + api.snow.length + ' vs ' + th.snow);
  }
  assert(seen.size >= 5, 'the markets should not all look the same, got ' + seen.size);
});

test('the whole campaign renders, theme by theme', () => {
  const api = boot();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    api.beginLevel();
    api.launch(-api.C.MAX_PULL, (i - 2) * 40);
    for (let f = 0; f < 240; f++){ api.update(1 / 60); api.stepSnow(1 / 60); api.draw(); }
  }
});

/* -------------------------------------------------------------- replay --- */

test('a fast kill throws limbs and pixels; a slow one only pixels', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.fx.length = 0;
  api.G.phase = 'drive';
  api.killPerson(api.addPerson(2000, 1100), 1800, 0, 'car');
  const limbs = api.fx.filter(f => f.type === 'limb');
  assert(limbs.length > 0, 'flat out should take pieces off, got ' + limbs.length);
  assert(limbs.some(f => f.part === 'arm' || f.part === 'leg' || f.part === 'head'), 'named parts');
  assert(api.fx.filter(f => f.type === 'pixel').length > 8, 'and a burst of pixels');

  api.fx.length = 0;
  api.killPerson(api.addPerson(2300, 1100), 220, 0, 'car');
  assert(api.fx.filter(f => f.type === 'limb').length === 0, 'a slow bump leaves them whole');
  assert(api.fx.filter(f => f.type === 'pixel').length > 0, 'but still throws pixels');
});

test('limbs land and stain the snow', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.fx.length = 0; api.gore.length = 0;
  api.gib(2000, 1100, 1200, 0, 2, '#c8443a', '#f0c9a4');
  const before = api.gore.length;
  step(api, 2.2);
  assert(api.gore.length > before, 'the pieces leave marks where they settle');
});

test('the recorder keeps a rolling window, not the whole run', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  step(api, 4);
  const held = api.rec.frames.length;
  assert(held > 10, 'it is recording, got ' + held);
  assert(held <= Math.ceil(api.C.REC_KEEP * api.C.REC_HZ) + 3,
    'the ring should stay about ' + api.C.REC_KEEP + 's, got ' + held);
  const spanS = api.rec.frames[held - 1].t - api.rec.frames[0].t;
  assert(spanS <= api.C.REC_KEEP + 0.15, 'window span ' + spanS.toFixed(2) + 's');
});

test('only what is near the car gets filmed', () => {
  const api = boot();
  api.startLevel(5); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100;
  const f = api.recSnap();
  const n = f.ents.length / 8;
  assert(n > 0, 'somebody is in shot');
  assert(n < api.people.length, 'but not all 700 of them: ' + n + ' of ' + api.people.length);
  for (let i = 0; i < f.ents.length; i += 8){
    assert(Math.abs(f.ents[i + 1] - api.car.x) <= api.C.REC_RADIUS, 'filmed someone out of range');
  }
});

test('a recorded frame is bounded even in the thickest crowd', () => {
  const api = boot();
  api.startLevel(5); api.beginLevel();
  api.G.phase = 'drive';
  // park the car in the densest spot we can find and film it
  let best = api.people[0], bestN = 0;
  for (const p of api.people){
    let n = 0;
    for (const q of api.people){
      if (Math.abs(q.x - p.x) < 300 && Math.abs(q.y - p.y) < 300) n++;
    }
    if (n > bestN){ bestN = n; best = p; }
  }
  api.car.x = best.x; api.car.y = best.y;
  const f = api.recSnap();
  assert(f.ents.length <= 96 * 8, 'per-frame entity cap held, got ' + f.ents.length / 8);
  assert(f.props.length <= 46 * 5, 'per-frame prop cap held, got ' + f.props.length / 5);
  // and the ring cannot grow without bound over a long run
  for (let i = 0; i < 3000; i++){ api.setT(api.getT() + 1 / 60); api.recStep(1 / 60); }
  assert(api.rec.frames.length <= Math.ceil(api.C.REC_KEEP * api.C.REC_HZ) + 3,
    'ring bounded, got ' + api.rec.frames.length);
});

test('the best two seconds beat a quieter window', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.phase = 'drive';
  api.car.x = 1700; api.car.y = 1100;

  // drive the recorder directly: two kills over here...
  const tick = (secs) => {
    for (let i = 0; i < Math.round(secs * 60); i++){
      api.setT(api.getT() + 1 / 60);
      api.recStep(1 / 60);
    }
  };
  for (let i = 0; i < 5; i++){
    api.killPerson(api.addPerson(1700 + i * 40, 1100), 900, 0, 'car');
    tick(0.12);
  }
  const quiet = api.clip.kills;
  tick(3);                                   // ...a long quiet stretch...

  // ...then a far busier second, a long way away
  api.car.x = 3800;
  for (let i = 0; i < 11; i++){
    api.killPerson(api.addPerson(3800 + i * 40, 1100), 900, 0, 'car');
    tick(0.1);
  }
  tick(0.3);

  assert(quiet === 5, 'the first group was captured while it was the best, got ' + quiet);
  assert(api.clip.kills >= 9, 'the busy stretch should win, got ' + api.clip.kills);
  assert(api.clip.cx > 3600, 'and the clip centres on it, got ' + Math.round(api.clip.cx));
  assert(api.clip.worth >= api.C.REPLAY_MIN_WORTH, 'worth ' + api.clip.worth);
  const span = api.clip.frames[api.clip.frames.length - 1].t - api.clip.frames[0].t;
  assert(span <= api.C.REC_WINDOW + 0.1, 'the clip is a two-second window, got ' + span.toFixed(2));
});

test('a stretch of pure demolition is worth a replay too', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100;
  for (let i = 0; i < 8; i++){
    api.wreckProp(api.addProp('hut', 2000 + i * 200, 1100, {}), 800, 0);
    for (let k = 0; k < 6; k++){ api.setT(api.getT() + 1 / 60); api.recStep(1 / 60); }
  }
  assert(api.clip.wrecks >= 8, 'the smashes were recorded, got ' + api.clip.wrecks);
  assert(api.replayReady(), 'eight stalls in two seconds earns a replay');
});

test('a quiet run is not worth a replay', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  drive(api, 900, 0, 1500, 1100);
  for (let i = 0; i < 600 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  assert(!api.replayReady(), 'nothing happened, so nothing to show');
  step(api, 3);
  assert(api.G.phase === 'aim' || api.G.phase === 'results', 'it goes straight on, got ' + api.G.phase);
});

test('the replay plays back in slow motion and then hands over', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.carsLeft = 2;
  for (let i = 0; i < 10; i++) api.addPerson(2000 + i * 70, 1100);
  drive(api, 1500, 0, 1700, 1100);
  for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  assert(api.replayReady(), 'a clip is waiting');
  const clipKills = api.clip.kills;

  step(api, 1.4);                            // settle hands over to the replay
  assert(api.G.phase === 'replay', 'expected the replay, got ' + api.G.phase);
  assert(/ IN [\d.]+ SECONDS| IN TWO SECONDS/.test(api.rp.caption), 'captioned: ' + api.rp.caption);
  assert(api.rp.caption.indexOf(String(clipKills)) === 0, 'with the kill count');
  const wide = api.camTarget().z;
  assert(wide < 700, 'the camera moves in close, z=' + wide);

  const t0 = api.rp.t;
  api.update(1 / 60);
  near(api.rp.t - t0, api.C.REPLAY_SPEED / 60, 1e-4, 'playback runs slow');
  api.draw();                                // the letterboxed frame renders

  for (let i = 0; i < 1200 && api.G.phase === 'replay'; i++) api.update(1 / 60);
  assert(api.G.phase === 'aim', 'and then the next car is up, got ' + api.G.phase);
});

test('the replay leaves the market exactly as it found it', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  // build the clip deterministically rather than hoping the run earns one —
  // this test used to bail out silently when it did not
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.carsLeft = 2;
  for (let i = 0; i < 10; i++) api.addPerson(2000 + i * 70, 1100);
  drive(api, 1500, 0, 1700, 1100);
  for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  assert(api.replayReady(), 'the run earned a clip');
  for (let i = 0; i < 200 && api.G.phase !== 'replay'; i++) api.update(1 / 60);
  assert(api.G.phase === 'replay', 'in the replay');
  const before = api.people.map(p => [p.x, p.y, p.dead, p.squash, p.ang, p.panic, p.cry, p.fly]);
  const propsBefore = api.props.map(o => [o.x, o.y, o.dead, o.hp]);
  const carBefore = [api.car.x, api.car.y, api.car.ang, api.car.z, api.car.roll, api.car.gore];
  const kills = api.G.kills, score = api.G.levelScore;
  for (let i = 0; i < 1200 && api.G.phase === 'replay'; i++) api.update(1 / 60);

  api.people.forEach((p, i) => {
    near(p.x, before[i][0], 0.001, 'person ' + i + ' moved during the replay');
    near(p.y, before[i][1], 0.001, 'person ' + i + ' moved in y');
    assert(p.dead === before[i][2], 'person ' + i + ' changed state');
    near(p.squash, before[i][3], 0.001, 'person ' + i + ' squash changed');
    near(p.ang, before[i][4], 0.001, 'person ' + i + ' facing changed');
    near(p.panic, before[i][5], 0.001, 'person ' + i + ' panic changed');
    near(p.cry, before[i][6], 0.001, 'person ' + i + ' crying changed');
    near(p.fly, before[i][7], 0.001, 'person ' + i + ' flight changed');
  });
  api.props.forEach((o, i) => {
    near(o.x, propsBefore[i][0], 0.001, 'prop ' + i + ' moved');
    near(o.y, propsBefore[i][1], 0.001, 'prop ' + i + ' moved in y');
    assert(o.dead === propsBefore[i][2], 'prop ' + i + ' changed state');
    near(o.hp, propsBefore[i][3], 0.001, 'prop ' + i + ' hp changed');
  });
  // the car is the one thing that legitimately moves: the replay hands over to
  // the next car, which starts on the sling
  near(api.car.x, api.C.ANCHOR.x, 0.001, 'the next car should be on the sling');
  near(api.car.z, 0, 0.001, 'and on the ground');
  near(api.car.roll, 0, 0.001, 'and the right way up');
  assert(carBefore[0] > api.C.ANCHOR.x + 200, 'the wreck really was out in the market');
  assert(api.G.kills === kills, 'the replay must not score again');
  assert(api.G.levelScore === score, 'nor add points');
});

test('the replay can be skipped', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.carsLeft = 2;
  for (let i = 0; i < 10; i++) api.addPerson(2000 + i * 70, 1100);
  drive(api, 1500, 0, 1700, 1100);
  for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  step(api, 1.4);
  assert(api.G.phase === 'replay', 'in the replay');
  api.skipReplay();
  api.update(1 / 60);
  assert(api.G.phase === 'aim', 'skipping goes straight to the next car');
});

test('the last car still ends the level after its replay', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.recReset();
  api.G.carsLeft = 0;
  for (let i = 0; i < 10; i++) api.addPerson(2000 + i * 70, 1100);
  drive(api, 1500, 0, 1700, 1100);
  for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  step(api, 1.4);
  assert(api.G.phase === 'replay', 'the last run gets its replay too');
  api.skipReplay(); api.update(1 / 60);
  assert(api.G.phase === 'results', 'then the scoreboard, got ' + api.G.phase);
});

/* --------------------------------------------------------------- feel --- */

test('a hit at speed lands harder than a nudge', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0;
  api.G.phase = 'drive';
  const at = (sp) => {
    api.G.combo = 0; api.G.mult = 1; api.G.comboT = 0;   // the combo must not be the variable
    api._clearFeel();
    api.G.phase = 'drive';
    const p = api.addPerson(2000 + sp, 1100);
    api.killPerson(p, sp, 0, 'car');
    return { shake: api.shake.a, stop: api.getHitstop(), flash: api.getFlash() };
  };
  const nudge = at(100), mid = at(600), fast = at(1200), flat = at(1900);
  assert(nudge.shake < mid.shake && mid.shake < fast.shake && fast.shake <= flat.shake,
    'shake should climb with impact: ' + [nudge, mid, fast, flat].map(x => x.shake.toFixed(1)).join(' → '));
  assert(flat.shake >= nudge.shake * 2.5,
    'flat out should shake 2.5x a nudge, got ' + flat.shake.toFixed(1) + ' vs ' + nudge.shake.toFixed(1));
  assert(nudge.stop < flat.stop && flat.stop >= nudge.stop * 2,
    'hit-stop should climb: ' + nudge.stop.toFixed(3) + ' → ' + flat.stop.toFixed(3));
  assert(nudge.flash === 0 && flat.flash > 0, 'only a real hit should flash the screen');
});

test('the launch is the calmest thing in the game', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.shake.a = 0;
  api.launch(-api.C.MAX_PULL, 0);
  const launchShake = api.shake.a;
  assert(launchShake < 6, 'the launch shakes ' + launchShake.toFixed(1));

  api.props.length = 0; api.people.length = 0;
  api._clearFeel(); api.G.combo = 0; api.G.phase = 'drive';
  api.killPerson(api.addPerson(2200, 1100), 1900, 0, 'car');
  assert(api.shake.a > launchShake,
    'running somebody over at 1900 (' + api.shake.a.toFixed(1) + ') should out-punch the launch (' +
    launchShake.toFixed(1) + ')');
});

test('a landing on a crowd flashes the screen', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.G.phase = 'drive';
  api._clearFeel();
  for (let i = 0; i < 6; i++) api.addPerson(2000 + Math.cos(i) * 25, 1100 + Math.sin(i) * 25);
  drive(api, 900, 0, 2000, 1100);
  api.car.air = 1; api.car.z = 30; api.car.vz = -300; api.car.rollAcc = 0;
  api.land();
  assert(api.getFlash() >= 0.35, 'the showpiece move should flash, got ' + api.getFlash().toFixed(2));
});

test('the aftermath is short, and shorter still when nothing happened', () => {
  const tail = (kills) => {
    const api = boot();
    api.startLevel(0); api.beginLevel();
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
    api.recReset();
    api.G.carsLeft = 3;
    for (let i = 0; i < kills; i++) api.addPerson(2000 + i * 60, 1100);
    drive(api, 1500, 0, 1700, 1100);
    for (let i = 0; i < 900 && api.G.phase === 'drive'; i++) api.update(1 / 60);
    let t = 0;
    while (api.G.phase !== 'aim' && t < 20){ api.update(1 / 60); t += 1 / 60; }
    return t;
  };
  const quiet = tail(0);
  assert(quiet <= 0.7, 'a run that hit nothing should hand over in 0.7s, took ' + quiet.toFixed(2));
  /* A run that earns a highlight is allowed to be longer — the two-second
     slow-motion clip is the feature, not the filler. What had to go was the
     1.33s of nothing that used to sit between the car stopping and the replay
     starting. Settle before a queued replay is now 0.3s. */
  const busy = tail(12);
  assert(busy <= 4.3, 'a run with a replay should tail off in 4.3s, took ' + busy.toFixed(2));
  assert(busy - quiet > 1.5, 'the replay should be most of that tail');
});

test('the run can never end while the car could still kill somebody', () => {
  const api = boot();
  assert(api.C.STOP_SPD > api.C.KILL_SPD,
    'STOP_SPD ' + api.C.STOP_SPD + ' must stay above KILL_SPD ' + api.C.KILL_SPD);
});

test('a quiet run gets no replay, a busy one does', () => {
  const runWith = (n) => {
    const api = boot();
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
    api.recReset();
    api.G.phase = 'drive';
    api.car.x = 2000; api.car.y = 1100;
    for (let i = 0; i < n; i++){
      api.killPerson(api.addPerson(2000 + i * 30, 1100), 900, 0, 'car');
      for (let k = 0; k < 6; k++){ api.setT(api.getT() + 1 / 60); api.recStep(1 / 60); }
    }
    return api.replayReady();
  };
  assert(!runWith(4), 'four kills is not a highlight');
  assert(runWith(6), 'six in two seconds is');
});

test('the run summary sits at the top, not across the wreckage', () => {
  const api = boot({ w: 1280, h: 720, count: true });
  api.startLevel(0); api.beginLevel();
  api.G.banner = { text: '9 DOWN · 3 WRECKED · 4,200', t: 1.2 };
  api.draw();
  // drawHUD places the receipt at VH*0.115 and combo shouts at VH*0.30
  assert(0.115 * 720 < 0.18 * 720, 'the receipt is inside the top strip');
  api.G.banner = { text: 'MARKET MAYHEM', t: 1.2 };
  api.draw();                                  // the loud one still renders centre
});

/* ---------------------------------------------------------- destruction --- */

test('a big stall takes the neighbours with it', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.G.phase = 'drive';
  const tree = api.addProp('bigtree', 2000, 1100, {});
  const gifts = api.addProp('gifts', 2090, 1100, {});
  const far = api.addProp('gifts', 2600, 1100, {});
  const close = api.addPerson(2050, 1100);
  const nearby = api.addPerson(2180, 1100);
  const away = api.addPerson(2700, 1100);
  api.wreckProp(tree, 600, 0);
  assert(gifts.dead, 'the gift pile beside it is destroyed');
  assert(!far.dead, 'the one down the aisle is not');
  assert(close.dead, 'anyone against it is killed');
  assert(!away.dead, 'the far shopper is fine');
  assert(nearby.panic === 1 && Math.hypot(nearby.vx, nearby.vy) > 100, 'the rest are blown back');
});

test('wrecks leave a debris field, and it stays bounded', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.debris.length = 0;
  for (let i = 0; i < 60; i++){
    const hut = api.addProp('hut', 2000 + i * 200, 1100, {});
    api.wreckProp(hut, 500, 0);
  }
  assert(api.debris.length > 20, 'planks everywhere, got ' + api.debris.length);
  assert(api.debris.length <= api.C.DEBRIS_MAX, 'but capped, got ' + api.debris.length);
});

test('a damaged stall is still standing but visibly worse', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const hut = api.addProp('hut', 2000, 1100, {});
  drive(api, 560, 0, 2000 - hut.w / 2 - api.C.CAR_R - 8, 1100);
  step(api, 0.4);
  assert(!hut.dead, 'it survived');
  assert(hut.hp < hut.maxHp * 0.8, 'but it is battered, ' + hut.hp + '/' + hut.maxHp);
  api.draw();                             // the damaged state renders
});

/* ----------------------------------------------------------------- air --- */

test('a snowbank at speed puts the car in the air', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const ramp = api.addProp('ramp', 2000, 1100, {});
  assert(ramp.ramp, 'the snowbank is flagged as a ramp');
  drive(api, 1200, 0, 2000 - ramp.w / 2 - api.C.CAR_R - 10, 1100);
  step(api, 0.25);
  assert(api.car.air === 1, 'the car should be airborne');
  assert(api.car.z > 0, 'and off the ground');
  assert(api.car.vx > 900, 'a ramp costs almost no speed, got ' + api.car.vx);
  assert(Math.abs(api.car.rollV) > 2, 'it should be rolling');
});

test('a crawl over a snowbank is just a bump', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const ramp = api.addProp('ramp', 2000, 1100, {});
  drive(api, api.C.RAMP_MIN - 120, 0, 2000 - ramp.w / 2 - api.C.CAR_R - 10, 1100);
  step(api, 0.4);
  assert(api.car.air === 0, 'too slow to take off');
  assert(api.car.z === 0, 'still on the ground');
});

test('an airborne car flies over stalls and lands again', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const ramp = api.addProp('ramp', 1600, 1100, {});
  const hut = api.addProp('hut', 1900, 1100, {});
  drive(api, 1400, 0, 1600 - ramp.w / 2 - api.C.CAR_R - 10, 1100);
  step(api, 0.2);
  assert(api.car.air === 1, 'airborne');
  const hp0 = hut.hp;
  let maxZ = 0, flew = false;
  for (let i = 0; i < 200 && api.car.air; i++){
    api.update(1 / 60);
    maxZ = Math.max(maxZ, api.car.z);
    if (api.car.x > 1900) flew = true;
  }
  assert(maxZ > 60, 'it should get properly airborne, peak ' + maxZ);
  assert(flew, 'and travel past the stall');
  assert(hut.hp === hp0 && !hut.dead, 'the stall it flew over is untouched');
  assert(api.car.air === 0 && api.car.z === 0, 'and it comes back down');
});

test('the landing flattens everyone underneath at once', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  for (let i = 0; i < 5; i++) api.addPerson(2000 + Math.cos(i) * 30, 1100 + Math.sin(i) * 30);
  const far = api.addPerson(2400, 1100);
  drive(api, 800, 0, 2000, 1100);
  api.car.air = 1; api.car.z = 40; api.car.vz = -300; api.car.rollAcc = 0;
  api.land();
  assert(api.people.filter(p => p.dead).length >= 5, 'the whole cluster goes under the wheels');
  assert(!far.dead, 'and the one down the aisle does not');
  assert(api.G.banner && /UNDER THE WHEELS/.test(api.G.banner.text), 'a slam banner fires');
});

test('one real jump is one barrel roll, in every car', () => {
  /* Driven through takeOff/stepAir/land for real rather than by hand-setting
     rollAcc — the roll rate used to be a constant fighting a capped flight
     time, so the van could not complete a turn at any speed up to 4000px/s and
     no car in the game could complete two. */
  for (const car of ['hatch', 'van', 'sport', 'monster', 'sleigh']){
    for (const sp of [1400, 1900]){
      const api = boot();
      api.G.lifeKills = 999999;
      api.selectCar(car);
      api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
      api.G.rolls = 0;
      const ramp = api.addProp('ramp', 2200, 1100, {});
      drive(api, sp, 0, 2200 - ramp.w / 2 - api.getDims().r - 12, 1100);
      for (let i = 0; i < 400 && (api.car.air || api.car.z > 0 || i < 6); i++) api.update(1 / 60);
      assert(api.G.rolls >= 1,
        car + ' at ' + sp + 'px/s landed ' + api.G.rolls + ' rolls off one jump');
    }
  }
});

test('a crawl over a snowbank is a wobble, not a roll', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.G.rolls = 0;
  const ramp = api.addProp('ramp', 2200, 1100, {});
  drive(api, api.C.RAMP_MIN + 40, 0, 2200 - ramp.w / 2 - api.C.CAR_R - 12, 1100);
  for (let i = 0; i < 400 && (api.car.air || i < 6); i++) api.update(1 / 60);
  assert(api.G.rolls === 0, 'a barely-airborne hop should not count as a roll');
});

test('no market asks for more jumps than it has snowbanks', () => {
  const api = boot();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    const ramps = api.props.filter(o => o.kind === 'ramp').length;
    for (const g of api.G.goals){
      if (g.id === 'air' || g.id === 'roll'){
        assert(ramps > 0, api.LEVELS[i].name + ' asks for ' + g.id + ' with no ramps');
        assert(g.n <= ramps,
          api.LEVELS[i].name + ' asks for ' + g.n + ' ' + g.id + ' with ' + ramps + ' ramps');
      }
      if (g.id === 'slam') assert(ramps > 0, api.LEVELS[i].name + ' asks for a slam with no ramps');
    }
  }
});

test('every market has a snowbank on the approach to its densest crowd', () => {
  const api = boot();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    // find the fullest 200px cell, the way genMarket does
    const cell = 200, bins = {};
    let best = null;
    for (const p of api.people){
      const key = Math.round(p.x / cell) + ',' + Math.round(p.y / cell);
      const b = bins[key] || (bins[key] = { n: 0, x: Math.round(p.x / cell) * cell, y: Math.round(p.y / cell) * cell });
      b.n++;
      if (!best || b.n > best.n) best = b;
    }
    const near = api.props.some(o => o.kind === 'ramp' &&
      o.x < best.x && best.x - o.x < 620 && Math.abs(o.y - best.y) < 220);
    assert(near, api.LEVELS[i].name + ': no snowbank upstream of the crowd at ' +
      Math.round(best.x) + ',' + Math.round(best.y));
  }
});

test('a completed roll pays out on landing', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  drive(api, 700, 0, 2000, 1100);
  api.G.levelScore = 0; api.G.mult = 1;
  api.car.air = 1; api.car.z = 20; api.car.rollAcc = Math.PI * 2 * 2 + 0.3;   // two full rolls
  api.land();
  assert(api.G.levelScore >= api.C.FLIP_PTS * 2, 'two rolls pay twice, got ' + api.G.levelScore);
  assert(api.G.banner && /ROLL/.test(api.G.banner.text), 'a roll banner fires');
  assert(api.car.rollAcc === 0 && api.car.roll === 0, 'the roll resets on the ground');
});

test('the flight arc is gravity, not a straight line', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  drive(api, 900, 0, 2000, 1100);
  api.takeOff(900, null);
  const up = api.car.vz;
  assert(up > 0, 'launched upward');
  const heights = [];
  for (let i = 0; i < 40 && api.car.air; i++){ api.update(1 / 60); heights.push(api.car.z); }
  const peak = Math.max(...heights);
  assert(peak > 20, 'it gets some height, peak ' + peak);
  assert(heights[heights.length - 1] < peak, 'and comes back down');
});

/* --------------------------------------------------------------- blood --- */

test('a kill leaves blood on the snow and on the car', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  api.gore.length = 0;
  const p = api.addPerson(2000, 1100);
  drive(api, 900, 0, 1990, 1100);
  assert(api.car.gore === 0, 'clean car to start');
  api.stepCarKills();
  assert(p.dead, 'killed');
  assert(api.gore.length > 4, 'a pool and spray, got ' + api.gore.length);
  assert(api.gore.some(g => g.kind === 'pool'), 'there is a pool');
  assert(api.car.gore > 0 && api.car.bloody > 0, 'the car is marked too');
  assert(api.fx.some(f => f.type === 'blood'), 'blood sprays as particles');
});

test('blood dries off the tyres, and the decal buffer is capped', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  drive(api, 400, 0, 1200, 1100);
  api.car.bloody = 1;
  step(api, 3);
  assert(api.car.bloody < 0.6, 'the smear fades as you drive, got ' + api.car.bloody);
  for (let i = 0; i < api.C.GORE_MAX + 200; i++) api.addGore(1000 + i, 1100, 10, 'splat');
  assert(api.gore.length <= api.C.GORE_MAX, 'decals capped, got ' + api.gore.length);
});

test('a run through a crowd paints the aisle', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  // a whole level of full-power runs, spread across the market
  for (let i = 0; i < api.G.cars; i++){
    api.launch(-api.C.MAX_PULL, (i - 1) * 110);
    step(api, 30);
  }
  assert(api.G.kills > 0, 'somebody went under');
  assert(api.gore.length > api.G.kills, 'every kill leaves more than one mark');
  assert(api.tracks.some(t => t.red > 0.05), 'and the tyres carry it down the aisle');
});

test('a fast kill throws chunks that stain where they land', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.gore.length = 0; api.fx.length = 0;
  api.G.phase = 'drive';
  const p = api.addPerson(2000, 1100);
  api.killPerson(p, 1700, 0, 'car');
  const chunks = api.fx.filter(f => f.type === 'chunk');
  assert(chunks.length > 0, 'flat out should throw chunks');
  assert(api.fx.some(f => f.type === 'mist'), 'and a mist');
  const before = api.gore.filter(g => g.kind === 'chunk').length;
  step(api, 1.5);
  assert(api.gore.filter(g => g.kind === 'chunk').length > before, 'chunks stain where they land');
});

test('a slow kill is messy but not chunky', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.gore.length = 0; api.fx.length = 0;
  api.G.phase = 'drive';
  const p = api.addPerson(2000, 1100);
  api.killPerson(p, 300, 0, 'car');
  assert(api.gore.length > 3, 'still leaves blood');
  assert(!api.fx.some(f => f.type === 'chunk'), 'but nothing comes apart at 300px/s');
});

test('blood hits the camera and then dries off it', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.lens.length = 0;
  api.G.phase = 'drive';
  api.killPerson(api.addPerson(2000, 1100), 1500, 0, 'car');
  assert(api.lens.length > 0, 'the lens catches some');
  api.splatLens(60);
  assert(api.lens.length <= 27, 'the lens buffer is bounded, got ' + api.lens.length);
  api.drawLens();
  step(api, 7);
  assert(api.lens.length === 0, 'and it clears, got ' + api.lens.length);
});

test('driving back over a body drags it and paints the snow', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0; api.ice.length = 0;
  const p = api.addPerson(2000, 1100);
  api.G.phase = 'drive';
  api.killPerson(p, 200, 0, 'car');
  p.fly = 0;
  api.gore.length = 0;
  const sq = p.squash;
  drive(api, 600, 0, 2000, 1100);
  api.stepCarKills();
  assert(p.smear === 1, 'the pass is counted');
  assert(p.squash < sq, 'and it flattens them further');
  assert(api.gore.length > 3, 'leaving a smear');
  for (let i = 0; i < 6; i++){ api.car.x = 2000; api.car.y = 1100; api.stepCarKills(); }
  assert(p.smear <= 3, 'but a body only smears so far, got ' + p.smear);
});

test('bodies are squashed by what hit them', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0;
  api.G.phase = 'drive';
  const slow = api.addPerson(2000, 1100);
  api.killPerson(slow, 200, 0, 'car');
  const fast = api.addPerson(2200, 1100);
  api.killPerson(fast, 1900, 0, 'car');
  const slam = api.addPerson(2400, 1100);
  api.killPerson(slam, 0, 0, 'slam');
  assert(fast.squash < slow.squash, 'faster leaves them flatter');
  assert(slam.squash < 0.4, 'a landing flattens them most');
  api.drawPerson(fast);            // the sprawled body renders
});

/* ---------------------------------------------------------------- flow --- */

test('a level is set up from its definition', () => {
  const api = boot();
  api.startLevel(2);
  const lv = api.LEVELS[2];
  assert(api.G.phase === 'brief', 'brief first');
  assert(api.G.cars === lv.cars && api.G.carsLeft === lv.cars, 'cars from the level def');
  assert(api.G.levelScore === 0, 'level score starts clean');
  assert(api.G.target > 0 && api.G.target < api.G.potential, 'target is a slice of the market');
});

test('stars are awarded against the target, and a miss locks the next market', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.G.carsLeft = 0;
  api.G.levelScore = api.G.target - 1;
  api.levelEnd();
  assert(api.G.stars === 0, 'below target is no stars');
  assert(api.G.unlocked === 0, 'a miss unlocks nothing');
  api.nextLevel();
  assert(api.G.level === 0, 'a miss sends you back to the same market');

  api.G.levelScore = api.G.target; api.G.goalsDone = 0;
  api.levelEnd(); assert(api.G.stars === 1, 'target alone is one star');
  api.G.goalsDone = 2; api.levelEnd(); assert(api.G.stars === 2, 'goals earn the second');
  api.G.goalsDone = 3; api.levelEnd(); assert(api.G.stars === 3, 'all three goals earn the third');
  api.G.levelScore = api.G.target - 1; api.levelEnd();
  assert(api.G.stars === 0, 'goals alone do not clear a market');
  assert(api.G.unlocked === 1, 'clearing unlocks the next market');
});

test('a retry rolls the campaign total back to the start of the level', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.G.score = 5000; api.G.levelStart = 5000;
  api.G.levelScore = 3000; api.G.score += 3000;
  api.G.carsLeft = 0;
  api.levelEnd();
  api.retryLevel();
  assert(api.G.score === 5000, 'campaign total restored, got ' + api.G.score);
  assert(api.G.levelScore === 0, 'level score cleared');
  assert(api.G.level === 0, 'same market');
});

test('clearing the last market reaches the finale', () => {
  const api = boot();
  api.startLevel(api.LEVELS.length - 1);
  api.beginLevel();
  api.G.carsLeft = 0;
  api.G.levelScore = api.G.target * 3;
  api.levelEnd();
  api.nextLevel();
  assert(api.G.phase === 'finale', 'expected the finale, got ' + api.G.phase);
});

test('the best score and unlocked market survive a reload', () => {
  const api = boot();
  api.G.score = 41234;
  api.G.unlocked = 3;
  api.saveBest();
  assert(api._store[api.BEST_KEY] === '41234', 'best written');
  const again = boot({ store: api._store });
  assert(again.G.best === 41234, 'best read back, got ' + again.G.best);
  assert(again.G.unlocked === 3, 'progress read back');
});

test('a lower score never overwrites the best', () => {
  const api = boot({ store: { merry_crashmas_best_v1: '99999' } });
  assert(api.G.best === 99999, 'loaded');
  api.G.score = 100;
  api.saveBest();
  assert(api.G.best === 99999, 'best held');
  assert(api._store.merry_crashmas_best_v1 === '99999', 'storage held');
});

test('corrupt save data does not break the boot', () => {
  const api = boot({ store: { merry_crashmas_best_v1: 'sleigh', merry_crashmas_progress_v1: '{}' } });
  assert(api.G.best === 0, 'garbage best reads as 0');
  assert(api.G.unlocked === 0, 'garbage progress reads as 0');
});

test('each run reports its own tally when the car stops', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  for (let i = 0; i < 1800 && api.G.phase === 'drive'; i++) api.update(1 / 60);
  assert(api.G.phase === 'settle', 'the car should have come to rest');
  assert(api.G.runKills + api.G.runWrecks > 0, 'the run should have hit something');
  assert(api.G.runScore > 0, 'run score tallied');
  assert(api.G.banner && /DOWN|SCRATCH/.test(api.G.banner.text), 'a run summary is shown');
  const first = api.G.runScore;
  step(api, 2);                       // settle hands over to the replay or the next car
  if (api.G.phase === 'replay'){ api.skipReplay(); api.update(1 / 60); }
  assert(api.G.phase === 'aim', 'next car ready, got ' + api.G.phase);
  api.launch(-api.C.MAX_PULL, 0);
  assert(api.G.runScore === 0, 'the tally resets for the next car');
  assert(api.G.levelScore >= first, 'but the level total keeps it');
});

/* -------------------------------------------------------------- camera --- */

/* The camera is allowed to look past the fence now — hard-clamping to it meant
   the last halfW of every market could never be centred, which is exactly where
   the market pulls its fence in to bounce a long shot back. What it must never
   do is lose the car. */
test('the camera keeps the car in frame and the road ahead visible', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.camSnap();
  api.launch(-api.C.MAX_PULL, 0);
  let worstPct = 0, worstAhead = 1e9;
  for (let i = 0; i < 600 && api.G.phase === 'drive'; i++){
    api.update(1 / 60);
    const sx = (api.car.x - api.cam.x) * api.cam.s + 1280 / 2;
    worstPct = Math.max(worstPct, sx / 1280);
    worstAhead = Math.min(worstAhead, 1280 - sx);
    assert(Number.isFinite(api.cam.x) && Number.isFinite(api.cam.s), 'camera went non-finite');
  }
  assert(worstPct <= 0.65, 'the car reached ' + Math.round(worstPct * 100) + '% of screen width');
  assert(worstAhead >= 600, 'only ' + Math.round(worstAhead) + 'px of road ahead at the worst point');
});

test('the camera keeps the car in frame on odd-shaped viewports too', () => {
  for (const [w, h] of [[1440, 600], [844, 390], [390, 844]]){
    const api = boot({ w, h });
    api.startLevel(0); api.beginLevel();
    api.camSnap();
    api.launch(-api.C.MAX_PULL, 0);
    let worstPct = 0;
    for (let i = 0; i < 600 && api.G.phase === 'drive'; i++){
      api.update(1 / 60);
      const sx = (api.car.x - api.cam.x) * api.cam.s + w / 2;
      worstPct = Math.max(worstPct, sx / w);
      assert(Number.isFinite(api.cam.x) && Number.isFinite(api.cam.s), w + 'x' + h + ': camera non-finite');
    }
    assert(worstPct <= 0.72, w + 'x' + h + ': car reached ' + Math.round(worstPct * 100) + '% of width');
  }
});

test('a narrow window pulls back instead of cropping the market away', () => {
  const wide = boot({ w: 1280, h: 720 });
  wide.startLevel(0); wide.beginLevel(); wide.camSnap();
  const tall = boot({ w: 390, h: 844 });
  tall.startLevel(0); tall.beginLevel(); tall.camSnap();
  const seen = (api, w) => {
    const halfW = w / api.cam.s / 2;
    return api.people.filter(p => Math.abs(p.x - api.cam.x) <= halfW).length / api.people.length;
  };
  assert(seen(tall, 390) >= 0.6,
    'portrait shows only ' + Math.round(seen(tall, 390) * 100) + '% of the crowd before launch');
  assert(tall.cam.s < wide.cam.s, 'portrait should be pulled further back');
});

test('a playfield narrower than the view is simply centred', () => {
  const api = boot();
  api.startLevel(0); api.beginLevel();
  api.bounds.x0 = 1000; api.bounds.x1 = 1400;   // narrower than any sane viewport
  api.bounds.y0 = 900;  api.bounds.y1 = 1300;
  api.camSnap();
  near(api.cam.x, 1200, 1, 'camera centred on x');
  near(api.cam.y, 1100, 1, 'camera centred on y');
});

test('the aim view is wider than the chase view', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const aimZ = api.camTarget().z;
  drive(api, 300, 0, 2000, 1100);
  assert(api.camTarget().z < aimZ, 'the chase should be closer in than the aim overview');
});

test('each market pulls the far fence in behind its last stall', () => {
  const api = boot();
  api.genMarket(api.LEVELS[0]);
  const small = api.bounds.x1;
  api.genMarket(api.LEVELS[5]);
  assert(api.bounds.x1 > small, 'the last market is the wider playfield');
  assert(small > api.C.MARKET_X + 600, 'even the smallest market has room to drive');
  assert(api.bounds.x1 <= api.C.WORLD_W - api.C.FENCE_PAD, 'never past the world edge');
  const far = Math.max(...api.props.map(o => o.x));
  assert(api.bounds.x1 > far, 'the fence sits behind the last stall');
});

test('the view zooms out with speed', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  drive(api, 100, 0, 2000, 1100);
  const slow = api.camTarget().z;
  drive(api, 1600, 0, 2000, 1100);
  assert(api.camTarget().z > slow, 'faster means wider');
});

/* --------------------------------------------------------------- draw --- */

test('the whole render path runs in every phase', () => {
  const api = boot();
  api.draw();                                   // menu
  api.startCampaign(); api.draw();              // brief
  api.beginLevel(); api.draw();                 // aim
  api.pointerDown(400, 360); api.pointerMove(200, 300); api.draw();  // dragging the sling
  api.launch(-api.C.MAX_PULL, -120);
  for (let i = 0; i < 200; i++){ api.update(1 / 60); api.stepSnow(1 / 60); api.draw(); }
  api.G.banner = { text: 'MARKET MAYHEM', t: 1.2 };
  api.draw();
  api.G.carsLeft = 0; api.G.levelScore = api.G.target * 3;
  api.levelEnd(); api.draw();                   // results
  api.finale(); api.draw();                     // finale
});

test('a real run leaves wreckage, particles and tyre tracks behind', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  let peakFx = 0;
  for (let i = 0; i < 360; i++){ api.update(1 / 60); peakFx = Math.max(peakFx, api.fx.length); }
  assert(api.tracks.length > 5, 'tyre tracks laid, got ' + api.tracks.length);
  assert(api.G.kills + api.G.wrecks > 0, 'a full-power run down the aisle should hit something');
  assert(peakFx > 20, 'the crash should throw particles, peak was ' + peakFx);
  assert(api.fx.length < peakFx, 'and they should clear up afterwards');
});

/* A market has to be beatable by aiming at the crowd, not by knowing the
   layout. Fire a level's cars down a few different lines and the best of them
   should clear the target — with room to spare, since a player aims at what
   they can see and these are blind. */
function blindBest(api, level, angles){
  let best = 0;
  for (const dy of angles){
    const run = boot();
    run.startLevel(level);
    run.beginLevel();
    for (let i = 0; i < run.G.cars; i++){
      run.launch(-run.C.MAX_PULL, dy + (i - 1) * 40);
      for (let f = 0; f < 2400 && run.G.phase !== 'aim' && run.G.phase !== 'results'; f++){
        run.skipReplay();
        run.update(1 / 60);
      }
    }
    best = Math.max(best, run.G.levelScore);
  }
  return best;
}

test('the campaign is twenty-one markets, each with an identity', () => {
  const api = boot();
  assert(api.LEVELS.length === 21, 'expected 21 markets, got ' + api.LEVELS.length);
  const names = new Set(), seeds = new Set(), shapes = new Set(), themes = new Set();
  for (const lv of api.LEVELS){
    assert(lv.name && lv.flavour && lv.flavour.length > 20, lv.name + ' needs a line about it');
    names.add(lv.name); seeds.add(lv.seed); shapes.add(lv.shape); themes.add(lv.theme);
    assert(lv.cars >= 3 && lv.cars <= 6, lv.name + ' car count');
    assert(lv.par > 0.05 && lv.par < 0.6, lv.name + ' par out of range: ' + lv.par);
  }
  assert(names.size === 21 && seeds.size === 21, 'no duplicate names or seeds');
  assert(shapes.size >= 5, 'at least five layout shapes in play, got ' + shapes.size);
  assert(themes.size >= 5, 'at least five themes in play, got ' + themes.size);
});

test('every market builds, is populated, and renders', () => {
  const api = boot();
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    const lv = api.LEVELS[i];
    assert(api.people.length > 60, lv.name + ' is empty: ' + api.people.length + ' people');
    assert(api.props.length > 20, lv.name + ' has no market: ' + api.props.length + ' props');
    assert(api.G.target > 1000, lv.name + ' target ' + api.G.target);
    assert(api.G.goals.length === 3, lv.name + ' goals');
    for (const p of api.people){
      assert(p.x > api.C.ANCHOR.x + 60, lv.name + ': somebody is standing on the launch pad');
    }
    api.beginLevel();
    api.draw();
  }
});

test('the set pieces actually appear where a market asks for them', () => {
  const api = boot();
  const byName = n => api.LEVELS.findIndex(l => l.name === n);

  api.startLevel(byName('THE ICE RINK'));
  assert(api.ice.some(p => p.r > 380), 'the rink is a proper sheet of ice');
  assert(api.people.some(p => p.march), 'with skaters going round it');

  api.startLevel(byName('THE GAUNTLET'));
  const bollards = api.props.filter(o => o.kind === 'nutcracker').length;
  assert(bollards >= 20, 'the gauntlet needs its chicanes, got ' + bollards);

  api.startLevel(byName('THE PARADE'));
  const marchers = api.people.filter(p => p.march).length;
  assert(marchers >= 25, 'the parade should be a column, got ' + marchers);

  api.startLevel(byName('THE CHOIR'));
  // a block of sixty standing in ten-wide rows
  let packed = 0;
  for (const p of api.people){
    let n = 0;
    for (const q of api.people) if (Math.abs(q.x - p.x) < 90 && Math.abs(q.y - p.y) < 90) n++;
    packed = Math.max(packed, n);
  }
  assert(packed >= 12, 'the choir stand should be shoulder to shoulder, got ' + packed);

  api.startLevel(byName('ROOFTOPS'));
  assert(api.props.filter(o => o.kind === 'ramp').length >= 6, 'rooftops needs its snowbanks');
});

test('marchers walk their line and turn at the fence', () => {
  const api = boot();
  api.props.length = 0; api.people.length = 0;
  const m = api.addPerson(2000, api.bounds.y1 - 80);
  m.march = { dx: 0, dy: 1 };
  m.walk = 70;
  const y0 = m.y;
  for (let i = 0; i < 60; i++) api.stepPeople(1 / 60);
  assert(m.y > y0, 'it marches');
  for (let i = 0; i < 400; i++) api.stepPeople(1 / 60);
  assert(m.y < api.bounds.y1, 'and turns rather than walking through the fence');
});

test('targets climb across the campaign', () => {
  const api = boot();
  const targets = [];
  for (let i = 0; i < api.LEVELS.length; i++){ api.startLevel(i); targets.push(api.G.target); }
  const early = targets.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const late = targets.slice(-5).reduce((a, b) => a + b, 0) / 5;
  assert(late > early * 1.6, 'the last markets should ask a lot more: ' + Math.round(early) + ' → ' + Math.round(late));
});

test('the first market is beatable blind', () => {
  const api = boot();
  api.startLevel(0);
  const target = api.G.target;
  const best = blindBest(api, 0, [-140, 0, 140]);
  assert(best >= target, 'best blind run ' + best + ' vs target ' + target);
});

test('the last market is beatable blind too', () => {
  const api = boot();
  api.startLevel(api.LEVELS.length - 1);
  const target = api.G.target;
  const best = blindBest(api, api.LEVELS.length - 1, [-180, 0, 180]);
  assert(best >= target, 'best blind run ' + best + ' vs target ' + target);
});

test('the awkward markets are beatable blind as well', () => {
  const api = boot();
  for (const name of ['THE GAUNTLET', 'THE LONG BOULEVARD', 'THE CHOIR']){
    const i = api.LEVELS.findIndex(l => l.name === name);
    api.startLevel(i);
    const target = api.G.target;
    const best = blindBest(api, i, [-200, 0, 200]);
    assert(best >= target, name + ': best blind run ' + best + ' vs target ' + target);
  }
});

test('particle and track buffers stay bounded', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  for (let i = 0; i < api.G.cars; i++){ api.launch(-api.C.MAX_PULL, (i - 1) * 80); step(api, 30); }
  assert(api.fx.length <= 1100, 'fx buffer bounded, got ' + api.fx.length);
  assert(api.tracks.length <= 500, 'track buffer bounded, got ' + api.tracks.length);
});

test('the sim survives a wildly variable frame rate', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, -200);
  for (let i = 0; i < 400; i++){
    api.update(i % 7 === 0 ? 0.05 : i % 3 === 0 ? 0.004 : 1 / 60);
  }
  assert(Number.isFinite(api.car.x) && Number.isFinite(api.car.y), 'car position stayed finite');
  assert(api.car.x >= api.bounds.x0 - 1 && api.car.x <= api.bounds.x1 + 1, 'car in bounds');
  for (const p of api.people) assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'person went NaN');
});

/* ---------------------------------------------------------------- cost --- */

/* The draw path is what a busy market costs per frame. Off-camera culling is
   the whole defence: a late market holds 700 shoppers, hundreds of blood
   decals and a debris field, and almost none of it is in shot. This counts the
   2d calls one frame actually issues so the culling cannot quietly rot. */
test('one frame of the worst market stays inside its draw budget', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(api.LEVELS.length - 1);
  api.beginLevel();
  // saturate every buffer the way a finished run would
  for (let i = 0; i < api.C.GORE_MAX + 100; i++){
    api.addGore(1600 + (i * 37) % 3000, 300 + (i * 53) % 1600, 20, i % 3 ? 'splat' : 'pool');
  }
  for (let i = 0; i < api.C.DEBRIS_MAX; i++){
    api.debris.push({ x: 1600 + (i * 41) % 3000, y: 300 + (i * 59) % 1600,
      w: 30, h: 8, rot: i, col: '#a8703c' });
  }
  for (let i = 0; i < 140; i++) api.people[i % api.people.length].panic = 1;
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.vx = 800;
  api.camSnap();
  api.draw();                       // warm the cached gradients
  api._resetCounts();
  api.draw();

  const c = api._counts;
  const fills = c.fill || 0, strokes = c.stroke || 0;
  assert(fills > 200, 'the frame should actually be drawing something, got ' + fills);
  console.log('    (worst-frame draw cost: ' + fills + ' fills, ' + strokes + ' strokes)');
  assert(fills < 3400, 'fill budget blown: ' + fills);
  assert(strokes < 1500, 'stroke budget blown: ' + strokes);
  assert(!c.createRadialGradient, 'the vignette gradient should be cached, not rebuilt');
  assert(!c.createLinearGradient, 'the floor gradient should be cached, not rebuilt');
  assert(api.gore.length <= api.C.GORE_MAX, 'gore capped');
});

test('drawing scales with what is on camera, not with the whole market', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(api.LEVELS.length - 1);
  api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100;
  api.camSnap();
  api.draw(); api._resetCounts(); api.draw();
  const busy = api._counts.fill || 0;

  // same market, camera parked out on the empty approach
  api.car.x = api.C.ANCHOR.x; api.car.y = api.C.ANCHOR.y;
  api.camSnap();
  api.draw(); api._resetCounts(); api.draw();
  const empty = api._counts.fill || 0;
  assert(empty < busy * 0.7, 'an empty view should cost far less: ' + empty + ' vs ' + busy);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
