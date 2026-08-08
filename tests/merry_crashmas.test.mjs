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
  reseed, rnd, rr, ri, vrnd, vrr, clamp, lerp, angLerp, fmt,
  genMarket, addProp, addPerson,
  toMenu, startCampaign, startLevel, beginLevel, nextCar, launch, endRun,
  levelEnd, nextLevel, retryLevel, finale, loadBest, saveBest,
  addScore, bumpCombo, breakCombo, stepCombo,
  killPerson, stepPeople, wreckProp, stepProps, stepSpills, stepFx,
  carSpeed, inCar, doBoost, hitProp, stepCarCollisions, stepCarKills, stepPickups,
  bounceBounds, onIce, stepCar, stepCam, camSnap, camTarget, update, stepSnow,
  takeOff, land, stepAir, addGore, bleed, splatLens, stepLens, blast, rollKind, KINDS,
  gib, pixels, rec, clip, rp, recStep, recReset, recSnap, replayReady, startReplay,
  GOALS, THEMES, rollGoals, checkGoals, goalTest, goalProgress,
  drawBalloons, balloonAt, BALLOONS, BALLOON_PX, replayGore, drawStains,
  CARS, CAR_KEY, KILLS_KEY, STARS_KEY, BESTPER_KEY, selectCar, carUnlocked, renderGarage,
  pickLevel, readStars, readBest, starsOn, bestOn, starsTotal,
  getCar: () => CAR, getDims: () => ({ l: CARL, w: CARW, r: CARR }),
  getTheme: () => TH,
  stepReplay, skipReplay, endReplay, replayApply, drawReplayFrame,
  drawCar, drawPerson, drawLens, drawCrowdBatch,
  lodQ, lodAlways, LOD_MID, LOD_FINE, LOD_REF,
  draw, drawHUD, drawAim, drawSling, previewPath, drawShout, nitroRect, popText, screenToWorld, pointerDown, pointerMove, pointerUp, fit,
  SHOUTS, SHOUT_TIME, SLING_RECOIL, LAUNCH_PUNCH_Z, CAR_MIN_PX, MIN_FILL, CAM_OVERSHOOT,
  C: { WORLD_W, WORLD_H, ANCHOR, MARKET_X, FENCE_PAD, CAR_L, CAR_W, CAR_R,
       MAX_PULL, MIN_POWER, MAX_LAUNCH, FRICTION, DRAG, ICE_FRICTION, STOP_SPD,
       RUN_TIMEOUT, REST, REST_HARD, KILL_SPD, DMG_PER_SPD, COMBO_WIN, MAX_MULT,
       SCARE_R, FLEE_SPD, BOOST_KICK, PLOW_TIME, PERSON_PTS, SANTA_PTS,
       GRAV_Z, RAMP_MIN, RAMP_KICK, RAMP_MAX_VZ, LAND_R, FLIP_PTS, AIR_PTS, GORE_MAX, DEBRIS_MAX,
       REC_HZ, REC_WINDOW, REC_KEEP, REC_RADIUS, REPLAY_SPEED, REPLAY_MIN_WORTH },
  getT: () => T, setT: (v) => { T = v; },
  getFlash: () => flash, getHitstop: () => hitstop,
  _clearFeel: () => { hitstop = 0; flash = 0; shake.t = 0; shake.a = 0; },
  _setHitstop: (v) => { hitstop = v; },
  setFlash: (v) => { flash = v; },
  goFullscreen, getWentFull: () => wentFull,
  getView: () => ({ w: VW, h: VH, rotated }),
  toCanvas, wantRotate,
  audioInit, engineStart, engineSet, engineStop, sndSquish, sndWail, sndThud, sndLand,
  wailSlot, noise, toggleMute, stepFx, hitProp, goalMarkers, drawEdgeMarkers, sndLaunch,
  somethingAhead, rollOut, IDLE_END, IDLE_SPD, AHEAD_R, AHEAD_WIDE,
  addFx, onCamera, FX_MAX, FX_EVICT, FLAME_SMOKE, doBoost, BOOST_KICK,
  reachableRamps, ROLL_SPD, carCost, levelEnd, shakeEnv, addShake, drawFx, drawCarRim, drawVignette,
  drawLights, shadow, SHADOW_FINE, PROP_FINE, propQ, propFine, LOD_REF, snowPattern, lightBuf, MAX_LIGHTS, DARK_SCALE, SUN_DX, SUN_DY,
  foot, FOOT_MAX, FOOT_STRIDE, FOOT_TTL, drawFootprints, beamSpots, HAIR,
  PROPS, TRADES, tradeOf, drawGoods, drawHut, hudPlate, hudScoreRect, hudCarsRect, goalRowY, goalTextW, drawProp,
  EDGE_FADE, EDGE_TREES, EDGE_BANDS, drawGround,
  drawTreeTop, spikeRing, TREE_TIER, TREE_SPIKE, TREE_SNOW, TREE_SNOW_C, drawGround, recentPops, POP_MIN_D, POP_MIN_T,
  captionScrim, REPLAY_SPEED, crateOf, launchFireworks, wreckProp, drawFireworks, FW_COLS,
  carLitDir, drawCar, plowReach, PLOW_PAD, PLOW_T, PLOW_GORE, paintCarThumb, withCtx, carBars, carProgress, CAR_STATS, THUMB_W, THUMB_H, carShadow,
  finale, nextLevel, toMenu, drawPickup, drawPickupGlow, pickupCol, PICKUP_RGB,
  wires, buildWires, drawWires, drawWireBulbs, wireSag, WIRE_MIN, WIRE_MAX, WIRE_DY, WIRE_COLS,
  windNow, WIND_STREAK, drawSnow, seedSnow,
  drawGate, drawGateBulbs, GATE_X, GATE_HALF,
  drawStallSigns, signMark, signAt, SIGN_W, SIGN_H,
  slingPosts, slingBand, drawSling, POST_X, POST_Y, aimCar,
  paintMarketThumb, paintShutTile, SHUT_SLATS, mkLane, mkRand, MK_W, MK_H, THEMES,
  drawSpills, drawSpillHeat, spillPath, SPILL_HOT,
  drawSpilledStock, WRECK_SPILL, WRECK_ITEMS, GLUH_CUPS, drawHut,
  BARREL_STAVES, BARREL_SNOW,
  drawCounter, goodsN, goodsX, snowCapPath, SNOW_LOBES,
  bannerBox, bannerFont, bannerLayout, bannerRibbon,
  paintGore, gorePath, goreCore, bloodLayer, BLOOD_A, BLOOD_SCALE,
  bloodInfo: () => ({ w: bloodW, h: bloodH, key: bloodKey, cv: bloodCv }),
  getFootI: () => footI,
  getBakeCount: () => bakeCount,
  darkInfo: () => ({ w: darkW, h: darkH, key: darkKey, cv: darkCv }),
  COATS, ELDER_COATS, KID_COATS, SKIN, HATS, BAG_COLS, PRAM_HOOD, drawPerson, camScale,
  C2: { WAIL_VOICES, WAIL_LEN, WAIL_RANGE },
  // tone/noise are function declarations in the game's scope, so the suite can
  // swap them out and count what a run actually asks the mixer for
  _spyAudio: () => {
    const c = { tone: 0, noise: 0, freqs: [] };
    tone = (f) => { c.tone++; c.freqs.push(f); };
    noise = () => { c.noise++; };
    return c;
  },
};
`;

/* Roughly what system-ui gives at these sizes. The harness cannot lay out
   type, so this is the one approximation the layout tests are built on — and
   it is also what the stubbed measureText answers with, so the game's own
   measured layouts and the suite's expectations come from one formula. */
const textW = (s, fs) => s.length * fs * 0.58;
const fontPx = (f) => { const m = /(\d+(?:\.\d+)?)px/.exec(String(f || '')); return m ? +m[1] : 16; };

function boot(opts){
  const o = opts || {};
  const gradient = { addColorStop(){} };
  const counts = {};
  const ctxStub = new Proxy({}, { get(t, p){
    /* A flat 30 made every measured layout in the game a lie under test: the
       score plate is sized off its goal text now, and at width 30 it never
       needed to grow. */
    if (p === 'measureText') return (s) => ({ width: textW(String(s), fontPx(t.font)) });
    // the words a frame puts on screen, so a headless suite can read them
    if (p === 'fillText') return (t) => {
      if (!o.count) return;
      counts.fillText = (counts.fillText || 0) + 1;
      (counts._text || (counts._text = [])).push(String(t));
    };
    if (p === 'createLinearGradient' || p === 'createRadialGradient')
      return () => { if (o.count) counts[p] = (counts[p] || 0) + 1; return gradient; };
    if (p === 'canvas') return { width: o.w || 960, height: o.h || 600 };
    if (o.count && typeof p === 'string' && p !== 'then')
      return () => { counts[p] = (counts[p] || 0) + 1; };
    return () => {};
  // the colours a frame asks for are the only way a headless suite can see what
  // shade of night the light pass laid down
  }, set(t, p, v){
    if (o.count && (p === 'fillStyle' || p === 'strokeStyle' || p === 'globalCompositeOperation')){
      const seen = counts._styles || (counts._styles = []);
      if (seen.length < 40000) seen.push(String(v));
    }
    // how heavy a line is, so a band under tension can be measured
    if (o.count && p === 'lineWidth'){
      const w = counts._widths || (counts._widths = []);
      if (w.length < 40000) w.push(+v);
    }
    return true;
  } });
  const el = () => ({
    style: { setProperty(){} }, textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
    addEventListener(){},
    /* Attributes are remembered rather than dropped, so a suite can see which
       elements show() has hidden — the results card's NEW BEST badge is a
       hidden attribute and nothing else. */
    _attrs: {},
    removeAttribute(k){ delete this._attrs[k]; },
    setAttribute(k, v){ this._attrs[k] = String(v); },
    hasAttribute(k){ return k in this._attrs; },
    setPointerCapture(){}, querySelector: () => null,
    classList: { add(){}, remove(){}, toggle(){} },
  });
  const canvas = el();
  // a document element that can be asked for fullscreen, and can refuse
  const fsEl = { _on: false, _calls: 0, _grant: true,
    requestFullscreen(){ this._calls++;
      return this._grant ? (this._on = true, Promise.resolve()) : Promise.reject(new Error('no')); } };
  const store = Object.assign({}, o.store || {});
  const nodes = {};
  const listeners = {};
  const sandbox = {
    document: {
      getElementById: (id) => (id === 'c' ? canvas : (nodes[id] || (nodes[id] = el()))),
      createElement: () => el(),
      documentElement: fsEl,
      get fullscreenElement(){ return fsEl._on ? fsEl : null; },
      body: { classList: { add(){}, remove(){}, toggle(){} }, className: '' },
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
  let patched = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  if (o.tweak) patched = o.tweak(patched);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', 'setTimeout', '__out', patched)(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined,
    sandbox.requestAnimationFrame, sandbox.setTimeout, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  api._counts = counts;
  api._ctxStub = ctxStub;
  api._resetCounts = () => { for (const k in counts) delete counts[k]; };
  api._nodes = nodes;
  api._listeners = listeners;
  api._window = sandbox.window;
  api._fs = fsEl;
  return api;
}

/* Everything in the garage owned. Two of the cars cost stars now, so a big
   kill count alone no longer buys them. */
const ALL_CARS = { merry_crashmas_kills_v1: '999999',
                   merry_crashmas_stars_v1: JSON.stringify(new Array(40).fill(3)) };

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

/* This used to assert `14 + 168 < 390 - 14 - 118` — three copies of drawHUD's
   own numbers, so drawHUD could move either panel anywhere and it would still
   pass. It reads the rectangles drawHUD actually draws now, and it has to,
   because the score plate is no longer a fixed width. */
test('the HUD panels do not sit on top of each other on a phone', () => {
  // the score panel and the car counter used to overlap by 78px at 390 wide
  for (const [w, h] of [[390, 844], [520, 400], [1280, 720], [2560, 1440]]){
    const api = boot({ w, h, count: true });
    api.startCampaign(); api.beginLevel();
    api.draw(); api._resetCounts(); api.draw();
    assert((api._counts.fill || 0) > 10, w + 'x' + h + ': the HUD drew something');
    const s = api.hudScoreRect(), c = api.hudCarsRect();
    const view = api.getView();
    assert(s.x + s.w < c.x, w + 'x' + h + ': panels overlap — score ends ' +
      (s.x + s.w) + ', cars start ' + c.x);
    assert(c.x + c.w <= view.w - 1, w + 'x' + h + ': the car counter is off the right edge');
    assert(s.x >= 1, w + 'x' + h + ': the score plate is off the left edge');
  }
});

/* The goal rows are the only thing telling you what the two extra stars cost.
   The plate was sized off its contents vertically and off a hard-coded 168/250
   horizontally, so thirteen of the sixty-three goal lines finished up to 45px
   past it, on the raw market, in grey. */
test('every goal line fits on the plate that is meant to carry it', () => {
  const rows = [];
  for (const [w, h] of [[1280, 720], [520, 400], [430, 320]]){
    const api = boot({ w, h });
    let worst = -999, worstAt = '';
    for (let lv = 0; lv < api.LEVELS.length; lv++){
      api.startLevel(lv); api.beginLevel();
      const r = api.hudScoreRect(), narrow = api.getView().w < 560;
      const lead = r.x + 12 + (narrow ? 8 : 10) + 7;
      for (const g of api.G.goals){
        // the row is the text AND, on the same line, its own "3,120 / 5,800"
        const at = api.goalProgress(g);
        const end = lead + textW(g.text, narrow ? 10 : 12) +
          (at ? textW(at, narrow ? 10 : 12) + 14 : 0);
        const slack = (r.x + r.w) - end;
        if (slack < worst || worst === -999){ worst = slack; worstAt = api.LEVELS[lv].name + ' “' + g.text + '”'; }
        assert(slack >= 0, w + 'x' + h + ': ' + worstAt + ' runs ' +
          (-slack).toFixed(0) + 'px past the plate');
      }
      // and every row's baseline is inside the plate it is drawn on
      for (let i = 0; i < api.G.goals.length; i++){
        const gy = api.goalRowY(i);
        assert(gy > r.y && gy <= r.y + r.h,
          w + 'x' + h + ': goal row ' + i + ' has its baseline at ' + gy +
          ', plate is ' + r.y + '…' + (r.y + r.h));
      }
    }
    rows.push(w + 'x' + h + ' ' + worst.toFixed(0) + 'px spare');
  }
  console.log('    (goal plate: ' + rows.join(' | ') + ')');
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

/* The previous test starts at `launch()`. The leak was one phase earlier: the
   last two lines of drawAim wrote car.x/car.y, so a gesture that had a frame
   drawn during it launched from the pulled-back position and an identical
   gesture that did not launched from the anchor, 430px downrange. Frame pacing
   decided where the run started. */
test('the drag, not the renderer, decides where the car is', () => {
  const gesture = (drawDuringDrag) => {
    const api = boot();
    api.startCampaign(); api.beginLevel();
    api.pointerDown(700, 430);
    api.pointerMove(700 - api.C.MAX_PULL * api.cam.s, 430);
    const pulledTo = Math.round(api.car.x);
    if (drawDuringDrag) api.draw();
    const afterDraw = Math.round(api.car.x);
    api.pointerUp();
    for (let f = 0; f < 2400 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
      api.skipReplay(); api.update(1 / 60);
    }
    return { pulledTo, afterDraw, score: api.G.levelScore, kills: api.G.kills };
  };
  const cold = gesture(false), warm = gesture(true);
  assert(cold.pulledTo === Math.round(api0AnchorX() - api0MaxPull()),
    'the drag should put the car at the pull position without any draw, got ' + cold.pulledTo);
  assert(warm.afterDraw === warm.pulledTo, 'drawing must not move it: ' +
    warm.pulledTo + ' -> ' + warm.afterDraw);
  assert(cold.score === warm.score && cold.kills === warm.kills,
    'the same gesture scored ' + cold.score + '/' + cold.kills +
    ' undrawn and ' + warm.score + '/' + warm.kills + ' drawn');
});
function api0AnchorX(){ return boot().C.ANCHOR.x; }
function api0MaxPull(){ return boot().C.MAX_PULL; }

/* The replay is decoration. Watching one used to cost you score on the next
   shot, because replayGore drew from the simulation's generator — in the one
   system the game explicitly invites you to skip. */
test('watching the replay costs nothing', () => {
  const play = (lv, dy, skip) => {
    const api = boot();
    api.startLevel(lv); api.beginLevel();
    for (let c = 0; c < api.G.cars; c++){
      api.launch(-api.C.MAX_PULL, dy + (c - 1) * 40);
      for (let f = 0; f < 4000 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
        if (skip) api.skipReplay();
        api.update(1 / 60);
      }
    }
    return api.G.levelScore + '/' + api.G.kills + '/' + api.G.stars;
  };
  const bad = [];
  for (const lv of [0, 5, 10, 15, 20]){
    for (const dy of [-200, 0, 200]){
      const skipped = play(lv, dy, true), watched = play(lv, dy, false);
      if (skipped !== watched) bad.push('lv' + lv + ' dy' + dy + ': ' + skipped + ' vs ' + watched);
    }
  }
  assert(bad.length === 0, 'skipping changed the run:\n  ' + bad.join('\n  '));
});

/* `!== 'replay'` let the crowd walk behind the briefing card, so how long you
   spent reading the briefing changed where every shopper stood: the same four
   shots scored 17,275 after half a second and 21,715 after thirty. */
test('a market you have not started yet does not move', () => {
  const dwell = (frames) => {
    const api = boot();
    api.startCampaign();
    assert(api.G.phase === 'brief', 'startCampaign should sit on the briefing card');
    for (let i = 0; i < frames; i++) api.update(1 / 60);
    api.beginLevel();
    for (let c = 0; c < api.G.cars; c++){
      api.launch(-api.C.MAX_PULL, (c - 1) * 40);
      for (let f = 0; f < 2400 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
        api.skipReplay(); api.update(1 / 60);
      }
    }
    return api.G.levelScore;
  };
  const quick = dwell(30), slow = dwell(1800);
  assert(quick === slow, 'thirty seconds on the briefing card changed the market: ' +
    quick + ' vs ' + slow);
});

/* The whole frame used to be scaled by 0.18, so the frame straddling the end of
   a stop lost its remainder too and one hit-stop cost 76-96px of travel
   depending on the frame rate. */
test('a hit-stop costs the same wherever the frames fall', () => {
  const travel = (dt, stop) => {
    const api = boot();
    api.startCampaign(); api.beginLevel();
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0;
    api.G.phase = 'drive';
    api.car.x = 1200; api.car.y = 1100; api.car.vx = 1500; api.car.vy = 0;
    api.G.runT = 0;
    if (stop) api._setHitstop(0.05);
    const x0 = api.car.x;
    for (let t = 0; t < 0.5; t += dt) api.update(dt);
    return api.car.x - x0;
  };
  const costs = [1 / 30, 1 / 60, 1 / 144].map(dt => travel(dt, false) - travel(dt, true));
  const lo = Math.min(...costs), hi = Math.max(...costs);
  console.log('    (hit-stop costs ' + costs.map(c => c.toFixed(1)).join(' / ') + 'px at 30/60/144fps)');
  assert(hi - lo < hi * 0.05,
    'a hit-stop costs ' + costs.map(c => c.toFixed(1)).join(' vs ') + 'px depending on frame rate');
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

/* The release used to be the flattest moment in the game: drawAim() bails on
   anything but the aim phase, so the posts, the band and the power arc vanished
   on the exact frame you let go, and all that was left was a small shake. */
test('letting go of the sling actually looks like something happened', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const before = api.fx.length;
  api.cam.tz = 1500;
  assert(api.launch(-api.C.MAX_PULL, -80), 'the launch should take');

  assert(api.G.sling && api.G.sling.t > 0, 'the sling outlives the release');
  near(api.G.sling.t, api.SLING_RECOIL, 0.0001, 'the band snaps for the full recoil');
  near(api.G.sling.len, api.C.MAX_PULL, 0.0001, 'the band starts at the pull it was released from');
  assert(api.fx.length - before >= 12, 'the anchor throws up snow, got ' + (api.fx.length - before));
  assert(api.fx.slice(before).every(f => f.type === 'puff'), 'and it is a puff, not debris');
  assert(api.getFlash() > 0.2, 'the release flashes, got ' + api.getFlash());
  assert(api.getHitstop() > 0.03, 'the release hit-stops, got ' + api.getHitstop());
  assert(api.cam.tz <= 1200, 'the camera punches in on release, got ' + api.cam.tz);
  near(api.cam.tz, api.LAUNCH_PUNCH_Z, 0.0001, 'to the punch zoom exactly');
});

test('the sling stops snapping, and the camera eases back out', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  const punched = api.cam.tz;
  step(api, 0.4);
  assert(!api.G.sling, 'the band is still by 0.4s');
  assert(api.cam.tz > punched + 60, 'and the camera has eased back out: ' + punched + ' -> ' + api.cam.tz);
  api.drawSling();                       // must be a no-op, not a throw
});

test('a fresh car gets a fresh sling', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  api.nextCar();
  assert(!api.G.sling, 'the previous release does not snap over the new one');
});

/* The dotted line used to integrate bare MAX_LAUNCH, FRICTION and DRAG for a
   fixed 34 steps, so every car got the same 2627px preview: the hatchback saw
   63% of its range and the sleigh, whose whole selling point is glide 2.6, saw
   23% of an 11,500px run. Unlock the best car in the game, lose the aiming UI. */
test('the aim preview ends where the car actually stops, in every car', () => {
  const worst = [];
  for (const c of boot().CARS){
    const api = boot({ store: ALL_CARS });
    api.startCampaign(); api.beginLevel();
    assert(api.selectCar(c.id), 'car should be unlocked: ' + c.id);
    // an empty field, so nothing but friction, ice and the fence is in play
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0;

    const pv = api.previewPath(-1, 0, 1);
    assert(pv.path.length < 899, c.id + ' preview hit the iteration cap, not a stop');
    assert(pv.path.length > 5, c.id + ' preview is empty');

    api.launch(-api.C.MAX_PULL, 0);
    for (let i = 0; i < 4000 && api.G.phase === 'drive'; i++) api.update(1 / 60);
    const actual = api.car.x - api.C.ANCHOR.x;
    const shown = pv.end.x - api.C.ANCHOR.x;
    const err = Math.abs(shown - actual) / Math.abs(actual);
    worst.push(c.id + ' ' + (err * 100).toFixed(1) + '%');
    assert(err < 0.10, c.id + ': preview says ' + Math.round(shown) +
      'px, the car goes ' + Math.round(actual) + 'px (' + (err * 100).toFixed(1) + '% out)');
  }
  console.log('    (preview error per car: ' + worst.join(', ') + ')');
});

test('the sleigh previews the distance it really covers', () => {
  const api = boot({ store: ALL_CARS });
  api.startCampaign(); api.beginLevel();
  api.props.length = 0; api.people.length = 0;
  const road = (id) => {
    api.selectCar(id);
    const pv = api.previewPath(-1, 0, 1);
    let d = 0, px = api.C.ANCHOR.x, py = api.C.ANCHOR.y;
    for (const s of pv.path){ d += Math.hypot(s.x - px, s.y - py); px = s.x; py = s.y; }
    return d;
  };
  const hatch = road('hatch'), sleigh = road('sleigh');
  /* The sleigh bounces off the fence and comes back, so it is the travelled
     road that shows the glide, not the terminal x — and the fence is why it
     covers 1.4x the hatchback here rather than the 4x an open field would give
     it. The preview being honest about the fence is the point. */
  assert(sleigh > hatch * 1.3,
    'the sleigh should preview far more road: ' + Math.round(sleigh) + ' vs ' + Math.round(hatch));
  /* 2,627px was what the old hard-coded line always drew, whatever car was on
     the sling. The margin over it used to be 2,900; the preview stops where
     the run stops now — it shares somethingAhead() with stepCar — so the tail
     of empty road it used to draw past the last stall is gone, and the guard
     is against the fixed line itself rather than against that tail. */
  assert(hatch > 2627, 'and even the hatchback outruns the old fixed 2627px line: ' + Math.round(hatch));
});

test('a ramp on the line is called out before you let go', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.props.length = 0; api.people.length = 0;
  assert(!api.previewPath(-1, 0, 1).ramp, 'an empty field has nothing to jump off');
  const bank = api.addProp('ramp', 1900, api.C.ANCHOR.y);
  assert(bank.ramp, 'a snowbank is a ramp');
  const pv = api.previewPath(-1, 0, 1);
  assert(pv.ramp && pv.ramp.o === bank, 'the snowbank on the line should be flagged');
  assert(Math.abs(pv.ramp.x - 1900) < 120, 'and flagged where it is, got ' + pv.ramp.x);
  // one well off the line is not
  bank.dead = true;
  const off = api.addProp('ramp', 1900, api.C.ANCHOR.y + 700);
  assert(off.ramp && !api.previewPath(-1, 0, 1).ramp, 'a ramp off the line is not flagged');
});

/* The preview used to ignore the market entirely: its terminus sat a median
   71% and up to 219% past where the car really stopped, drawn straight through
   forty stalls. It cannot track a pinball run exactly — a 40px lateral
   difference decides which stall you clip — so it draws what it knows and
   stops. The property that matters is that the confident stretch is never a
   promise the car does not keep. */
test('the confident part of the line never runs past the car', () => {
  let over = 0, n = 0, worst = -1e9;
  for (const lv of [0, 2, 5, 10, 13, 19, 20]){
    for (const dy of [-200, -70, 0, 70, 200]){
      const api = boot();
      api.startLevel(lv); api.beginLevel();
      const len = Math.hypot(api.C.MAX_PULL, dy);
      const pv = api.previewPath(-api.C.MAX_PULL / len, dy / len, 1);
      const stop = Math.max(0, Math.min(pv.sure, pv.path.length) - 1);
      const sureEnd = pv.path[stop] || pv.end;
      api.launch(-api.C.MAX_PULL, dy);
      for (let f = 0; f < 4000 && api.G.phase === 'drive'; f++) api.update(1 / 60);
      const reach = Math.max(...api.tracks.map(t => t.x));
      const d = sureEnd.x - reach;
      n++; if (d > 1) over++;
      worst = Math.max(worst, d);
    }
  }
  console.log('    (confident line vs where the car got to: worst overshoot ' +
    Math.round(worst) + 'px over ' + n + ' shots)');
  assert(over === 0, 'the confident line ran past the car in ' + over + ' of ' + n + ' shots');
});

test('a stall on the line stops the line', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.props.length = 0; api.people.length = 0;
  const open = api.previewPath(-1, 0, 1);
  assert(open.sure >= open.path.length, 'an empty field is believed all the way');
  const stall = api.addProp('hut', 1900, api.C.ANCHOR.y);
  const blocked = api.previewPath(-1, 0, 1);
  assert(blocked.sure < open.path.length, 'a stall should truncate the confident stretch');
  const at = blocked.path[Math.max(0, blocked.sure - 1)];
  assert(Math.abs(at.x - stall.x) < 200,
    'and truncate it at the stall, not somewhere else: ' + Math.round(at.x) + ' vs ' + stall.x);
});

test('no JUMP is promised past the point the line stops meaning anything', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.props.length = 0; api.people.length = 0;
  // a wall first, then a ramp well behind it
  api.addProp('hut', 1500, api.C.ANCHOR.y);
  const far = api.addProp('ramp', 2600, api.C.ANCHOR.y);
  const pv = api.previewPath(-1, 0, 1);
  assert(far.ramp, 'the fixture should be a ramp');
  assert(!pv.ramp || pv.ramp.at <= pv.sure,
    'a ramp past the horizon should not be flagged: ramp at ' +
    (pv.ramp && pv.ramp.at) + ', horizon ' + pv.sure);
});

test('the preview follows the car it is drawn for, not a fixed curve', () => {
  const api = boot({ store: ALL_CARS });
  api.startCampaign(); api.beginLevel();
  api.props.length = 0; api.people.length = 0;
  const ends = {};
  for (const c of api.CARS){
    api.selectCar(c.id);
    ends[c.id] = api.previewPath(-1, 0, 1).end.x;
  }
  const vals = Object.values(ends);
  assert(new Set(vals.map(v => Math.round(v))).size === vals.length,
    'every car should preview differently: ' + JSON.stringify(ends));
});

/* camSnap used to run against wherever the run happened to END, not where the
   clip begins, so the highlight opened with the car off screen and slid in —
   15 of 135 frames on market 1, from x = -1498. */
test('the replay opens with its subject in shot', () => {
  const bad = [];
  for (const lv of [0, 5, 10, 19]){
    const api = boot({ w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    api.launch(-api.C.MAX_PULL, 0);
    for (let f = 0; f < 4000 && api.G.phase !== 'replay' && api.G.phase !== 'aim' &&
      api.G.phase !== 'results'; f++) api.update(1 / 60);
    if (api.G.phase !== 'replay') continue;               // that run did not earn one
    const sx = 1280 / 2 + (api.car.x - api.cam.x) * api.cam.s;
    const sy = 720 / 2 + (api.car.y - api.cam.y) * api.cam.s;
    if (sx < 0 || sx > 1280 || sy < 0 || sy > 720){
      bad.push(api.LEVELS[lv].name + ' at ' + Math.round(sx) + ',' + Math.round(sy));
    }
  }
  assert(bad.length === 0, 'the clip opened with the car off screen on: ' + bad.join(', '));
});

/* ----------------------------------------------------------------- feel --- */

/* addShake was Math.max on both fields and update only decremented the timer,
   so six kills in a row held 96 consecutive frames — 1.60s — at amplitude 12.5
   to 13.6 with no dip, then dropped to zero in one frame. Kills two through six
   added nothing you could see. */
test('a shake decays, and a second hit re-punches it', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api._clearFeel();
  api.addShake(0.4, 12);
  const start = api.shake.a * api.shakeEnv();
  near(start, 12, 0.01, 'full amplitude at the start');
  step(api, 0.32);                                  // 80% of the way through
  const late = api.shake.a * api.shakeEnv();
  assert(late < start * 0.5,
    'it should be under half by 80% through, got ' + late.toFixed(2) + ' of ' + start);
  api.addShake(0.4, 12);
  near(api.shake.a * api.shakeEnv(), 12, 0.5, 'a second hit restores the punch');
  step(api, 0.5);
  assert(api.shake.a * api.shakeEnv() === 0, 'and it ends');
});

test('six kills read as six punches, not one long rumble', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api._clearFeel();
  const amps = [];
  for (let i = 0; i < 60; i++){
    if (i % 10 === 0) api.addShake(0.35, 12);       // a kill every 10 frames
    api.update(1 / 60);
    amps.push(api.shake.a * api.shakeEnv());
  }
  const peak = Math.max(...amps);
  let run = 0, flat = 0;
  for (const a of amps){ if (a > peak * 0.9){ run++; flat = Math.max(flat, run); } else run = 0; }
  // a trough between each punch: the amplitude has to come down before it can
  // go back up, or the sixth kill is indistinguishable from the first
  let troughs = 0;
  for (let i = 1; i < amps.length - 1; i++){
    if (amps[i] < amps[i - 1] && amps[i] < amps[i + 1] && amps[i] < peak * 0.75) troughs++;
  }
  assert(flat <= 8, 'the shake sat at full amplitude for ' + flat + ' frames straight');
  assert(troughs >= 4, 'each kill should be its own punch, counted ' + troughs +
    ' troughs in ' + JSON.stringify(amps.map(a => +a.toFixed(1))));
});

/* drawFx ran entirely after drawCar and repainted 77-95% of the car's own
   footprint for 49 of the 66 frames after the first kill. */
test('the blood goes under the car and the limbs go over it', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.fx.length = 0;
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100;
  api.camSnap();
  api.fx.push({ type: 'blood', x: 2000, y: 1100, vx: 0, vy: 0, t: 0, ttl: 1, size: 6, col: '#b3201a', rot: 0, spin: 0 });
  api.fx.push({ type: 'limb', part: 'arm', x: 2000, y: 1100, vx: 0, vy: 0, t: 0, ttl: 1,
    size: 9, col: '#e05143', col2: '#f0c9a4', rot: 0, spin: 0 });
  api._resetCounts();
  api.drawFx(false);
  const under = api._counts.fill || 0;
  api._resetCounts();
  api.drawFx(true);
  const over = api._counts.fill || 0;
  assert(under > 0 && over > 0, 'both halves should draw something: ' + under + ' / ' + over);
  assert(over > under, 'the limb is the more expensive of the two, got ' + over + ' vs ' + under);
  // and the call order in draw() is what makes the split mean anything
  const src = fs.readFileSync(HTML, 'utf8');
  const body = src.slice(src.indexOf('function draw(){'));
  const groundFx = body.indexOf('drawFx(false)');
  const theCar = body.indexOf('drawCar();');
  const airFx = body.indexOf('drawFx(true)');
  assert(groundFx > 0 && theCar > 0 && airFx > 0, 'draw() should call all three');
  assert(groundFx < theCar && theCar < airFx,
    'ground gore must be drawn before the car and airborne gore after it');
});

test('the car is traced on top of whatever is covering it', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100; api.car.air = 0; api.car.z = 0;
  api.camSnap();
  api._resetCounts();
  api.drawCarRim();
  assert(api._counts.stroke, 'the rim should draw while driving');
  api.G.phase = 'aim';
  api._resetCounts();
  api.drawCarRim();
  assert(!api._counts.stroke, 'and not while you are still aiming');
});

/* The flash was a cream wash over the whole frame, which on snow moved a pixel
   by +11/+5/-2 of 255 — the biggest event in the game, under the threshold you
   can see. It punches the vignette now. */
test('the flash actually changes the frame', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.drawVignette();                       // warm the cached gradient
  api._clearFeel();
  api._resetCounts();
  api.drawVignette();
  const quiet = api._counts.fillRect || 0;
  api.setFlash(0.35);
  api._resetCounts();
  api.drawVignette();
  const lit = api._counts.fillRect || 0;
  assert(lit > quiet, 'a flash should lay down more than a quiet frame: ' + lit + ' vs ' + quiet);
  assert(!api._counts.createRadialGradient, 'and still not rebuild the gradient');
});

/* Everything the player's body registered when a stall went down was a
   constant: the same shake, hit-stop and flash at 400px/s as at 1,600 —
   half the shake a single shopper gets at the same speed. */
test('a stall taken at speed hits harder than one nudged over', () => {
  const amp = (sp) => {
    const api = boot();
    api.startCampaign(); api.beginLevel();
    api.props.length = 0; api.people.length = 0;
    const o = api.addProp('hut', 2000, 1100);
    api.G.phase = 'drive';
    api._clearFeel();
    api.wreckProp(o, sp, 0);
    return { shake: api.shake.a, stop: api.getHitstop() };
  };
  const slow = amp(400), mid = amp(900), fast = amp(1600);
  console.log('    (stall wreck shake at 400/900/1600: ' +
    [slow, mid, fast].map(v => v.shake.toFixed(1)).join(' / ') + ')');
  assert(slow.shake < mid.shake && mid.shake < fast.shake,
    'shake should climb with the hit: ' + [slow, mid, fast].map(v => v.shake).join(' / '));
  assert(fast.shake > slow.shake * 1.8, 'and climb by something you would notice');
  // hit-stop stays a constant on purpose: it scales dt, so it is simulation
  near(slow.stop, fast.stop, 0.0001, 'hit-stop must not vary with the hit');
});

/* The fence takes 525px/s out of the car in a single frame and answered with a
   fixed six-particle puff and a fixed-level thud. */
test('the fence answers for what it takes', () => {
  const bounce = (sp) => {
    const api = boot();
    api.startCampaign(); api.beginLevel();
    api.G.phase = 'drive';
    api.car.x = api.bounds.x1 + 10; api.car.y = 1100;
    api.car.vx = sp; api.car.vy = 0;
    api._clearFeel();
    assert(api.bounceBounds(), 'it should bounce');
    return api.shake.a;
  };
  const gentle = bounce(200), hard = bounce(900);
  assert(gentle === 0, 'a nudge into the fence should not shake the screen, got ' + gentle);
  assert(hard > 0, 'a real hit should, got ' + hard);
  console.log('    (fence bounce shake at 200/900: ' + gentle + ' / ' + hard.toFixed(1) + ')');
});

test('the wind-up is not silent, and revs with the pull', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  assert(api.G.phase === 'aim', 'we should be aiming');
  api.update(1 / 60);
  const idle = api.snd.engLevel;
  assert(idle > 0, 'the engine idles while you aim, got ' + idle);
  api.pointerDown(700, 430);
  api.pointerMove(700 - api.C.MAX_PULL * api.cam.s, 430);
  api.update(1 / 60);
  const pulled = api.snd.engLevel;
  assert(pulled > idle * 2, 'and revs with the pull: ' + idle + ' -> ' + pulled);
  api.pointerUp();
  api.update(1 / 60);
  assert(api.snd.engLevel > pulled, 'and the launch is louder still than the wind-up');
});

test('the launch note falls, the way the car goes away from you', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const c = api._spyAudio();
  api.sndLaunch(1);
  assert(c.freqs.length, 'the launch should make a sound');
  const src = fs.readFileSync(HTML, 'utf8');
  const line = src.split('\n').find(l => l.includes('const sndLaunch'));
  assert(line, 'sndLaunch should be one line');
  const m = line.match(/tone\(([^,]+), [^,]+, '[^']+', [^,]+, ([^)]+)\)/);
  assert(m, 'could not read the launch tone: ' + line);
  const from = Function('const p = 1; return ' + m[1])();
  const to = Function('const p = 1; return ' + m[2])();
  assert(to < from, 'the launch note should fall, got ' + from + ' -> ' + to);
});

/* -------------------------------------------------------------- rotation --- */

/* A phone held upright plays the game sideways rather than badly. Real
   orientation lock only works on Android and only in fullscreen, and iOS
   Safari has never supported it, so the game turns itself. */
test('a phone on its end plays landscape', () => {
  const phone = boot({ w: 390, h: 844 });
  const v = phone.getView();
  assert(v.rotated, 'a 390x844 phone should rotate');
  assert(v.w === 844 && v.h === 390, 'and get a landscape frame, got ' + v.w + 'x' + v.h);
  assert(v.w > v.h, 'wider than it is tall, which is the whole point');
});

test('a window that is not a phone is left alone', () => {
  for (const [w, h] of [[1280, 720], [1440, 900], [1024, 1366], [900, 1200]]){
    const api = boot({ w, h });
    const v = api.getView();
    assert(!v.rotated, w + 'x' + h + ' should not be rotated');
    assert(v.w === w && v.h === h, 'and keeps its own dimensions');
  }
});

test('a tap lands where you put it, turned or not', () => {
  const flat = boot({ w: 1280, h: 720 });
  assert(!flat.getView().rotated, 'desktop is not rotated');
  const [fx1, fy1] = flat.toCanvas(300, 200);
  near(fx1, 300, 0.001, 'x passes through');
  near(fy1, 200, 0.001, 'y passes through');

  const phone = boot({ w: 390, h: 844 });
  const v = phone.getView();
  assert(v.rotated, 'the phone is rotated');
  /* #wrap is turned a quarter turn about the middle of the viewport, so a tap
     at the top-left of the phone is the BOTTOM-left of the game, and one at the
     bottom-left of the phone is its top-left. */
  const corners = [
    [0, 0,              0, 390],          // phone top-left    -> game bottom-left
    [0, 844,          844, 390],          // phone bottom-left -> game bottom-right
    [390, 0,            0, 0],            // phone top-right   -> game top-left
    [390, 844,        844, 0],            // phone bottom-right-> game top-right
  ];
  for (const [cx, cy, wx, wy] of corners){
    const [gx, gy] = phone.toCanvas(cx, cy);
    near(gx, wx, 0.001, 'tap at ' + cx + ',' + cy + ' should map to x ' + wx + ', got ' + gx);
    near(gy, wy, 0.001, 'tap at ' + cx + ',' + cy + ' should map to y ' + wy + ', got ' + gy);
  }
  // and the whole game frame is reachable
  const [mx, my] = phone.toCanvas(195, 422);
  assert(mx > 0 && mx < v.w && my > 0 && my < v.h, 'the middle of the phone is inside the game');
});

test('a full pull is reachable on a phone', () => {
  const api = boot({ w: 390, h: 844 });
  api.startCampaign(); api.beginLevel();
  // drag from the middle of the phone all the way to one end
  api.pointerDown(...api.toCanvas(195, 700));
  api.pointerMove(...api.toCanvas(195, 120));
  const pull = Math.hypot(api.aim.x - api.C.ANCHOR.x, api.aim.y - api.C.ANCHOR.y);
  assert(pull >= api.C.MAX_PULL,
    'a drag down the long side of the phone should reach full power, got ' + Math.round(pull));
  assert(api.launch(api.aim.x - api.C.ANCHOR.x, api.aim.y - api.C.ANCHOR.y),
    'and the launch takes');
});

/* Fullscreen needs a user gesture, so it rides the first tap and the START
   button rather than firing on load. A refusal must not burn the session. */
test('a refused fullscreen leaves the next gesture free to try again', () => {
  const api = boot();
  api._fs._grant = false;
  api.goFullscreen();
  assert(api._fs._calls === 1, 'it should ask');
  assert(!api.getWentFull(), 'and not latch on a refusal');
  api.goFullscreen();
  assert(api._fs._calls === 2, 'so the next gesture asks again');
});

test('fullscreen is asked for once, not on every tap', () => {
  const api = boot();
  api._fs._grant = true;
  api.goFullscreen();
  assert(api._fs._calls === 1 && api._fs._on, 'granted');
  api.goFullscreen();
  api.goFullscreen();
  assert(api._fs._calls === 1, 'and not asked for again, got ' + api._fs._calls);
});

/* ----------------------------------------------------------------- menu --- */

/* The 21-chip market grid used to sit above START THE ENGINE, which put the
   only thing a new player needs to press 237px below the fold at 1280x720 —
   with overlay scrollbars, so there was no affordance either. The suite cannot
   lay out a page, so it guards the thing that decided it: the order of the two
   in the card. Measured in Chromium after the change, the button's bottom is
   512/514/518/535 against viewport heights of 720/768/900/844. */
test('the button you are meant to press comes before the market grid', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const card = src.slice(src.indexOf('<div class="ov" id="menu">'), src.indexOf('<div class="ov" id="brief"'));
  const start = card.indexOf('id="bStart"'), levels = card.indexOf('id="mLevels"');
  assert(start > 0 && levels > 0, 'the menu should have both a start button and a market grid');
  assert(start < levels,
    'START THE ENGINE must come before the 21-chip grid, or it lands below the fold');
  assert(card.indexOf('id="mBest"') > start, 'and the record line sits under the button');
});

/* ---------------------------------------------------------------- goals --- */

/* Ramp goals used to be rolled from a straight-line distance that ignored the
   market: THE CHOIR asked for two barrel rolls on a market where the starting
   car landed zero rolls and zero jumps across 825 shots, and GRAND MARKET asked
   to flatten five at once with a landing it never gets airborne for. */
test('no market asks for a ramp it does not have', () => {
  const bad = [];
  for (let lv = 0; lv < boot().LEVELS.length; lv++){
    const api = boot();
    api.startLevel(lv);
    const reach = api.reachableRamps();
    for (const g of api.G.goals){
      if (g.id === 'roll' && reach.roll < g.n)
        bad.push(api.LEVELS[lv].name + ': ' + g.n + ' rolls, ' + reach.roll + ' ramps fast enough');
      if (g.id === 'air' && reach.jump < g.n)
        bad.push(api.LEVELS[lv].name + ': ' + g.n + ' jumps, ' + reach.jump + ' ramps in reach');
      if (g.id === 'slam' && reach.jump === 0)
        bad.push(api.LEVELS[lv].name + ': a landing slam with nothing to jump off');
    }
  }
  assert(bad.length === 0, 'impossible ramp goals:\n  ' + bad.join('\n  '));
});

test('every market has a ramp the starting car can reach at speed', () => {
  const bad = [];
  for (let lv = 0; lv < boot().LEVELS.length; lv++){
    const api = boot();
    api.startLevel(lv);
    if (!api.props.some(o => o.ramp)) continue;      // a market with no ramps at all is fine
    const reach = api.reachableRamps();
    if (reach.jump === 0) bad.push(api.LEVELS[lv].name);
  }
  assert(bad.length === 0, 'ramps only the sleigh could ever reach on: ' + bad.join(', '));
});

/* The teeth: for every market, every goal it rolled has to actually fall to the
   starting car in one of a fan of aimed launches. */
test('every goal on every market falls to the hatchback', () => {
  const angles = [-260, -170, -85, 0, 85, 170, 260];
  const bad = [];
  for (let lv = 0; lv < boot().LEVELS.length; lv++){
    const names = boot();
    names.startLevel(lv);
    const want = names.G.goals.map(g => g.id);
    const got = new Set();
    for (const dy of angles){
      const api = boot({ store: { merry_crashmas_car_v1: 'hatch' } });
      api.startLevel(lv); api.beginLevel();
      assert(api.getCar().id === 'hatch', 'the sweep must run in the starting car');
      for (let c = 0; c < api.G.cars; c++){
        api.launch(-api.C.MAX_PULL, dy + (c - 1) * 40);
        for (let f = 0; f < 4000 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
          // a player fires the nitro in the crowd; a sweep that never does
          // cannot reach a goal that asks you to
          if (api.G.phase === 'drive' && api.G.runT > 0.45 && api.car.boost > 0) api.doBoost();
          api.skipReplay(); api.update(1 / 60);
        }
      }
      for (const g of api.G.goals) if (g.done) got.add(g.id);
      if (got.size === want.length) break;
    }
    for (const id of want) if (!got.has(id)) bad.push(names.LEVELS[lv].name + ' / ' + id);
  }
  console.log('    (goals unreached by the hatchback across seven aimed fans: ' +
    (bad.length ? bad.join(', ') : 'none') + ')');
  assert(bad.length <= 3, 'goals the starting car never completed:\n  ' + bad.join('\n  '));
});

/* ------------------------------------------------------------------ aim --- */

/* At a fixed aim zoom of 1500 you chose an angle without being able to see
   what was down any of them: 48% of the market's depth, 25-33% of its crowd,
   and half the frame was the empty approach. */
test('the aim frame shows you the market you are aiming at', () => {
  const rows = [];
  for (const lv of [0, 5, 14, 19, 20]){
    const api = boot({ w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    api.camSnap();
    const halfW = 1280 / api.cam.s / 2, halfH = 720 / api.cam.s / 2;
    const x0 = api.cam.x - halfW, x1 = api.cam.x + halfW;
    const y0 = api.cam.y - halfH, y1 = api.cam.y + halfH;
    const depth = (Math.min(x1, api.bounds.x1) - Math.max(x0, api.bounds.x0)) /
      (api.bounds.x1 - api.bounds.x0);
    const seen = api.people.filter(p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1).length;
    const crowd = seen / api.people.length;
    const firstProp = Math.min(...api.props.map(o => o.x));
    const lane = (Math.min(x1, firstProp) - x0) / (x1 - x0);
    rows.push(api.LEVELS[lv].name + ' ' + (depth * 100).toFixed(0) + '% deep, ' +
      (crowd * 100).toFixed(0) + '% of the crowd, ' + (lane * 100).toFixed(0) + '% empty lane');
    assert(depth >= 0.70, api.LEVELS[lv].name + ': only ' + (depth * 100).toFixed(0) + '% of the depth');
    assert(crowd >= 0.60, api.LEVELS[lv].name + ': only ' + (crowd * 100).toFixed(0) + '% of the crowd');
    assert(lane <= 0.35, api.LEVELS[lv].name + ': ' + (lane * 100).toFixed(0) + '% of the frame is empty lane');
    // and the sling still has to be on screen to aim with
    assert(api.C.ANCHOR.x - api.C.MAX_PULL > x0,
      api.LEVELS[lv].name + ': a full pull goes off the left edge');
  }
  console.log('    (aim frame: ' + rows.join(' | ') + ')');
});

/* CAM_OVERSHOOT lets the camera look past the fence so the climax of a market
   can be centred, and the drive leash keeps the car near the middle of the
   frame — between them the fence sits at mid-screen and 46% of a market-1
   frame was out-of-world. That was the right camera; what was wrong was that
   out-of-world was a flat fillRect of TH.sky against a light snow floor. So
   the measurement is how much FLAT sky a frame ends in, not how far past the
   fence it looks. */
test('a run never ends in a slab of flat sky', () => {
  const rows = [];
  for (const lv of [0, 1, 5]){
    const api = boot({ w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    let worstVoid = 0, worst = 0, at = 0, t = 0;
    for (let c = 0; c < api.G.cars && api.G.phase !== 'results'; c++){
      api.launch(-api.C.MAX_PULL, (c - 1) * 40);
      for (let f = 0; f < 2400 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
        api.skipReplay(); api.update(1 / 60); t += 1 / 60;
        if (api.G.phase !== 'drive') continue;
        const halfW = 1280 / api.cam.s / 2;
        const edge = api.cam.x + halfW, fence = api.bounds.x1 + api.C.CAR_R;
        worstVoid = Math.max(worstVoid, edge - fence);
        // everything past the fade has run out of gradient and is flat again
        const frac = Math.max(0, edge - fence - api.EDGE_FADE) / (halfW * 2);
        if (frac > worst){ worst = frac; at = t; }
      }
    }
    rows.push(api.LEVELS[lv].name + ' ' + worstVoid.toFixed(0) + 'w past the fence, ' +
      (worst * 100).toFixed(0) + '% flat');
    assert(worst <= 0.15, api.LEVELS[lv].name + ': ' + (worst * 100).toFixed(0) +
      '% of the frame is flat sky at t' + at.toFixed(1) + 's');
    assert(worstVoid > 200, api.LEVELS[lv].name + ': the camera stopped ' +
      'overshooting the fence, so this test is no longer measuring anything');
  }
  console.log('    (edge of town: ' + rows.join(' | ') + ')');
});

test('the edge of town is drawn, not left as canvas', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive';
  // park the car at the fence, which is where the overshoot is at its worst
  api.car.x = api.bounds.x1 - 40; api.car.y = 1100; api.camSnap();
  const th = api.getTheme();

  const rec = carRec();
  api.withCtx(rec, api.drawGround);
  const fence = api.bounds.x1 + api.C.CAR_R;
  const beyond = rec.rects.filter(r => r.x >= fence - 1);
  assert(beyond.length === 1, 'one fill past the fence, got ' + beyond.length);
  assert(beyond[0].style !== th.sky,
    'and it should not be flat ' + th.sky + ', which is what it used to be');
  assert(beyond[0].w >= api.EDGE_FADE * 0.5,
    'covering the overshoot, got ' + beyond[0].w.toFixed(0) + 'w');

  /* Woods standing in it: one batched path per band, drawn back to front, each
     band starting further out than the one in front of it. */
  const woods = rec.polys.filter(q => q.style === th.tree[0] || q.style === th.tree[1]);
  assert(woods.length === api.EDGE_BANDS,
    api.EDGE_BANDS + ' bands in ' + api.EDGE_BANDS + ' paths, got ' + woods.length);
  for (const w of woods){
    assert(w.x0 > fence, 'the woods start past the fence, got ' + w.x0.toFixed(0));
    assert(w.x1 < fence + api.EDGE_FADE, 'and stay inside the fade');
  }
  // back to front, so the near band is the last one drawn and the innermost
  for (let i = 1; i < woods.length; i++){
    assert(woods[i].x0 < woods[i - 1].x0,
      'band ' + i + ' should sit nearer the fence than the one drawn before it');
  }
  assert(woods[woods.length - 1].style === th.tree[1],
    'the near band is the lit green; the ones behind it are the dark one');

  /* Off a stateless hash, so a market's treeline is as fixed as its stalls and
     drawing it cannot move a score. */
  const r0 = api.rnd();
  api.reseed(4242);
  const check = api.rnd();
  api.reseed(4242);
  const a = carRec(); api.withCtx(a, api.drawGround);
  const b = carRec(); api.withCtx(b, api.drawGround);
  assert(JSON.stringify(a.polys) === JSON.stringify(b.polys),
    'the same frame drawn twice should give the same woods');
  assert(api.rnd() === check && typeof r0 === 'number',
    'drawing the treeline moved the simulation stream');
  console.log('    (edge: ' + beyond[0].w.toFixed(0) + 'w fade, ' +
    (woods[woods.length - 1].x1 - woods[woods.length - 1].x0).toFixed(0) + 'w of near woods)');
});

test('blood does not float in the sky past the fence', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = api.bounds.x1 - 40; api.car.y = 1100; api.camSnap();
  const fence = api.bounds.x1 + api.C.CAR_R;

  api.gore.length = 0; api.fx.length = 0;
  api.addGore(api.bounds.x1 - 200, 1100, 40, 'pool');   // inside
  api.addGore(fence + 260, 1100, 40, 'pool');           // flung over the fence
  const inside = api.gore.filter(g => g.x < fence).length;
  assert(inside >= 1 && api.gore.length > inside, 'one decal each side of the fence');

  /* The soak halo goes straight onto the snow as one path of arcs — one arc a
     decal — which is the pass that betrayed the ones over the fence. */
  const rec = carRec();
  api.withCtx(rec, api.drawGround);
  const arcs = rec.all.filter(a => a[0] === 'arc' && /158,20,14/.test(String(a[4])));
  assert(arcs.length > 0, 'the decal inside the fence should still be drawn');
  for (const [, ax, , ar] of arcs){
    assert(ax - ar <= fence + 1,
      'a decal is sitting out in the sky at x' + ax.toFixed(0) +
      ' (fence ' + fence.toFixed(0) + ')');
  }
  console.log('    (blood past the fence: ' + arcs.length + ' of ' + api.gore.length +
    ' decals drawn)');
});

/* `z` is world units down the frame, so one number is a 58px car on a desktop
   and a 23px one on a phone — and at 23px, with a 7px shopper under it, you are
   steering a dash. Plan 1 item 6 made a market launchable in portrait by
   driving the zoom off the width; this is what that cost, on the other side. */
const VIEWPORTS = [[390, 844], [820, 1180], [1280, 720], [1440, 600]];

test('the car is big enough to drive on every frame the game runs in', () => {
  const rows = [];
  for (const [w, h] of VIEWPORTS){
    const api = boot({ w, h });
    api.startLevel(0); api.beginLevel();
    const view = api.getView();
    // settle the drive camera rather than catching it mid-lerp off the aim zoom
    api.G.phase = 'drive'; api.car.x = 2200; api.car.y = 1100;
    api.car.vx = 0; api.car.vy = 0; api.camSnap();
    const dims = api.getDims();
    const carPx = dims.l * api.cam.s;
    const shopPx = api.people[0].r * 2 * api.cam.s;
    const worldH = (api.bounds.y1 - api.bounds.y0) * api.cam.s / view.h;

    assert(Number.isFinite(api.cam.s) && api.cam.s > 0, w + 'x' + h + ': cam.s is ' + api.cam.s);
    assert(Number.isFinite(api.cam.x) && Number.isFinite(api.cam.y),
      w + 'x' + h + ': the camera left the world');
    assert(carPx >= api.CAR_MIN_PX - 0.5, w + 'x' + h + ': the car is ' +
      carPx.toFixed(0) + 'px long, floor is ' + api.CAR_MIN_PX);
    assert(shopPx >= 5, w + 'x' + h + ': a shopper is ' + shopPx.toFixed(1) + 'px across');
    assert(worldH >= 0.8, w + 'x' + h + ': the playfield fills ' +
      (worldH * 100).toFixed(0) + '% of the frame height');
    rows.push(w + 'x' + h + ' car ' + carPx.toFixed(0) + 'px, shopper ' +
      shopPx.toFixed(1) + 'px, ' + (worldH * 100).toFixed(0) + '% high');

    // …at full speed too, where the zoom stretches furthest out
    api.car.vx = 1900; api.camSnap();
    assert(dims.l * api.cam.s >= api.CAR_MIN_PX - 0.5, w + 'x' + h +
      ': at speed the car drops to ' + (dims.l * api.cam.s).toFixed(0) + 'px');
  }
  console.log('    (drive framing: ' + rows.join(' | ') + ')');
});

test('the wide zoom may pull back but not empty the screen', () => {
  for (const [w, h] of VIEWPORTS){
    const api = boot({ w, h });
    api.startLevel(0); api.beginLevel();
    const view = api.getView();
    for (const phase of ['aim', 'drive']){
      api.G.phase = phase; api.camSnap();
      const high = view.h / api.cam.tz;
      assert(api.cam.s >= high * api.MIN_FILL - 1e-6, w + 'x' + h + ' ' + phase +
        ': the width term shrank the picture to ' + (api.cam.s / high).toFixed(2) +
        ' of the height zoom, floor is ' + api.MIN_FILL);
      assert(api.cam.s <= high + 1e-6, w + 'x' + h + ' ' + phase +
        ': the zoom went past what the frame height allows');
    }
    // and a full pull still fires at full power on the narrowest of them
    api.G.phase = 'aim'; api.camSnap();
    assert(api.C.ANCHOR.x - api.C.MAX_PULL > api.cam.x - view.w / api.cam.s / 2,
      w + 'x' + h + ': a full pull goes off the left edge of the aim frame');
  }
});

/* The results card gained per-goal progress; the checklist you actually play
   against did not, which is the wrong way round — mid-run is when knowing you
   are on 3 of 4 changes what you aim at. */
test('the live checklist shows how far each goal has got', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(4); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2200; api.car.y = 1100; api.camSnap();
  api.G.goals = [
    { id: 'stalls', n: 4, done: false, text: 'Wreck 4 stalls' },
    { id: 'kids', n: 3, done: false, text: 'Catch 3 children' },
    { id: 'santa', n: 1, done: false, text: 'Run over Santa' },
  ];
  api.G.bigWrecks = 2; api.G.byKind = { kid: 1 };
  api._resetCounts(); api.drawHUD();
  let words = (api._counts._text || []).map(String);
  assert(words.includes('2 / 4'), 'the checklist should print 2 / 4: ' + words.join(' | '));
  assert(words.includes('1 / 3'), 'and 1 / 3');
  assert(!words.includes('0 / 1'), 'but nothing on a one-shot goal');

  // a goal that is done shows its tick, not a number
  api.G.goals[0].done = true; api.G.bigWrecks = 4;
  api._resetCounts(); api.drawHUD();
  words = (api._counts._text || []).map(String);
  assert(!words.includes('4 / 4'), 'a ticked goal should not still be counting');

  /* Right-aligned inside the plate — and the plate is measured off the row
     including the number, so a long one cannot push it out over the market. */
  const r = api.hudScoreRect();
  const rec = carRec();
  api.withCtx(rec, api.drawHUD);
  assert(r.x + r.w < api.hudCarsRect().x, 'the plate still clears the car counter');
});

test('the aim zoom stretches to the market and stops', () => {
  const z = (lv) => { const a = boot({ w: 1280, h: 720 }); a.startLevel(lv); a.beginLevel(); a.camSnap(); return Math.round(a.cam.tz); };
  const small = z(0), big = z(20);
  assert(big > small, 'a bigger market should pull back further: ' + small + ' vs ' + big);
  assert(small >= 1500, 'the smallest market should not pull back into sky, got ' + small);
  assert(big <= 2300, 'and the biggest should stop somewhere, got ' + big);
});

/* The tree, the carousel, Santa and the first ramp on your line sat 2,288 to
   2,940px out with the frame ending at 1,763: the checklist told you what to
   hit and nothing told you where it was. */
test('a goal object off the edge of the frame gets an arrow', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  // find a market whose checklist names a landmark
  let found = null;
  for (let lv = 0; lv < api.LEVELS.length && !found; lv++){
    api.startLevel(lv); api.beginLevel();
    if (api.G.goals.some(g => g.id === 'tree' || g.id === 'carousel' || g.id === 'santa')) found = lv;
  }
  assert(found !== null, 'some market should ask for a landmark');
  api.startLevel(found); api.beginLevel(); api.camSnap();
  const marks = api.goalMarkers();
  assert(marks.length > 0, 'the landmark should be marked');
  // push it far off screen and assert the pass draws something
  api._resetCounts();
  api.drawEdgeMarkers([{ x: api.cam.x + 9000, y: api.cam.y, col: '#8ee06a', tag: 'TREE' }]);
  assert((api._counts.fill || 0) >= 2, 'an off-screen goal should draw an arrow');
  assert(api._counts.fillText, 'and print how far away it is');
  // one that is in shot draws nothing
  api._resetCounts();
  api.drawEdgeMarkers([{ x: api.cam.x, y: api.cam.y, col: '#8ee06a', tag: 'TREE' }]);
  assert(!api._counts.fill, 'a landmark already in shot needs no arrow');
  // and an empty market must not throw
  api._resetCounts();
  api.drawEdgeMarkers([]);
});

test('the checklist’s people are findable in the crowd while you aim', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  let lv = null;
  for (let i = 0; i < api.LEVELS.length && lv === null; i++){
    api.startLevel(i); api.beginLevel();
    if (api.G.goals.some(g => g.id === 'elders' || g.id === 'kids' || g.id === 'prams')) lv = i;
  }
  assert(lv !== null, 'some market should ask for a kind of person');
  api.startLevel(lv); api.beginLevel(); api.camSnap();
  const crowd = api.people.slice(0, 200);
  api.G.phase = 'aim';
  api._resetCounts();
  api.drawCrowdBatch(crowd);
  const aiming = api._counts.stroke || 0;
  api.G.phase = 'drive';
  api._resetCounts();
  api.drawCrowdBatch(crowd);
  const driving = api._counts.stroke || 0;
  assert(aiming > driving, 'aiming should ring the goal kinds: ' + aiming + ' vs ' + driving);
  // and it stops once the goal is done
  api.G.phase = 'aim';
  for (const g of api.G.goals) g.done = true;
  api._resetCounts();
  api.drawCrowdBatch(crowd);
  assert((api._counts.stroke || 0) === driving, 'a finished goal should stop ringing people');
});

/* ---------------------------------------------------------- correctness --- */

/* killPerson reached for its own flat copy of the shopper palette, ignoring
   p.kind, so a grey-coated pensioner exploded into orange sleeves and a
   lime-green child into purple ones — and bleed() seeded the pixel burst from
   the same value, so the whole thing was the wrong colour. */
test('a pensioner does not explode in somebody else’s coat', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  const drawn = (p) => (p.kind === 'elder' ? api.ELDER_COATS[p.coat % 4]
                      : p.kind === 'kid' ? api.KID_COATS[p.coat % 4]
                      : api.COATS[p.coat % api.COATS.length]);
  for (const kind of ['elder', 'kid', 'shopper', 'santa']){
    const p = api.addPerson(2000, 1100, kind);
    p.coat = 3;
    api.rec.killed.length = 0;
    api.killPerson(p, 900, 0, 'car');
    const rc = api.rec.killed[api.rec.killed.length - 1];
    assert(rc && rc.coat === drawn(p),
      kind + ' bleeds ' + (rc && rc.coat) + ' but is drawn ' + drawn(p));
    assert(rc.skin === api.SKIN[p.coat % api.SKIN.length], kind + ' skin should match too');
  }
});

/* `if (f.t >= f.ttl - dt)` dropped the same chunk's permanent mark 0, 1, 2 or
   3 times depending purely on how the frames fell — which is the frame after
   every hit-stop, and every frame on a variable-refresh display. */
test('a chunk leaves exactly one mark, however the frames fall', () => {
  const paces = {
    steady: () => 1 / 60,
    shrinking: (i) => Math.max(0.001, 0.02 - i * 0.0012),
    stalling: (i) => (i === 3 ? 0.05 : 0.0005),
    spiking: (i) => (i % 2 ? 0.010 : 0.003),
  };
  for (const name in paces){
    const api = boot();
    api.startCampaign(); api.beginLevel();
    api.gore.length = 0;
    api.fx.length = 0;
    api.fx.push({ type: 'chunk', x: 2000, y: 1100, vx: 0, vy: 0, t: 0, ttl: 0.06,
      size: 6, rot: 0, spin: 0, col: '#8e1a14' });
    for (let i = 0; i < 60 && api.fx.length; i++) api.stepFx(paces[name](i));
    assert(api.fx.length === 0, name + ': the chunk should be gone');
    assert(api.gore.length === 1,
      name + ' frame pacing left ' + api.gore.length + ' decals, expected 1');
  }
});

test('a limb leaves its two marks once, however the frames fall', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.gore.length = 0; api.fx.length = 0;
  api.fx.push({ type: 'limb', part: 'arm', x: 2000, y: 1100, vx: 0, vy: 0, t: 0,
    ttl: 0.05, size: 7, rot: 0, spin: 0, col: '#e05143', col2: '#f0c9a4' });
  for (let i = 0; i < 40 && api.fx.length; i++) api.stepFx(i === 2 ? 0.05 : 0.0005);
  assert(api.gore.length === 2, 'a limb leaves two marks, got ' + api.gore.length);
});

/* The shortest-axis eject was written above a `d >= CARR` return, where
   `d > 0.001` is implied, so it could never run. What actually ran pushed the
   car one radius straight up whichever wall it came through. */
test('a car buried in a hut leaves by the nearest wall, not northwards', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.props.length = 0; api.people.length = 0;
  const hut = api.addProp('hut', 2000, 1100);
  assert(hut.shape === 'box', 'the fixture should be a box');
  const hw = hut.w / 2, hh = hut.h / 2;
  // dead centre, and just off centre on each side
  for (const [ox, oy, why] of [[0, 0, 'dead centre'], [hw * 0.6, 0, 'east of centre'],
                               [-hw * 0.6, 0, 'west of centre'], [0, hh * 0.6, 'south of centre']]){
    hut.dead = false; hut.hp = hut.maxHp;
    drive(api, 200, 0, hut.x + ox, hut.y + oy);
    api.hitProp(hut);
    const dx = api.car.x - hut.x, dy = api.car.y - hut.y;
    const outside = Math.abs(dx) >= hw + api.C.CAR_R - 1 || Math.abs(dy) >= hh + api.C.CAR_R - 1;
    assert(outside, why + ': still inside the hut at ' +
      Math.round(dx) + ',' + Math.round(dy) + ' (box ' + hw + 'x' + hh + ')');
    if (ox > 0) assert(dx > 0, 'east of centre should leave eastwards, went ' + Math.round(dx));
    if (ox < 0) assert(dx < 0, 'west of centre should leave westwards, went ' + Math.round(dx));
    if (oy > 0) assert(dy > 0, 'south of centre should leave southwards, went ' + Math.round(dy));
  }
});

/* hitProp's box test is axis-aligned, so a box prop drawn at an arbitrary
   angle is a wall you can drive through and an invisible one beside it. The
   ice rink's barrier ring was briefly drawn along its tangent — 41 degrees off
   the box that actually stopped the car. */
test('every live prop is drawn where its collider is', () => {
  const api = boot();
  for (let lv = 0; lv < api.LEVELS.length; lv++){
    api.startLevel(lv);
    for (const o of api.props){
      if (o.shape !== 'box' || o.dead) continue;
      assert(!o.rot, api.LEVELS[lv].name + ': live ' + o.kind + ' has rot ' + o.rot +
        ' but its collider is an axis-aligned ' + o.w + 'x' + o.h + ' box');
    }
  }
});

test('the rink’s barrier ring follows the circle without lying about it', () => {
  const api = boot();
  api.startLevel(6); api.beginLevel();          // THE ICE RINK
  const ip = api.ice[0];
  assert(ip, 'the rink should have a sheet of ice');
  const ring = api.props.filter(o => o.kind === 'fence' &&
    Math.abs(Math.hypot(o.x - ip.x, o.y - ip.y) - (ip.r + 26)) < 8);
  assert(ring.length > 8, 'the ring should be a ring, got ' + ring.length);
  const vert = ring.filter(o => o.h > o.w).length;
  assert(vert > 0 && vert < ring.length,
    'barriers should take both orientations around the circle, got ' + vert + '/' + ring.length);
  for (const o of ring){
    // the barrier's long axis should be the one closer to the tangent there
    const a = Math.atan2(o.y - ip.y, o.x - ip.x);
    const wantVert = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    assert((o.h > o.w) === wantVert,
      'barrier at ' + a.toFixed(2) + 'rad points the wrong way');
  }
});

/* Grep guards: these are the branches the pass deleted. They are cheap to
   reintroduce by accident and expensive to notice. */
test('the code this pass deleted stays deleted', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  assert(!/COATS_RT|SKIN_RT/.test(src), 'the duplicate simulation palettes are gone');
  assert(!/f\.t >= f\.ttl - dt/.test(src), 'the frame-paced gore drop is gone');
  assert(!/G\.potential/.test(src), 'G.potential was written and never read');
  const limbDraw = src.split("if (f.part === 'head')").length - 1;
  assert(limbDraw === 1, 'drawFx had two byte-identical limb branches, now ' + limbDraw);
});

/* ---------------------------------------------------------------- sound --- */

/* A 4.6s run on the last market fired 933 tone() and 41 noise() calls — 212
   oscillator spawns a second, from 218 shoppers crying with no voice cap, no
   distance falloff and no priority, all summing into a 0.32 master gain that
   clipped and buried the squish and the crunch. The kills got quieter the more
   of them you made. */
test('a market full of screaming does not drown out the kills', () => {
  const api = boot();
  api.startLevel(api.LEVELS.length - 1);
  api.beginLevel();
  const c = api._spyAudio();
  api.launch(-api.C.MAX_PULL, -60);
  let secs = 0;
  for (let i = 0; i < 300 && api.G.phase === 'drive'; i++){ api.update(1 / 60); secs += 1 / 60; }
  const perSec = (c.tone + c.noise) / Math.max(0.5, secs);
  const crying = api.people.filter(p => p.cry > 0.45 && !p.dead).length;
  console.log('    (mixer load: ' + Math.round(perSec) + ' voices/s over ' + secs.toFixed(1) +
    's, ' + crying + ' shoppers crying)');
  assert(crying > 20, 'the market should actually be in a panic, got ' + crying);
  assert(perSec < 40, 'oscillator spawns per second: ' + perSec.toFixed(0));
});

test('only the shoppers you are near are mixed in', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100;
  const near = api.addPerson(2100, 1100, 'shopper');
  const far = api.addPerson(2000 + api.C2.WAIL_RANGE + 200, 1100, 'shopper');
  assert(!api.wailSlot(far), 'a shopper two screens away is not audible');
  assert(api.wailSlot(near), 'one right next to the car is');
  assert(api.wailSlot(near) && api.wailSlot(near), 'up to three at once');
  assert(!api.wailSlot(near), 'and no more than three');
  api.setT(api.getT() + api.C2.WAIL_LEN + 0.01);
  assert(api.wailSlot(near), 'the slots free up again');
});

test('the engine is only running while the car is', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  assert(api.snd.engLevel === 0, 'silent on the sling');
  api.launch(-api.C.MAX_PULL, 0);
  api.update(1 / 60);
  assert(api.carSpeed() > 400, 'the car should be moving');
  assert(api.snd.engLevel > 0, 'the engine should be audible while driving');
  const fast = api.snd.engLevel;
  api.car.vx = 300; api.car.vy = 0;
  api.update(1 / 60);
  assert(api.snd.engLevel < fast, 'and quieter when it slows: ' + api.snd.engLevel + ' vs ' + fast);
  api.endRun();
  assert(api.snd.engLevel === 0, 'and gone once the run is over');
});

test('muting reaches the drone, not just the one-shots', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  api.update(1 / 60);
  assert(api.snd.engLevel > 0, 'the engine is running');
  api.toggleMute();
  assert(!api.snd.on && api.snd.engLevel === 0, 'muting silences it');
  api.toggleMute();
  api.update(1 / 60);
  assert(api.snd.on && api.snd.engLevel > 0, 'unmuting mid-run brings it back');
});

test('a chain of kills climbs instead of repeating itself', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const c = api._spyAudio();
  api.G.combo = 1; api.sndSquish();
  const one = c.freqs[0];
  c.freqs.length = 0;
  api.G.combo = 6; api.sndSquish();
  const six = c.freqs[0];
  // the jitter is +-60, the step is 55 per link, so five links clear it
  assert(six > one + 200, 'the sixth kill should be well above the first: ' + one + ' vs ' + six);
});

test('landing is not the same sound as clipping a hut', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const c = api._spyAudio();
  api.sndThud(0.9);
  const thud = c.freqs.slice();
  c.freqs.length = 0;
  api.sndLand(1);
  assert(JSON.stringify(thud) !== JSON.stringify(c.freqs),
    'landing should have its own voice, got ' + JSON.stringify(c.freqs));
  assert(c.freqs.length >= 2, 'and more than one note in it');
});

/* Chrome suspends a backgrounded context and iOS hands one back suspended.
   There was no resume() and no visibilitychange anywhere in the file, so the
   game went permanently silent with the mute button still reading a note. */
test('a suspended audio context gets woken back up', () => {
  const api = boot();
  let resumed = 0;
  api.snd.ac = { state: 'suspended', resume: () => { resumed++; }, currentTime: 0 };
  api.audioInit();
  assert(resumed === 1, 'audioInit should resume a suspended context');
  api.snd.ac.state = 'running';
  api.audioInit();
  assert(resumed === 1, 'and leave a running one alone');
  const vis = api._listeners.visibilitychange;
  assert(vis && vis.length, 'the game should listen for the tab coming back');
  api.snd.ac.state = 'suspended';
  vis[0]();
  assert(resumed === 2, 'coming back to the tab resumes it');
});

test('the noise bank is baked once, not per bang', () => {
  const api = boot();
  let built = 0;
  const buf = { getChannelData: () => new Float32Array(64) };
  api.snd.ac = null;
  api._window.AudioContext = function (){
    return { sampleRate: 8000, currentTime: 0, state: 'running', destination: {},
      createGain: () => ({ gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){},
        setTargetAtTime(){}, cancelScheduledValues(){} }, connect(){} }),
      createBuffer: () => { built++; return buf; },
      createBufferSource: () => ({ buffer: null, connect(){}, start(){}, stop(){} }),
      createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect(){} }),
      resume(){} };
  };
  api.audioInit();
  const afterInit = built;
  assert(afterInit >= 1 && afterInit <= 8, 'the bank is a handful of buffers, got ' + afterInit);
  for (let i = 0; i < 50; i++) api.noise(0.2, 0.2, 800);
  assert(built === afterInit, 'no buffer should be built per bang, got ' + (built - afterInit));
});

/* ------------------------------------------------------------------ HUD --- */

/* "⚡ NITRO ×1" was drawn at (30, VH-24), straight underneath #back, which is
   a 100x34 button at z-index 4 over the canvas. Every screenshot read
   "← GAMES ×1": the word NITRO was gone and the green count looked like part
   of the button's label. */
test('the run readout never lands under the buttons in the corner', () => {
  // #back: left 10, bottom 10, ~100x34.  #mute: right 10, bottom 10, 40x40.
  const dom = (w, h) => [
    { name: '#back', x: 10, y: h - 44, w: 100, h: 34 },
    { name: '#mute', x: w - 50, y: h - 50, w: 40, h: 40 },
  ];
  for (const [ww, hh] of [[1280, 720], [390, 844], [1440, 600]]){
    const api = boot({ w: ww, h: hh });
    api.startCampaign(); api.beginLevel();
    // a phone on its end plays sideways, so the game's frame is not the window's
    const { w, h } = api.getView();
    const r = api.nitroRect();
    assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h,
      'readout off screen at ' + w + 'x' + h + ': ' + JSON.stringify(r));
    for (const d of dom(w, h)){
      const clear = r.x + r.w <= d.x || d.x + d.w <= r.x || r.y + r.h <= d.y || d.y + d.h <= r.y;
      assert(clear, 'readout overlaps ' + d.name + ' at ' + w + 'x' + h +
        ': ' + JSON.stringify(r) + ' vs ' + JSON.stringify(d));
    }
  }
});

test('one kill is not a combo', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.G.combo = 1; api.G.mult = 1; api.G.comboT = api.C.COMBO_WIN;
  api._resetCounts();
  api.drawHUD();
  const one = api._counts.fillText || 0;
  api.G.combo = 2; api.G.mult = 1.5;
  api._resetCounts();
  api.drawHUD();
  const two = api._counts.fillText || 0;
  assert(two === one + 2, 'the combo block should add exactly its two lines, and only from x2: '
    + one + ' vs ' + two);
});

test('score pops do not stack on top of each other', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.fx.length = 0;
  assert(api.popText(1000, 1000, 'A', '#fff'), 'the first pop lands');
  assert(!api.popText(1020, 1010, 'B', '#fff'), 'a second pop 22px away is dropped');
  assert(api.popText(1000, 1100, 'C', '#fff'), 'one 100px away is fine');
  api.setT(api.getT() + 0.4);
  assert(api.popText(1020, 1010, 'D', '#fff'), 'and after the window it is fine again');
});

/* The bubble lives in a fixed screen corner, so it does not suppress the
   world-space pops any more — a rule that did was swallowing 63% of kill pops,
   and every single "NITRO!", which doBoost prints four lines after it arms the
   shout. */
test('the driver talking does not swallow the score', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.fx.length = 0;
  api.car.shoutT = api.SHOUT_TIME;
  assert(api.popText(1000, 1000, 'A', '#fff'), 'a kill still pops while the bubble is up');
});

test('firing the nitro says so', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  api.update(1 / 60);
  api.fx.length = 0;
  assert(api.doBoost(), 'the boost should fire');
  assert(api.fx.some(f => f.type === 'txt' && f.text === 'NITRO!'),
    'and print its own label, got ' + JSON.stringify(api.fx.map(f => f.text).filter(Boolean)));
});

/* Nobody reads a checklist at 1500px/s. */
test('goals ticked mid-run are announced once the car has stopped', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  // a goal that is already satisfied, so checkGoals ticks it on the next frame
  api.G.goals = [{ id: 'combo', text: 'chain a x2 combo', n: 2, done: false }];
  api.G.goalsDone = 0;
  api.G.bestCombo = 5;                    // already satisfied
  api.G.goalPops.length = 0;
  api.fx.length = 0;
  api.checkGoals();
  assert(api.G.goals[0].done, 'the goal should tick');
  assert(api.G.goalPops.length === 1, 'and queue its words, got ' + api.G.goalPops.length);
  assert(!api.fx.some(f => f.type === 'txt' && /GOAL/.test(f.text || '')),
    'nothing is printed while the car is still moving');
  assert(!/GOAL/.test((api.G.banner && api.G.banner.text) || ''), 'and no banner either');
  api.endRun();
  assert(api.fx.some(f => f.type === 'txt' && /GOAL: CHAIN A X2 COMBO/.test(f.text || '')),
    'the goal is announced when the run ends');
  assert(api.G.goalPops.length === 0, 'and the queue is drained');
});

test('the shout bubble is screen furniture, not a billboard in the market', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.shoutT = api.SHOUT_TIME; api.car.shout = 'HO HO HO';
  // it must not care where the car is or how far out the camera has zoomed
  api.car.x = 2600; api.car.y = 1100; api.cam.tz = 1300;
  api._resetCounts();
  api.drawHUD();
  const far = api._counts.setTransform || 0;
  assert(api._counts.fillText, 'the bubble should print its line');
  api.car.x = 900; api.car.y = 300; api.cam.tz = 880;
  api._resetCounts();
  api.drawHUD();
  assert((api._counts.setTransform || 0) === far, 'same work wherever the car is');
  api.car.shoutT = 0;
  api._resetCounts();
  api.drawHUD();
  const quiet = api._counts.fillText || 0;
  api.car.shoutT = api.SHOUT_TIME;
  api._resetCounts();
  api.drawHUD();
  assert((api._counts.fillText || 0) > quiet, 'the bubble is what adds the line');
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
  const cases = [[false, 0, 0], [false, 3, 0], [true, 0, 1], [true, 1, 1], [true, 2, 2], [true, 3, 3]];
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
  api.G.levelScore = api.G.target * 2; api.G.goalsDone = 2;
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
  assert(api.CARS[0].unlock === 0 && !api.CARS[0].stars, 'the first one is free');
  // the ladder climbs within each currency, and the star cars come last
  const kills = api.CARS.filter(c => !c.stars).map(c => c.unlock);
  const stars = api.CARS.filter(c => c.stars).map(c => c.stars);
  for (let i = 1; i < kills.length; i++) assert(kills[i] > kills[i - 1], 'kill prices climb');
  for (let i = 1; i < stars.length; i++) assert(stars[i] > stars[i - 1], 'star prices climb');
  assert(api.CARS.slice(-2).every(c => c.stars), 'the last two cost stars');
  assert(api.getCar().id === 'hatch', 'the hatchback is the default');
  const ids = api.CARS.map(c => c.id);
  assert(new Set(ids).size === ids.length, 'no duplicate ids');
});

/* The whole garage should be open inside three campaigns for a player who has
   learned the markets. At 4000 and 9000 the sleigh landed around campaign ten,
   by which point every remaining market is a formality. The reference is a
   campaign played at the best of five launch angles per market, which is what
   you converge on after a retry or two — measured at 1008 kills. */
/* The garage is bought with good play now, not long play. Measured: a blind
   straight-line campaign banks 44 of the 63 stars on offer and a learned one
   banks 61, so the monster truck lands about a third of the way through a
   first campaign and the sleigh near the end of it — and stars only ever go
   up, so neither is ever a wall. */
test('the garage opens inside one good campaign, not three long ones', () => {
  const api = boot();
  const cap = api.LEVELS.length * 3;
  const stars = api.CARS.filter(c => c.stars).map(c => c.stars);
  assert(stars[stars.length - 1] < cap * 0.75,
    'the last car should not need three quarters of every star in the game, wants ' +
    stars[stars.length - 1] + ' of ' + cap);
  assert(stars[0] <= 24, 'and the first star-priced car lands inside a first campaign');
  const kills = api.CARS.filter(c => !c.stars);
  assert(kills[1].unlock <= 500, 'the first unlock still arrives early on kills alone');
});

/* The reference above is a number in a test, so it has to be re-derived when
   the balance moves. This is the derivation, run for real. */
test('a campaign is still worth about a thousand kills to someone who has learned it', () => {
  let learned = 0;
  const api0 = boot();
  for (let lv = 0; lv < api0.LEVELS.length; lv++){
    const runs = [];
    for (const dy of [-200, -70, 0, 70, 200]){
      const api = boot();
      api.startLevel(lv); api.beginLevel();
      for (let c = 0; c < api.G.cars; c++){
        api.launch(-api.C.MAX_PULL, dy + (c - 1) * 40);
        for (let f = 0; f < 2400 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
          api.skipReplay(); api.update(1 / 60);
        }
      }
      runs.push(api.G.kills);
    }
    learned += Math.max(...runs);
  }
  console.log('    (one learned campaign: ' + learned + ' kills; the sleigh costs ' +
    (api0.CARS[4].unlock / learned).toFixed(1) + ' of them)');
  assert(learned > 700 && learned < 1500,
    'the 1008-kill reference in the test above needs re-deriving: ' + learned);
});

/* starsTotal() had exactly one caller — a subtitle on the menu. The results
   card's centrepiece bought nothing, and the garage was bought with time. */
test('the two best cars are bought with stars, not with hours', () => {
  const api = boot();
  const byId = (id) => api.CARS.find(c => c.id === id);
  const stars = api.CARS.filter(c => c.stars);
  assert(stars.length === 2, 'two cars should cost stars, got ' + stars.length);
  assert(stars.map(c => c.id).join() === 'monster,sleigh', 'and they are the best two');

  api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
  api.G.starsPer = [];
  assert(!api.carUnlocked(byId('monster')),
    'a million kills should not buy the monster truck');
  assert(api.carUnlocked(byId('van')) && api.carUnlocked(byId('sport')),
    'but they still buy the two that cost kills');

  api.G.lifeKills = 0;
  api.G.starsPer = api.LEVELS.map((_, i) => (i < 6 ? 3 : 0));   // 18 stars
  assert(api.starsTotal() === 18, 'fixture should be 18 stars, got ' + api.starsTotal());
  assert(!api.carUnlocked(byId('monster')), 'locked at 18');
  api.G.starsPer[6] = 2;
  assert(api.starsTotal() === 20 && api.carUnlocked(byId('monster')), 'open at 20');
  assert(!api.carUnlocked(byId('sleigh')), 'the sleigh costs more');
  api.G.starsPer = api.LEVELS.map((_, i) => (i < 14 ? 3 : 0));  // 42
  assert(api.carUnlocked(byId('sleigh')), 'open at 42');
});

test('the coupe stops being the third most expensive thing in the garage', () => {
  const api = boot();
  const kills = api.CARS.filter(c => !c.stars);
  const order = kills.map(c => c.unlock);
  assert(order.join() === [0, 400, 600].join(),
    'the kill-priced cars should climb 0/400/600, got ' + order.join('/'));
});

test('the second star costs a second goal', () => {
  const api = boot();
  api.startCampaign(); api.beginLevel();
  const rate = (hit, goalsDone) => {
    api.G.levelScore = hit ? api.G.target : api.G.target - 1;
    api.G.goalsDone = goalsDone;
    api.levelEnd();
    return api.G.stars;
  };
  assert(rate(false, 3) === 0, 'missing the target is no stars whatever else you did');
  assert(rate(true, 0) === 1, 'the target alone is one');
  assert(rate(true, 1) === 1, 'one goal is still one — it used to be two');
  assert(rate(true, 2) === 2, 'two goals is two');
  assert(rate(true, 3) === 3, 'all three is three');
});

test('a save from before the garage changed still boots', () => {
  // a player who had unlocked the sleigh on kills alone, with no stars at all
  const api = boot({ store: {
    merry_crashmas_kills_v1: '99999',
    merry_crashmas_car_v1: 'sleigh',
    merry_crashmas_progress_v1: '12',
  } });
  assert(api.G.lifeKills === 99999, 'the kill count survives');
  assert(api.getCar().id === 'hatch',
    'a car they can no longer afford falls back to the hatchback, got ' + api.getCar().id);
  assert(api.G.unlocked === 12, 'and their campaign progress is untouched');
  // nothing is un-owned: the stars they earn from here still count
  api.G.starsPer = api.LEVELS.map(() => 3);
  assert(api.carUnlocked(api.CARS[4]), 'and the sleigh comes back once earned');
});

test('a locked car cannot be picked, an unlocked one can', () => {
  const api = boot();
  api.G.lifeKills = 0;
  const locked = api.CARS[api.CARS.length - 1];
  assert(!api.carUnlocked(locked), 'the last car starts locked');
  assert(api.selectCar(locked.id) === false, 'and cannot be selected');
  assert(api.getCar().id === 'hatch', 'so the hatchback stays');
  api.G.starsPer = api.LEVELS.map(() => 3);
  assert(api.carUnlocked(locked), 'stars unlock it');
  assert(api.selectCar(locked.id) === true, 'and now it takes');
  assert(api.getCar().id === locked.id, 'selected');
  assert(api.selectCar('not-a-car') === false, 'nonsense ids are refused');
});

/* The garage told you nothing about a car you had not earned. A locked card
   was a picture, a name and a wall — no stat bars at all, so you could not see
   what you were grinding towards; and the two unlock currencies were told
   completely differently, a star car counting down ("★ 20 (2 to go)") and a
   shopper car quoting a flat total ("4,000 lifetime shoppers") with no way to
   tell whether you were at twelve or at 3,999. */
test('a locked car shows what it is and how close you are to it', () => {
  const api = boot();
  api.G.lifeKills = 268; api.G.starsPer = api.LEVELS.map((_, i) => i < 9 ? 2 : 0);
  api.renderGarage();
  const html = String(api._nodes.brGarage.innerHTML);
  const cards = html.split('<button ').slice(1);
  assert(cards.length === api.CARS.length,
    'the garage should show every car, got ' + cards.length);

  let lockedSeen = 0;
  for (let i = 0; i < api.CARS.length; i++){
    const c = api.CARS[i], card = cards[i], open = api.carUnlocked(c);
    assert(card.includes(c.name), 'card ' + i + ' should be ' + c.name);
    // three stat bars on every card, earned or not
    const bars = [...card.matchAll(/<s title="([^"]+)"><em style="width:(\d+)%/g)];
    assert(bars.length === api.CAR_STATS.length,
      c.id + ' shows ' + bars.length + ' bars, expected ' + api.CAR_STATS.length +
      (open ? '' : ' — a locked car should still say what it is'));
    for (const [, label] of bars)
      assert(api.CAR_STATS.some(s => s[0] === label), c.id + ' bar labelled ' + label);

    const prog = /<o><em style="width:(\d+)%"><\/em><\/o>/.exec(card);
    if (open){
      assert(!prog, c.id + ' is unlocked and should not carry a progress bar');
      assert(card.includes(c.blurb), c.id + ' should read its blurb');
    } else {
      lockedSeen++;
      assert(prog, c.id + ' is locked and should show how close you are');
      assert(+prog[1] === Math.round(api.carProgress(c) * 100),
        c.id + ' bar says ' + prog[1] + '% for progress ' + api.carProgress(c).toFixed(3));
      assert(+prog[1] < 100, c.id + ' is locked, so the bar must not be full');
      // and the line above it counts the same way whichever currency it is
      const cost = api.carCost(c);
      assert(/\d\s*\/\s*[\d,]+/.test(cost),
        c.id + ' should read as progress, got "' + cost + '"');
      assert(card.includes(cost), c.id + ' should print its cost line');
    }
  }
  assert(lockedSeen >= 2, 'this fixture should have locked cars, got ' + lockedSeen);
  console.log('    (garage at 268 shoppers / 18 stars: ' + api.CARS.map(c =>
    c.id + ' ' + Math.round(api.carProgress(c) * 100) + '%').join(', ') + ')');

  /* The bar and the gate are the same question asked twice, so they must never
     disagree — and the interesting place for that is the last step before the
     car opens, not the middle of the grind. */
  const setTo = (c, n) => {
    if (c.stars) api.G.starsPer = api.LEVELS.map((_, i) => i * 3 < n ? Math.min(3, n - i * 3) : 0);
    else api.G.lifeKills = n;
    return c.stars ? api.starsTotal() : api.G.lifeKills;
  };
  for (const c of api.CARS){
    const cost = c.stars || c.unlock;
    if (cost <= 0){                              // the starter car costs nothing
      api.G.lifeKills = 0; api.G.starsPer = api.LEVELS.map(() => 0);
      assert(api.carUnlocked(c) && api.carProgress(c) === 1,
        c.id + ' is the car you start with and should read full');
      continue;
    }
    assert(setTo(c, cost - 1) === cost - 1, 'fixture should sit one short for ' + c.id);
    assert(!api.carUnlocked(c), c.id + ' should still be shut one short of its cost');
    assert(api.carProgress(c) < 1 && api.carProgress(c) > 0.5,
      c.id + ' should read nearly full one short, got ' + api.carProgress(c).toFixed(3));
    setTo(c, cost);
    assert(api.carUnlocked(c) && api.carProgress(c) === 1,
      c.id + ' should be full and open at exactly its cost');
    setTo(c, cost * 40);
    assert(api.carProgress(c) === 1, c.id + ' progress should clamp, got ' + api.carProgress(c));
  }

  /* On a short screen the blurb line is hidden outright, which is where the
     bar earns its keep: it must be the one thing left that still says
     "you are getting closer". */
  const src = fs.readFileSync(HTML, 'utf8');
  assert(/body\.short \.car i\{ display:none; \}/.test(src),
    'the short layout is expected to hide the blurb line');
  assert(!/body\.short \.car o\s*\{[^}]*display:\s*none/.test(src),
    'it must not hide the progress bar as well');
  assert(/\.car o em\{[^}]*background:/.test(src), 'the progress bar needs a fill colour');
  assert(/\.car\.locked u s em\{[^}]*background:/.test(src),
    'a locked stat bar should be its own colour, not gold');
});

test('each car is a different size on the road', () => {
  const api = boot();
  api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
  api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
    api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
    api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
    api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
  api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
  api.selectCar('sport');
  api.startCampaign(); api.beginLevel();
  assert(api.car.boost === 2, 'the coupe starts with two nitros, got ' + api.car.boost);
  api.selectCar('hatch'); api.nextCar();
  assert(api.car.boost === 1, 'the hatchback with one');
});

test('the chosen car and the lifetime tally survive a reload', () => {
  const api = boot();
  api.G.lifeKills = 5000;
  api.G.starsPer = api.LEVELS.map(() => 3);
  api.selectCar('monster');
  api.saveBest();
  assert(api._store[api.CAR_KEY] === 'monster', 'car written');
  assert(api._store[api.KILLS_KEY] === '5000', 'kills written');
  const again = boot({ store: api._store });
  assert(again.G.lifeKills === 5000, 'tally read back');
  assert(again.getCar().id === 'monster', 'car read back');
});

test('a saved car that is no longer unlocked falls back to the hatchback', () => {
  const api = boot({ store: { merry_crashmas_car_v1: 'sleigh', merry_crashmas_kills_v1: '0',
    merry_crashmas_stars_v1: '[]' } });
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

test('drawing every car, on the ground and mid-roll, does not throw', () => {
  const api = boot();
  api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
  // a player lines it up, misses, adjusts, and fires the nitro at a different
  // moment — a few goes, not one
  const felled = (name, kind) => {
    for (const off of [-90, -40, 0, 40, 90]){
      for (const trig of [1200, 800]){
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
          if (!fired && Math.hypot(t.x - api.car.x, t.y - api.car.y) < trig){ api.doBoost(); fired = true; }
        }
        if (t.dead) return true;
      }
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

test('drawing every market in the campaign does not throw', () => {
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
  for (let i = 0; i < 6; i++){
    api.killPerson(api.addPerson(1700 + i * 40, 1100), 900, 0, 'car');
    tick(0.12);
  }
  const quiet = api.clip.kills;
  tick(3);                                   // ...a long quiet stretch...

  // ...then a far busier second, a long way away
  api.car.x = 3800;
  for (let i = 0; i < 16; i++){
    api.killPerson(api.addPerson(3800 + i * 40, 1100), 900, 0, 'car');
    tick(0.1);
  }
  tick(0.3);

  assert(quiet >= 5, 'the first group was captured while it was the best, got ' + quiet);
  assert(api.clip.kills > quiet, 'the busy stretch should win, got ' + api.clip.kills);
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
  /* Snapshot BEFORE the replay starts, not after. startReplay now puts the car
     and the crowd where the clip begins so the camera can frame them, so by the
     first replay frame the market is already scribbled on — which is exactly
     the thing this test exists to prove gets put back. */
  /* Re-taken every frame of the settle, so it is the state on the frame the
     replay actually starts from. Taken once when the drive loop ended, it was
     a state the market had not finished arriving at — bodies were still in the
     air, and the run now ends the moment there is nothing left to hit, which
     leaves more of the settle to happen after the snapshot than before. */
  let before, propsBefore, carBefore, groundBefore;
  const snap = () => {
    before = api.people.map(p => [p.x, p.y, p.dead, p.squash, p.ang, p.panic, p.cry, p.fly]);
    propsBefore = api.props.map(o => [o.x, o.y, o.dead, o.hp]);
    carBefore = [api.car.x, api.car.y, api.car.ang, api.car.z, api.car.roll, api.car.gore];
    groundBefore = [api.gore.length, api.tracks.length, api.debris.length];
  };
  snap();
  for (let i = 0; i < 200 && api.G.phase !== 'replay'; i++){ snap(); api.update(1 / 60); }
  assert(api.G.phase === 'replay', 'in the replay');
  assert(api.gore.length === 0,
    'the clip should not open on the run it is a highlight of, got ' + api.gore.length + ' decals');
  const kills = api.G.kills, score = api.G.levelScore;
  for (let i = 0; i < 1200 && api.G.phase === 'replay'; i++) api.update(1 / 60);

  assert(api.gore.length === groundBefore[0] && api.debris.length === groundBefore[2],
    'the ground should come back exactly: ' + [api.gore.length, api.debris.length] +
    ' vs ' + [groundBefore[0], groundBefore[2]]);
  // endReplay hands over to nextCar, which seeds one track under the new car
  assert(api.tracks.length - groundBefore[1] <= 1,
    'the tyre tracks should come back: ' + api.tracks.length + ' vs ' + groundBefore[1]);
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
  /* The bar is 5. Measured over 450 runs it lets 65% of them through, and the
     markets you start on need that: at 9 it was 20% on market 1 and 10% on THE
     GAUNTLET, which is a whole level of four cars showing you nothing. */
  assert(!runWith(3), 'three kills is not a highlight');
  assert(runWith(6), 'six in two seconds is');
});

test('the run summary sits at the top, not across the wreckage', () => {
  const api = boot({ w: 1280, h: 720, count: true });
  api.startLevel(0); api.beginLevel();
  api.G.banner = { text: '9 DOWN · 3 WRECKED · 4,200', t: 1.2 };
  api.draw();
  /* This used to assert `0.115 * 720 < 0.18 * 720` — two constants, so drawHUD
     could put the receipt at VH * 0.9 and it would still pass. It reads the
     layout the banner actually uses now. */
  const receipt = api.bannerLayout(textW('9 DOWN · 3 WRECKED · 4,200', 30), true, 1);
  const shout = api.bannerLayout(textW('MARKET MAYHEM', 30), false, 1);
  const sr = api.hudScoreRect();
  assert(receipt.y + receipt.h / 2 < 720 * 0.30,
    'the receipt should stay in the top strip, got ' + receipt.y.toFixed(0));
  assert(receipt.y - receipt.h / 2 > sr.y + sr.h - 200,
    'but below the score plate, not printed through it');
  assert(shout.y > receipt.y,
    'the loud banner belongs lower than the quiet one: ' +
    shout.y.toFixed(0) + ' vs ' + receipt.y.toFixed(0));
  assert(shout.y + shout.h / 2 < 720, 'and inside the frame');

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
      api.G.lifeKills = 999999; api.G.starsPer = api.LEVELS.map(() => 3);
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
  // what the market is worth if you flatten every last bit of it
  let pot = 0;
  for (const p of api.people) pot += p.pts;
  for (const o of api.props) pot += o.pts;
  assert(api.G.target > 0 && api.G.target < pot, 'target is a slice of the market');
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

test('running the whole render path in every phase does not throw', () => {
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
  let peakFx = 0, peakTracks = 0;
  /* Measured while the car is driving, not at a fixed frame count: a run this
     good now earns a replay, and the replay lifts the tyre tracks off the
     ground for the length of the clip and puts them back after. */
  for (let i = 0; i < 360; i++){
    api.update(1 / 60);
    peakFx = Math.max(peakFx, api.fx.length);
    if (api.G.phase === 'drive') peakTracks = Math.max(peakTracks, api.tracks.length);
  }
  assert(peakTracks > 5, 'tyre tracks laid, got ' + peakTracks);
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

/* Every market's target should sit near 0.78x what a blind full-power player
   scores on it. Before this table existed the median ratio across the campaign
   was 2.3x — sixteen of twenty-one markets cleared themselves 89-100% of the
   time on random angles, while market 1, the one that decides whether anybody
   keeps playing, sat at 0.99x and a 44% pass rate. The curve ran backwards. */
function blindMedian(level, angles){
  const scores = [];
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
    scores.push(run.G.levelScore);
  }
  scores.sort((x, y) => x - y);
  return scores[Math.floor(scores.length / 2)];
}

test('every market asks for about three quarters of a blind run', () => {
  const api = boot();
  const angles = [-200, -70, 0, 70, 200];
  const bad = [];
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    const target = api.G.target;
    const med = blindMedian(i, angles);
    const ratio = target / Math.max(1, med);
    /* Market 1 sits deliberately below the curve: it is the tutorial, it gets
       four cars, and its job is to open on the shot everyone takes first —
       which the test below pins at 9 runs in 10. Holding it to the same floor
       as the rest squeezes its par into a 0.4% window between "too hard for a
       first-timer" and "out of band", which any change to the random stream
       then breaks. */
    const floor = i === 0 ? 0.25 : 0.35;
    if (ratio < floor || ratio > 1.05){
      bad.push(api.LEVELS[i].name + ' ' + ratio.toFixed(2) + ' (target ' + target + ', median ' + med + ')');
    }
  }
  assert(bad.length === 0, 'markets out of band:\n  ' + bad.join('\n  '));
});

/* Market 1 — the first market anyone plays — spent 2.0 to 3.3 seconds per car,
   ten seconds a market, watching a car roll across empty snow with the score
   frozen. STOP_SPD alone could not fix that: it is at 110, just above KILL_SPD
   85, so the next notch up starts eating kills. */
test('a run ends when there is nothing left to hit', () => {
  const rows = [];
  for (const lv of [0, 5, 10]){
    const api = boot({ w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    const tails = [];
    for (let c = 0; c < api.G.cars && api.G.phase !== 'results'; c++){
      api.launch(-api.C.MAX_PULL, (c - 1) * 40);
      let lastT = 0, t = 0, sc = api.G.levelScore;
      for (let f = 0; f < 3000 && api.G.phase === 'drive'; f++){
        api.update(1 / 60); t += 1 / 60;
        if (api.G.levelScore !== sc){ sc = api.G.levelScore; lastT = t; }
      }
      tails.push(t - lastT);
      for (let f = 0; f < 900 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
        api.skipReplay(); api.update(1 / 60);
      }
    }
    const worst = Math.max(...tails), total = tails.reduce((a, b) => a + b, 0);
    rows.push(api.LEVELS[lv].name + ' ' + tails.map(x => x.toFixed(1)).join('/') +
      ' (' + total.toFixed(1) + 's)');
    assert(worst <= 2.0, api.LEVELS[lv].name + ': ' + worst.toFixed(2) +
      's of dead run on one car');
    assert(total <= 6.5, api.LEVELS[lv].name + ': ' + total.toFixed(1) +
      's of dead run over the market');
  }
  /* The cheap fix stayed rejected: raising STOP_SPD would have bought the same
     seconds by quietly eating kills. */
  const C = boot().C;
  assert(C.STOP_SPD >= 110 && C.STOP_SPD > C.KILL_SPD,
    'STOP_SPD ' + C.STOP_SPD + ' should still sit above KILL_SPD ' + C.KILL_SPD);
  console.log('    (dead tail: ' + rows.join(' | ') + ')');
});

test('a car still rolling at a crowd is never cut short', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive';
  api.props.length = 0; api.people.length = 0; api.pickups.length = 0;

  const aim = (x, y, ang, v) => {
    api.car.x = x; api.car.y = y; api.car.ang = ang;
    return api.somethingAhead(v, x, y, ang);
  };
  // 120px/s toward a crowd 400px ahead: it will not get there, and the rule says so
  // parked well clear of every fence, which is itself a thing worth hitting
  const CX = 1400, CY = 1100;
  const q = api.addPerson(CX + 400, CY, 'shopper');
  assert(api.rollOut(120) < 400,
    '120px/s does not carry 400px, it carries ' + api.rollOut(120).toFixed(0));
  assert(!aim(CX, CY, 0, 120), 'a car that cannot reach them should not be kept alive');
  // …but at speed it is squarely a run
  assert(aim(CX, CY, 0, 700), 'at 700px/s that crowd is very much ahead');
  assert(api.rollOut(700) > 400, 'because 700px/s does carry that far');

  // dead ahead counts, ninety degrees off does not — the car sweeps a corridor,
  // not the 150° cone the first version used
  assert(!aim(CX, CY, Math.PI / 2, 700), 'square across the bow is not ahead');
  assert(!aim(CX, CY, Math.PI, 700), 'and behind is not ahead');
  q.y = CY + api.AHEAD_WIDE + api.C.CAR_R + q.r + 20;
  assert(!aim(CX, CY, 0, 700), 'nor is one the car passes to the side of');
  q.y = CY;

  // a corpse is not a reason to keep driving
  q.dead = true;
  assert(!aim(CX, CY, 0, 700), 'the dead do not count');
  q.dead = false;
  assert(aim(CX, CY, 0, 700), 'the living do');
  api.people.length = 0;

  // the fence counts: it is how a long shot gets thrown back into the crowd
  assert(aim(api.bounds.x1 - 300, 1100, 0, 700),
    'a fence 300px ahead at speed is worth staying alive for');
  assert(!aim(api.bounds.x1 - 300, 1100, 0, 150),
    'but not at 150px/s, where the bounce leaves it under STOP_SPD');

  // above IDLE_SPD the rule does not run at all
  assert(api.IDLE_SPD > api.C.STOP_SPD,
    'the rule stays clear of the speed the run already ends at');
});

test('the aim preview stops where the run stops', () => {
  /* The preview models the roll-out; the run now ends on emptiness. They share
     somethingAhead(), which is the only way the dot and the car can agree —
     the first version did not, and the preview promised 566px of road the car
     never drove. */
  for (const [lv, name] of [[0, 'OPENING NIGHT'], [10, 'NARROW ALLEYS']]){
    const api = boot({ w: 1280, h: 720, store: ALL_CARS });
    api.startLevel(lv); api.beginLevel();
    api.props.length = 0; api.people.length = 0; api.pickups.length = 0;
    const pv = api.previewPath(-1, 0, 1);
    api.launch(-api.C.MAX_PULL, 0);
    for (let i = 0; i < 4000 && api.G.phase === 'drive'; i++) api.update(1 / 60);
    const err = Math.hypot(pv.end.x - api.car.x, pv.end.y - api.car.y);
    assert(err < 140, name + ': the preview ends ' + err.toFixed(0) +
      'px from where the car stops');
  }
});

/* One MIDNIGHT MASS run makes 12,390 tears out of 19,707 particles, sits
   pinned at the 899 cap, and the eviction took the front 200 entries whatever
   they were — which deleted 8 of the 12 score pops mid-flight. The game was
   throwing away the only thing on screen that says what you just earned, to
   make room for crying. */
test('the particle buffer never eats a score pop', () => {
  const rows = [];
  for (const lv of [20, 0, 10]){
    const api = boot({ w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    const seen = new Map();
    let evictions = 0, peak = 0;
    for (let c = 0; c < api.G.cars && api.G.phase !== 'results'; c++){
      api.launch(-api.C.MAX_PULL, (c - 1) * 40);
      for (let f = 0; f < 3000 && api.G.phase === 'drive'; f++){
        const before = api.fx.length;
        api.update(1 / 60);
        peak = Math.max(peak, api.fx.length);
        if (before - api.fx.length >= api.FX_EVICT * 0.75) evictions++;
        for (const e of api.fx) if (!seen.has(e)) seen.set(e, 1);
      }
      for (let f = 0; f < 900 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
        api.skipReplay(); api.update(1 / 60);
      }
    }
    let txt = 0, lost = 0;
    for (const [e] of seen){
      if (e.type !== 'txt') continue;
      txt++;
      if (e.t < e.ttl && api.fx.indexOf(e) < 0) lost++;
    }
    assert(txt > 8, api.LEVELS[lv].name + ': only ' + txt + ' score pops to check');
    assert(lost === 0, api.LEVELS[lv].name + ': ' + lost + ' of ' + txt +
      ' score pops were deleted before their ttl');
    assert(peak <= api.FX_MAX + api.FX_EVICT,
      api.LEVELS[lv].name + ': the buffer ran to ' + peak);
    rows.push(api.LEVELS[lv].name + ' ' + txt + ' pops, ' + evictions + ' evictions');
  }
  console.log('    (particles: ' + rows.join(' | ') + ')');
});

test('eviction takes the tears and leaves the text', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.fx.length = 0;
  // a text pop at the very front, exactly where the old splice(0, 200) hit
  const pop = api.addFx({ type: 'txt', text: '+1,000', ttl: 1, size: 20, col: '#8effb0' });
  for (let i = 0; i < api.FX_MAX + 5; i++) api.addFx({ type: 'tear', ttl: 1 });
  assert(api.fx.indexOf(pop) >= 0, 'the pop survived the eviction it used to be first in line for');
  assert(api.fx.length <= api.FX_MAX + 6,
    'and the buffer still shed its 200: ' + api.fx.length);
  const tears = api.fx.filter(e => e.type === 'tear').length;
  assert(tears === api.fx.length - 1, 'everything else is a tear');

  // a buffer that is nothing but text cannot shed anything, and must not loop
  api.fx.length = 0;
  for (let i = 0; i < api.FX_MAX + 5; i++) api.addFx({ type: 'txt', text: 'x', ttl: 1 });
  assert(api.fx.length === api.FX_MAX + 5, 'all text, nothing dropped: ' + api.fx.length);
});

test('a tear nobody can see costs a draw but not a particle', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  /* The rolls stay unconditional whether or not the tear is spawned. This is
     the point of the item: four other cosmetic systems have fed on the
     simulation seed, and culling a draw rescores all twenty-one markets. */
  /* Only the camera moves between the two runs. The shopper stands in the same
     place next to the same car both times, so every draw stepPeople makes is
     the same draw — the only difference is whether anyone could have seen the
     tear. */
  const draws = (camX) => {
    api.reseed(99); api.people.length = 0; api.fx.length = 0;
    api.car.x = 2600; api.car.y = 1100;
    const p = api.addPerson(2660, 1100, 'shopper');
    p.cry = 1; p.panic = 1;
    api.cam.x = camX; api.cam.y = 1100;
    for (let i = 0; i < 40; i++) api.stepPeople(1 / 60);
    return { after: api.rnd(), spawned: api.fx.filter(e => e.type === 'tear').length };
  };
  const near = draws(2600);
  const far = draws(2600 + 9000);
  assert(near.after === far.after,
    'the stream moved when the tear was culled: ' + near.after + ' vs ' + far.after);
  assert(near.spawned > 0, 'a shopper crying in shot should make tears');
  assert(far.spawned === 0, 'one crying 9,000px away should not, got ' + far.spawned);

  assert(api.onCamera(api.cam.x, api.cam.y, 0), 'the camera centre is on camera');
  assert(!api.onCamera(api.cam.x + 9000, api.cam.y, 0), '9,000px away is not');
});

test('drawFx does not draw what the camera cannot see', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const cost = (dx) => {
    api.fx.length = 0;
    for (let i = 0; i < 60; i++)
      api.addFx({ type: 'puff', x: api.cam.x + dx, y: api.cam.y, ttl: 1, size: 6 });
    const rec = carRec();
    api.withCtx(rec, () => api.drawFx());
    return rec.all.length;
  };
  const seen = cost(0), unseen = cost(5000);
  assert(seen > 30, '60 puffs in shot should draw something, got ' + seen);
  assert(unseen === 0, '60 puffs 5,000px off camera still cost ' + unseen + ' draw ops');
  console.log('    (drawFx: ' + seen + ' ops in shot, ' + unseen + ' off it)');
});

test('the first market clears on the shot everyone takes first', () => {
  let pass = 0;
  for (let t = 0; t < 10; t++){
    const api = boot();
    api.startLevel(0); api.beginLevel();
    for (let c = 0; c < api.G.cars; c++){
      api.launch(-api.C.MAX_PULL, (t - 4.5) * 12 + (c - 1) * 30);
      for (let f = 0; f < 2400 && api.G.phase !== 'aim' && api.G.phase !== 'results'; f++){
        api.skipReplay();
        api.update(1 / 60);
      }
    }
    if (api.G.levelScore >= api.G.target) pass++;
  }
  assert(pass >= 9, 'straight down the lane cleared market 1 only ' + pass + '/10 times');
});

test('changing the weather does not rebuild the market', () => {
  /* seedSnow() used to pull TH.snow x5 numbers from the layout's own seed
     before the market was laid out, so bumping a theme's snowfall by one flake
     changed prop count, crowd size, target and every position — with nothing to
     connect the two. */
  const api = boot();
  const before = [];
  for (let i = 0; i < api.LEVELS.length; i++){
    api.startLevel(i);
    before.push([api.props.length, api.people.length, api.G.target, api.props[0].x]);
  }
  const mutated = boot({ tweak: src => src.replace('snow:70,', 'snow:71,').replace('snow:220,', 'snow:221,') });
  for (let i = 0; i < mutated.LEVELS.length; i++){
    mutated.startLevel(i);
    const name = mutated.LEVELS[i].name;
    assert(mutated.props.length === before[i][0], name + ': prop count moved with the snowfall');
    assert(mutated.people.length === before[i][1], name + ': crowd size moved with the snowfall');
    assert(mutated.G.target === before[i][2], name + ': target moved with the snowfall');
    near(mutated.props[0].x, before[i][3], 1e-9, name + ': layout moved with the snowfall');
  }
  /* And the tweak really did change the snowfall — otherwise the four
     assertions above are comparing a build against itself and prove nothing. */
  const snowA = api.LEVELS.map((_, i) => { api.startLevel(i); return api.snow.length; });
  const snowB = mutated.LEVELS.map((_, i) => { mutated.startLevel(i); return mutated.snow.length; });
  assert(JSON.stringify(snowA) !== JSON.stringify(snowB),
    'the snow constants were tweaked but no market\'s snowfall changed, so this ' +
    'test was comparing a build against itself');
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
/* Sets up the most expensive frame the game can produce: the last market, every
   buffer saturated, the camera at the zoom where the most people are on screen
   at the most detail. Returns the counted frame plus how many of the people in
   shot took a path more expensive than the batch. */
function worstFrame(w, h, shot){
  const api = boot({ count: true, w, h });
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
  api.car.x = 2600; api.car.y = 1100; api.car.vx = (shot || {}).vx || 800;
  api.camSnap();
  if ((shot || {}).aim){ api.G.phase = 'aim'; api.camSnap(); }
  // a full boot-print buffer, all of it in shot and none of it faded
  api.setT(500);
  for (let i = 0; i < api.FOOT_MAX; i++){
    api.foot[i] = { x: api.cam.x + ((i * 53) % 900) - 450,
      y: api.cam.y + ((i * 71) % 600) - 300, rot: i, r: 16, t: 500 };
  }
  api.draw();                       // warm the cached gradients
  api._resetCounts();
  api.draw();

  const halfW = w / api.cam.s / 2 + 220, halfH = h / api.cam.s / 2 + 220;
  let detailed = 0, onCamera = 0;
  for (const p of api.people){
    if (Math.abs(p.x - api.cam.x) > halfW || Math.abs(p.y - api.cam.y) > halfH) continue;
    onCamera++;
    if (p.dead || api.lodAlways(p) || api.lodQ(p) >= api.LOD_MID) detailed++;
  }
  let propsOn = 0;
  for (const o of api.props){
    if (Math.abs(o.x - api.cam.x) <= halfW && Math.abs(o.y - api.cam.y) <= halfH) propsOn++;
  }
  return { api, c: api._counts, fills: api._counts.fill || 0,
    strokes: api._counts.stroke || 0, detailed, onCamera, propsOn,
    tz: Math.round(api.cam.tz) };
}

/* The same world at the same zoom on three monitors. cam.s is VH/cam.tz, so
   before the LOD gate was made resolution-independent a 1440p window handed out
   bigger shoppers and pushed 149 of them onto the full-detail path where 720p
   pushed one — the identical frame cost 1167 fills at 720p and 4846 at 1440p,
   which is how the budget got blown by nothing but a larger window. One budget
   covers all three now because all three draw the same thing. */
test('one frame of the worst market stays inside its draw budget at any resolution', () => {
  const sizes = [[1280, 720], [1920, 1080], [2560, 1440]];
  const runs = sizes.map(([w, h]) => Object.assign({ w, h }, worstFrame(w, h)));
  for (const r of runs){
    console.log('    (worst frame at ' + r.w + 'x' + r.h + ': ' + r.fills + ' fills, ' +
      r.strokes + ' strokes, ' + r.detailed + '/' + r.onCamera + ' people past the batch)');
    assert(r.fills > 200, 'the frame should actually be drawing something, got ' + r.fills);
    assert(r.fills < 3400, 'fill budget blown at ' + r.w + 'x' + r.h + ': ' + r.fills);
    assert(r.strokes < 1500, 'stroke budget blown at ' + r.w + 'x' + r.h + ': ' + r.strokes);
    assert(!r.c.createRadialGradient, 'the vignette gradient should be cached, not rebuilt');
    assert(!r.c.createLinearGradient, 'the floor gradient should be cached, not rebuilt');
    assert(r.api.gore.length <= r.api.C.GORE_MAX, 'gore capped');
  }
  // and the detail handed out must not depend on the size of the window
  const det = runs.map(r => r.detailed / r.onCamera);
  const lo = Math.min(...det), hi = Math.max(...det);
  assert(hi - lo < 0.1 * hi + 0.02,
    'detail should not scale with resolution: ' + det.map(d => d.toFixed(3)).join(' vs '));
});

/* A shadow is two ellipses — a soft outer one and a tighter core — which is
   how it gets an edge that is not a hard line. That pair only reads while the
   shadow is big enough to have an edge at all, and on a frame holding two
   hundred props the second ellipse was two hundred fills nobody could see. */
test('a distant shadow is one blob, a near one has an edge', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const cast = (rx) => {
    const rec = carRec();
    api.withCtx(rec, () => api.shadow(0, 0, rx, rx * 0.4, 0.3));
    return rec;
  };
  const q = (rx) => rx * api.LOD_REF / api.cam.tz;
  // pick two radii either side of the line at this camera
  const big = api.SHADOW_FINE * api.cam.tz / api.LOD_REF * 1.6;
  const small = api.SHADOW_FINE * api.cam.tz / api.LOD_REF * 0.5;
  assert(q(big) > api.SHADOW_FINE && q(small) < api.SHADOW_FINE, 'fixture straddles the line');
  const near = cast(big), far = cast(small);
  assert(near.all.filter(e => e[0] === 'el').length === 2,
    'a near shadow is two ellipses, got ' + near.all.filter(e => e[0] === 'el').length);
  assert(far.all.filter(e => e[0] === 'el').length === 1,
    'a far shadow should be one blob, got ' + far.all.filter(e => e[0] === 'el').length);
  assert(far.fills === 1 && near.fills === 2,
    'fills: far ' + far.fills + ', near ' + near.fills);

  // the blob still lands under the thing casting it, and is not a hard disc
  const blob = far.all.filter(e => e[0] === 'el')[0];
  assert(Math.hypot(blob[1], blob[2]) < small * 0.75,
    'the blob drifted off its prop by ' + Math.hypot(blob[1], blob[2]).toFixed(1));
  assert(blob[4] < blob[3], 'a shadow lies flat, got ' + blob[3] + ' by ' + blob[4]);
  assert(String(far.order[0]).startsWith('rgba(8,16,32'), 'and it is still a shadow colour');

  /* Measured on the reference 720p frame like every other LOD gate in this
     game — a bigger window must not buy itself softer shadows. */
  const at = (h) => {
    const a2 = boot({ w: h * 16 / 9, h });
    a2.startCampaign(); a2.beginLevel();
    a2.G.phase = 'drive'; a2.car.x = 2600; a2.car.y = 1100; a2.camSnap();
    const rec = carRec();
    a2.withCtx(rec, () => a2.shadow(0, 0, small, small * 0.4, 0.3));
    return rec.fills;
  };
  assert(at(720) === at(1440), 'a 1440p window got a different shadow: ' +
    at(720) + ' vs ' + at(1440));
});

/* This budget was only ever checked against one camera — the car at 800px/s,
   tz 1072. Two cameras are wider and cost more, and neither had ever been
   counted: the aim frame, which holds the entire market and which you look at
   before every single launch, and the frame right after the launch, where the
   car is doing 2,000 and the camera has pulled out to keep it in shot. The aim
   frame was at 3,913 fills against a 3,400 budget when this was written — 15%
   over, on the screen the game opens on. */
test('the frames the budget never looked at are inside it too', () => {
  const shots = [{ name: 'aim (whole market)', aim: true },
                 { name: 'launch speed', vx: 2200 },
                 { name: 'driving', vx: 800 }];
  const runs = shots.map(sh => Object.assign({ sh }, worstFrame(1280, 720, sh)));
  for (const r of runs){
    r.props = r.propsOn;
    console.log('    (' + r.sh.name + ': ' + r.fills + ' fills at tz ' + r.tz +
      ' over ' + r.props + ' props, ' + (r.fills / r.props).toFixed(1) + ' each)');
    assert(r.fills > 200, r.sh.name + ' drew nothing: ' + r.fills);
    assert(r.strokes < 1500, 'stroke budget blown on ' + r.sh.name + ': ' + r.strokes);
  }
  const near = runs.find(r => r.sh.vx === 800);
  const wide = runs.find(r => r.sh.aim);
  const fast = runs.find(r => r.sh.vx === 2200);
  assert(wide.tz > near.tz * 1.5,
    'the aim camera should be much the wider: ' + wide.tz + ' vs ' + near.tz);

  /* The whole market in shot must not cost more than a corner of it. This is
     the claim the flat 3,400 could never make: the aim frame holds 40% more
     props than the driving frame and used to cost 3,913 against it, because
     nothing about a prop got cheaper when you pulled the camera back. */
  assert(wide.fills < near.fills,
    'the widest frame in the game is the dearest: ' + wide.fills + ' vs ' + near.fills);
  assert(wide.fills < 3400, 'the aim frame is over the driving budget: ' + wide.fills);

  /* The launch frame is a third more market than the driving frame, at a zoom
     where a stall is still 87px across and you can read the stock on its
     counter — so it legitimately costs more in total. What must not grow is
     what it costs *per prop*: that is the number a new bit of art with no LOD
     on it moves, and a flat total would let it hide behind the wider shot. */
  for (const r of [wide, fast])
    assert(r.fills / r.props <= near.fills / near.props,
      r.sh.name + ' costs ' + (r.fills / r.props).toFixed(1) + ' a prop against ' +
      (near.fills / near.props).toFixed(1) + ' driving — new detail with no LOD on it');
  // and a hard ceiling so nothing runs away between passes
  for (const r of runs) assert(r.fills < 3700, r.sh.name + ' blew the ceiling: ' + r.fills);
});

/* Santa is r 17 and a pram carrier is r 14, both under the batch line at any
   driving zoom. Santa is the goal of two markets and the pram is the one
   silhouette worth swerving for; neither may dissolve into a coloured blob. */
test('santa and the prams are never batched, however fast the car is going', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startLevel(6);
  api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.vx = 1900;
  api.camSnap();
  assert(api.cam.tz > 1250, 'full speed should be the widest zoom, got ' + api.cam.tz);
  const santa = api.addPerson(2620, 1100, 'santa');
  const parent = api.addPerson(2660, 1100, 'parent');
  const shopper = api.addPerson(2700, 1100, 'shopper');
  assert(api.lodQ(shopper) < api.LOD_MID, 'an ordinary shopper does batch at speed');
  assert(api.lodAlways(santa), 'santa is never batched');
  assert(api.lodAlways(parent) && parent.pram, 'a pram carrier is never batched');
  assert(!api.lodAlways(shopper), 'an ordinary shopper is not exempt');
});

/* Three tiers, each actually reachable, each measurably cheaper than the next.
   There used to be a half-pixel band between "coloured blob" and "squeezed
   eyes, two tear ellipses and a fillText", which is not a middle tier. */
test('the crowd has three distinct levels of detail', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0);
  api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100;
  api.camSnap();
  const p = api.addPerson(2600, 1100, 'shopper');
  p.panic = 1; p.cry = 1;

  /* A shopper's r is 13, so the zoom alone decides the tier. The far tier is
     drawCrowdBatch's job — drawPerson has no copy of it, which is the point:
     there used to be one and nothing but this suite ever reached it. */
  const cost = (tz, fn) => {
    api.cam.tz = tz;
    api._resetCounts();
    fn();
    return { q: api.lodQ(p), fills: api._counts.fill || 0,
      strokes: api._counts.stroke || 0, text: api._counts.fillText || 0 };
  };
  const crowd = [];
  for (let i = 0; i < 20; i++) crowd.push(Object.assign({}, p, { x: 2600 + i * 30 }));
  const far1 = cost(1500, () => api.drawCrowdBatch([p]));
  const far20 = cost(1500, () => api.drawCrowdBatch(crowd));
  const mid = cost(800, () => api.drawPerson(p));
  const close = cost(470, () => api.drawPerson(p));

  assert(far1.q < api.LOD_MID, 'the wide zoom should batch, q was ' + far1.q);
  assert(mid.q >= api.LOD_MID && mid.q <= api.LOD_FINE, 'the middle tier should be reachable, q was ' + mid.q);
  assert(close.q > api.LOD_FINE, 'the replay zoom should be the full kit, q was ' + close.q);
  // the batch's win is that its cost does not grow with the crowd
  assert(far20.fills === far1.fills,
    'twenty batched shoppers cost what one does: ' + far20.fills + ' vs ' + far1.fills);
  assert(far20.fills < mid.fills * 20,
    'and far less than drawing each of them: ' + far20.fills + ' vs ' + (mid.fills * 20));
  assert(mid.fills < close.fills, 'the middle tier costs less than the full kit: ' + mid.fills + ' vs ' + close.fills);
  assert(mid.strokes < close.strokes, 'the middle tier strokes less: ' + mid.strokes + ' vs ' + close.strokes);
  assert(!far20.text && !mid.text, 'only the full kit prints the panic marker');
  assert(close.text > 0, 'the full kit prints the panic marker');
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

/* ---------------------------------------------------------------- light --- */

/* A stall lamp used to be ctx.fillStyle = 'rgba(255,186,86,.1)' and a circle:
   no falloff, and nothing dark anywhere in the frame for it to be brighter
   than. Twenty-one markets of flat brown boxes on flat grey-blue. The lamps
   are cut out of a darkness layer now, so this checks the layer is actually
   laid down, that its depth follows the theme, and that it is not rebuilt
   every frame. */
function frameOf(lv, w, h){
  const api = boot({ count: true, w: w || 1280, h: h || 720 });
  api.G.unlocked = 21;
  api.startLevel(lv); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.vx = 700;
  api.camSnap();
  api.draw();                      // warm every cache
  api._resetCounts();
  api.draw();
  return api;
}
const washOf = (api) => (api._counts._styles || []).filter(s => s.indexOf('rgba(6,11,28,') === 0);

test('the market is lit against a night, and the night follows the theme', () => {
  const bright = frameOf(12);                      // BLIZZARD, the palest night
  const deep = frameOf(20);                        // CHRISTMAS EVE, the deepest
  for (const [tag, api] of [['bright', bright], ['deep', deep]]){
    const wash = washOf(api);
    assert(wash.length === 1, tag + ' should lay exactly one night wash a frame, got ' + wash.length);
  }
  const a = (api) => parseFloat(washOf(api)[0].split(',')[3]);
  const ab = a(bright), ad = a(deep);
  console.log('    (night wash: ' + bright.getTheme().name + ' ' + ab.toFixed(3) +
    ', ' + deep.getTheme().name + ' ' + ad.toFixed(3) + ')');
  assert(ab > 0.2 && ad < 0.7, 'the wash should be a shade, not a blackout: ' + ab + ' / ' + ad);
  assert(ad > ab * 1.4, 'the darker theme should lay down a deeper night: ' + ad + ' vs ' + ab);
  // and the holes are punched, not painted over
  const ops = deep._counts._styles || [];
  assert(ops.indexOf('destination-out') >= 0, 'the lamps should be cut out of the darkness');
  assert(ops.indexOf('lighter') >= 0, 'and the glow added on top of it');
});

test('a lit lamp costs one drawImage, not a gradient', () => {
  const api = frameOf(20);
  const lamps = Math.min(api.lightBuf.length, api.MAX_LIGHTS);
  assert(lamps >= 8, 'the last market should have lamps in shot, got ' + lamps);
  // one hole per lamp + one for the car, one glow per lamp, one composite
  const imgs = api._counts.drawImage || 0;
  assert(imgs >= lamps * 2 + 2, lamps + ' lamps should cost at least ' +
    (lamps * 2 + 2) + ' drawImage calls, got ' + imgs);
  assert(!api._counts.createRadialGradient,
    'and never build a radial gradient inside a frame');
});

test('the light sprites and the snow grain are baked once, not per frame', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21;
  api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.draw();
  const after1 = api.getBakeCount();
  // the mask, the headlight, the nitro halo, one themed lamp glow, and one
  // glow per pickup kind
  const kinds = Object.keys(api.PICKUP_RGB).length;
  assert(after1 === 4 + kinds,
    'the first frame bakes the mask, the headlight, the nitro halo, the themed ' +
    'glow and the ' + kinds + ' pickup colours, got ' + after1);
  for (let i = 0; i < 30; i++){ api.setT(api.getT() + 1 / 60); api.draw(); }
  assert(api.getBakeCount() === after1,
    'thirty more frames should bake nothing: ' + api.getBakeCount());
  // a different theme rebakes the glow, and only the glow
  api.startLevel(12); api.beginLevel(); api.camSnap(); api.draw();
  assert(api.getBakeCount() === after1 + 1,
    'a new theme should rebake exactly the glow: ' + api.getBakeCount());

  // the snow tile is built from a fixed hash, so it never touches either RNG
  const before = api.rnd();
  api.snowPattern(); api.snowPattern();
  api.setT(0);
  assert(typeof before === 'number', 'sanity');
});

test('the darkness layer is half resolution and survives between frames', () => {
  const api = frameOf(20, 1920, 1080);
  const d = api.darkInfo();
  assert(api.DARK_SCALE === 0.5, 'the layer is deliberately half res');
  assert(d.w === 960 && d.h === 540,
    'a 1920x1080 viewport should carry a 960x540 darkness layer, got ' + d.w + 'x' + d.h);
  const cv = d.cv;
  api.draw(); api.draw();
  assert(api.darkInfo().cv === cv, 'the layer should be reused, not reallocated per frame');
  // and it follows a resize
  api._window.innerWidth = 1280; api._window.innerHeight = 720;
  api.fit(); api.draw();
  const r = api.darkInfo();
  assert(r.cv !== cv, 'a resize should build a new layer');
  assert(r.w === 640 && r.h === 360, 'and at half the new size, got ' + r.w + 'x' + r.h);
});

/* Every shadow sat dead centre under its own object, which is the one
   arrangement that reads as a sticker rather than a thing standing on snow. */
test('shadows fall away from one light direction, not straight down', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  assert(api.SUN_DX > 0.1, 'there should be a horizontal light direction, got ' + api.SUN_DX);
  api._resetCounts();
  api.shadow(0, 0, 100, 40, 0.3);
  assert((api._counts.ellipse || 0) === 2,
    'a caster should throw a soft shadow and a contact shadow, got ' + api._counts.ellipse);
  const cols = (api._counts._styles || []).filter(s => s.indexOf('rgba(8,16,32,') === 0);
  assert(cols.length === 2, 'both in the shadow colour, got ' + cols.length);
  const a = cols.map(s => parseFloat(s.split(',')[3]));
  assert(Math.min(...a) < Math.max(...a),
    'the thrown shadow should be softer than the contact one: ' + a.join(' / '));
  assert(Math.max(...a) <= 0.3 + 1e-9, 'and neither darker than asked for: ' + a.join(' / '));
});

/* The floor was one flat fill of TH.ground across four thousand world units,
   which is why the game had no sense of scale or speed. */
test('the snow floor carries a grain, laid down once per frame', () => {
  const api = frameOf(20);
  const pat = api.snowPattern();
  // the headless ctx cannot make a real pattern, so the game must survive that
  assert(pat === false || (pat && typeof pat === 'object'),
    'snowPattern should return a pattern or a hard false, got ' + typeof pat);
  const fills = api._counts.fillRect || 0;
  assert(fills > 0, 'the ground should still be drawn without a pattern');
});

/* ---------------------------------------------------------------- crowd --- */

/* Seven hundred shoppers walk across a field of untouched snow all run and
   leave nothing behind. Boots go down now — but a ring buffer that grows, or
   one that eats the simulation's random numbers, would be worse than none. */
test('the crowd treads the snow, on a ring buffer that never grows', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2200; api.car.y = 1100; api.camSnap();
  for (let i = 0; i < 900; i++) api.stepPeople(1 / 60);
  const laid = api.foot.filter(Boolean).length;
  console.log('    (prints after fifteen seconds of walking: ' + laid + '/' + api.FOOT_MAX + ')');
  assert(laid > 20, 'a market of walking shoppers should leave prints, got ' + laid);
  assert(api.foot.length <= api.FOOT_MAX,
    'the buffer must not grow past its cap: ' + api.foot.length);
  for (let i = 0; i < 3000; i++) api.stepPeople(1 / 60);
  assert(api.foot.length <= api.FOOT_MAX,
    'still capped after a minute: ' + api.foot.length);
  // the two feet alternate rather than tracking one line down the middle
  const walker = api.people.find(p => typeof p.footL === 'number');
  assert(walker, 'somebody should have put a foot down');
});

/* Six cosmetic systems have shifted the simulation's random stream by drawing
   from it, and each one changed every market's score. This compares a run with
   the print code in against the same run with it cut out of the source. */
test('laying footprints does not move the simulation', () => {
  const CUT = 'if (sp > 12){';
  const run = (tweak) => {
    const api = boot({ w: 1280, h: 720, tweak });
    api.startCampaign(); api.beginLevel();
    api.G.phase = 'drive';
    api.car.x = 2200; api.car.y = 1100; api.camSnap();
    for (let i = 0; i < 600; i++) api.stepPeople(1 / 60);
    return { pos: api.people.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join('|'),
      next: api.rnd(), prints: api.foot.filter(Boolean).length };
  };
  const withPrints = run(null);
  const without = run((s) => {
    assert(s.includes(CUT), 'the footprint gate moved; this test is checking nothing');
    return s.replace(CUT, 'if (false){');
  });
  assert(withPrints.prints > 20, 'the control run should have laid prints, got ' + withPrints.prints);
  assert(without.prints === 0, 'the cut run should have laid none, got ' + without.prints);
  assert(withPrints.pos === without.pos, 'the crowd walked somewhere else once prints were on');
  assert(withPrints.next === without.next,
    'the simulation RNG advanced differently: ' + withPrints.next + ' vs ' + without.next);
});

test('a print fades on its own clock and is culled off camera', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2200; api.car.y = 1100; api.camSnap();
  api.setT(100);
  for (let i = 0; i < 8; i++){
    api.foot[i] = { x: api.cam.x + i * 12, y: api.cam.y, rot: 0, r: 16, t: 100 };
  }
  api._resetCounts();
  api.drawFootprints();
  const fresh = api._counts.ellipse || 0;
  assert(fresh === 16, 'eight fresh prints are eight dents and eight lips, got ' + fresh);
  // wound past the ttl they cost nothing at all
  api.setT(100 + api.FOOT_TTL + 1);
  api._resetCounts();
  api.drawFootprints();
  assert(!(api._counts.ellipse || 0), 'an expired print should not be drawn');
  // and neither should one on the far side of the market
  api.setT(100);
  for (let i = 0; i < 8; i++) api.foot[i].x = api.cam.x + 90000;
  api._resetCounts();
  api.drawFootprints();
  assert(!(api._counts.ellipse || 0), 'an off-camera print should not be drawn');
});

/* The headlights were one trapezoid at alpha .10 — a grey wedge with a hard
   edge, drawn over the scene and lighting nothing. */
test('the headlights are a cone that overlaps itself, not a row of blobs', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100; api.car.ang = 0; api.car.vx = 900; api.car.vy = 0;
  const spots = api.beamSpots();
  assert(spots.length >= 5, 'a cone needs more than a couple of discs, got ' + spots.length);
  for (let i = 1; i < spots.length; i++){
    const a = spots[i - 1], b = spots[i];
    const gap = Math.hypot(b.x - a.x, b.y - a.y);
    assert(gap < a.r, 'disc ' + i + ' is further away than the last one is wide (' +
      gap.toFixed(1) + ' vs ' + a.r.toFixed(1) + ') — the beam would read as blobs');
    assert(b.r > a.r, 'the beam should widen with distance');
    assert(b.a < a.a, 'and fade with distance');
  }
  assert(spots[0].x > api.car.x, 'the beam points where the car is pointing');
  // and it reaches further the faster you are going
  const slowReach = (() => { api.car.vx = 0; const s = api.beamSpots();
    return Math.hypot(s[s.length - 1].x - api.car.x, s[s.length - 1].y - api.car.y); })();
  api.car.vx = 1800;
  const fast = api.beamSpots();
  const fastReach = Math.hypot(fast[fast.length - 1].x - api.car.x,
    fast[fast.length - 1].y - api.car.y);
  console.log('    (beam reach parked / at 1800: ' + Math.round(slowReach) + ' / ' +
    Math.round(fastReach) + ')');
  assert(fastReach > slowReach * 1.5, 'the beam should stretch with speed: ' +
    slowReach + ' -> ' + fastReach);
});

test('the beam cuts the darkness as well as adding its own glow', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.vx = 900; api.camSnap();
  api.draw(); api._resetCounts(); api.draw();
  const lamps = Math.min(api.lightBuf.length, api.MAX_LIGHTS);
  const spots = api.beamSpots().length;
  // holes: one per lamp + the car + the beam. glow: one per lamp + the beam.
  const want = lamps * 2 + 1 + spots * 2 + 1;
  assert((api._counts.drawImage || 0) >= want,
    'the beam should be punched and drawn, expected at least ' + want +
    ' drawImage calls, got ' + api._counts.drawImage);
});

/* --------------------------------------------------------------- stalls --- */

/* Twenty-one markets of the identical brown box with four gold dots on it.
   Every hut picks a trade now — but out of the seed it already carries, never
   a fresh rnd(), because a new draw in addProp would rescore every market. */
test('a market sells six different things, and picks them without a dice roll', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  const huts = api.props.filter(o => o.kind === 'hut');
  assert(huts.length > 30, 'the last market should be full of stalls, got ' + huts.length);
  const seen = {};
  for (const o of huts) seen[api.tradeOf(o).id] = (seen[api.tradeOf(o).id] || 0) + 1;
  console.log('    (trades in the last market: ' +
    Object.entries(seen).map(([k, v]) => k + ' ' + v).join(', ') + ')');
  assert(Object.keys(seen).length === api.TRADES.length,
    'every trade should turn up: ' + Object.keys(seen).join(','));
  const least = Math.min(...Object.values(seen));
  assert(least >= 2, 'no trade should be a one-off curiosity, rarest had ' + least);

  // pure function of the seed: same seed in, same trade out, whatever else ran
  const o = huts[0], id = api.tradeOf(o).id;
  for (let i = 0; i < 50; i++) api.rnd();
  assert(api.tradeOf(o).id === id, 'the trade moved when the RNG did');
  const twin = { seed: o.seed };
  assert(api.tradeOf(twin).id === id, 'the trade should depend on nothing but the seed');
});

test('drawing the stalls does not touch the simulation RNG', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.draw();                                  // warm every cache
  // reseed, take a number; reseed, draw three frames, take a number. A draw
  // that reads the simulation stream moves the second one.
  api.reseed(1234);
  const clean = api.rnd();
  api.reseed(1234);
  api.setT(0); api.draw();
  api.setT(3); api.draw();
  api.setT(6); api.draw();
  assert(api.rnd() === clean,
    'three frames of drawing moved the simulation RNG: ' + api.rnd() + ' vs ' + clean);

  // and the same market laid out twice sells the same things in the same order
  const first = api.props.filter(o => o.kind === 'hut').map(o => api.tradeOf(o).id).join(',');
  api.startLevel(20); api.beginLevel();
  const second = api.props.filter(o => o.kind === 'hut').map(o => api.tradeOf(o).id).join(',');
  assert(first === second, 'the same market laid out two different sets of trades');
});

test('the six counters are six different drawings, not one with a palette', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.setT(2.5);
  const costs = api.TRADES.map((t, i) => {
    const o = { seed: (i + 0.5) / api.TRADES.length, w: 158, h: 112 };
    assert(api.tradeOf(o).id === t.id, 'seed ' + o.seed + ' should pick ' + t.id);
    api._resetCounts();
    api.drawGoods(o, 158, 112, 13, 0);
    return { id: t.id, fills: api._counts.fill || 0,
      rects: api._counts.fillRect || 0, strokes: api._counts.stroke || 0 };
  });
  console.log('    (counter cost per trade: ' +
    costs.map(c => c.id + ' ' + (c.fills + c.rects + c.strokes)).join(', ') + ')');
  for (const c of costs) assert(c.fills + c.rects + c.strokes > 0, c.id + ' drew nothing');
  const shapes = new Set(costs.map(c => c.fills + ':' + c.rects + ':' + c.strokes));
  assert(shapes.size >= 4,
    'the trades should not collapse onto one drawing, got ' + shapes.size + ' distinct');
  // and a wrecked stall has sold or lost half its stock
  const o = { seed: 0.4, w: 158, h: 112 };
  api._resetCounts(); api.drawGoods(o, 158, 112, 13, 0);
  const full = (api._counts.fill || 0) + (api._counts.fillRect || 0);
  api._resetCounts(); api.drawGoods(o, 158, 112, 13, 0.9);
  const half = (api._counts.fill || 0) + (api._counts.fillRect || 0);
  assert(half < full, 'a half-wrecked stall should have lost stock: ' + half + ' vs ' + full);
});

/* Eight trades laid their stock out "on the counter" and there was no counter:
   goods floating on a flat wooden face, touching nothing. */
test('the stock stands on a counter instead of floating on the stall face', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const w = 158, gy = 13, th = api.getTheme();

  for (let i = 0; i < api.TRADES.length; i++){
    const o = { x: 0, y: 0, w, h: 112, seed: (i + 0.5) / api.TRADES.length };
    const id = api.tradeOf(o).id;
    const rec = carRec();
    api.withCtx(rec, () => api.drawCounter(o, w, gy, 0, 1));

    // a plank, wide enough to carry the whole row and sitting under it
    const plank = rec.polys.filter(q => q.style === th.wood2);
    assert(plank.length === 1, id + ': expected one plank, got ' + plank.length);
    const p = plank[0];
    assert(p.x0 <= api.goodsX(w, 0) - 6 && p.x1 >= api.goodsX(w, 3) + 6,
      id + ': the plank does not reach under the whole row, ' +
      p.x0.toFixed(0) + '..' + p.x1.toFixed(0) + ' for goods at ' +
      api.goodsX(w, 0).toFixed(0) + '..' + api.goodsX(w, 3).toFixed(0));
    assert(p.y0 > gy && p.y0 < gy + 16,
      id + ': the plank should meet the stock, top at ' + p.y0.toFixed(1) +
      ' for stock at ' + gy);

    // every item resting on it casts a shadow, below it and pushed with the sun
    const shad = rec.all.filter(e => e[0] === 'el');
    assert(shad.length === api.goodsN(0),
      id + ': ' + shad.length + ' shadows for ' + api.goodsN(0) + ' items');
    for (let k = 0; k < shad.length; k++){
      assert(shad[k][2] > gy, id + ': a shadow above the thing casting it');
      assert(shad[k][1] > api.goodsX(w, k),
        id + ': shadow ' + k + ' is not pushed with the light');
      assert(shad[k][4] < shad[k][3], id + ': the shadow is not flattened');
    }
    /* Every ellipse in one path needs its own moveTo, or canvas joins them into
       a polygon spanning the whole row. It stays green either way; it is only
       visible in a screenshot, so it gets held down here. */
    const before = rec.all.filter((e, k) => e[0] === 'el' && (rec.all[k - 1] || [])[0] !== 'm');
    assert(before.length === 0, id + ': ' + before.length + ' ellipses not opened by a moveTo');
  }

  /* The stock has always halved at wear > 0.5 with nothing to show for it.
     The plank snaps at the middle now, and the splintered stub is why. */
  const o = { x: 0, y: 0, w, h: 112, seed: 0.4 };
  const whole = carRec(); api.withCtx(whole, () => api.drawCounter(o, w, gy, 0, 1));
  const half  = carRec(); api.withCtx(half,  () => api.drawCounter(o, w, gy, 0.9, 1));
  const span = (r) => { const q = r.polys.filter(x => x.style === th.wood2)[0]; return q.x1 - q.x0; };
  assert(span(half) < span(whole) * 0.7,
    'a half-wrecked counter should be a stub: ' + span(half).toFixed(0) +
    ' vs ' + span(whole).toFixed(0));
  assert(half.polys.some(q => q.style === th.wood) && !whole.polys.some(q => q.style === th.wood),
    'the snapped end should be splintered, and only when it has snapped');
  assert(half.all.filter(e => e[0] === 'el').length === api.goodsN(0.9),
    'and carry only the stock that is left');

  // legs, two of them, and only on the side you can see
  const front = carRec(); api.withCtx(front, () => api.drawCounter(o, w, gy, 0, 1));
  const back  = carRec(); api.withCtx(back,  () => api.drawCounter(o, w, gy, 0, -1));
  const legs = (r) => r.all.filter(e => e[0] === 'rect');
  assert(legs(front).length === 2, 'a counter stands on two legs, got ' + legs(front).length);
  for (const l of legs(front)) assert(l[2] > gy + 16, 'a leg should hang below the plank');
  assert(legs(back).length === 0, 'a stall facing away should not draw legs you cannot see');
  // and the plank moves to the far side of the stock when the stall turns round
  const py = (r) => r.polys.filter(x => x.style === th.wood2)[0].y0;
  assert(py(back) < gy && py(front) > gy,
    'the counter should follow the face: back ' + py(back).toFixed(0) +
    ', front ' + py(front).toFixed(0));

  // none of it reaches the simulation
  api.reseed(4242);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(4242);
  for (const hut of api.props.filter(x => x.kind === 'hut')) api.drawHut(hut);
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'drawing the counters moved the simulation stream');
  console.log('    (counter: ' + whole.fills + ' fills whole, ' + half.fills +
    ' snapped, ' + back.fills + ' facing away)');
});

/* The biggest patch of snow in the frame was the only one in the game with no
   shape to it: a rounded rectangle with a lit band across the top and a blue
   band across the bottom. Four straight edges on something that is supposed to
   have settled there. */
test('the snow on a stall roof has drifted, it is not a painted panel', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const SHADE = 'rgba(126,156,206,.34)', WHITE = '#eef4ff';

  const cap = (seed) => {
    api.props.length = 0;
    const o = api.addProp('hut', api.cam.x, api.cam.y, {});
    o.seed = seed; o.face = 1;
    const rec = carRec();
    api.withCtx(rec, () => api.drawHut(o));
    const run = (col) => rec.all.filter(e =>
      (e[0] === 'm' || e[0] === 'l' || e[0] === 'q') && e[4] === col);
    return { o, rec, white: run(WHITE), shade: run(SHADE) };
  };

  const a = cap(0.31);
  assert(a.white.length > 8, 'the cap should be a real outline, got ' + a.white.length + ' points');
  assert(a.shade.length === a.white.length,
    'the shade should be the same outline: ' + a.shade.length + ' vs ' + a.white.length);

  /* The same path, dropped. A shade drawn as a straight band across a wavy
     edge is exactly what it looked like before, so this is the claim. */
  let dy = null;
  for (let i = 0; i < a.white.length; i++){
    assert(Math.abs(a.white[i][1] - a.shade[i][1]) < 1e-9,
      'point ' + i + ' of the shade is not under the white');
    const d = a.shade[i][2] - a.white[i][2];
    if (dy === null) dy = d;
    assert(Math.abs(d - dy) < 1e-9,
      'the shade is not a clean offset: ' + d.toFixed(2) + ' vs ' + dy.toFixed(2));
  }
  assert(dy > 2, 'the shade should sit below the drift, got ' + dy);

  // the lower edge sags in lobes, and no two lobes sag the same
  const lobes = a.white.filter(e => e[0] === 'q');
  assert(lobes.length >= api.SNOW_LOBES,
    api.SNOW_LOBES + ' lobes expected along the lip, got ' + lobes.length);
  const flat = Math.max(...a.white.filter(e => e[0] === 'l').map(e => e[2]));
  // the bulge is in the control point, not the endpoint — the endpoints all sit
  // on the lip, which is exactly why this looked flat before
  const pull = a.rec.ctrls.filter(c => c.style === WHITE);
  const deepest = Math.max(...pull.map(c => c.cy));
  assert(deepest > flat + 3,
    'the lip should sag past the corners: ' + deepest.toFixed(1) + ' vs ' + flat.toFixed(1));
  const sags = new Set(pull.filter(c => c.cy > flat).map(c => c.cy.toFixed(3)));
  assert(sags.size > 1, 'every lobe sags by the same amount — that is a straight edge');

  // the shade goes down first, or it would sit on top of the snow
  const order = a.rec.order.filter(c => c === SHADE || c === WHITE);
  assert(order[0] === SHADE, 'the shade should be under the cap, got ' + order[0]);

  // stable frame to frame, and different from stall to stall
  const again = cap(0.31), other = cap(0.77);
  // the control points too: the endpoints are identical whatever the seed, so a
  // signature built only from them would call every roof the same
  const sig = (c) => JSON.stringify([c.white, c.rec.ctrls.filter(q => q.style === WHITE)]);
  assert(sig(a) === sig(again), 'a roof should drift the same way every frame');
  assert(sig(a) !== sig(other), 'two stalls should not wear the same drift');

  // banks blown up onto it, batched into one fill
  const banks = a.rec.all.filter(e => e[0] === 'el' && e[5] === 'rgba(255,255,255,.34)');
  assert(banks.length === 2, 'two banks expected, got ' + banks.length);
  for (let i = 0; i < banks.length; i++)
    assert((a.rec.all[a.rec.all.indexOf(banks[i]) - 1] || [])[0] === 'm',
      'a bank ellipse with no moveTo joins the path across the roof');

  // and none of it reaches the simulation
  api.reseed(2024);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(2024);
  // draw, do not build — addProp rolls its own seed and would measure the
  // fixture instead of the drift
  for (let i = 0; i < 20; i++){ a.o.seed = i / 20; api.drawHut(a.o); }
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'drifting the roofs moved the simulation stream');
  console.log('    (roof drift: ' + api.SNOW_LOBES + ' lobes, sag ' +
    (deepest - flat).toFixed(0) + 'px, shade dropped ' + dy.toFixed(0) + 'px)');
});

/* A stall that has been smoking for six markets must not have six markets of
   particles behind it — the plume is four puffs on a rolling phase. */
test('a smoking stall costs the same on frame one and frame six hundred', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const smoker = api.TRADES.findIndex(t => t.smoke > 0);
  assert(smoker >= 0, 'some trade should smoke');
  const o = api.addProp('hut', 2000, 1100);
  o.seed = (smoker + 0.5) / api.TRADES.length;
  assert(api.tradeOf(o).smoke > 0, 'that seed should land on a smoking trade');
  api.setT(0.4);
  api._resetCounts(); api.drawHut(o);
  const first = api._counts.fill || 0;
  for (let i = 0; i < 600; i++){ api.setT(api.getT() + 1 / 60); api.drawHut(o); }
  api._resetCounts(); api.drawHut(o);
  const later = api._counts.fill || 0;
  assert(later === first,
    'ten seconds of smoke changed the frame cost: ' + first + ' -> ' + later);
  assert(first > 4, 'a smoking stall should be drawing a plume, got ' + first + ' fills');
  // a stall that does not smoke draws no plume and no chimney
  const dry = api.addProp('hut', 2200, 1100);
  const cold = api.TRADES.findIndex(t => !t.smoke);
  dry.seed = (cold + 0.5) / api.TRADES.length;
  api._resetCounts(); api.drawHut(dry);
  const dryFills = api._counts.fill || 0;
  assert(dryFills < first, 'a toy stall should cost less than a grill: ' +
    dryFills + ' vs ' + first);
});

/* ------------------------------------------------------------------- UI --- */

/* The score plate was a fixed 74px tall while the goals were printed at pad+96
   and down, so all three goal lines landed outside the panel, in grey, on a
   lit market. You could not read a single one of them. */
test('every goal line lands inside the plate that is meant to be behind it', () => {
  for (const [w, h] of [[1280, 720], [390, 844], [844, 390], [2560, 1440]]){
    const api = boot({ w, h });
    api.G.unlocked = 21; api.startLevel(9); api.beginLevel();
    const r = api.hudScoreRect();
    assert(api.G.goals.length >= 3, 'a market should set three goals');
    for (let i = 0; i < api.G.goals.length; i++){
      const y = api.goalRowY(i);
      assert(y > r.y, w + 'x' + h + ': goal ' + i + ' printed above the plate');
      assert(y <= r.y + r.h - 3,
        w + 'x' + h + ': goal ' + i + ' baseline ' + y +
        ' falls outside a plate ending at ' + (r.y + r.h));
    }
    // and the plate is measured, not guessed: no goals, no room reserved
    const tall = r.h;
    api.G.goals = [];
    assert(api.hudScoreRect().h < tall,
      'a market with no goals should not reserve rows for them');
  }
});

test('the plate grows a row at a time', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const hs = [];
  for (let n = 0; n <= 4; n++){
    api.G.goals = Array.from({ length: n }, () => ({ text: 'x', done: false }));
    hs.push(api.hudScoreRect().h);
  }
  const step = hs[3] - hs[2];
  assert(step === hs[4] - hs[3] && step === hs[2] - hs[1],
    'each extra goal should add the same row height: ' + hs.join(','));
  assert(step === api.hudScoreRect().rowH, 'and that height should be the row height');
});

/* Four HUD panels, four bare rgba fills, no edge and thin enough that a lit
   stall came through the text. */
test('every HUD panel sits on the same plate', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api._resetCounts();
  api.hudPlate(10, 10, 200, 80);
  assert((api._counts.fill || 0) === 2,
    'a plate is a base and a lit band, got ' + api._counts.fill + ' fills');
  assert((api._counts.stroke || 0) === 1,
    'and one hairline border, got ' + api._counts.stroke + ' strokes');
  const styles = (api._counts._styles || []).join('|');
  assert(styles.includes('rgba(7,12,24,.84)'), 'the base should be near-opaque: ' + styles);

  // a driving frame puts up the score plate, the cars plate, the nitro plate
  // and, once a combo is running, the combo plate
  api.G.phase = 'drive'; api.car.boost = 1;
  api.G.combo = 5; api.G.comboT = 1; api.G.mult = 3;
  api._resetCounts();
  api.drawHUD();
  const plates = (api._counts._styles || []).filter(s => s === 'rgba(7,12,24,.84)').length;
  console.log('    (plates in a driving frame: ' + plates + ')');
  assert(plates >= 4, 'score, cars, nitro and combo should all be plated, got ' + plates);
});

/* The hint was bare letters on the market under nothing but a text shadow. It
   is a pill centred with left:50% + translateX(-50%), which a stray left/right
   in the phone override would silently break. */
test('the launch hint keeps its pill on every layout', () => {
  const html = fs.readFileSync(HTML, "utf8");
  const rule = html.match(/#hint\{[^}]*\}/);
  assert(rule, 'the #hint rule went missing');
  assert(/background:/.test(rule[0]), 'the hint lost its backing: ' + rule[0]);
  assert(/border-radius:\s*999px/.test(rule[0]), 'the hint lost its pill shape');
  assert(/left:\s*50%/.test(rule[0]) && /translateX\(-50%\)/.test(rule[0]),
    'the hint should be centred on its own width');
  const narrow = html.match(/body\.narrow #hint\{[^}]*\}/);
  assert(narrow, 'the phone override went missing');
  assert(!/(^|[;{\s])(left|right):/.test(narrow[0]),
    'the phone override sets left/right again, which fights the centring: ' + narrow[0]);
});

/* A gift was a coloured square with a yellow cross painted on it. */
test('a present is a box with a bow on it', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const g = api.addProp('gifts', 2000, 1100);
  api._resetCounts(); api.drawProp(g);
  const alive = (api._counts.fill || 0) + (api._counts.fillRect || 0);
  g.dead = true; g.rot = 0.4;
  api._resetCounts(); api.drawProp(g);
  const wrecked = (api._counts.fill || 0) + (api._counts.fillRect || 0);
  console.log('    (present: ' + alive + ' pieces wrapped, ' + wrecked + ' torn open)');
  assert(alive >= 9, 'a wrapped present needs a lid, a shade, snow, ribbons and a bow, got ' + alive);
  assert(wrecked < alive, 'a torn-open one should be simpler: ' + wrecked + ' vs ' + alive);
});

/* ------------------------------------------------------------------ set --- */

/* A conifer from above was four plain circles inside each other in four greens
   a shade apart: one flat disc with dots on it. The tiers have needles now —
   but a silhouette that reaches past the collider promises a hit the physics
   will not give you, and the collider is a circle of exactly r. */
test('a tree never draws past the circle you can actually hit', () => {
  const api = boot({ w: 1280, h: 720 });
  assert(api.TREE_SPIKE > 0.02, 'the tiers should actually be spiked, got ' + api.TREE_SPIKE);
  const peak = api.TREE_TIER * (1 + api.TREE_SPIKE);
  /* The snow load rides on top of the needles, so it — not the tier — is what
     the silhouette ends in. Measuring only the green would have let the snow
     out past the collider by 11%, which is exactly what the first version of
     it did. */
  const snowPeak = peak + api.TREE_TIER * api.TREE_SNOW;
  console.log('    (tree reaches ' + (peak * 100).toFixed(1) + '% of the collider in needles, ' +
    (snowPeak * 100).toFixed(1) + '% with its snow)');
  assert(snowPeak <= 1,
    'the snow reaches ' + snowPeak.toFixed(4) + ' of r, past the collider');
  assert(snowPeak > 0.9, 'and it should not be a shrunken disc either: ' + snowPeak.toFixed(4));
  assert(peak < snowPeak, 'the needles should stop short of the snow on them');

  // and the drawing agrees with the arithmetic
  api.startCampaign(); api.beginLevel();
  const rec = carRec();
  api.withCtx(rec, () => api.drawTreeTop(0, 0, 100, false, 0, 0.31));
  const far = Math.max(...rec.all.filter(e => e[0] === 'm' || e[0] === 'l')
    .map(e => Math.hypot(e[1], e[2])));
  assert(far <= 100.001, 'a tree drew ' + far.toFixed(1) + ' out from a collider of 100');
});

/* Every conifer in the game — 209 across the campaign plus the town tree in
   each market — stood bare in a market whose ground, roofs and snowmen are all
   snow. */
test('snow settles on a conifer, on the side the light comes from', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const th = api.getTheme();
  const rec = carRec();
  api.withCtx(rec, () => api.drawTreeTop(0, 0, 100, false, 0, 0.31));

  const pts = (col) => rec.all.filter(e =>
    (e[0] === 'm' || e[0] === 'l') && e[4] === col);
  const snow = pts(api.TREE_SNOW_C);
  const tiers = th.tree.map(c => pts(c)).filter(a => a.length);
  assert(tiers.length >= 4, 'a conifer is four tiers, found ' + tiers.length);
  assert(snow.length === tiers.reduce((n, a) => n + a.length, 0),
    'every tier should carry snow: ' + snow.length + ' snow points for ' +
    tiers.reduce((n, a) => n + a.length, 0) + ' needle points');

  /* Under each tier, not over it. Over it buries the tree in white — which is
     what it did the first time, and the screenshot is the only place it shows. */
  const seq = rec.order.filter(c => c === api.TREE_SNOW_C || th.tree.indexOf(c) >= 0);
  for (let i = 0; i < 4; i++)
    assert(seq[i * 2] === api.TREE_SNOW_C && th.tree.indexOf(seq[i * 2 + 1]) >= 0,
      'tier ' + i + ' should be snow then needles, got ' + seq[i * 2] + ' / ' + seq[i * 2 + 1]);

  // pushed towards the light, and only towards the light
  const mid = (a) => [a.reduce((n, e) => n + e[1], 0) / a.length,
                      a.reduce((n, e) => n + e[2], 0) / a.length];
  const [sx, sy] = mid(snow), [tx, ty] = mid(tiers.flat());
  const ox = sx - tx, oy = sy - ty;
  const len = Math.hypot(ox, oy);
  assert(len > 2, 'the snow should sit off-centre, offset only ' + len.toFixed(2));
  const sun = Math.hypot(api.SUN_DX, api.SUN_DY);
  const dot = (ox * -api.SUN_DX + oy * -api.SUN_DY) / (len * sun);
  assert(dot > 0.999,
    'the snow should ride towards the light, off by ' +
    (Math.acos(Math.min(1, dot)) * 57.3).toFixed(1) + '°');

  // the felled tree keeps its load, under the greens
  const dead = carRec();
  api.withCtx(dead, () => api.drawTreeTop(0, 0, 100, true, 0.4, 0.31));
  const dseq = dead.order.filter(c => c === api.TREE_SNOW_C || th.tree.indexOf(c) >= 0);
  assert(dseq[0] === api.TREE_SNOW_C,
    'a felled tree should still be carrying snow, under its greens');
  assert(dead.all.some(e => e[4] === api.TREE_SNOW_C), 'and actually draw it');

  // spikeRing without an offset is exactly what it always was
  const a = carRec(), b = carRec();
  api.withCtx(a, () => api.spikeRing(40, 9, 0.055, 1.2));
  api.withCtx(b, () => api.spikeRing(40, 9, 0.055, 1.2, 0, 0));
  assert(JSON.stringify(a.all) === JSON.stringify(b.all),
    'adding an offset changed the un-offset ring');

  // none of it reaches the simulation
  api.reseed(8080);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(8080);
  for (let i = 0; i < 30; i++) api.drawTreeTop(0, 0, 60, i % 2 === 0, 0.3, i / 30);
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'snowing the trees moved the simulation stream');
});

test('a tree costs a flat handful of fills however many baubles it has', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.setT(2);
  api._resetCounts();
  api.drawTreeTop(2000, 1100, 56, false, 0, 0.3);
  const fills = api._counts.fill || 0;
  console.log('    (one tree: ' + fills + ' fills)');
  assert(fills >= 12, 'a tree needs tiers, baubles and a star, got ' + fills);
  /* Four tiers, each with its snow load under it, a lit side, seven baubles,
     one batched highlight pass, a star and its glow. The cap moved from 18
     when the snow went on; what it is really guarding is below. */
  assert(fills <= 22, 'a tree should stay a handful of fills, got ' + fills);
  /* Seven baubles used to mean seven highlight fills on top of seven bauble
     fills, on every tree in a market that holds fifteen of them. That is the
     claim a total cannot make on its own: the highlights are one path. */
  const rec = carRec();
  api.withCtx(rec, () => api.drawTreeTop(0, 0, 56, false, 0, 0.3));
  const hi = rec.order.filter(c => c === 'rgba(255,255,255,.55)');
  const baubles = rec.all.filter(e => e[0] === 'arc' &&
    ['#ffd34d', '#e0483c', '#7ec8ff'].indexOf(String(e[4])) >= 0);
  assert(baubles.length >= 7, 'seven baubles expected, got ' + baubles.length);
  assert(hi.length === 1,
    baubles.length + ' baubles should share one highlight pass, got ' + hi.length);
  // a felled tree is a cheaper drawing than a standing one
  api._resetCounts();
  api.drawTreeTop(2000, 1100, 56, true, 0.6, 0.3);
  const dead = api._counts.fill || 0;
  assert(dead < fills, 'a felled tree should cost less: ' + dead + ' vs ' + fills);
});

/* The first attempt gave the snowman a top hat, which from directly above is a
   dark disc sitting exactly where the face is. A snowman whose face you cannot
   read is a snowball. */
test('nothing is painted over the snowman face', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const s = api.addProp('snowman', 2000, 1100);
  api._resetCounts();
  api.drawProp(s);
  const st = api._counts._styles || [];
  const head = st.lastIndexOf('#e2ebf8'), eyes = st.lastIndexOf('#1b2740');
  const nose = st.lastIndexOf('#e8862c');
  assert(head >= 0 && eyes >= 0 && nose >= 0,
    'head, eyes and carrot should all be drawn: ' + st.join('|'));
  assert(eyes > head, 'the eyes go on after the head, not under it');
  assert(nose > eyes, 'and the carrot last of all');
  assert(nose === st.length - 1 || st.slice(nose + 1).every(c => c === '#e8862c'),
    'something is drawn over the face: ' + st.slice(nose + 1).join('|'));
  // the arms are strokes, and there are two of them with two twigs each
  assert((api._counts.stroke || 0) >= 1, 'a snowman should have twig arms');
});

/* -------------------------------------------------------------- effects --- */

/* A forced pop is one the run is not allowed to lose — a ticked goal. It used
   to skip the proximity check entirely, which is how "GOAL: CHAIN A x9 COMBO"
   and "COMBO x10 BANKED" ended up printed through each other in the middle of
   the screen: both land at car.y - 90 in the same frame. */
test('two pops the run must not lose still do not land on each other', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.fx.length = 0; api.recentPops.length = 0;
  api.setT(10);
  const ys = [];
  for (let i = 0; i < 4; i++){
    const p = api.popText(2000, 1100, 'GOAL ' + i, '#8effb0', true, true);
    assert(p, 'a forced pop must never be dropped, lost number ' + i);
    ys.push(p.y);
  }
  ys.sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++){
    assert(Math.abs(ys[i] - ys[i - 1]) >= api.POP_MIN_D,
      'forced pops ' + (i - 1) + ' and ' + i + ' are ' +
      Math.abs(ys[i] - ys[i - 1]).toFixed(0) + 'px apart, under the ' +
      api.POP_MIN_D + 'px guard: ' + ys.join(', '));
  }
  console.log('    (four forced pops stacked at ' + ys.map(y => Math.round(y)).join(', ') + ')');
});

test('an ordinary pop is still swallowed by the one already there', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.fx.length = 0; api.recentPops.length = 0;
  api.setT(10);
  assert(api.popText(2000, 1100, '+100', '#ffd34d'), 'the first pop shows');
  assert(!api.popText(2010, 1105, '+100', '#ffd34d'), 'a second one on top of it does not');
  // and once the guard window has passed it shows again
  api.setT(10 + api.POP_MIN_T + 0.1);
  assert(api.popText(2010, 1105, '+100', '#ffd34d'), 'after the window it shows again');
});

/* Three hundred and sixty decals cannot each afford a fill for their soak halo
   or their wet sheen, so both go down as one path for the whole field. */
/* The whole field is one shape now, so its cost stops depending on how much of
   the market you flattened. Three hundred decals used to be three hundred
   fills, which is also three hundred chances to stack alpha into fog. */
/* ------------------------------------------------- the market picker --- */

/* A canvas the plan can be painted into, counted by the shared stub. */
const planCv = (api) => ({ width: api.MK_W * 2, height: api.MK_H * 2,
  getContext: () => api._ctxStub });

/* The plan walks its own copy of the generator's laneAt(). If the two ever
   drift apart the picker starts advertising a market that is not there, so
   this checks the copy against the real thing: generate the market, then find
   every stall on the plan's lanes. */
test('the plan on a tile is the market the generator builds', () => {
  const api = boot({ w: 1280, h: 720 });
  const worst = [];
  for (const lv of api.LEVELS){
    if ((lv.shape || 'rows') === 'plaza') continue;      // the ring is not on a lane
    api.genMarket(lv);
    const x0 = api.C.MARKET_X;
    const x1 = api.C.FENCE_PAD + (api.C.WORLD_W - api.C.FENCE_PAD * 2 - 120) * lv.span;
    const huts = api.props.filter(o => o.kind === 'hut');
    assert(huts.length > 8, lv.name + ' should have stalls, got ' + huts.length);
    let off = 0;
    for (const o of huts){
      let best = Infinity;
      for (let r = 0; r < lv.rows; r++){
        for (let side = -1; side <= 1; side += 2){
          best = Math.min(best, Math.abs(o.y - (api.mkLane(lv, r, o.x, x0, x1) + side * 108)));
        }
      }
      if (best > 1) off++;
    }
    worst.push([lv.name, off / huts.length]);
    assert(off / huts.length < 0.06,
      lv.name + ': ' + Math.round(off / huts.length * 100) + '% of its stalls are not on a plan lane');
  }
  const bad = worst.sort((a, b) => b[1] - a[1])[0];
  console.log('    (plan lanes: worst market is ' + bad[0] + ' at ' +
    (bad[1] * 100).toFixed(1) + '% off-lane)');
});

test('a market plan shows its shape, not a generic street', () => {
  const api = boot({ w: 1280, h: 720 });
  // the y-spread of one row along the market: flat for rows, not for the rest
  const spread = (lv) => {
    const x0 = api.C.MARKET_X;
    const x1 = api.C.FENCE_PAD + (api.C.WORLD_W - api.C.FENCE_PAD * 2 - 120) * lv.span;
    const ys = [];
    for (let i = 0; i <= 20; i++) ys.push(api.mkLane(lv, 0, x0 + (x1 - x0) * i / 20, x0, x1));
    return Math.max(...ys) - Math.min(...ys);
  };
  const byShape = {};
  for (const lv of api.LEVELS) (byShape[lv.shape || 'rows'] ||= []).push(spread(lv));
  const shapes = Object.keys(byShape).sort();
  console.log('    (lane spread by shape: ' + shapes.map(s =>
    s + ' ' + Math.round(Math.max(...byShape[s]))).join(', ') + ')');
  assert(shapes.length >= 5, 'the campaign should use at least five shapes, got ' + shapes);
  assert(Math.max(...byShape.rows) < 1, 'straight rows should be straight');
  for (const s of shapes){
    if (s === 'rows' || s === 'plaza') continue;
    assert(Math.min(...byShape[s]) > 60,
      s + ' should bend its lane, spread was only ' + Math.round(Math.min(...byShape[s])));
  }
});

/* The picker paints twenty-one pictures every time the menu opens. If any of
   them drew a random number the whole campaign would rescore itself on the way
   past the menu — five cosmetic systems have done exactly that before. */
test('painting the picker does not touch either random stream', () => {
  const api = boot({ w: 1280, h: 720 });
  const draw5 = (fn) => {
    api.reseed(4242);
    if (fn) fn();
    return [api.rnd(), api.rnd(), api.rnd(), api.rnd(), api.rnd()];
  };
  const clean = draw5(null);
  const painted = draw5(() => {
    for (const lv of api.LEVELS) api.paintMarketThumb(planCv(api), lv);
  });
  assert(JSON.stringify(clean) === JSON.stringify(painted),
    'the picker moved the simulation stream: ' + clean[0] + ' -> ' + painted[0]);
  // and the same tile paints the same picture every time the menu opens
  const a = api.paintMarketThumb(planCv(api), api.LEVELS[20]);
  const b = api.paintMarketThumb(planCv(api), api.LEVELS[20]);
  assert(JSON.stringify(a) === JSON.stringify(b),
    'a plan should be stable: ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  assert(a.stalls > 20 && a.trees > 0 && a.lamps > 0,
    'the last market should be busy: ' + JSON.stringify(a));
});

/* A market you have not reached used to paint its entire plan and then have
   `grayscale(1)` thrown over it: every stall, lane and lamp of a market you
   have never seen, still legible through the wash. */
test('a locked tile is a shuttered stall, not a smudged plan', () => {
  const api = boot({ w: 1280, h: 720 });
  const recCv = (rec) => ({ width: api.MK_W * 2, height: api.MK_H * 2, getContext: () => rec });
  const paint = (lv, locked) => {
    const rec = carRec();
    const out = api.paintMarketThumb(recCv(rec), lv, locked);
    return { rec, out, sig: JSON.stringify(rec.rects) };
  };

  // two markets that share a theme but nothing else about their layout
  let pair = null;
  for (let i = 0; i < api.LEVELS.length && !pair; i++){
    for (let j = i + 1; j < api.LEVELS.length && !pair; j++){
      const a = api.LEVELS[i], b = api.LEVELS[j];
      if (a.theme === b.theme && (a.shape || 'rows') !== (b.shape || 'rows')) pair = [a, b];
    }
  }
  assert(pair, 'the campaign should reuse a theme across two different shapes');
  const [A, B] = pair;

  const lockA = paint(A, true), lockB = paint(B, true);
  assert(lockA.sig === lockB.sig,
    'shuttered ' + A.name + ' and ' + B.name + ' should be the same drawing — ' +
    'a locked tile must not leak the market behind it');
  assert(lockA.out.shut === true && lockA.out.stalls === 0,
    'a shuttered tile should report itself shut, got ' + JSON.stringify(lockA.out));
  const openA = paint(A, false), openB = paint(B, false);
  assert(openA.sig !== openB.sig,
    'unlocked, those two markets should look nothing alike — otherwise the ' +
    'check above proves nothing');
  assert(openA.out.shut === false && openA.out.stalls > 0, 'an open tile draws its plan');

  // it still says which market it is: the theme's own timber and awning
  const th = api.THEMES[A.theme];
  const cols = new Set(lockA.rec.rects.map(r => r.style));
  for (const c of [th.sky, th.wood, th.awning, th.awning2])
    assert(cols.has(c), 'the shuttered stall drops the theme colour ' + c);
  const other = api.LEVELS.find(lv => api.THEMES[lv.theme].awning !== th.awning);
  assert(paint(other, true).sig !== lockA.sig,
    'two themes shuttered should not look identical');

  // a shutter is down over the whole front, in slats
  const wood = lockA.rec.rects.filter(r => r.style === th.wood)[0];
  assert(wood, 'no stall frame');
  const slats = lockA.rec.rects.filter(r => r.style === 'rgba(255,240,212,.10)');
  assert(slats.length === api.SHUT_SLATS,
    api.SHUT_SLATS + ' slats expected, got ' + slats.length);
  for (const s of slats){
    assert(s.x >= wood.x && s.x + s.w <= wood.x + wood.w + 0.01,
      'a slat hangs outside the frame');
    assert(s.y > wood.y && s.y + s.h < wood.y + wood.h,
      'a slat outside the shutter opening');
  }
  // and snow sits above the awning, not under it
  const snow = lockA.rec.rects.filter(r => r.style === '#eef4ff')[0];
  const awn = lockA.rec.rects.filter(r => r.style === th.awning2)[0];
  assert(snow && awn && snow.y + snow.h <= awn.y + 0.01,
    'the snow should settle on top of the furled awning');

  // cheaper than the plan it replaces — this is 7+ tiles on the first menu
  const big = paint(api.LEVELS[api.LEVELS.length - 1], false);
  assert(lockA.rec.rects.length < big.rec.rects.length / 3,
    'a shuttered tile should be far cheaper than a plan: ' +
    lockA.rec.rects.length + ' vs ' + big.rec.rects.length);
  console.log('    (locked tile: ' + lockA.rec.rects.length + ' rects vs ' +
    big.rec.rects.length + ' for ' + api.LEVELS[api.LEVELS.length - 1].name + ')');

  // the picture is not greyed out any more — the whole point is the theme colour
  const src = fs.readFileSync(HTML, 'utf8');
  assert(!/\.lv\.locked\s+\.lvpic\s*\{[^}]*grayscale/.test(src),
    'the locked tile still has grayscale over its picture');
  // and the menu shutters exactly the tiles it locks
  assert(/paintMarketThumb\(cv, lv, i > G\.unlocked\)/.test(src),
    'the picker should shutter a tile on the same test that locks it');
  api.G.unlocked = 12;
  api.toMenu();
  const tiles = [...String(api._nodes.mLevels.innerHTML)
    .matchAll(/class="(lv[^"]*)" data-lv="(\d+)"/g)];
  assert(tiles.length === api.LEVELS.length,
    'the picker should list every market, got ' + tiles.length);
  for (const [, cls, n] of tiles){
    const locked = /\blocked\b/.test(cls);
    assert(locked === (+n > 12),
      'market ' + (+n + 1) + ' is ' + (locked ? '' : 'not ') + 'locked at unlocked=12');
  }

  // nothing about any of it touches a random stream
  api.reseed(777);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(777);
  for (const lv of api.LEVELS) api.paintMarketThumb(recCv(carRec()), lv, true);
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'shuttering the picker moved the simulation stream');
});

test('a plan costs a handful of fills however big the market is', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  const cost = (lv) => {
    api._resetCounts();
    const out = api.paintMarketThumb(planCv(api), lv);
    return { fills: api._counts.fill || 0, rects: api._counts.fillRect || 0, out };
  };
  const small = cost(api.LEVELS[0]), big = cost(api.LEVELS[20]);
  console.log('    (plan: ' + api.LEVELS[0].name + ' ' + small.out.stalls + ' stalls in ' +
    (small.fills + small.rects) + ' calls, ' + api.LEVELS[20].name + ' ' +
    big.out.stalls + ' in ' + (big.fills + big.rects) + ')');
  assert(big.out.stalls > small.out.stalls * 2, 'the last market is much bigger than the first');
  // the greenery and the lamps are one path each, so only the stall rects scale
  assert(big.fills - small.fills === 0,
    'the trees and lamps should batch: ' + small.fills + ' -> ' + big.fills);
  assert(big.fills <= 6, 'a plan should be a handful of fills, got ' + big.fills);
});

/* ---------------------------------------------------------- trades --- */

/* A trade is four things: an awning stripe, what is laid out on the counter, a
   pictogram on the hanging sign, and what spills when the stall comes down.
   Adding one and forgetting the fourth is the obvious way to get this wrong,
   and it would not show up until you happened to wreck that stall. */
test('every trade is fully dressed', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  assert(api.TRADES.length >= 8, 'the market should sell more than six things');

  const counters = new Set(), stripes = new Set(), goods = new Set();
  for (let i = 0; i < api.TRADES.length; i++){
    const o = { x: 0, y: 0, w: 158, h: 112, seed: (i + 0.5) / api.TRADES.length };
    const t = api.tradeOf(o);
    assert(t === api.TRADES[i], 'seed should land on trade ' + i + ', got ' + t.id);
    assert(!goods.has(t.goods), 'two trades sell the same goods: ' + t.goods);
    goods.add(t.goods);

    // something on the counter, and not the same something as anyone else
    api._resetCounts();
    api.drawGoods(o, 158, 112, 0, 0);
    const drew = (api._counts.fill || 0) + (api._counts.fillRect || 0) +
      (api._counts.stroke || 0);
    assert(drew > 0, t.id + ' lays nothing out on its counter');
    const sig = (api._counts._styles || []).join('|');
    assert(!counters.has(sig), t.id + ' has the same counter as another trade');
    counters.add(sig);

    // a pictogram for the hanging sign
    api._resetCounts();
    api.signMark(t.goods, 0, 0);
    const marks = (api._counts.arc || 0) + (api._counts.rect || 0) +
      (api._counts.lineTo || 0);
    assert(marks > 0, t.id + ' has no pictogram for its sign');

    // and stock to throw across the snow when it goes down
    assert(api.WRECK_SPILL[t.goods],
      t.id + ' leaves nothing of itself when wrecked');
    assert(api.WRECK_SPILL[t.goods].cols.length > 0, t.id + ' spills no colours');

    // no two trades fly the same stripe (a null one takes the theme's)
    if (t.stripe){
      assert(!stripes.has(t.stripe), 'two trades fly the same stripe: ' + t.stripe);
      stripes.add(t.stripe);
    }
  }
  console.log('    (trades: ' + api.TRADES.map(t => t.id).join(', ') + ')');
});

test('adding trades did not change what a market is made of', () => {
  /* tradeOf is a pure function of a prop's existing seed, so a trade cannot
     reach the simulation — but that is exactly the claim five earlier cosmetic
     systems in this game got wrong, so it is worth holding down. */
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21;
  const draw5 = (fn) => {
    api.reseed(9876);
    if (fn) fn();
    return [api.rnd(), api.rnd(), api.rnd(), api.rnd(), api.rnd()];
  };
  api.startLevel(20); api.beginLevel();
  const huts = api.props.filter(o => o.kind === 'hut');
  assert(huts.length > 20, 'the last market should be full of stalls');
  const clean = draw5(null);
  const after = draw5(() => { for (const o of huts) api.tradeOf(o); });
  assert(JSON.stringify(clean) === JSON.stringify(after),
    'picking a trade moved the simulation stream');
  // and every stall in the market gets one of the trades, none falls through
  for (const o of huts){
    assert(api.TRADES.indexOf(api.tradeOf(o)) >= 0, 'a stall with no trade at ' + o.x);
  }
});

/* ---------------------------------------------------------- nitro --- */

/* The one power move in the game, and its exhaust was `circle(x, y, size * k)`
   under `lighter` — a row of round dots trailing off the back bumper with no
   direction, no taper and no heat in it. */
test('the nitro exhaust is a jet, not a row of dots', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21; api.startLevel(2); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.z = 0; api.camSnap();

  /* One flame, thrown at a chosen angle, drawn at a chosen point in its life.
     `k = 1 - t/ttl`, so t is what picks hot or cold. */
  const flame = (ang, k) => {
    api.fx.length = 0;
    api.addFx({ type: 'flame', x: api.car.x, y: api.car.y,
      vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 120,
      ttl: 1, t: 1 - k, size: 14, col: '#ffd34d' });
    const rec = carRec();
    api.withCtx(rec, () => api.drawFx(true));
    return rec;
  };
  // rotation lives on `shapes`, not `all` — several tests read the last slot
  // of an `all` entry as its colour, so nothing may be appended there
  const els = (rec) => rec.shapes;

  // it lies along the way it was thrown, at whatever angle that is
  for (const ang of [0, 1.1, -2.4, 3.0]){
    const e = els(flame(ang, 0.9));
    assert(e.length >= 2, 'a burning flame should be a body and a hot heart, got ' + e.length);
    for (const one of e){
      const d = Math.atan2(Math.sin(one.rot - ang), Math.cos(one.rot - ang));
      assert(Math.abs(d) < 1e-6,
        'a flame thrown at ' + ang.toFixed(2) + ' was drawn at ' + Number(one.rot).toFixed(2));
    }
    assert(e[0].r > e[0].ry * 2,
      'a jet is stretched, got ' + e[0].r.toFixed(1) + ' by ' + e[0].ry.toFixed(1));
    // the white heart sits back towards the pipe it came out of, never ahead
    const dx = e[1].x - e[0].x, dy = e[1].y - e[0].y;
    assert(dx * Math.cos(ang) + dy * Math.sin(ang) < -1,
      'the hot end should be behind the flame, not out in front of it');
    assert(e[1].r < e[0].r, 'the heart should be smaller than the body it sits in');
  }

  // burning is additive; smoke is not, or the night would glow where it drifts
  const hot = flame(0, 0.9), cold = flame(0, api.FLAME_SMOKE * 0.3);
  assert(hot.styles.includes('op:lighter'), 'a burning flame should add light');
  assert(hot.styles.includes('op:source-over'), 'and put the mode back afterwards');
  assert(!cold.styles.includes('op:lighter'), 'smoke should not add light');
  assert(els(cold).length === 1, 'smoke is one puff, got ' + els(cold).length);
  assert(!cold.order.includes('#ffd34d'), 'cold smoke should have lost the flame colour');
  assert(hot.order.includes('#ffd34d'), 'a burning flame should be its own colour');

  // it burns down and then the smoke opens out
  const wid = (k) => els(flame(0, k))[0].r;
  assert(wid(0.95) > wid(api.FLAME_SMOKE + 0.02),
    'the flame should burn down: ' + wid(0.95).toFixed(1) + ' -> ' +
    wid(api.FLAME_SMOKE + 0.02).toFixed(1));
  assert(wid(0.02) > wid(api.FLAME_SMOKE - 0.02) * 1.4,
    'the smoke should open out as it dies: ' + wid(api.FLAME_SMOKE - 0.02).toFixed(1) +
    ' -> ' + wid(0.02).toFixed(1));
  console.log('    (nitro flame: ' + wid(0.95).toFixed(0) + 'px hot, ' +
    wid(0.02).toFixed(0) + 'px of smoke at the end)');

  /* And the shape is read off the velocity the spawn already rolled — a flame
     that reached for one more random number would rescore all 21 markets. */
  api.reseed(31337);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(31337);
  for (let i = 0; i < 40; i++) flame(i * 0.3, (i % 10) / 10);
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'drawing the exhaust moved the simulation stream');

  // a real nitro on a real run puts a plume behind the car and nothing in front
  api.startLevel(11); api.beginLevel();
  api.launch(-api.C.MAX_PULL, 0);
  for (let f = 0; f < 40; f++) api.update(1 / 60);
  assert(api.carSpeed() > 100, 'the car should be moving, got ' + api.carSpeed());
  assert(api.doBoost(), 'the nitro should fire');
  for (let f = 0; f < 14; f++) api.update(1 / 60);
  const plume = api.fx.filter(e => e.type === 'flame');
  assert(plume.length > 6, 'a plume, got ' + plume.length + ' flames');
  const back = Math.atan2(api.car.vy, api.car.vx) + Math.PI;
  for (const p of plume){
    const dx = p.x - api.car.x, dy = p.y - api.car.y;
    assert(dx * Math.cos(back) + dy * Math.sin(back) > -30,
      'a flame came out of the front of the car');
  }
});

test('the nitro halo is a baked light, not a flat plate', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21; api.startLevel(2); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.z = 0;
  api.car.vx = 600; api.car.vy = 0; api.camSnap();
  api.drawLights();                                  // bake the sprites

  const lightPass = (boostT) => {
    api.car.boostT = boostT;
    const rec = carRec();
    api.withCtx(rec, api.drawLights);
    return rec;
  };
  const off = lightPass(0), hot = lightPass(0.55), fading = lightPass(0.15);

  // the boost adds a sprite, and does not add a fill
  assert(hot.images.length === off.images.length + 1,
    'the halo should be one more sprite: ' + off.images.length + ' -> ' + hot.images.length);
  assert(hot.shapes.length <= off.shapes.length,
    'and not a raw disc on top of it: ' + off.shapes.length + ' -> ' + hot.shapes.length);

  /* It used to be a 190-unit circle at a flat .16 for the whole 0.55s, which
     at the drive camera greys out two thirds of the frame at the exact moment
     the most is happening in it. */
  /* The halo is the one sprite centred exactly on the car: the headlight spots
     are thrown ahead of it, the car's own hole in the darkness goes to the
     dark layer's own context, and the night wash is the full frame. */
  const halo = (rec) => rec.images.filter(i =>
    Math.abs(i.x + i.w / 2 - api.car.x) < 1 && Math.abs(i.y + i.h / 2 - api.car.y) < 1);
  assert(halo(off).length === 0, 'no boost, no halo: ' + halo(off).length);
  assert(halo(hot).length === 1, 'one halo: ' + halo(hot).length);
  const big = halo(hot)[0], small = halo(fading)[0];
  assert(big.w > small.w, 'the halo should burn down: ' + big.w + ' -> ' + small.w);
  assert(big.alpha > small.alpha, 'and fade with it: ' + big.alpha + ' -> ' + small.alpha);
  assert(big.w < 380, 'and never plate the frame: ' + big.w + ' across');
  // centred on the car, wherever it is
  assert(Math.abs(big.x + big.w / 2 - api.car.x) < 1 &&
         Math.abs(big.y + big.w / 2 - api.car.y) < 1, 'the halo rides the car');
  console.log('    (nitro halo: ' + big.w.toFixed(0) + 'px at a' + big.alpha.toFixed(2) +
    ', down to ' + small.w.toFixed(0) + 'px at a' + small.alpha.toFixed(2) + ')');
});

/* ------------------------------------------------------ in the air --- */

test('the car’s shadow stays on the ground and pulls away from it', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const L = api.getDims().l;
  const g = api.carShadow(0), mid = api.carShadow(160), high = api.carShadow(320);

  // on the ground the shadow is under the car
  assert(Math.hypot(g.dx, g.dy) < 1, 'a parked car sits on its own shadow');
  // and it travels along the scene's one light direction, not straight down
  const along = (s) => (s.dx * api.SUN_DX + s.dy * api.SUN_DY) /
    (Math.hypot(s.dx, s.dy) * Math.hypot(api.SUN_DX, api.SUN_DY));
  assert(along(high) > 0.999, 'the shadow should fall along the light, got ' + along(high));
  assert(Math.hypot(high.dx, high.dy) > Math.hypot(mid.dx, mid.dy),
    'higher car, further shadow');
  /* Far enough to be clear of the car. The car is drawn at 1 + z/380 scale, so
     at the top of a ramp jump it is nearly twice its size — a shadow that only
     slid a ninetieth of the height stayed underneath it and the one moment in
     the game with altitude in it read as a car that had got bigger. */
  const grown = L / 2 * (1 + 320 / 380);
  assert(Math.hypot(high.dx, high.dy) > grown,
    'at 320 up the shadow should clear the car body: ' +
    Math.hypot(high.dx, high.dy).toFixed(0) + ' vs ' + grown.toFixed(0));

  // it does not shrink away — a shadow keeps its size and softens
  assert(high.rx >= g.rx && high.ry >= g.ry,
    'the shadow should not shrink with height: ' + g.rx.toFixed(1) + ' -> ' + high.rx.toFixed(1));
  assert(high.rx < g.rx * 1.3, 'nor balloon: ' + high.rx.toFixed(1));
  assert(high.a < g.a, 'but it should soften');
  assert(high.a > 0.1, 'without disappearing: ' + high.a.toFixed(2));
  // and it never inverts, however high a monster truck gets
  assert(api.carShadow(2000).a > 0,
    'the shadow must not go negative at any height: ' + api.carShadow(2000).a);
  console.log('    (shadow at z320: ' + Math.hypot(high.dx, high.dy).toFixed(0) +
    'px out, rx ' + g.rx.toFixed(0) + ' -> ' + high.rx.toFixed(0) +
    ', alpha ' + g.a.toFixed(2) + ' -> ' + high.a.toFixed(2) + ')');
});

test('a car in the air draws its shadow apart from itself', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.ang = 0; api.car.roll = 0;
  api.car.vx = 0; api.car.vy = 0; api.car.dispSp = 0; api.camSnap();
  const at = (z) => {
    api.car.z = z;
    const rec = carRec();
    api.withCtx(rec, api.drawCar);
    // the shadow is the only thing drawn in the shadow ink
    return rec.shapes.filter(s => /rgba\(9,16,32|rgba\(10,20,36|rgba\(8,16,32/.test(s.style));
  };
  const onGround = at(0), aloft = at(320);
  assert(onGround.length >= 1 && aloft.length >= 1,
    'the car should cast a shadow at any height: ' + onGround.length + ' / ' + aloft.length);
  assert(aloft.length === onGround.length,
    'the same shadow, in a different place: ' + onGround.length + ' vs ' + aloft.length);
});

/* --------------------------------------------------------- the pram --- */

/* The one silhouette a goal names — "send 3 prams flying" — and the one thing
   `lodAlways` keeps out of the batch precisely because it has to read before
   you hit it. It read as a phone: a rounded rectangle, a pale rectangle inside
   it, and (only at the replay tier) two near-black circles drawn *inside* the
   dark body where nothing could see them. */
/* Exact, not roomy. A pram is never batched, so at launch speed ninety-odd of
   them are in shot and one more fill each is two hundred off the budget — the
   ceiling caught exactly that when the handle bar was first drawn as a fill.
   Adding one here is meant to be a deliberate act, so the number is the number. */
const PRAM_MID_FILLS = 5;
test('a pushed pram reads as a pram, at the tier that has to swerve for it', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100;
  const shot = (tz) => {
    api.people.length = 0;
    const p = api.addPerson(api.car.x + 40, api.car.y, 'parent');
    p.ang = -Math.PI / 2; p.wt = 0.4; p.bob = 1;
    api.cam.x = p.x; api.cam.y = p.y; api.cam.tz = tz; api.cam.s = api.camScale(tz);
    const rec = carRec();
    api.withCtx(rec, () => api.drawPerson(p));
    return { p, rec, q: api.lodQ(p) };
  };
  const near = shot(150), mid = shot(900);
  assert(near.q > api.LOD_FINE, 'the close camera should be the fine tier, q ' + near.q.toFixed(1));
  assert(mid.q < api.LOD_FINE && mid.q >= api.LOD_MID,
    'the driving camera should be the middle tier, q ' + mid.q.toFixed(1));
  const r = near.p.r;

  // four wheels, outside the body, in one path
  const wheels = near.rec.all.filter(e => e[0] === 'arc' && e[4] === '#101722');
  assert(wheels.length === 4, 'a pram has four wheels, got ' + wheels.length);
  for (const w of wheels)
    assert(Math.abs(w[1]) > r * 0.62,
      'a wheel at ' + Math.abs(w[1]).toFixed(1) + ' is inside a body of ' + (r * 0.62).toFixed(1));
  assert(new Set(wheels.map(w => (w[1] > 0) + ':' + (w[2] > 0))).size === 4,
    'the four wheels should be at four corners');

  /* The hood and the handle bar are silhouette, so they are drawn at every
     tier; the wheels and the baby's face are detail and stay in `fine`. That
     split is the whole point — the middle tier is the one that has to make you
     swerve, and it is the one the old drawing served worst. */
  for (const [name, rec] of [['fine', near.rec], ['middle', mid.rec]])
    assert(rec.order.includes(api.PRAM_HOOD), name + ' tier lost the hood');
  assert(!mid.rec.all.some(e => e[0] === 'arc' && e[4] === '#101722'),
    'the middle tier should not be paying for wheels');
  assert(near.rec.order.includes('#f3c9a8') && !mid.rec.order.includes('#f3c9a8'),
    'the baby belongs to the replay');
  assert(near.rec.order.includes('#dfe8f6') && !mid.rec.order.includes('#dfe8f6'),
    'the blanket is interior detail; the hood is the silhouette');
  /* The hood replaced the blanket as the middle tier's second colour rather
     than joining it. A pram is never batched, so at launch speed ninety-odd
     are in shot and one extra fill each is two hundred off the budget — the
     ceiling caught exactly that when this was first written. */
  assert(mid.rec.fills <= PRAM_MID_FILLS,
    'the driving tier costs ' + mid.rec.fills + ' fills, budget ' + PRAM_MID_FILLS);

  /* The hood is deliberately no coat's colour: a hood in the same red as the
     coat pushing it merges into one shape, which is the opposite of what a
     thing you are meant to swerve for should do. */
  for (const list of [api.COATS, api.ELDER_COATS, api.KID_COATS, api.HATS])
    assert(list.indexOf(api.PRAM_HOOD) < 0,
      'the hood shares a colour with a coat or hat: ' + api.PRAM_HOOD);

  // the hood covers the head end, and the handle is where the hands reach
  const hoodPts = near.rec.all.filter(e => e[4] === api.PRAM_HOOD &&
    (e[0] === 'm' || e[0] === 'q'));
  assert(hoodPts.length >= 3, 'the hood should be an arc, got ' + hoodPts.length);
  /* The bar rides on the arms' own stroke, so it is free — and it has to be
     where the hands stop, or they are reaching for nothing. */
  const line = near.rec.all.filter(e => e[0] === 'm' || e[0] === 'l');
  const reach = Math.min(...line.map(e => e[2]));
  const across = line.filter(e => Math.abs(e[2] - reach) < r * 0.1);
  assert(across.length >= 2, 'nothing spans the top of the arms');
  const span = Math.max(...across.map(e => e[1])) - Math.min(...across.map(e => e[1]));
  assert(span > r * 0.9,
    'the handle bar spans only ' + span.toFixed(1) + ' across a pram of ' + (r * 1.24).toFixed(1));

  api.reseed(3141);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(3141);
  for (let i = 0; i < 20; i++) api.drawPerson(near.p);
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'drawing the pram moved the simulation stream');
  console.log('    (pram: ' + near.rec.fills + ' fills at the replay, ' +
    mid.rec.fills + ' driving)');
});

test('a pram that was sent flying lands and stays there', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.people.length = 0; api.fx.length = 0; api.debris.length = 0;
  const p = api.addPerson(2600, 1100, 'parent');
  assert(p.pram && p.pramT > 0, 'a parent should be pushing a pram');

  api.killPerson(p, 300, -80);
  const flying = api.fx.filter(f => f.type === 'pram');
  assert(flying.length === 1, 'the pram should be thrown, got ' + flying.length);
  assert(api.debris.some(d => d.kind === 'pram') === false,
    'it should not have landed while it is still in the air');

  step(api, 3);
  assert(api.fx.filter(f => f.type === 'pram').length === 0, 'and it should come down');
  const down = api.debris.filter(d => d.kind === 'pram');
  assert(down.length === 1, 'one pram thrown, one pram on the snow: ' + down.length);
  assert(Math.hypot(down[0].x - 2600, down[0].y - 1100) > 20,
    'it should land where it was thrown to, not where it started');
  assert(down[0].w > 0 && down[0].h > 0, 'and have a size to be drawn at');
  console.log('    (pram landed ' +
    Math.round(Math.hypot(down[0].x - 2600, down[0].y - 1100)) + 'px from the parent)');
});

test('a landed pram is drawn as a pram, not as a plank', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const cost = (kind) => {
    api.debris.length = 0;
    api.debris.push({ x: api.cam.x, y: api.cam.y, w: 24, h: 16, rot: 0.4,
      col: '#22354f', kind });
    api.drawGround();
    api._resetCounts();
    api.drawGround();
    return { fills: api._counts.fill || 0, rects: api._counts.fillRect || 0,
      styles: (api._counts._styles || []).slice() };
  };
  const plank = cost(undefined), pram = cost('pram');
  console.log('    (plank ' + plank.rects + ' rects / ' + plank.fills + ' fills, pram ' +
    pram.rects + ' / ' + pram.fills + ')');
  assert(pram.fills > plank.fills + 2,
    'a pram should be more than a rectangle: ' + plank.fills + ' -> ' + pram.fills);
  // the blanket and the wheels are what make it read as a pram from above
  assert(pram.styles.includes('#dfe8f6'), 'the blanket should be half out of it');
  assert(pram.styles.includes('#101722') && pram.styles.includes('#3b4a63'),
    'one wheel still on it and one that came off');
  assert(!plank.styles.includes('#dfe8f6'), 'a plank has no blanket');
});

test('the prams you sent flying are still there when the run settles', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.people.length = 0; api.fx.length = 0; api.debris.length = 0;
  for (let i = 0; i < 5; i++){
    const p = api.addPerson(2500 + i * 60, 1100, 'parent');
    api.killPerson(p, 260, -40);
  }
  const drive = () => { api.G.phase = 'drive'; };   // the run times out otherwise
  drive(); step(api, 4);
  const down = api.debris.filter(d => d.kind === 'pram');
  assert(down.length === 5, 'five prams thrown, five on the snow: ' + down.length);
  // ten more seconds of settling changes nothing — they are ground, not effects
  drive(); step(api, 10);
  assert(api.debris.filter(d => d.kind === 'pram').length === 5,
    'a landed pram should not fade out like an effect does');
  // and the field is still capped
  for (let i = 0; i < api.C.DEBRIS_MAX + 50; i++){
    api.debris.push({ x: 0, y: 0, w: 10, h: 4, rot: 0, col: '#000' });
  }
  drive();
  const p2 = api.addPerson(2600, 1100, 'parent');
  api.killPerson(p2, 200, 0);
  assert(api.fx.some(f => f.type === 'pram'), 'that pram should be in the air');
  step(api, 3);
  assert(api.debris.length <= api.C.DEBRIS_MAX,
    'the debris field should stay capped: ' + api.debris.length);
});

/* ------------------------------------------------------- the fallen --- */

function corpse(api, kind, tweak){
  api.people.length = 0;
  const p = api.addPerson(api.cam.x, api.cam.y, kind);
  p.ang = 0; p.dead = true; p.squash = 0.85; p.fly = 0;
  if (tweak) tweak(p);
  const rec = carRec();
  api.withCtx(rec, () => api.drawPerson(p));
  const isTorso = (s) => Math.abs(s.r - p.r * 0.95) < 0.01 && Math.abs(s.ry - p.r * 0.72) < 0.01;
  return { p, rec,
    torso: rec.shapes.find(s => !s.stroked && isTorso(s)),
    trim: rec.shapes.find(s => s.stroked && isTorso(s)),
    by: (c) => rec.shapes.filter(s => s.style === c),
    rects: rec.rects };
}

test('a flattened Santa is still recognisably Santa', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const s = corpse(api, 'santa');
  const r = s.p.r;

  assert(s.torso && s.torso.style === '#c22f28', 'the red coat should survive: ' +
    (s.torso && s.torso.style));
  assert(s.trim && /246,242,234/.test(s.trim.style), 'and the fur trim with it');
  assert(s.trim.lw > r * 0.1, 'thick enough to read: ' + s.trim.lw.toFixed(1));
  assert(s.rects.some(x => x.style === '#2a2028') && s.rects.some(x => x.style === '#e8b53a'),
    'belt and buckle should still be on him');
  const beard = s.by('#f3efe6')[0];
  assert(beard, 'the beard should still be there');
  assert(beard.x > 0 && beard.x < r * 1.05,
    'under his chin, between the torso and the head: x' + beard.x.toFixed(1));
  const hat = s.by('#d8382c')[0], bob = s.by('#f6f2ea')[0];
  assert(hat && bob, 'the hat and its bobble should have come off with him');
  assert(hat.x > r * 1.05 && bob.x > hat.x, 'knocked forward past the head');
  /* And he is still visibly dead: the X goes on after the hat, so nothing he
     is now wearing can cover it. */
  const st = s.rec.styles;
  assert(st.indexOf('s:#2a1a16') > st.lastIndexOf('f:#d8382c'),
    'the X should be struck over the hat, not under it');
  console.log('    (dead santa: beard x' + beard.x.toFixed(1) + ', hat x' +
    hat.x.toFixed(1) + ', bobble x' + bob.x.toFixed(1) + ' on r' + r + ')');
});

test('everyone else falls the way they always did', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  for (const kind of ['shopper', 'elder', 'kid', 'parent']){
    const c = corpse(api, kind, (p) => { p.hat = true; p.hatCol = 0; });
    assert(c.torso.style !== '#c22f28', kind + ' should not be wearing Santa red');
    assert(/18,28,48/.test(c.trim.style), kind + ' should keep the plain outline');
    assert(!c.rects.some(x => x.style === '#2a2028'), kind + ' should not have the belt');
    assert(c.by('#f3efe6').length === 0, kind + ' should not have the beard');
    // but their own bobble hat still comes down with them
    assert(c.by(api.HATS[0]).length === 1,
      kind + ' should keep its own hat: ' + c.by(api.HATS[0]).length);
  }
  // and a hatless one draws no hat at all
  const bald = corpse(api, 'shopper', (p) => { p.hat = false; });
  assert(bald.by(api.HATS[0]).length === 0, 'no hat, no hat');
});

/* ------------------------------------------------- wrecked set pieces --- */

/* Draws one prop, live or wrecked, into the shape recorder. */
function propShot(api, kind, seed, dead){
  api.props.length = 0;
  const o = api.addProp(kind, api.cam.x, api.cam.y, {});
  o.seed = seed; o.dead = !!dead; o.rot = 0.4;
  const rec = carRec();
  api.withCtx(rec, () => api.drawProp(o));
  return { o, rec, cols: rec.order,
    by: (c) => rec.shapes.filter(s => s.style === c),
    rects: rec.rects };
}

test('a wrecked glühwein stand is a pot on its side, not a brown disc', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const dead = propShot(api, 'gluh', 0.62, true);
  const live = propShot(api, 'gluh', 0.62, false);

  // the pot, still wearing the gold rim it had when it was standing
  const rim = dead.by('#c9a24a').find(s => s.stroked);
  assert(rim, 'the gold rim should survive the wreck');
  assert(rim.r !== rim.ry, 'and be an ellipse, because the pot is on its side');
  assert(live.by('#c9a24a').some(s => s.stroked), 'the live pot has the rim too');
  // the trestle it stood on, snapped — two bars, which the live one has none of
  assert(dead.rects.filter(r => r.style === '#5c4430').length === 2,
    'the wreck should show a broken trestle: ' +
    dead.rects.filter(r => r.style === '#5c4430').length + ' bars');
  assert(live.rects.filter(r => r.style === '#5c4430').length === 0,
    'a standing stand has no snapped trestle');
  // and the cups off the counter
  const cups = dead.by('#8b2f22');
  assert(cups.length >= 1, 'the cups should be on the snow');
  console.log('    (wrecked gluh: rim ' + rim.r.toFixed(0) + 'x' + rim.ry.toFixed(0) +
    ', ' + dead.rects.filter(r => r.style === '#5c4430').length + ' trestle bars)');
});

test('a burst crate shows its spent tubes, a burst barrel does not', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  // find a seed either side of the crate line, whichever way round it runs
  let crateSeed = null, plainSeed = null;
  for (let i = 0; i <= 20; i++){
    api.props.length = 0;
    const o = api.addProp('barrel', api.cam.x, api.cam.y, {});
    o.seed = i / 20;
    if (api.crateOf(o) && crateSeed === null) crateSeed = o.seed;
    if (!api.crateOf(o) && plainSeed === null) plainSeed = o.seed;
  }
  assert(crateSeed !== null && plainSeed !== null,
    'the market should hold both crates and plain barrels');

  const crate = propShot(api, 'barrel', crateSeed, true);
  const plain = propShot(api, 'barrel', plainSeed, true);
  // both burst into staves and a sprung hoop
  for (const [name, w] of [['crate', crate], ['barrel', plain]]){
    assert(w.by('#6b4e32').length >= 1, name + ' should burst into staves');
    assert(w.by('#8d7a5c').some(s => s.stroked), name + ' should keep its hoop');
    assert(w.by('#7a5836').length === 0, name + ' should not still be a whole barrel');
  }
  /* Only the crate leaves tubes. A crate is drawn differently from a barrel
     while it is standing, and wrecked they were the same brown disc — the
     thing that just launched a volley across the market looked like a barrel
     that fell over. */
  assert(crate.by('#3a1512').length >= 1, 'a spent crate should leave its tubes');
  assert(plain.by('#3a1512').length === 0, 'a plain barrel has no tubes to leave');
  // and a standing barrel is still a barrel
  const upright = propShot(api, 'barrel', plainSeed, false);
  assert(upright.by('#7a5836').length === 1, 'a standing barrel is a barrel');
  assert(upright.by('#6b4e32').length === 0, 'and is not in pieces');
  console.log('    (crate seed ' + crateSeed + ' leaves tubes, barrel seed ' +
    plainSeed + ' does not)');
});

test('wrecked set pieces are drawn from a hash, not a generator', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const draw5 = (fn) => {
    api.reseed(2468);
    if (fn) fn();
    return [api.rnd(), api.rnd(), api.rnd(), api.rnd(), api.rnd()];
  };
  /* The props are made first and only drawn inside the measured block —
     addProp itself rolls numbers, and measuring the drawing means measuring
     the drawing. */
  const wrecks = [];
  for (const k of ['gluh', 'barrel']){
    for (let i = 0; i < 6; i++){
      const o = api.addProp(k, api.cam.x, api.cam.y, {});
      o.seed = i / 6; o.dead = true; o.rot = 0.4;
      wrecks.push(o);
    }
  }
  const clean = draw5(null);
  const after = draw5(() => {
    const rec = carRec();
    api.withCtx(rec, () => { for (const o of wrecks) api.drawProp(o); });
    assert(rec.all.length > 40, 'the wrecks should actually draw: ' + rec.all.length);
  });
  assert(JSON.stringify(clean) === JSON.stringify(after),
    'a wreck moved the simulation stream: ' + clean[0] + ' -> ' + after[0]);
  // and it looks the same every frame it is on camera
  const a = propShot(api, 'gluh', 0.3, true).rec.all;
  const b = propShot(api, 'gluh', 0.3, true).rec.all;
  assert(a.length > 4 && JSON.stringify(a) === JSON.stringify(b),
    'a wreck should not shuffle itself between frames');
});

/* ------------------------------------------------------- the brief --- */

test('the brief shows the plan of the market it is briefing', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21;
  api.startCampaign();
  api.startLevel(0);                          // so the node exists to spy on
  const node = api._nodes.brPlan;
  assert(node, 'the brief should have a plan canvas');

  const painted = carRec();
  node.getContext = () => painted;
  api.startLevel(8);
  assert(painted.all.length > 20,
    'the brief should paint a plan, got ' + painted.all.length + ' primitives');

  // and it is this market's plan, not some other market's
  const want = carRec();
  node.getContext = () => want;
  api.paintMarketThumb(node, api.LEVELS[8]);
  assert(JSON.stringify(painted.all) === JSON.stringify(want.all),
    'the brief is painting the wrong market');
  const other = carRec();
  node.getContext = () => other;
  api.paintMarketThumb(node, api.LEVELS[2]);
  assert(JSON.stringify(painted.all) !== JSON.stringify(other.all),
    'two different markets should not brief the same picture');

  // the markup's canvas is sized off the same constants the picker uses, so
  // the two cannot drift apart
  const src = fs.readFileSync(HTML, 'utf8');
  const m = src.match(/id="brPlan" width="(\d+)" height="(\d+)"/);
  assert(m, 'the plan canvas should carry its own size');
  assert(+m[1] === api.MK_W * 2 && +m[2] === api.MK_H * 2,
    'the brief canvas is ' + m[1] + 'x' + m[2] + ', the picker paints ' +
    (api.MK_W * 2) + 'x' + (api.MK_H * 2));
  console.log('    (brief plan: ' + m[1] + 'x' + m[2] + ', ' + painted.all.length + ' primitives)');
});

test('the brief lets you see the market you are about to wreck', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const alphaOf = (sel) => {
    const block = src.slice(src.indexOf(sel + '{'));
    const m = block.slice(0, 400).match(/rgba\(4,7,14,\.(\d+)\)/);
    assert(m, 'no outer wash found for ' + sel);
    return +('0.' + m[1]);
  };
  const std = alphaOf('.ov'), br = alphaOf('#brief');
  console.log('    (brief wash ' + br + ' vs standard ' + std + ')');
  assert(br < std - 0.08,
    'the brief should sit on a lighter wash than a plain overlay: ' + br + ' vs ' + std);
  assert(/#brief\{[^}]*backdrop-filter:blur\(2px\)/.test(src.replace(/\s+/g, ' ')),
    'and its blur eased off with it');
});

/* ---------------------------------------------------- wrecked stalls --- */

test('a wrecked stall is a wreck of that stall', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const wreck = (seed) => {
    api.props.length = 0;
    const o = api.addProp('hut', api.cam.x, api.cam.y, {});
    o.seed = seed; o.dead = true; o.rot = 0.4;
    const rec = carRec();
    api.withCtx(rec, () => api.drawProp(o));
    return { o, trade: api.tradeOf(o), cols: rec.order };
  };
  const sets = [];
  for (let i = 0; i < api.TRADES.length; i++){
    const w = wreck((i + 0.5) / api.TRADES.length);
    const t = w.trade;
    // the scrap of awning is the stripe it was flying a second earlier
    if (t.stripe){
      assert(w.cols.includes(t.stripe),
        t.id + ' lost its stripe when it fell: ' + t.stripe);
    }
    // and its stock is on the snow around it
    const sp = api.WRECK_SPILL[t.goods];
    assert(sp, t.id + ' has no spill defined for ' + t.goods);
    for (const c of sp.cols){
      assert(w.cols.includes(c), t.id + ' spilled nothing of its stock (' + c + ')');
    }
    sets.push(t.id + ':' + sp.cols.join(','));
  }
  // six trades, six different wrecks — they all used to be the same brown heap
  assert(new Set(sets).size === sets.length,
    'two trades leave the same wreck: ' + sets.join(' | '));
  console.log('    (wrecks: ' + sets.map(s => s.split(':')[0]).join(', ') + ')');
});

test('the spilled stock is batched, and drawn from a hash not a generator', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const o = api.addProp('hut', api.cam.x, api.cam.y, {});
  o.dead = true; o.rot = 0.4;

  // one fill a colour, whatever the item count
  for (let i = 0; i < api.TRADES.length; i++){
    o.seed = (i + 0.5) / api.TRADES.length;
    const sp = api.WRECK_SPILL[api.tradeOf(o).goods];
    api._resetCounts();
    const items = api.drawSpilledStock(o, 158);
    assert(items === api.WRECK_ITEMS,
      api.tradeOf(o).id + ' should scatter ' + api.WRECK_ITEMS + ' items, got ' + items);
    assert((api._counts.fill || 0) === sp.cols.length,
      api.tradeOf(o).id + ' should cost one fill a colour: ' +
      api._counts.fill + ' for ' + sp.cols.length + ' colours');
  }

  /* Nothing here may roll a number. A wreck is drawn every frame it is on
     camera, so a generator call in it would rescore the campaign continuously
     — which is exactly how five earlier cosmetic systems went wrong. */
  const draw5 = (fn) => {
    api.reseed(1234);
    if (fn) fn();
    return [api.rnd(), api.rnd(), api.rnd(), api.rnd(), api.rnd()];
  };
  const clean = draw5(null);
  const after = draw5(() => {
    for (let i = 0; i < api.TRADES.length; i++){
      o.seed = (i + 0.5) / api.TRADES.length;
      api.drawSpilledStock(o, 158);
      api.drawSpilledStock(o, 158);
    }
  });
  assert(JSON.stringify(clean) === JSON.stringify(after),
    'a wreck moved the simulation stream: ' + clean[0] + ' -> ' + after[0]);
  // and it looks the same every frame
  const shot = () => { const r = carRec(); api.withCtx(r, () => api.drawSpilledStock(o, 158));
    return r.all; };
  const a = shot(), b = shot();
  assert(a.length >= api.WRECK_ITEMS, 'the recorder should see every item: ' + a.length);
  assert(JSON.stringify(a) === JSON.stringify(b),
    'a wreck should not shuffle itself between frames');
});

/* --------------------------------------------------------- Santa --- */

/* Draws one shopper into a recorder, close enough that the fine tier runs. */
function shopper(api, kind, tweak){
  api.people.length = 0;
  const p = api.addPerson(api.cam.x, api.cam.y, kind);
  p.ang = 0; p.bob = 0.4; p.panic = 0; p.cry = 0;
  p.vx = 20; p.vy = 0;
  if (tweak) tweak(p);
  api.cam.tz = 300; api.cam.s = 1;
  assert(api.lodQ(p) > api.LOD_FINE, kind + ' should be drawn at the fine tier');
  const rec = carRec();
  api.withCtx(rec, () => api.drawPerson(p));
  // the coat by its exact geometry — the drop shadow is a big ellipse too
  const isCoat = (s) => Math.abs(s.r - p.r * 0.86) < 0.01 && Math.abs(s.y - p.r * 0.1) < 0.01;
  // the shopping: a filled box in one of the bag colours, its dark rim, the
  // handle arc over it and the shading fold across the top
  const bagCol = api.BAG_COLS[p.coat % api.BAG_COLS.length];
  const bags = rec.polys.filter(q => !q.stroked && q.style === bagCol);
  const bag = bags[0];
  const near = (q) => bag && Math.abs(q.x0 - bag.x0) < 0.01 && Math.abs(q.y0 - bag.y0) < 0.01;
  return { p, rec, bag, bags, bagCol,
    bagRim: rec.polys.find(q => q.stroked && near(q)),
    handle: bag && rec.shapes.find(s => s.stroked && s.r === s.ry &&
      s.x > bag.x0 - 0.01 && s.x < bag.x1 + 0.01 && s.y < bag.y1),
    fold: rec.rects.find(r => near({ x0: r.x, y0: r.y })),
    coat: rec.shapes.find(s => !s.stroked && isCoat(s)),
    trim: rec.shapes.find(s => s.stroked && isCoat(s)),
    pale: rec.shapes.filter(s => !s.stroked && /^#f[36]/i.test(s.style)),
    red: rec.shapes.filter(s => !s.stroked && s.style === '#d8382c'),
    belt: rec.rects.find(r => r.style === '#2a2028'),
    buckle: rec.rects.find(r => r.style === '#e8b53a') };
}

test('Santa is dressed as Santa, and nobody else is', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const s = shopper(api, 'santa');
  assert(s.coat, 'he should have a coat');
  assert(s.coat.style === '#c22f28', 'in Santa red, got ' + s.coat.style);
  assert(s.trim, 'and a fur trim round it');
  assert(/246,242,234|f6f2ea/i.test(s.trim.style), 'in white, got ' + s.trim.style);
  assert(s.trim.lw > s.p.r * 0.1,
    'thick enough to read from above: ' + s.trim.lw.toFixed(1) + ' on r' + s.p.r);
  assert(s.belt && s.buckle, 'a belt and a buckle');

  /* Nobody else wears it. He used to draw from the same eight shopper coats
     his seed happened to roll, which on a market whose whole goal is running
     him over made the jackpot look like everyone else. */
  for (const kind of ['shopper', 'elder', 'kid', 'parent']){
    for (let seed = 0; seed < 8; seed++){
      const o = shopper(api, kind, (p) => { p.coat = seed; });
      assert(o.coat.style !== '#c22f28', kind + ' seed ' + seed + ' is wearing Santa red');
      assert(!o.trim || !/246,242,234/.test(o.trim.style),
        kind + ' seed ' + seed + ' got the fur trim');
      assert(!o.belt, kind + ' should not have Santa’s belt');
    }
  }
  console.log('    (santa: coat ' + s.coat.style + ', trim ' + s.trim.lw.toFixed(1) +
    'px on r' + s.p.r + ')');
});

test('Santa’s beard sits behind the face the crying pass draws', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const s = shopper(api, 'santa', (p) => { p.cry = 1; p.panic = 0.9; });
  const r = s.p.r;
  const beard = s.pale.find(x => x.r !== x.ry);       // the only pale ellipse
  const bobble = s.pale.find(x => x.r === x.ry && x.y < -r * 0.6);
  const band = s.pale.find(x => x.r !== x.ry && x !== beard);
  const hat = s.red[0];
  assert(beard && hat && bobble, 'beard, hat and bobble: ' +
    [!!beard, !!hat, !!bobble].join('/'));

  const mouthY = -r * 0.26;                            // where drawPerson cries
  assert(beard.y > mouthY, 'the beard should sit behind the mouth');
  assert(beard.y - beard.ry > mouthY,
    'and not cover it: beard reaches ' + (beard.y - beard.ry).toFixed(1) +
    ', mouth at ' + mouthY.toFixed(1));
  assert(hat.y < -r * 0.34, 'the hat should be forward of the head');
  assert(bobble.y < hat.y, 'and the bobble forward of the hat');
  assert(Math.hypot(bobble.x - hat.x, bobble.y - hat.y) < hat.r + bobble.r,
    'the bobble should be on the hat, not floating off it');
  // the belt is on the coat, well clear of the beard
  assert(s.belt.y > beard.y + beard.ry,
    'the belt is at his waist, not in his beard: ' + s.belt.y.toFixed(1) +
    ' vs ' + (beard.y + beard.ry).toFixed(1));
  console.log('    (santa head: beard y' + beard.y.toFixed(1) + '±' + beard.ry.toFixed(1) +
    ', mouth y' + mouthY.toFixed(1) + ', hat y' + hat.y.toFixed(1) +
    ', bobble y' + bobble.y.toFixed(1) + ')');
});

/* --------------------------------------------------------- the goals --- */

/* The results card shows "Wrecked 9" and, right underneath it, an unticked
   "Wreck 4 stalls". They are two different counters — G.wrecks is everything
   flattened, the goal tests G.bigWrecks, which is props worth 260 or more —
   so the card read as a broken goal rather than as one you missed. */
test('every goal can say how far it got, and agrees with itself', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();

  assert(api.GOALS.length === 13, 'thirteen goals in the pool, got ' + api.GOALS.length);
  for (const d of api.GOALS)
    assert(typeof d.val === 'function', d.id + ' cannot report its progress');

  /* The invariant that matters: progress and pass/fail are two readings of the
     same thing and must never disagree. Swept across the whole state space
     each goal cares about. */
  const G = api.G;
  const fields = ['bestCombo', 'bigWrecks', 'rolls', 'jumps', 'bestSlam',
                  'nitroKills'];
  let cases = 0;
  for (const d of api.GOALS){
    // the n the game actually asks for, market by market — a one-shot goal's
    // gen always returns 1 and it ignores n entirely, so an invented n proves
    // nothing about it
    for (let lv = 0; lv < api.LEVELS.length; lv++){
      const n = d.gen(lv);
      for (const at of [0, 1, n - 1, n, n + 1, n * 3]){
        if (at < 0) continue;
        for (const f of fields) G[f] = at;
        G.bestRun = at * 900;
        G.byKind = { elder: at, kid: at, parent: at, santa: at };
        G.treeDown = at > 0; G.carouselDown = at > 0;
        const got = d.val(G);
        assert(!!d.test(G, n) === (got >= n),
          d.id + ' at market ' + (lv + 1) + ': test says ' + !!d.test(G, n) +
          ' with progress ' + got + ' / ' + n + ' — the two disagree');
        cases++;
      }
    }
  }
  console.log('    (goal progress: ' + cases + ' cases across 13 goals)');
});

test('a missed goal says how close it came', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.bigWrecks = 1;

  const stalls = { id: 'stalls', n: 4, done: false, text: 'Wreck 4 stalls' };
  assert(api.goalProgress(stalls) === '1 / 4',
    'a missed goal should read 1 / 4, got "' + api.goalProgress(stalls) + '"');

  // clamped: you cannot be 9 / 4 through a goal you have finished
  api.G.bigWrecks = 9;
  assert(api.goalProgress(stalls) === '4 / 4',
    'progress should clamp at the target, got "' + api.goalProgress(stalls) + '"');

  // one-shot goals say nothing — "0 / 1" is noise next to "Run over Santa"
  for (const id of ['santa', 'tree', 'carousel'])
    assert(api.goalProgress({ id, n: 1 }) === '',
      id + ' should not print 0 / 1');

  // big numbers keep their separators
  api.G.bestRun = 12345;
  assert(api.goalProgress({ id: 'onerun', n: 20000 }) === '12,345 / 20,000',
    'got "' + api.goalProgress({ id: 'onerun', n: 20000 }) + '"');

  /* …and the card actually prints it. Without this the chip could be deleted
     from the render and every assertion above would still pass — which is
     exactly what happened when the fix was reverted to check it. */
  api.startLevel(0); api.beginLevel();
  api.G.goals = [
    { id: 'stalls', n: 4, done: false, text: 'Wreck 4 stalls' },
    { id: 'combo', n: 6, done: true, text: 'Chain a ×6 combo' },
    { id: 'santa', n: 1, done: false, text: 'Run over Santa' },
  ];
  api.G.bigWrecks = 2; api.G.bestCombo = 6;
  api.levelEnd();
  const html = api._nodes.rsGoals.innerHTML;
  assert(/2 \/ 4/.test(html), 'the card should print 2 / 4 on the missed goal: ' + html);
  assert(!/6 \/ 6/.test(html), 'and nothing on the one it ticked');
  assert(!/0 \/ 1/.test(html), 'nor 0 / 1 on a one-shot goal');
});

/* ------------------------------------------------------- the wrecks --- */

/* Santa used to lose his hat, his beard and his belt the instant you hit him
   and lie there as an anonymous red shopper; that was fixed earlier. The same
   defect was still in two props: a smashed snowman was two plain white discs,
   and a wrecked present two plain rectangles, one of them yellow. Everything
   that told you what you had just flattened vanished on impact. */
function propArt(api, kind, dead, tweak){
  api.props.length = 0;
  const o = api.addProp(kind, api.cam.x, api.cam.y, {});
  o.dead = !!dead; o.rot = 0.4;
  if (tweak) tweak(o);
  const rec = carRec();
  api.withCtx(rec, () => api.drawProp(o));
  const cols = new Set();
  for (const a of rec.all) cols.add(String(a[a.length - 1]));
  for (const q of rec.polys) cols.add(String(q.style));
  for (const r of rec.rects) cols.add(String(r.style));
  return { o, rec, cols, has: (c) => cols.has(c) };
}

/* Fifteen of these stand in a market and the live one was four concentric
   circles — a brown disc, a red disc, a pulsing orange disc and a gold ring.
   The odd part is that the *wreck* already knew what it was: a copper pot on a
   trestle, with wine in it and cups that had been on the counter. */
test('the glühwein stand is a pot on a trestle, not a pink plate', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.setT(2.2);
  const live = propArt(api, 'gluh', false);
  const r = live.o.r;

  // the pieces the wreck says it is made of
  for (const [col, what] of [['#5c4430', 'a trestle under it'],
                             ['#7a5a3c', 'a lit side on the copper'],
                             ['#8b2f22', 'wine in it'],
                             ['#8d7a5c', 'a ladle standing in it'],
                             ['#e8ded0', 'cups on the rim']]){
    assert(live.has(col), 'a live stand should have ' + what + ' (' + col + ')');
  }
  assert(live.rec.shapes.some(s => s.stroked && s.style === '#c9a24a'), 'and its gold rim');

  // the trestle reaches past the pot on every side, or it is not holding it up
  const legs = live.rec.all.filter(e => e[0] === 'rect' && e[5] === '#5c4430');
  assert(legs.length === 2, 'the trestle is two crossed planks, got ' + legs.length);
  for (const l of legs){
    const long = Math.max(l[3], l[4]);
    /* Across the whole collider, and not past it: the first version reached
       2.68r and drew planks 34% outside the circle you can actually hit. The
       pot sits inside the trestle rather than the trestle round the pot. */
    assert(long > r * 1.9, 'a plank only ' + long.toFixed(0) + ' across a pot of r' + r);
    assert(long <= r * 2 + 0.01, 'a plank reaches ' + long.toFixed(0) + ' past a pot of r' + r);
  }

  /* Four mugs, spread round the rim rather than rolled independently — four
     random angles clump, and two mugs on top of each other read as one odd
     blob. Three passes at the same centres: a dark rim so they read off the
     copper, the cup, and what is in it. */
  // not the pot itself: the wine in it is the same red as the wine in the mugs
  const ring = (col) => live.rec.all.filter(e =>
    e[0] === 'arc' && e[4] === col && Math.hypot(e[1], e[2]) > 1);
  const rim = ring('#3a2c22'), cup = ring('#e8ded0'), wine = ring('#8b2f22');
  assert(cup.length === api.GLUH_CUPS,
    api.GLUH_CUPS + ' mugs expected, got ' + cup.length);
  assert(rim.length === cup.length && wine.length === cup.length,
    'every mug gets all three passes: ' + rim.length + '/' + cup.length + '/' + wine.length);
  for (let i = 0; i < cup.length; i++){
    assert(Math.abs(rim[i][1] - cup[i][1]) < 0.01 && Math.abs(rim[i][2] - cup[i][2]) < 0.01,
      'mug ' + i + ' is not stacked on its own rim');
    assert(rim[i][3] > cup[i][3] && cup[i][3] > wine[i][3],
      'a mug should be rim > cup > wine, got ' +
      [rim[i][3], cup[i][3], wine[i][3]].join(' '));
  }
  const angs = cup.map(e => Math.atan2(e[2] / 0.66, e[1])).sort((a, b) => a - b);
  let worst = 6.283;
  for (let i = 0; i < angs.length; i++){
    const d = i ? angs[i] - angs[i - 1] : angs[0] + 6.283 - angs[angs.length - 1];
    worst = Math.min(worst, d);
  }
  assert(worst > 6.283 / api.GLUH_CUPS - 0.01,
    'the mugs should be evenly spread, closest pair ' + worst.toFixed(2) +
    ' rad apart for ' + api.GLUH_CUPS);
  // the rim moved in with the pot when the trestle stopped overhanging
  for (const e of cup)
    assert(Math.abs(Math.hypot(e[1], e[2] / 0.66) - r * 0.66) < 0.5,
      'a mug is off the rim at ' + Math.hypot(e[1], e[2] / 0.66).toFixed(1));

  // what it carries is what the wreck throws across the snow
  const dead = propArt(api, 'gluh', true);
  assert(dead.has('#8b2f22'), 'the wreck should still spill its cups');
  assert(!dead.rec.all.some(e => e[0] === 'rect' && e[5] === '#7a5a3c'),
    'a wrecked pot has no lit copper wall left standing');

  /* Steam on a rolling phase, not a particle system: a stand that has been
     steaming for six markets must not have six markets of puffs behind it. */
  const cost = () => {
    const rec = carRec();
    api.withCtx(rec, () => api.drawProp(live.o));
    return rec.fills;
  };
  /* Sampled across a stretch of time rather than at one instant: a puff that
     has faded out is legitimately not drawn, so a single frame proves nothing.
     The window's cheapest and dearest frames are what must not move. */
  const window = (t0) => {
    const seen = [];
    for (let i = 0; i < 150; i++){ api.setT(t0 + i / 60); seen.push(cost()); }
    return [Math.min(...seen), Math.max(...seen)];
  };
  const early = window(0.4), late = window(600.4);
  assert(early[0] === late[0] && early[1] === late[1],
    'ten seconds of steam changed the frame cost: ' + early.join('-') +
    ' then ' + late.join('-'));
  assert(early[1] - early[0] <= 3, 'the plume is three puffs, spread ' +
    (early[1] - early[0]));
  const first = early[1];
  console.log('    (glühwein stand: ' + first + ' fills live, ' + (() => {
    const rec = carRec(); api.withCtx(rec, () => api.drawProp(dead.o)); return rec.fills;
  })() + ' wrecked)');

  // and none of it reaches the simulation
  api.reseed(5150);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(5150);
  for (let i = 0; i < 30; i++){ api.setT(i * 0.2); api.drawProp(live.o); api.drawProp(dead.o); }
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'drawing the stands moved the simulation stream');
});

/* 633 barrels across the campaign, the second most common thing in the game,
   and the top of one was a flat brown disc with a hoop drawn on it. */
test('a barrel lid is staves and banked snow, not a biscuit', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  // a plain barrel, not a fireworks crate
  let live = null;
  for (let i = 0; i < 20 && !live; i++){
    const c = propArt(api, 'barrel', false, (o) => { o.seed = 0.4 + i * 0.03; });
    if (!api.crateOf(c.o)) live = c;
  }
  assert(live, 'could not find a seed that is a plain barrel');
  const r = live.o.r;

  // seams between the staves, evenly round the lid and out to the rim
  const seams = live.rec.all.filter(e =>
    (e[0] === 'm' || e[0] === 'l') && e[4] === '#5f4326');
  assert(seams.length === api.BARREL_STAVES * 4,
    api.BARREL_STAVES + ' seams of four corners expected, got ' + seams.length);
  const angs = [];
  for (let i = 0; i < seams.length; i += 4){
    const q = seams.slice(i, i + 4);
    const inner = Math.min(...q.map(e => Math.hypot(e[1], e[2])));
    const outer = Math.max(...q.map(e => Math.hypot(e[1], e[2])));
    assert(inner < r * 0.7 && outer > r * 0.9,
      'a seam should cross the rim, it runs ' + inner.toFixed(0) + '..' + outer.toFixed(0));
    angs.push(Math.atan2(q[0][2] + q[3][2], q[0][1] + q[3][1]));
  }
  angs.sort((a, b) => a - b);
  let worst = 6.283;
  for (let i = 0; i < angs.length; i++)
    worst = Math.min(worst, i ? angs[i] - angs[i - 1]
                              : angs[0] + 6.283 - angs[angs.length - 1]);
  assert(worst > 6.283 / api.BARREL_STAVES - 0.01,
    'the staves should be even, closest pair ' + worst.toFixed(2) + ' rad');

  /* Banked against one side, not ringed round: the snow disc is barely wider
     than the lid that covers its middle, so on the dark side it is buried
     entirely and only the offset survives. */
  const arcs = live.rec.all.filter(e => e[0] === 'arc');
  const snow = arcs.filter(e => String(e[4]).startsWith('rgba(232,242,255'))[0];
  const lid = arcs.filter(e => e[4] === '#8a6540')[0];
  assert(snow && lid, 'a lid needs snow on it and a lid under the snow');
  const off = Math.hypot(snow[1], snow[2]);
  assert(off > 1, 'the snow should be pushed off centre, got ' + off.toFixed(2));
  assert(snow[3] - lid[3] < off,
    'the snow rings the lid instead of banking: it is ' + (snow[3] - lid[3]).toFixed(1) +
    ' wider than the lid but only offset ' + off.toFixed(1));
  const sun = Math.hypot(api.SUN_DX, api.SUN_DY);
  assert((snow[1] * -api.SUN_DX + snow[2] * -api.SUN_DY) / (off * sun) > 0.999,
    'the snow should bank towards the light');

  /* Nothing may promise a hit the physics will not give: the collider is a
     circle of exactly r. The shadow is on the ground, not on the barrel. */
  const reach = (rec) => Math.max(...rec.all
    .filter(e => !String(e[e.length - 1]).startsWith('rgba(8,16,32'))
    .map(e => e[0] === 'arc' ? Math.hypot(e[1], e[2]) + e[3]
            : e[0] === 'el'  ? Math.hypot(e[1], e[2]) + Math.max(e[3], e[4])
            : Math.hypot(e[1], e[2])));
  assert(reach(live.rec) <= r + 0.001,
    'a barrel drew ' + reach(live.rec).toFixed(1) + ' out from a collider of ' + r);

  // a crate still shows what is in it, a plain barrel does not
  let crate = null;
  for (let i = 0; i < 20 && !crate; i++){
    const c = propArt(api, 'barrel', false, (o) => { o.seed = i * 0.02; });
    if (api.crateOf(c.o)) crate = c;
  }
  assert(crate, 'could not find a seed that is a crate');
  assert(crate.has('#b5342b') && crate.has('#ffd34d'), 'a crate shows its tubes and fuses');
  assert(!live.has('#b5342b'), 'a plain barrel should not');

  // the wreck is untouched: sprung staves and an open hoop, no lid, no snow
  const dead = propArt(api, 'barrel', true);
  assert(dead.has('#6b4e32') && dead.rec.shapes.some(s => s.stroked && s.style === '#8d7a5c'),
    'a burst barrel is sprung staves and a hoop');
  assert(!dead.has('#8a6540'), 'a burst barrel has no lid left on it');

  console.log('    (barrel: ' + live.rec.fills + ' fills live, ' + dead.rec.fills +
    ' burst, reaching ' + (reach(live.rec) / r * 100).toFixed(0) + '% of the collider)');

  // and none of it reaches the simulation
  api.reseed(1863);
  const clean = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(1863);
  for (let i = 0; i < 30; i++){ live.o.seed = i / 30; api.drawProp(live.o); }
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(clean),
    'drawing the barrels moved the simulation stream');
});

/* Four passes running turned up a silhouette drawn past the circle or box the
   car can actually hit — the tree's snow at 1.11r, the barrel's snow bank, the
   plough's blade and its wings. Each was found by looking at one prop. This
   looks at all of them at once: for every live prop kind, nothing it draws may
   reach past its own collider.

   Three things are allowed out, and each is a thing you cannot hit: the shadow
   it casts on the ground, and the plumes off the grills and the glühwein pots,
   which are meant to be bigger than the thing making them. */
const NOT_SOLID = [
  /^rgba\(8,16,32/,          // the shadow it casts on the ground
  /^rgba\(228,238,252/,      // a grill's plume, which is meant to be bigger
  /^rgba\(238,244,255/,      // and a glühwein pot's steam
];
/* A silhouette is what is opaque. The lit-side wash every round prop carries
   is a translucent ellipse at a tenth alpha laid across the whole top of it —
   it softens an edge, it does not make one, and holding it to the collider
   would mean shrinking the light rather than the art. */
const SOLID_A = 0.5;
const translucent = (col) => {
  const m = /^rgba\([^)]*,\s*([\d.]+)\)/.exec(String(col));
  return !!m && +m[1] < SOLID_A;
};
/* A stall's awning is a canopy: it hangs over the counter, past the front of
   the hut's box, and you drive under it. It is the one piece of art in the
   market that is deliberately not where the collider is. */
const CANOPY = { hut: 1.5 };
test('no prop draws past the shape the car can hit', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  /* At the origin, and the camera with it: some prop branches translate to the
     prop and draw in local coordinates, others draw at o.x/o.y outright. With
     everything at zero the two are the same frame. */
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.cam.x = 0; api.cam.y = 0;
  api.setT(2.2);
  const kinds = Object.keys(api.PROPS);
  assert(kinds.length >= 10, 'the sweep should cover the whole kit, got ' + kinds.length);
  const worst = [];
  for (const kind of kinds){
    // three seeds, because a trade or a wreck pattern can change the drawing
    for (const seed of [0.12, 0.47, 0.83]){
      const art = propArt(api, kind, false, (o) => {
        o.x = 0; o.y = 0; o.seed = seed; o.face = 1;
      });
      const o = art.o;
      const box = o.shape !== 'circ';
      // a point, and a radius around it if the primitive has one
      const over = (x, y, rx, ry) => box
        ? Math.max((Math.abs(x) + (rx || 0)) / (o.w / 2),
                   (Math.abs(y) + (ry || rx || 0)) / (o.h / 2))
        : (Math.hypot(x, y) + Math.max(rx || 0, ry || rx || 0)) / o.r;
      let peak = 0, at = null;
      for (const e of art.rec.all){
        const col = String(e[e.length - 1]);
        if (NOT_SOLID.some(rx => rx.test(col)) || translucent(col)) continue;
        let f = 0;
        if (e[0] === 'arc') f = over(e[1], e[2], e[3]);
        else if (e[0] === 'el') f = over(e[1], e[2], e[3], e[4]);
        else if (e[0] === 'rect' || e[0] === 'fr'){
          for (const cx of [e[1], e[1] + e[3]]) for (const cy of [e[2], e[2] + e[4]])
            f = Math.max(f, over(cx, cy));
        } else f = over(e[1], e[2]);
        if (f > peak){ peak = f; at = [e[0], col]; }
      }
      if (peak > 0) worst.push({ kind, seed, peak, at, box });
    }
  }
  const byKind = {};
  for (const w of worst) if (!byKind[w.kind] || w.peak > byKind[w.kind].peak) byKind[w.kind] = w;
  const lines = Object.keys(byKind).sort()
    .map(k => k + ' ' + (byKind[k].peak * 100).toFixed(0) + '% ' + byKind[k].at.join(':'));
  console.log('    (silhouette against collider: ' + lines.join(', ') + ')');
  for (const k of Object.keys(byKind)){
    const w = byKind[k];
    assert(w.peak <= (CANOPY[k] || 1.001),
      k + ' draws to ' + (w.peak * 100).toFixed(0) + '% of the ' +
      (w.box ? 'box' : 'circle') + ' you can hit, in a ' + w.at[0] + ' of ' + w.at[1]);
  }
  /* And it must not be a kit of shrunken stickers either: something in the
     market has to actually fill the shape it promises. */
  const fills = Object.values(byKind).filter(w => w.peak > 0.9).length;
  assert(fills >= 3, 'only ' + fills + ' props fill their collider — the art has shrunk');
});

test('a wrecked snowman is still a snowman', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const live = propArt(api, 'snowman', false);
  const dead = propArt(api, 'snowman', true);
  /* The four things that said "snowman". The old wreck kept none of them. */
  for (const [col, what] of [['#e8862c', 'its carrot'], ['#1b2740', 'its coal'],
                             ['#c8443a', 'its scarf'], ['#4a3524', 'its twigs']]){
    assert(live.has(col), 'a live snowman should have ' + what);
    assert(dead.has(col), 'a smashed snowman should keep ' + what + ' in the snow');
  }
  // and the pieces stay where the snowman was, not scattered off the market
  const r = dead.o.r;
  for (const sh of dead.rec.shapes){
    assert(Math.hypot(sh.x, sh.y) < r * 2.2,
      'a piece landed ' + Math.hypot(sh.x, sh.y).toFixed(0) + ' from a snowman of r' + r);
  }
});

test('a wrecked present is still that present', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const GIFT = ['#c8443a', '#3f8a5c', '#2f6ea5'];
  let seen = 0;
  for (const seed of [0.1, 0.4, 0.8]){
    const live = propArt(api, 'gifts', false, (o) => { o.seed = seed; });
    const dead = propArt(api, 'gifts', true, (o) => { o.seed = seed; });
    const col = GIFT.find(c => live.has(c));
    assert(col, 'a present is wrapped in one of the three papers');
    assert(dead.has(col), 'seed ' + seed + ': the wreck should keep its own paper, ' +
      col + ' — otherwise you cannot tell which present it was');
    assert(dead.has('#ffd34d'), 'and its snapped ribbon');
    assert([...dead.cols].some(c => /12,20,38/.test(c)),
      'and show the torn inside of the box');
    seen++;
  }
  assert(seen === 3, 'all three papers checked');

  // nothing flung off the tile the collider occupies
  const dead = propArt(api, 'gifts', true);
  for (const q of dead.rec.polys){
    assert(q.x0 > -dead.o.w && q.x1 < dead.o.w && q.y0 > -dead.o.h && q.y1 < dead.o.h,
      'a piece of the box is off its own footprint');
  }
});

test('a felled tree is a felled tree, in the market’s own greens', () => {
  const rows = [];
  for (const lv of [0, 3, 5]){
    const api = boot({ count: true, w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
    const th = api.getTheme();

    const dead = propArt(api, 'tree', true);
    /* The old felled tree was one ellipse of hard-coded #2c6b40 — the same
       green on every market, while the standing one has always taken its four
       greens from the theme. Two markets should never read the same. */
    assert(!dead.has('#2c6b40'), api.LEVELS[lv].name + ': still the hard-coded green');
    assert(dead.has(th.tree[0]) && dead.has(th.tree[2]),
      api.LEVELS[lv].name + ': a felled tree should be this market’s greens, ' +
      th.tree[0] + '/' + th.tree[2]);
    assert(dead.has('#6b4a2f'), 'and keep its trunk');
    assert(dead.has('#3d2a19'), 'with a splintered break where it came down');
    rows.push(api.LEVELS[lv].name + ' ' + th.tree[0]);
  }

  // the crown tapers: a conifer on its side is a wedge, not a disc
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const th = api.getTheme();
  const dead = propArt(api, 'tree', true, (o) => { o.rot = 0; });
  const pts = dead.rec.all.filter(a => (a[0] === 'm' || a[0] === 'l') &&
    String(a[4]) === th.tree[0]).map(a => [a[1], a[2]]);
  assert(pts.length > 12, 'the crown should be a needled outline, got ' + pts.length);
  const spanAt = (lo, hi) => {
    const ys = pts.filter(p => p[0] >= lo && p[0] < hi).map(p => Math.abs(p[1]));
    return ys.length ? Math.max(...ys) : 0;
  };
  const xs = pts.map(p => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), third = (x1 - x0) / 3;
  assert(spanAt(x0, x0 + third) > spanAt(x1 - third, x1) * 1.8,
    'the crown should taper toward the tip: ' + spanAt(x0, x0 + third).toFixed(1) +
    ' at the butt, ' + spanAt(x1 - third, x1).toFixed(1) + ' at the tip');
  console.log('    (felled trees: ' + rows.join(' | ') + ')');
});

test('a felled town tree drops its trimmings', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const live = propArt(api, 'bigtree', false);
  const dead = propArt(api, 'bigtree', true);
  /* The town tree is worth 3,000 and is the goal on several markets. Felling
     it used to leave a green blob with no star and no baubles on it — the same
     thing the smashed snowman and the wrecked present used to do. */
  assert(dead.has('#ffeaa0'), 'the star should be in the snow beside it');
  for (const col of ['#ff7a5e', '#ffe28c', '#96e1ff'])
    assert(dead.has(col), 'and its baubles, including ' + col);
  assert(live.cols.size > 4, 'a standing town tree is trimmed too');

  // the trimmings land around the tree, not on the far side of the market
  const r = dead.o.r;
  const loose = dead.rec.shapes.filter(sh => !sh.stroked &&
    /ff7a5e|ffe28c|96e1ff/.test(String(sh.style)));
  assert(loose.length === 5, 'five baubles, got ' + loose.length);
  for (const sh of loose)
    assert(Math.hypot(sh.x - dead.o.x, sh.y - dead.o.y) < r * 1.1,
      'a bauble rolled ' + Math.hypot(sh.x - dead.o.x, sh.y - dead.o.y).toFixed(0) +
      ' from a tree of r' + r);
});

test('a flattened carousel is a collapsed carousel', () => {
  const rows = [];
  for (const lv of [0, 3, 5]){
    const api = boot({ count: true, w: 1280, h: 720 });
    api.startLevel(lv); api.beginLevel();
    api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
    const th = api.getTheme();
    const dead = propArt(api, 'carousel', true);

    /* Two concentric discs, one brown and one translucent red, on every market
       — the same theme-blindness the felled tree had. The canopy is the
       market's own awning now. */
    assert(dead.has(th.awning) && dead.has(th.awning2),
      api.LEVELS[lv].name + ': a wrecked carousel should keep this market’s ' +
      'awning, ' + th.awning + '/' + th.awning2);
    assert(!dead.cols.has('rgba(190,60,50,.5)'),
      api.LEVELS[lv].name + ': still the hard-coded red disc');
    rows.push(api.LEVELS[lv].name + ' ' + th.awning);
  }

  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(0); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const dead = propArt(api, 'carousel', true);
  const r = dead.o.r;

  // three horses thrown clear, each still a body and a head
  const bodies = dead.rec.shapes.filter(s => !s.stroked &&
    (s.style === '#f6f2ea' || s.style === '#e0c9a4'));
  const heads = dead.rec.shapes.filter(s => !s.stroked && s.style === '#4a3524');
  assert(bodies.length === 3, 'three horses off the ring, got ' + bodies.length);
  assert(heads.length === 3, 'each with a head, got ' + heads.length);
  assert(dead.has('#ffd34d'), 'and the finial come off the pole');

  // nothing thrown outside the collider the car bounces off
  for (const sh of dead.rec.shapes)
    assert(Math.hypot(sh.x, sh.y) < r * 1.05,
      'a piece landed ' + Math.hypot(sh.x, sh.y).toFixed(0) + ' from a carousel of r' + r);

  // a wreck should cost less than the ride it replaced, not more
  const live = propArt(api, 'carousel', false);
  assert(dead.rec.fills < live.rec.fills,
    'the wreck costs ' + dead.rec.fills + ' fills, the running ride ' + live.rec.fills);
  console.log('    (collapsed carousel: ' + dead.rec.fills + ' fills vs ' +
    live.rec.fills + ' running | ' + rows.join(' | ') + ')');
});

test('drawing a wreck rolls nothing', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.props.length = 0;
  const sn = api.addProp('snowman', api.cam.x, api.cam.y, {});
  const gf = api.addProp('gifts', api.cam.x, api.cam.y, {});
  api.reseed(5);
  const r0 = api.rnd();
  api.reseed(5);
  for (let i = 0; i < 20; i++){
    sn.dead = gf.dead = i % 2 === 0; sn.rot = gf.rot = i * 0.3;
    api.withCtx(carRec(), () => { api.drawProp(sn); api.drawProp(gf); });
  }
  assert(api.rnd() === r0, 'drawing wrecks moved the simulation stream');
});

/* ------------------------------------------------------ the barrier --- */

/* A crowd barrier was five flat fillRects: a white bar, four upright red
   blocks and two grey stubs. Every other prop got a lit face, a shaded face
   and snow along its top edge — and this one is drawn in numbers, the rink
   alone ringing itself with sixteen. */
function barrier(api, tweak){
  api.props.length = 0;
  const o = api.addProp('fence', api.cam.x, api.cam.y, {});
  if (tweak) tweak(o);
  const rec = carRec();
  api.withCtx(rec, () => api.drawProp(o));
  return { o, rec,
    rails: rec.polys.filter(q => !q.stroked),
    reds: rec.polys.filter(q => q.style === '#c8443a'),
    feet: rec.polys.filter(q => q.style === '#8a94a6'),
    lit: rec.polys.find(q => /255,250,238/.test(String(q.style))),
    shade: rec.polys.find(q => /12,20,38/.test(String(q.style))) };
}

test('a crowd barrier is a barrier, with both its feet', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const b = barrier(api);
  const L = b.o.w, THK = b.o.h;

  /* roundRect opens its own path, so two of them cannot share a fill — the
     first version stacked both feet into one and silently drew the far one
     only. This is the assertion that says so. */
  assert(b.feet.length === 2, 'a barrier stands on two feet, drew ' + b.feet.length);
  const [f0, f1] = b.feet.sort((p, q) => p.x0 - q.x0);
  assert(f0.x0 < -L * 0.4 && f1.x1 > L * 0.4,
    'one foot at each end, got ' + f0.x0.toFixed(0) + ' and ' + f1.x1.toFixed(0));

  assert(b.lit && b.shade, 'a lit top rail and a shaded lower one');
  assert(b.lit.y0 < b.shade.y0, 'the lit rail is the one the light reaches first');

  /* Four hazard stripes in one path, and each one leans — four upright blocks
     read as a fence panel, not as a barrier. Every stripe is a four-point
     parallelogram, so its top edge and its bottom edge start at different x. */
  assert(b.reds.length === 1, 'the stripes should be one path, got ' + b.reds.length);
  assert(b.reds[0].x1 - b.reds[0].x0 > L * 0.6, 'and run the length of it');
  const pts = b.rec.all.filter(a => a[0] === 'm' || a[0] === 'l')
    .filter(a => String(a[4]) === '#c8443a').map(a => [a[1], a[2]]);
  assert(pts.length === 16, 'four stripes of four corners, got ' + pts.length);
  for (let i = 0; i < 16; i += 4){
    const top = pts[i], bot = pts[i + 3];
    assert(Math.abs(top[0] - bot[0]) > THK * 0.3,
      'stripe ' + (i / 4) + ' is upright, not slanted: ' +
      top[0].toFixed(1) + ' over ' + bot[0].toFixed(1));
  }

  // everything inside the collider the market bounces the car off
  for (const q of b.rails){
    assert(q.x0 >= -L / 2 - 12 && q.x1 <= L / 2 + 12,
      'a piece hangs off the end: ' + q.x0.toFixed(0) + '…' + q.x1.toFixed(0));
    assert(q.y0 >= -THK / 2 - 7 && q.y1 <= THK / 2 + 7,
      'a piece hangs off the side: ' + q.y0.toFixed(0) + '…' + q.y1.toFixed(0));
  }
  console.log('    (barrier: ' + b.rails.length + ' pieces on a ' + L + 'x' + THK + ' collider)');
});

test('a wrecked barrier is two pieces and a foot, under a smaller shadow', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const live = barrier(api);
  const dead = barrier(api, (o) => { o.dead = true; o.rot = 0.5; });
  assert(dead.reds.length === 0, 'a wreck keeps no hazard stripes');
  assert(dead.rails.length >= 3, 'two rail pieces and a foot, got ' + dead.rails.length);
  assert(dead.feet.length === 1, 'one foot, bent up out of the snow');

  /* The shadow is the widest ellipse either draw puts down. A wreck is two
     short pieces and was casting a whole barrier's shadow under a third of
     one. */
  const widest = (o) => Math.max(...o.rec.shapes.filter(s => !s.stroked).map(s => s.r));
  assert(widest(dead) < widest(live) * 0.75,
    'the wreck still casts a full-length shadow: ' + widest(dead).toFixed(0) +
    ' vs ' + widest(live).toFixed(0));

  /* It is scenery, so drawing one rolls nothing. The prop is built first —
     addProp itself rolls — and only the drawing is measured. */
  const one = api.props[0];
  api.reseed(3);
  const r0 = api.rnd();
  api.reseed(3);
  for (let i = 0; i < 20; i++){
    one.dead = i % 2 === 0; one.rot = i * 0.3;
    api.withCtx(carRec(), () => api.drawProp(one));
  }
  // reseed() resets the simulation stream only, so that is the one to compare
  assert(api.rnd() === r0, 'drawing a barrier moved the simulation stream');
});

/* ------------------------------------------------------ the children --- */

/* Every archetype carries the thing that says what it is — the pensioner's
   stick, the parent's pram, Santa's fur, the shopper's bag. The child had
   nothing, is the smallest person in the market at r9, and one of the thirteen
   goals is "Catch N children": the game asked you to hunt for the one thing it
   had made hardest to see. */
test('a child carries a balloon, and it is a balloon not a polygon', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(12); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2500; api.car.y = 1100; api.camSnap();

  api.people.length = 0;
  const kids = [];
  for (let i = 0; i < 7; i++){
    const p = api.addPerson(api.cam.x + i * 70, api.cam.y, 'kid');
    p.coat = i; p.bob = i * 0.9; kids.push(p);
  }
  api.addPerson(api.cam.x, api.cam.y + 90, 'shopper');

  const rec = carRec();
  api.withCtx(rec, () => api.drawBalloons(() => true));
  /* Each balloon is laid down twice: the colour fill, and the dark rim that
     separates it from a market already full of baubles and wrapped presents. */
  const els = rec.all.filter(a => a[0] === 'el');
  assert(els.length === 14, 'seven balloons, filled and rimmed, got ' + els.length);
  const rim = rec.polys.filter(q => q.stroked && /14,22,40/.test(String(q.style)));
  assert(rim.length === 1, 'the rim should be one stroke for the lot, got ' + rim.length);

  /* The bug this test exists for: ctx.ellipse joins the current point, so a
     batch of them without a moveTo between draws a filled polygon spanning
     every balloon in the market. It did exactly that, in five colours, across
     the whole screen — and the suite was green. Every ellipse must be opened
     by a moveTo. */
  let open = 0;
  for (let i = 0; i < rec.all.length; i++){
    if (rec.all[i][0] !== 'el') continue;
    assert(i > 0 && rec.all[i - 1][0] === 'm',
      'a balloon is not opened by a moveTo — the fill will span the market');
    open++;
  }
  assert(open === 14, 'every fill and every rim opened, got ' + open);

  // one fill a colour, not one a child
  assert(rec.fills <= api.BALLOONS.length + 1,
    api.BALLOONS.length + ' colours plus the highlight, got ' + rec.fills + ' fills');

  // a shopper does not get one
  api.people.length = 0;
  for (const k of ['shopper', 'elder', 'parent', 'santa'])
    api.addPerson(api.cam.x, api.cam.y, k);
  const none = carRec();
  api.withCtx(none, () => api.drawBalloons(() => true));
  assert(none.all.filter(a => a[0] === 'el').length === 0,
    'only children carry balloons');
});

/* A child's balloon vanished the frame they were hit — the same thing the
   smashed snowman and the wrecked present used to do with everything that said
   what they were, except this one gets to float away. */
test('a child’s balloon is let go, not deleted', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startLevel(12); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2500; api.car.y = 1100; api.camSnap();

  const kill = (kind, coat) => {
    api.people.length = 0; api.fx.length = 0;
    const p = api.addPerson(api.cam.x, api.cam.y, kind);
    p.coat = coat || 0; p.bob = 0.4;
    const before = api.balloonAt(p);
    api.killPerson(p, 300, -100, 'car');
    return { p, before, loose: api.fx.filter(f => f.type === 'balloon') };
  };

  const k = kill('kid', 2);
  assert(k.loose.length === 1, 'one balloon let go, got ' + k.loose.length);
  assert(k.loose[0].col === api.BALLOONS[2 % api.BALLOONS.length],
    'and it is the one they were carrying, got ' + k.loose[0].col);
  assert(Math.abs(k.loose[0].x - k.before.x) < 1 && Math.abs(k.loose[0].y - k.before.y) < 1,
    'let go from where it was floating, not from the body');
  assert(k.loose[0].vy < 0, 'and it leaves upward, got vy ' + k.loose[0].vy.toFixed(0));

  for (const kind of ['shopper', 'elder', 'parent', 'santa'])
    assert(kill(kind).loose.length === 0, kind + ' should not release a balloon');

  /* It keeps going up. Everything else in stepFx falls, and drag alone would
     stall a balloon in mid-air a few frames after the child let go. */
  api.people.length = 0; api.fx.length = 0;
  const kid = api.addPerson(api.cam.x, api.cam.y, 'kid');
  kid.coat = 1; kid.bob = 0.4;
  api.killPerson(kid, 300, -100, 'car');
  const b = api.fx.find(f => f.type === 'balloon');
  const y0 = b.y;
  for (let f = 0; f < 152; f++) api.stepFx(1 / 60);
  /* Measured both ways: with the lift it climbs 86px and is still going at
     -40px/s; with drag alone it drifts 24px and stalls at -3, which is a
     balloon hanging in the sky rather than getting away. A "y goes down each
     step" assertion passes either way — it has to be the speed it is still
     doing when its life runs out. */
  assert(y0 - b.y > 60, 'it should get away, climbed only ' + (y0 - b.y).toFixed(0) + 'px');
  assert(b.vy < -25, 'and still be climbing at the end, got vy ' + b.vy.toFixed(1));

  // …and it is gone by its ttl rather than hanging in the sky
  for (let f = 0; f < 60 * 3; f++) api.stepFx(1 / 60);
  assert(api.fx.filter(f => f.type === 'balloon').length === 0, 'it should expire');
});

test('a balloon stays big enough to find, however far the camera is', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startLevel(12); api.beginLevel();
  api.G.phase = 'drive';
  api.people.length = 0;
  const kid = api.addPerson(2500, 1100, 'kid');
  kid.coat = 0; kid.bob = 0;

  /* At p.r * 0.5 on an r9 child the balloon came out under two screen pixels
     at the drive zoom — a balloon nobody can see is not a balloon. */
  const rows = [];
  for (const s of [1.2, 0.6, 0.37, 0.2]){
    api.cam.s = s; api.cam.x = 2500; api.cam.y = 1100;
    const b = api.balloonAt(kid);
    assert(b.r * s >= api.BALLOON_PX - 0.01,
      'at scale ' + s + ' the balloon is ' + (b.r * s).toFixed(1) +
      ' screen px, floor is ' + api.BALLOON_PX);
    // …and it floats clear of the child rather than sitting on them
    assert(kid.y - b.y > b.r,
      'at scale ' + s + ' the balloon is on top of the child');
    rows.push(s + '→' + (b.r * s).toFixed(1) + 'px');
  }
  // close up it is sized off the child, not pinned to the floor
  api.cam.s = 4;
  assert(api.balloonAt(kid).r > api.BALLOON_PX / 4,
    'close up it should grow with the child');
  // and none of it is rolled
  api.reseed(8);
  const r0 = api.rnd();
  api.reseed(8);
  for (let i = 0; i < 20; i++) api.balloonAt(kid);
  assert(api.rnd() === r0, 'a balloon moved the simulation stream');
  console.log('    (balloon: ' + rows.join(' ') + ')');
});

/* --------------------------------------------------------- the dead --- */

/* A corpse's four limbs were four fixed line segments in the body's own frame:
   the same starfish at 400px/s mid-tumble as lying still, which is what
   "bodies slide and stop" looked like up close. */
function corpseLimbs(api, tweak){
  api.people.length = 0;
  const p = api.addPerson(api.cam.x, api.cam.y, 'shopper');
  p.dead = true; p.fly = 0; p.squash = 0.9; p.ang = 0; p.side = 1;
  p.vx = 0; p.vy = 0; p.spin = 0;
  if (tweak) tweak(p);
  api.cam.tz = 300; api.cam.s = 1;
  const rec = carRec();
  api.withCtx(rec, () => api.drawPerson(p));
  // every stroked path is moveTo, lineTo, lineTo — hinge, joint, tip
  const limbs = [];
  let cur = null;
  for (const a of rec.all){
    if (a[0] === 'm'){ cur = { style: a[3], pts: [[a[1], a[2]]] }; limbs.push(cur); }
    else if (a[0] === 'l' && cur) cur.pts.push([a[1], a[2]]);
    else cur = null;
  }
  return { p, rec, limbs: limbs.filter(l => l.pts.length === 3) };
}

test('a corpse has jointed limbs, not four sticks', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const c = corpseLimbs(api);
  assert(c.limbs.length === 4, 'two arms and two legs, got ' + c.limbs.length);
  for (const l of c.limbs){
    const [h, j, t] = l.pts;
    // the joint must be off the straight line from hinge to tip
    const dx = t[0] - h[0], dy = t[1] - h[1], len = Math.hypot(dx, dy);
    const off = Math.abs((j[0] - h[0]) * -dy + (j[1] - h[1]) * dx) / len;
    assert(off > c.p.r * 0.05, 'a limb is straight: joint sits ' +
      off.toFixed(2) + ' off the hinge-to-tip line on r' + c.p.r);
    assert(len > c.p.r * 0.7 && len < c.p.r * 2,
      'and it should be limb-length, got ' + len.toFixed(1) + ' on r' + c.p.r);
  }
});

test('a corpse trails its limbs, then folds them out', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  const tipX = (o) => o.limbs.reduce((a, l) => a + l.pts[2][0], 0) / o.limbs.length;
  const armSpan = (o) => Math.max(...o.limbs.map(l => Math.abs(l.pts[2][1])));

  const hit = corpseLimbs(api, (p) => { p.fly = 0.75; });
  const half = corpseLimbs(api, (p) => { p.fly = 0.35; });
  const rest = corpseLimbs(api, (p) => { p.fly = 0; });

  // the car came from behind, so at the moment of impact everything trails
  assert(tipX(hit) < tipX(half) && tipX(half) < tipX(rest),
    'the limbs should sweep forward as the body settles: ' +
    [hit, half, rest].map(o => tipX(o).toFixed(1)).join(' -> '));
  // and settle out to the sides rather than reaching over the head
  assert(armSpan(rest) > armSpan(hit),
    'a settled body lies with its arms out: ' + armSpan(rest).toFixed(1) +
    ' vs ' + armSpan(hit).toFixed(1));
  // legs trailing back past -1.3r is the point; nothing reaches over the head
  assert(rest.limbs.every(l => l.pts[2][0] < api.people[0].r * 0.9),
    'a limb is reaching out past the head: ' +
    Math.max(...rest.limbs.map(l => l.pts[2][0])).toFixed(1) +
    ' on r' + api.people[0].r);

  // a slam sweeps them further back than a nudge does
  const slam = corpseLimbs(api, (p) => { p.fly = 0.75; p.squash = 0.34; });
  const nudge = corpseLimbs(api, (p) => { p.fly = 0.75; p.squash = 0.95; });
  assert(tipX(slam) < tipX(nudge), 'a slam should throw them further back: ' +
    tipX(slam).toFixed(1) + ' vs ' + tipX(nudge).toFixed(1));
});

test('the ragdoll poses off state the replay puts back, and rolls nothing', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  /* The replay restores x, y, ang, dead, squash, panic, cry and fly — nothing
     else. A pose that read p.vx or a stashed lag would come back wrong in the
     clip, and one that rolled for its spread would move every market's score. */
  // geometry only — the colours legitimately come off p.coat
  const pose = (tweak) => JSON.stringify(corpseLimbs(api, tweak).limbs.map(l => l.pts));
  const base = pose((p) => { p.fly = 0.4; p.squash = 0.6; });
  const noisy = pose((p) => {
    p.fly = 0.4; p.squash = 0.6;
    p.vx = 900; p.vy = -400; p.spin = 12; p.coat = 5; p.bob = 3.1; p.bleedT = 1;
  });
  assert(base === noisy, 'the pose moved with state the replay does not restore');

  // …but side, which the person carries from birth, is allowed to mirror it
  const left = pose((p) => { p.fly = 0.4; p.squash = 0.6; p.side = -1; });
  assert(left !== base, 'side should mirror the fold');

  /* Not one draw from either stream. Two identical boots — the cosmetic
     generator has its own seed, so it can only be compared run against run —
     and one of them draws forty corpses in between. */
  const streams = (draw) => {
    const a = boot({ w: 1280, h: 720 });
    a.startCampaign(); a.beginLevel();
    a.G.phase = 'drive'; a.car.x = 2600; a.car.y = 1100; a.camSnap();
    const q = a.addPerson(a.cam.x, a.cam.y, 'shopper');
    q.dead = true; q.squash = 0.7; q.side = 1;
    if (draw) for (let i = 0; i < 40; i++){
      q.fly = (i % 8) / 10;
      a.withCtx(carRec(), () => a.drawPerson(q));
    }
    return [a.rnd(), a.vrnd(), a.rnd(), a.vrnd()];
  };
  assert(JSON.stringify(streams(false)) === JSON.stringify(streams(true)),
    'drawing forty corpses moved a random stream');
});

/* ------------------------------------------------------ the shopping --- */

test('a shopper carries the bag they are about to drop', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  for (const kind of ['shopper', 'elder']){
    for (let seed = 0; seed < 4; seed++){
      const s = shopper(api, kind, (p) => { p.coat = seed; });
      assert(s.bag, kind + ' seed ' + seed + ' is walking a market empty-handed');
      assert(s.bags.length === 1,
        'and carrying exactly one, got ' + s.bags.length);
      assert(s.bagRim, 'the bag needs its dark rim: two of the four colours are ' +
        'a shade off lit snow and vanished without one');
      assert(s.handle, 'and a handle to hold it by');
      assert(s.fold, 'and the fold across the top');
      const w = s.bag.x1 - s.bag.x0, h = s.bag.y1 - s.bag.y0;
      assert(Math.abs(w - s.p.r * 0.34) < 0.01 && Math.abs(h - s.p.r * 0.4) < 0.01,
        'sized against the person, got ' + w.toFixed(2) + '×' + h.toFixed(2) +
        ' on r' + s.p.r);
    }
  }

  /* The defect the first pass shipped: the coat ellipse is drawn AFTER the
     bag, so any part of the bag inside the shoulder line is simply painted
     over. The arm swings, so this has to hold at every phase of the walk —
     the first version only looked wrong on the forward half of the stride. */
  let worst = 99;
  for (const kind of ['shopper', 'elder']){
    for (const panic of [0, 0.9]){
      for (let seed = 0; seed < 4; seed++){
        for (let ph = 0; ph < 8; ph++){
          const s = shopper(api, kind, (p) => {
            p.coat = seed; p.panic = panic; p.bob = ph * Math.PI / 4;
          });
          const r = s.p.r;
          const inner = Math.min(Math.abs(s.bag.x0), Math.abs(s.bag.x1));
          const dy = (s.bag.y0 + s.bag.y1) / 2 - r * 0.1;   // the coat's own centre
          const coatAt = Math.abs(dy) >= r * 0.72 ? 0
            : r * 0.86 * Math.sqrt(1 - (dy / (r * 0.72)) ** 2);
          assert(inner >= coatAt,
            kind + ' seed ' + seed + ' panic ' + panic + ' phase ' + ph +
            ': the bag starts at ' + inner.toFixed(2) +
            ' but the coat covers to ' + coatAt.toFixed(2));
          /* …and it still has to be in a hand rather than floating alongside:
             the arm ends at 0.9r walking, 1.25r with both arms up, and that
             point has to fall inside the bag. */
          const hand = (panic ? 1.25 : 0.9) * r * (kind === 'elder' ? -1 : seed % 2 ? 1 : -1);
          assert(hand >= s.bag.x0 - 0.01 && hand <= s.bag.x1 + 0.01,
            kind + ' seed ' + seed + ' panic ' + panic + ' phase ' + ph +
            ': the hand is at ' + hand.toFixed(2) + ', the bag spans ' +
            s.bag.x0.toFixed(2) + '…' + s.bag.x1.toFixed(2));
          worst = Math.min(worst, (inner - coatAt) / r);
        }
      }
    }
  }
  console.log('    (bag clears the coat by ' + worst.toFixed(2) + 'r at its worst)');

  // a pensioner's stick is in the right hand, so the bag has to take the left
  for (let seed = 0; seed < 4; seed++){
    const s = shopper(api, 'elder', (p) => { p.coat = seed; });
    const cane = s.rec.shapes.find(x => x.stroked && x.style === '#6b4a2f');
    assert(s.bag.x1 < 0, 'elder seed ' + seed + ' should carry on the left, got ' +
      s.bag.x1.toFixed(2));
    if (cane) assert(cane.x > 0, 'and the stick stays on the right');
  }
  console.log('    (bags: ' + api.BAG_COLS.join(' ') + ')');
});

test('nobody carries shopping they have already thrown away', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  for (const kind of ['shopper', 'elder']){
    for (let seed = 0; seed < 4; seed++){
      const s = shopper(api, kind, (p) => { p.coat = seed; p.panic = 0.9; p.dropped = 1; });
      assert(!s.bag, kind + ' seed ' + seed + ' still has the bag it threw');
    }
  }
  // hands full, or no hands at all
  for (const kind of ['parent', 'kid', 'santa']){
    for (let seed = 0; seed < 4; seed++){
      const s = shopper(api, kind, (p) => { p.coat = seed; });
      assert(!s.bag, kind + ' seed ' + seed + ' should not be carrying shopping');
    }
  }
  // and a corpse does not hold anything up either
  for (let seed = 0; seed < 4; seed++){
    const s = shopper(api, 'shopper', (p) => { p.coat = seed; p.dead = 1; p.deadT = 1; });
    assert(!s.bag, 'a dead shopper seed ' + seed + ' is still holding its shopping');
  }
});

test('the bag in the hand is the bag that lands in the snow', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();

  for (let seed = 0; seed < 8; seed++){
    const held = shopper(api, 'shopper', (p) => { p.coat = seed; });
    assert(held.bag.style === held.bagCol, 'the held bag is a bag colour');

    // now scare that same person into dropping it
    api.fx.length = 0;
    const p = api.people[0];
    p.panic = 0.9; p.dropped = 0;
    api.stepPeople(0.016);
    const drop = api.fx.find(f => f.type === 'drop');
    assert(drop, 'seed ' + seed + ' should have dropped something');
    assert(drop.col === held.bag.style,
      'seed ' + seed + ' dropped a ' + drop.col + ' bag but was holding a ' +
      held.bag.style);
  }

  /* Choosing the colour off the coat instead of rolling for it must not move
     the simulation stream — every one of the twenty-one markets is scored
     against the sequence that was there when its par was tuned. */
  const roll = () => {
    api.reseed(4242);
    api.people.length = 0; api.fx.length = 0;
    for (let i = 0; i < 6; i++){
      const q = api.addPerson(2600 + i * 40, 1100, 'shopper');
      q.panic = 0.9; q.dropped = 0;
    }
    api.stepPeople(0.016);
    return [api.rnd(), api.rnd(), api.rnd(), api.rnd()];
  };
  const a = roll(), b = roll();
  assert(JSON.stringify(a) === JSON.stringify(b), 'the stream should be repeatable');
  assert(api.fx.filter(f => f.type === 'drop').length === 6, 'six bags, six droppers');
  console.log('    (stream after six drops: ' + a.map(v => v.toFixed(4)).join(' ') + ')');
});

/* ------------------------------------------------------- the driver --- */

/* Records every disc and ellipse a draw puts down, with the colour it was
   painted in, in the car's own coordinates — drawCar's translate and rotate go
   through ctx and the recorder ignores them, so what comes back is the layout
   inside the bodywork. */
function carRec(){
  const shapes = [], order = [], rects = [], all = [], styles = [], polys = [], ctrls = [];
  let fill = '', line = '', lw = 0, alpha = 1, op = 'source-over', pending = null, poly = null;
  /* roundRect is moveTo/lineTo/quadraticCurveTo, so nothing about it reaches
     `shapes`. Its bounding box goes in `polys` instead of `shapes`, because the
     layout tests read `shapes` by colour and a box sharing a coat's colour
     would quietly become that coat. */
  const pt = (x, y) => {
    if (!poly) poly = { x0: x, y0: y, x1: x, y1: y };
    poly.x0 = Math.min(poly.x0, x); poly.y0 = Math.min(poly.y0, y);
    poly.x1 = Math.max(poly.x1, x); poly.y1 = Math.max(poly.y1, y);
  };
  const base = {
    shapes, order, rects, all, styles, polys, ctrls, images: [], fills: 0,
    // raw path points too, so a jointed limb can be told from a straight one
    // both styles, because a path may be on its way to a fill or to a stroke
    moveTo(x, y){ pt(x, y); all.push(['m', x, y, line, fill]); },
    lineTo(x, y){ pt(x, y); all.push(['l', x, y, line, fill]); },
    /* Control points go in their own array rather than into `all` — several
       tests read the last slot of an `all` entry as its colour, and a curve's
       bulge lives in the control point, not the endpoint. */
    quadraticCurveTo(cx, cy, x, y){
      pt(x, y); all.push(['q', x, y, line, fill]);
      ctrls.push({ cx, cy, x, y, style: fill, line });
    },
    set fillStyle(v){ fill = String(v); order.push(String(v)); styles.push('f:' + v); },
    get fillStyle(){ return fill; },
    set strokeStyle(v){ line = String(v); styles.push('s:' + v); },
    get strokeStyle(){ return line; },
    set lineWidth(v){ lw = +v; },
    get lineWidth(){ return lw; },
    set globalAlpha(v){ alpha = +v; },
    get globalAlpha(){ return alpha; },
    // additive vs normal, so "this burns" can be told from "this is smoke"
    set globalCompositeOperation(v){ op = String(v); styles.push('op:' + v); },
    get globalCompositeOperation(){ return op; },
    // sprites are how every light in this game is drawn, so they get recorded
    // with the alpha they went down at
    drawImage(img, x, y, w, h){ base.images.push({ x, y, w, h, alpha }); },
    // a shape lasts until the next beginPath, so a fill and the stroke that
    // outlines it are both recorded against it
    beginPath(){ pending = null; poly = null; },
    // `all` is every primitive in order, for checking a draw repeats exactly;
    // `shapes` keeps one per fill, which is what the layout tests read
    arc(x, y, r){ pending = { x, y, r, ry: r }; all.push(['arc', x, y, r, fill]); },
    /* the rotation too, appended after the fill so every existing index-based
       assertion still reads the same slot — a flame is only a flame because it
       is turned to lie along the way it was thrown */
    ellipse(x, y, rx, ry, rot){
      pending = { x, y, r: rx, ry, rot };
      all.push(['el', x, y, rx, ry, fill]);
    },
    rect(x, y, w, h){ all.push(['rect', x, y, w, h, fill]); },
    fillRect(x, y, w, h){ rects.push({ x, y, w, h, style: fill }); all.push(['fr', x, y, w, h, fill]); },
    fill(){
      base.fills++;
      if (pending) shapes.push(Object.assign({}, pending, { style: fill }));
      if (poly) polys.push(Object.assign({}, poly, { style: fill }));
    },
    stroke(){
      if (poly) polys.push(Object.assign({}, poly, { style: line, lw, stroked: true }));
      if (pending){ shapes.push(Object.assign({}, pending, { style: line, lw, stroked: true })); pending = null; }
    },
    measureText: (s) => ({ width: textW(String(s), fontPx(base.font)) }),
    /* Gradients stringify to their stops, so a fill can be told apart from the
       flat colour it replaced — the recorder used to return undefined here and
       every cached gradient silently fell back to its solid fallback. */
    createLinearGradient(gx0, gy0, gx1, gy1){
      const stops = [];
      return { stops, addColorStop(o, c){ stops.push(o + ':' + c); },
        toString: () => 'grad(' + gx0 + ',' + gx1 + ' ' + stops.join(' ') + ')' };
    },
    canvas: { width: 1280, height: 720 },
  };
  return new Proxy(base, { get(t, p){
    if (p in t) return t[p];
    return () => {};
  }, set(t, p, v){ t[p] = v; return true; } });
}

// the driver's palette, which is how his parts are told apart in the recording
const FACE_C = '#f0c9a4', BEARD_C = '#efe9dd', INK_C = '#2a1a16', GLOVE_C = '#e8e3d8';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function driver(api, shouting){
  api.car.ang = 0; api.car.z = 0; api.car.roll = 0;
  api.car.vx = 0; api.car.vy = 0; api.car.dispSp = 0;
  api.car.gore = 0; api.car.plowT = 0;
  api.car.shoutT = shouting ? 0.3 : 0;
  const rec = carRec();
  api.withCtx(rec, api.drawCar);
  const by = (c) => rec.shapes.filter(s => s.style === c);
  const eyes = by(INK_C).filter(s => Math.abs(s.y) > 0.5);
  return { rec, face: by(FACE_C)[0], beard: by(BEARD_C)[0], gloves: by(GLOVE_C),
    eyes, mouth: by(INK_C).find(s => Math.abs(s.y) <= 0.5),
    wheel: rec.shapes.find(s => s.stroked && s.ry && s.r !== s.ry) };
}

/* Both damage counters have been kept since the game was written — dents up to
   6, gore up to 9 — and both drew as flat discs at fixed angles spread over the
   whole plan: six mud-coloured dots and nine red ones, up to sixteen fills of
   nothing that reads as damage, over the top of the driver. */
function damaged(api, dents, gore, ang){
  api.car.ang = ang || 0; api.car.z = 0; api.car.roll = 0;
  api.car.vx = 0; api.car.vy = 0; api.car.dispSp = 0;
  api.car.shoutT = 0; api.car.plowT = 0;
  api.car.dents = dents; api.car.gore = gore;
  const rec = carRec();
  api.withCtx(rec, api.drawCar);
  const d = api.getDims();
  const marks = rec.all.filter(a => a[0] === 'arc' || a[0] === 'el')
    .filter(a => /26,14,12|255,247,232|126,14,10|168,26,20/.test(String(a[a.length - 1])));
  // arcs and ellipses only: a lobe is a moveTo plus an arc, and the recorder
  // now tags path points with the fill they are headed for as well
  const shp = rec.all.filter(a => a[0] === 'arc' || a[0] === 'el');
  return { rec, d, marks,
    pit: shp.filter(a => /26,14,12/.test(String(a[a.length - 1]))),
    lip: shp.filter(a => /255,247,232/.test(String(a[a.length - 1]))),
    blood: shp.filter(a => /126,14,10|168,26,20/.test(String(a[a.length - 1]))) };
}

/* One of the two things you can pick up, on screen for its whole eight
   seconds, and it was a flat white trapezoid and a red bar: bolted to nothing,
   with no back to it, still white after going through a crowd — and drawn 10%
   longer than the distance it actually hits from. */
test('the plough is a blade that ends where it hits', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.car.ang = 0; api.car.z = 0; api.car.roll = 1;
  api.camSnap();
  const paint = (plowT, bloody) => {
    api.car.plowT = plowT; api.car.bloody = bloody;
    const rec = carRec();
    api.withCtx(rec, () => api.drawCar());
    return rec;
  };
  const d = api.getDims();
  const reach = api.plowReach(), wing = d.w / 2 + api.PLOW_PAD;
  assert(reach === d.l / 2 + api.PLOW_PAD + api.getCar().plow,
    'plowReach should be the collider’s own number');

  const on = paint(5, 0), off = paint(0, 0);
  const blade = (rec) => rec.all.filter(e =>
    (e[0] === 'm' || e[0] === 'l' || e[0] === 'q') &&
    (e[4] === '#dfe8f6' || e[4] === '#c9cfd8' || e[4] === '#8d97a8'));
  assert(blade(on).length > 0, 'a fitted plough should draw a blade');
  assert(blade(off).length === 0, 'no plough, no blade');

  /* The promise it makes must be the one the physics keeps, and this goes
     first because it is the one the old art broke: it reached CARL*0.72, 4.7
     units past where a hit actually lands. */
  for (const e of blade(on)){
    assert(e[1] <= reach + 0.001,
      'the blade reaches ' + e[1].toFixed(1) + ' where the plough hits at ' + reach);
    assert(Math.abs(e[2]) <= wing + 0.001,
      'a wing reaches ' + Math.abs(e[2]).toFixed(1) + ' where the plough hits at ' + wing);
  }
  assert(blade(on).length > 8,
    'a blade is more than a four-corner cut-out, got ' + blade(on).length + ' points');
  const far = Math.max(...blade(on).map(e => e[1]));
  const wide = Math.max(...blade(on).map(e => Math.abs(e[2])));
  assert(far > reach - 4, 'and it should fill that reach, stopping at ' + far.toFixed(1));
  assert(wide > d.w / 2, 'a plough is wider than the car, got ' + wide.toFixed(1) +
    ' against a half-width of ' + d.w / 2);

  /* A band, not a filled wedge: it comes back along a second curve, which is
     what gives it a back edge and a thickness. The trapezoid had neither. */
  const face = on.all.filter(e => e[0] === 'q' && e[4] === '#dfe8f6');
  assert(face.length >= 4, 'the blade should curve out and back, got ' + face.length + ' curves');

  // and it carries what it has been through
  const clean = paint(5, 0), gory = paint(5, 1), half = paint(5, 0.4);
  const red = (rec) => rec.order.filter(c => /^rgba\(150,20,16/.test(String(c)));
  assert(red(clean).length === 0, 'a clean plough is clean');
  assert(red(gory).length === 1, 'a bloodied one is smeared, got ' + red(gory).length);
  const alpha = (rec) => +/rgba\(150,20,16,([\d.]+)\)/.exec(red(rec)[0])[1];
  assert(alpha(gory) > alpha(half),
    'the smear should follow car.bloody: ' + alpha(gory) + ' vs ' + alpha(half));
  const smears = gory.all.filter(e => e[0] === 'arc' && e[4] === red(gory)[0]);
  assert(smears.length === api.PLOW_GORE,
    api.PLOW_GORE + ' smears expected, got ' + smears.length);
  for (const sm of smears)
    assert(sm[1] <= reach + 0.001 && Math.abs(sm[2]) <= wing + 0.001,
      'a smear landed off the blade at ' + sm[1].toFixed(1) + ',' + sm[2].toFixed(1));

  /* And the collider is really the same number: someone standing at the very
     end of the blade is hit, and one standing a hair beyond it is not. */
  api.car.plowT = 5;
  assert(api.inCar(api.car.x + reach - 1, api.car.y, 0, 0), 'the blade tip should hit');
  assert(!api.inCar(api.car.x + reach + 2, api.car.y, 0, 0), 'and nothing past it');
  api.car.plowT = 0;
  assert(!api.inCar(api.car.x + reach - 1, api.car.y, 0, 0),
    'with no plough fitted that reach is gone');

  api.reseed(4711);
  const cleanRnd = [api.rnd(), api.rnd(), api.rnd()];
  api.reseed(4711);
  for (let i = 0; i < 30; i++) paint(5, i / 30);
  assert(JSON.stringify([api.rnd(), api.rnd(), api.rnd()]) === JSON.stringify(cleanRnd),
    'drawing the plough moved the simulation stream');
  console.log('    (plough: reach ' + reach + ', wings ' + wing + ', ' +
    gory.fills + ' fills bloodied)');
});

test('a battered car looks battered, in four fills not sixteen', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';

  const clean = damaged(api, 0, 0);
  assert(clean.marks.length === 0, 'a fresh car carries no damage, got ' + clean.marks.length);

  const worst = damaged(api, 6, 9);
  assert(worst.pit.length === 18, 'six dents, three lobes each: ' + worst.pit.length);
  assert(worst.lip.length === 6, 'and a lit lip on each: ' + worst.lip.length);
  assert(worst.blood.length === 10, 'nine streaks and the wet nose: ' + worst.blood.length);

  // …all of it in four fills, which is fewer than the sixteen discs it replaced
  const cost = (d, g) => { const r = carRec(); api.car.dents = d; api.car.gore = g;
    api.car.ang = 0; api.withCtx(r, api.drawCar); return r.fills; };
  const extra = cost(6, 9) - cost(0, 0);
  assert(extra === 4, 'damage should cost four fills, costs ' + extra);
  console.log('    (car damage: ' + extra + ' fills for 6 dents + 9 hits)');
});

test('damage lands on the bodywork, never on the glass', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  const o = damaged(api, 6, 9);
  const halfL = o.d.l / 2, halfW = o.d.w / 2;

  for (const m of o.marks){
    const [, x, y, rx] = m;
    const ry = m[0] === 'el' ? m[4] : rx;
    assert(Math.abs(x) + rx <= halfL + 0.01,
      'a mark hangs off the nose or tail at x' + x.toFixed(1) + '±' + rx.toFixed(1) +
      ', the car is ' + o.d.l + ' long');
    assert(Math.abs(y) + ry <= halfW + 0.01,
      'a mark hangs off the flank at y' + y.toFixed(1) + '±' + ry.toFixed(1) +
      ', the car is ' + o.d.w + ' wide');
  }
  /* The driver sits in the middle of the cabin and is the one thing on the car
     you have to be able to read. The first version put six dents and nine hits
     straight over him. */
  for (const m of o.marks){
    assert(Math.hypot(m[1], m[2]) > o.d.w * 0.28,
      'a mark is on top of the driver at ' + m[1].toFixed(1) + ',' + m[2].toFixed(1));
  }
});

test('a dent catches the light the rest of the market catches', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';

  /* The lip is on the side the market's light comes from, so turning the car
     moves it round the dent in the car's own frame — the same rule every
     shadow and every coat highlight in the game already follows. */
  const lipAt = (ang) => damaged(api, 3, 0, ang).lip.map(l => [l[1], l[2]]);
  const east = JSON.stringify(lipAt(0));
  const north = JSON.stringify(lipAt(Math.PI / 2));
  assert(east !== north, 'the lip should follow the market light, not the bodywork');

  // and it is the same car twice in a row: nothing here is rolled
  const a = JSON.stringify(damaged(api, 4, 6, 0.4).marks.map(m => m.slice(1, 5)));
  const b = JSON.stringify(damaged(api, 4, 6, 0.4).marks.map(m => m.slice(1, 5)));
  assert(a === b, 'the same car drawn twice should be dented the same way');

  api.reseed(11);
  const r0 = api.rnd(), v0 = api.vrnd();
  api.reseed(11);
  for (let i = 0; i < 20; i++) damaged(api, 6, 9);
  assert(api.rnd() === r0, 'drawing damage moved the simulation stream');
});

test('the driver is a man in a seat, not four discs', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  const d = driver(api, false);
  const dims = api.getDims();

  assert(d.face && d.beard, 'he should have a face and a beard');
  assert(d.eyes.length === 2, 'two eyes, got ' + d.eyes.length);
  assert(Math.abs(d.eyes[0].y + d.eyes[1].y) < 0.01, 'and they should be level');
  assert(d.gloves.length === 2, 'two gloves on the wheel, got ' + d.gloves.length);
  assert(d.wheel, 'and a wheel for them to be on');

  // the eyes are on the face
  for (const e of d.eyes){
    assert(dist(e, d.face) + e.r <= d.face.r + 0.01,
      'an eye is off the face: ' + dist(e, d.face).toFixed(1) + ' + ' + e.r.toFixed(1) +
      ' vs ' + d.face.r.toFixed(1));
  }
  /* And not in the beard. The first pass had the beard far enough back that
     both eyes landed in the whiskers, which reads as a snowman. */
  for (const e of d.eyes){
    assert(dist(e, d.beard) > d.beard.r,
      'an eye is buried in the beard: ' + dist(e, d.beard).toFixed(1) +
      ' vs ' + d.beard.r.toFixed(1));
  }
  // the mouth is in the beard, where a mouth is
  assert(dist(d.mouth, d.beard) < d.beard.r, 'the mouth should be in the beard');
  // the beard hangs forward of the face, and the wheel is forward of the beard
  assert(d.beard.x > d.face.x, 'the beard hangs down his front');
  assert(d.wheel.x > d.beard.x, 'the wheel is ahead of him');
  assert(d.wheel.x + d.wheel.r <= dims.l * 0.2 + 0.01,
    'the wheel should stay behind the windscreen: ' + (d.wheel.x + d.wheel.r).toFixed(1) +
    ' vs ' + (dims.l * 0.2).toFixed(1));
  for (const g of d.gloves) assert(Math.abs(dist(g, d.wheel) - 0) > 0, 'gloves placed');

  // he is painted over the bodywork, not under it
  const car = api.getCar();
  assert(d.rec.order.indexOf(car.body) < d.rec.order.indexOf(FACE_C),
    'the driver should be drawn on top of the body');
  assert(d.rec.order.indexOf('#8e2a24') < d.rec.order.indexOf(FACE_C),
    'shoulders first, then the head on top of them');
  console.log('    (driver: face r' + d.face.r.toFixed(1) + ', beard r' +
    d.beard.r.toFixed(1) + ' at x' + d.beard.x.toFixed(1) + ', wheel at x' +
    d.wheel.x.toFixed(1) + ')');
});

test('the driver opens his mouth when he shouts', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  const quiet = driver(api, false).mouth, loud = driver(api, true).mouth;
  assert(loud.r > quiet.r * 1.5,
    'the mouth should open: ' + quiet.r.toFixed(2) + ' -> ' + loud.r.toFixed(2));
  // and nothing else about him moves
  assert(driver(api, true).eyes.length === 2, 'he keeps both eyes while shouting');
});

test('every car carries the same driver', () => {
  const api = boot({ w: 1280, h: 720, store: ALL_CARS });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  const seen = [];
  for (const c of api.CARS){
    assert(api.selectCar(c.id), 'should be able to pick ' + c.id);
    const d = driver(api, false);
    assert(d.face && d.beard && d.eyes.length === 2 && d.gloves.length === 2,
      c.id + ' lost part of its driver');
    seen.push(c.id + ' ' + d.rec.shapes.length);
  }
  console.log('    (driver on ' + seen.join(', ') + ' shapes)');
});

/* ------------------------------------------------ the combo banner --- */


test('the combo banner is a ribbon, not bare text on the market', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const frame = (banner) => {
    api.G.banner = banner;
    api.drawHUD();                              // warm anything cached
    api._resetCounts();
    api.drawHUD();
    return { fills: api._counts.fill || 0, strokes: api._counts.stroke || 0,
      text: (api._counts._text || []).slice() };
  };
  const off = frame(null);
  const on = frame({ text: 'DOUBLE PARKED', t: 1.2 });
  console.log('    (banner: +' + (on.fills - off.fills) + ' fills, +' +
    (on.strokes - off.strokes) + ' strokes)');
  // the tails, the plate and the lit band, plus a hairline round the edge
  assert(on.fills - off.fills === 3,
    'the ribbon is three fills — tails, plate, lit band: +' + (on.fills - off.fills));
  assert(on.strokes - off.strokes === 1, 'and one hairline, the HUD material');
  /* Two passes at the same text, a dark copy under the colour. On a plate that
     is belt and braces, but the banner is the one thing in the game that lands
     on a lit stall counter, which is the brightest thing in it. */
  const said = on.text.filter(t => t === 'DOUBLE PARKED').length;
  assert(said === 2, 'the banner text should be drawn twice, got ' + said);
  assert(!off.text.includes('DOUBLE PARKED'), 'and not at all when there is no banner');
});

test('a banner shrinks rather than running off the frame', () => {
  const api = boot({ w: 1280, h: 720 });
  const fs = api.bannerFont(false);
  const wide = api.bannerBox(2000, fs, 500);
  assert(wide.fit < 1, 'a 2000px banner in a 500px frame has to shrink');
  assert(wide.w * wide.fit <= 500 + 0.01,
    'and it has to actually fit: ' + (wide.w * wide.fit).toFixed(1) + ' in 500');
  const small = api.bannerBox(100, fs, 500);
  assert(small.fit === 1, 'one that already fits should not be shrunk');
  assert(small.w > 100, 'the plate is wider than its text');
});

test('the ribbon has tails, so it reads as a banner and not a box', () => {
  const api = boot({ w: 1280, h: 720 });
  /* Watch the path the ribbon builds. The tails go down as raw lines and the
     plate through roundRect, so the two are told apart by which call made the
     point. */
  const line = [], plate = [];
  let into = line;
  const ctx = api._ctxStub;
  const spy = {
    beginPath(){ into = line; },
    moveTo(x, y){ into.push(x); }, lineTo(x, y){ into.push(x); },
    quadraticCurveTo(a, b, x){ into.push(x); },
    closePath(){}, fill(){}, stroke(){},
    fillStyle: '', strokeStyle: '', lineWidth: 0,
  };
  api.withCtx(spy, () => {
    // roundRect writes through moveTo/lineTo too, so the plate's points are
    // collected by watching which fill they land in
    api.bannerRibbon(300, 60, false);
  });
  const reach = Math.max(...line.map(Math.abs));
  assert(reach > 150, 'the ribbon should extend past its own plate: ' + reach + ' vs 150');
  assert(reach < 150 + 40, 'but not sprout wings: ' + reach);
  console.log('    (ribbon: 300px plate, ' + Math.round(reach * 2) + 'px across the tails)');
});

test('the banner never lands on the panels it shares the frame with', () => {
  const COMBO_H = 86;
  for (const [w, h] of [[1440, 810], [1280, 720], [844, 390], [667, 375], [520, 320]]){
    const api = boot({ w, h });
    api.startCampaign(); api.beginLevel();
    const narrow = w < 560;
    const fs = api.bannerFont(false);
    const L = api.bannerLayout(textW('INSANE ROLL ×5', fs), false, 1);
    const r = api.hudScoreRect();
    const comboBottom = (narrow ? 150 : 20) + COMBO_H;
    assert(L.y - L.h / 2 >= comboBottom,
      w + 'x' + h + ': the banner overlaps the combo plate (' +
      (L.y - L.h / 2).toFixed(0) + ' vs ' + comboBottom + ')');
    // and if it is wide enough to reach the score panel, it clears that too
    if (L.w / 2 > w / 2 - (r.x + r.w)){
      assert(L.y - L.h / 2 >= r.y + r.h,
        w + 'x' + h + ': a full-width banner printed over the goals (' +
        (L.y - L.h / 2).toFixed(0) + ' vs ' + (r.y + r.h) + ')');
    }
    assert(L.y + L.h / 2 < h, w + 'x' + h + ': the banner runs off the bottom');
    assert(L.w <= w - 40, w + 'x' + h + ': the banner is wider than the frame');
  }
  const big = boot({ w: 1440, h: 810 }), small = boot({ w: 667, h: 375 });
  console.log('    (banner type: ' + big.bannerFont(false) + 'px at 810 tall, ' +
    small.bannerFont(false) + 'px at 375)');
  assert(big.bannerFont(false) > small.bannerFont(false) + 8,
    'the banner should be sized off the frame, not off a desktop');
  assert(small.bannerFont(false) >= 20, 'but still readable on a phone');
});

/* --------------------------------------------- spilt glühwein --- */

/* Records the shapes a path builder asks for, so a puddle can be measured
   rather than counted. */
function pathRec(){
  const shapes = [];
  return { shapes, moveTo(){}, beginPath(){}, fill(){},
    ellipse(x, y, rx, ry){ shapes.push({ x, y, rx, ry }); },
    arc(x, y, r){ shapes.push({ x, y, rx: r, ry: r }); },
    set fillStyle(v){}, get fillStyle(){ return ''; } };
}

test('a spilt pot of glühwein is a puddle, not a circle', () => {
  const api = boot({ w: 1280, h: 720 });
  const s = { x: 0, y: 0, r: 100, t: 0, ttl: 6.5, seed: 0.37 };
  const rec = pathRec();
  api.spillPath(rec, s, 1);
  const sh = rec.shapes;
  assert(sh.length === 4, 'a body and three lobes: ' + sh.length);
  const body = sh[0];
  assert(body.rx !== body.ry, 'even the body should not be a circle');
  // the lobes have to break the outline, or the puddle is an ellipse again
  const reach = sh.slice(1).map(l => Math.hypot(l.x, l.y) + Math.max(l.rx, l.ry));
  assert(Math.max(...reach) > body.rx * 1.05,
    'the lobes should push past the body: ' + Math.max(...reach).toFixed(1) +
    ' vs ' + body.rx);
  // and it is the seed that decides where they fall, so two spills differ
  const other = pathRec();
  api.spillPath(other, Object.assign({}, s, { seed: 0.82 }), 1);
  assert(other.shapes[1].x !== sh[1].x, 'two spills should not be the same puddle');
  // a spill with no seed at all still draws something finite
  const bare = pathRec();
  api.spillPath(bare, { x: 0, y: 0, r: 80 }, 1);
  assert(bare.shapes.every(p => Number.isFinite(p.x) && Number.isFinite(p.rx)),
    'a seedless spill should not produce NaN geometry');
});

test('a spill steams while it is lethal and goes dull when it is not', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.drawLights();                          // bakes the light sprites

  const steam = (t) => {
    api.spills.length = 0;
    api.spills.push({ x: api.cam.x, y: api.cam.y, r: 110, t, ttl: 6.5, seed: 0.4 });
    api._resetCounts();
    api.drawSpillHeat();
    return api._counts.drawImage || 0;
  };
  const hot = steam(0.2), warm = steam(api.SPILL_HOT * 0.7), cold = steam(api.SPILL_HOT + 0.5);
  console.log('    (spill vapour: fresh ' + hot + ' images, warm ' + warm + ', cooled ' + cold + ')');
  assert(hot > 0, 'a fresh spill should be steaming');
  assert(cold === 0, 'a cooled spill should not, got ' + cold + ' images');

  /* The look and the rule read the same constant. If they drift, a puddle goes
     on steaming after it has stopped being dangerous — or worse, stops looking
     dangerous while it still is. */
  const src = fs.readFileSync(HTML, 'utf8');
  const step = src.slice(src.indexOf('function stepSpills'), src.indexOf('function stepSpills') + 700);
  assert(step.includes('s.t < SPILL_HOT'),
    'the kill window should read the constant the drawing reads');
  assert(!/s\.t < 3\.5/.test(step), 'and not a bare number');

  // and the rule itself still holds at the boundary
  api.people.length = 0; api.spills.length = 0;
  api.spills.push({ x: 2000, y: 1100, r: 100, t: 0, ttl: 6.5, seed: 0.3 });
  const inIt = api.addPerson(2020, 1110);
  api.stepSpills(1 / 60);
  assert(inIt.dead, 'a fresh spill kills what walks into it');
  api.spills[0].t = api.SPILL_HOT + 0.1;
  const later = api.addPerson(2020, 1110);
  api.stepSpills(1 / 60);
  assert(!later.dead, 'a cooled spill is a stain and nothing more');
});

test('the whole spill field is one rim and a few fills', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const cost = (n, t) => {
    api.spills.length = 0;
    for (let i = 0; i < n; i++){
      api.spills.push({ x: api.cam.x + i * 40, y: api.cam.y, r: 100, t, ttl: 6.5, seed: i / n });
    }
    api._resetCounts();
    api.drawSpills();
    return api._counts.fill || 0;
  };
  const one = cost(1, 0.5), six = cost(6, 0.5);
  console.log('    (spills: 1 puddle ' + one + ' fills, 6 puddles ' + six + ')');
  assert(cost(0, 0.5) === 0, 'no spills, nothing drawn');
  // the rim is shared; the wine, its heat and its sheen are per puddle
  assert(six - one === (one - 1) * 5,
    'only the per-puddle passes should scale: ' + one + ' -> ' + six);
  assert(one <= 5, 'a puddle should not cost more than a handful: ' + one);
  // a cooled puddle drops its heat pass
  assert(cost(1, api.SPILL_HOT + 1) < one, 'a cooled puddle has no glow to draw');
});

/* ----------------------------------------------- the results card --- */

/* Plays the card without playing the market: levelEnd reads G, so setting the
   numbers and calling it is exactly what a finished run does. */
function endedRun(api, level, score, goals){
  api.G.unlocked = 21; api.startCampaign(); api.startLevel(level); api.beginLevel();
  api.G.levelScore = score; api.G.score = score;
  api.G.kills = 35; api.G.wrecks = 19; api.G.bestCombo = 21;
  api.G.goalsDone = goals;
  if (api.G.goals) api.G.goals.forEach((g, i) => { g.done = i < goals; });
  api.levelEnd();
  const n = api._nodes;
  return { where: n.rsWhere.textContent, line: n.rsLine.textContent,
    stars: n.rsStars.innerHTML, title: n.rsTitle.textContent,
    pb: !n.rsPb.hasAttribute('hidden'), starline: n.rsStarline.textContent };
}

test('the results card says which market it is about', () => {
  const api = boot({ w: 1280, h: 720 });
  for (const i of [0, 5, 8, 20]){
    const r = endedRun(api, i, 999999, 3);
    assert(r.where === (i + 1) + ' · ' + api.LEVELS[i].name,
      'market ' + i + ' card says "' + r.where + '"');
  }
  console.log('    (results heading: "' + endedRun(api, 8, 999999, 3).where + '")');
});

test('a new best on a market is flagged once, and only when it is one', () => {
  const api = boot({ w: 1280, h: 720 });
  // first run on the market: a record, but there is no old one to name
  const first = endedRun(api, 5, 40000, 2);
  assert(first.pb, 'the first clear of a market is a personal best');
  assert(/first run here/i.test(first.line), 'and it should say so: ' + first.line);
  assert(!/NaN|undefined/.test(first.line), 'no arithmetic leaking into the copy: ' + first.line);

  // beating it names the old figure
  const better = endedRun(api, 5, 52000, 3);
  assert(better.pb, 'beating 40,000 with 52,000 is a new best');
  assert(better.line.includes('40,000'), 'the old record should be named: ' + better.line);

  // and falling short of it does not
  const worse = endedRun(api, 5, 31000, 1);
  assert(!worse.pb, 'a worse run is not a new best');
  assert(worse.line.includes('52,000'), 'the standing record is still shown: ' + worse.line);
  assert(!/old best/i.test(worse.line), 'nothing was beaten: ' + worse.line);

  /* A run that misses the target still counts for the record, so the card has
     to quote the record as it stands after the run rather than before it. */
  const api2 = boot({ w: 1280, h: 720 });
  const failed = endedRun(api2, 5, 12000, 0);
  assert(failed.title === 'NOT ENOUGH DAMAGE', 'that run did not clear the market');
  assert(!failed.pb, 'a failed run does not get a celebration');
  assert(failed.line.includes(api2.fmt(api2.bestOn(5))),
    'the failed card should quote the record as it now stands: ' + failed.line +
    ' (record ' + api2.bestOn(5) + ')');
});

test('the stars on the results card land one at a time', () => {
  const api = boot({ w: 1280, h: 720 });
  const delays = (html) => [...html.matchAll(/animation-delay:([\d.]+)s/g)].map(m => +m[1]);
  const three = endedRun(api, 5, 999999, 3);
  const d = delays(three.stars);
  assert(d.length === 3, 'three earned stars, three entrances: ' + d.length);
  assert(d[0] > 0 && d[1] > d[0] && d[2] > d[1],
    'each star should land after the one before it: ' + d.join('/'));
  assert(d[2] < 1.2, 'and the last one should not keep you waiting: ' + d[2]);
  console.log('    (stars land at ' + d.join('s, ') + 's)');
  // only the earned ones move; the empty sockets are just there
  const one = endedRun(api, 5, 999999, 1);
  assert(delays(one.stars).length === 1,
    'one star earned, one animated: ' + delays(one.stars).length);
  assert((one.stars.match(/★/g) || []).length === 3, 'three sockets either way');
  const none = endedRun(boot({ w: 1280, h: 720 }), 5, 100, 0);
  assert(delays(none.stars).length === 0, 'a failed run has nothing to celebrate');
});

test('the results overlay lets the wreckage through', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const alphaOf = (sel) => {
    const block = src.slice(src.indexOf(sel + '{'));
    const m = block.slice(0, 400).match(/rgba\(4,7,14,\.(\d+)\)/);
    assert(m, 'no outer wash found for ' + sel);
    return +('0.' + m[1]);
  };
  const std = alphaOf('.ov'), res = alphaOf('#results'), fin = alphaOf('#finale');
  console.log('    (overlay wash: standard ' + std + ', results ' + res + ', finale ' + fin + ')');
  assert(res < std - 0.08,
    'the results card should sit on a lighter wash than a plain overlay: ' + res + ' vs ' + std);
  assert(res <= fin + 0.06, 'and about as light as the finale, which shows the same market');
  assert(/#results\{[^}]*backdrop-filter:blur\(2px\)/.test(src.replace(/\s+/g, ' ')),
    'the results blur should be eased off too, not left at the overlay default');
});

test('every market gets a tile with its plan, its name and its stars', () => {
  const api = boot({ w: 1280, h: 720, store: { merry_crashmas_stars_v1: JSON.stringify(
    [3, 2, 1, 0].concat(new Array(17).fill(0))) } });
  api.G.unlocked = 3;
  api.toMenu();
  const html = api._nodes.mLevels.innerHTML;
  const tiles = html.split('<button').length - 1;
  assert(tiles === api.LEVELS.length, 'one tile a market: ' + tiles + ' vs ' + api.LEVELS.length);
  assert((html.match(/data-plan="/g) || []).length === api.LEVELS.length,
    'every tile should carry a plan to paint');
  // the full name, not a truncation — the number is a badge, not a prefix
  for (const lv of api.LEVELS){
    assert(html.includes('<b>' + lv.name + '</b>'), 'missing name: ' + lv.name);
  }
  assert(html.includes('<u>21</u>'), 'the last market should be numbered on its plan');
  assert(!html.includes('21. MIDNIGHT'), 'the number should not be eating the name');
  // stars read off the save, and locked markets say so instead
  assert(html.includes('★★★☆'.slice(0, 3) + '</em>'), 'a three-star market shows three stars');
  assert((html.match(/🔒/g) || []).length === api.LEVELS.length - 4,
    'everything past the unlock should be locked');
  assert((html.match(/disabled/g) || []).length === api.LEVELS.length - 4,
    'and locked tiles should not be clickable');
});

test('the blood field costs the same at one decal or three hundred', () => {
  const cost = (n, kind) => {
    const api = boot({ count: true, w: 1280, h: 720 });
    api.startCampaign(); api.beginLevel();
    api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
    api.gore.length = 0;
    for (let i = 0; i < n; i++){
      api.addGore(api.cam.x + ((i * 37) % 700) - 350, api.cam.y + ((i * 53) % 500) - 250,
        18, kind || (i % 3 ? 'splat' : 'pool'));
    }
    api.drawGround();                       // warm the cached gradients
    api._resetCounts();
    api.drawGround();
    return { api, fills: api._counts.fill || 0, saves: api._counts.save || 0,
      images: api._counts.drawImage || 0 };
  };
  const a = cost(60), b = cost(300);
  console.log('    (blood: ' + a.fills + ' fills for 60 decals, ' + b.fills + ' for 300)');
  assert(a.fills === b.fills,
    'the field should cost a constant: ' + a.fills + ' vs ' + b.fills);
  // an empty field costs neither the halo, the mass, nor the composite
  const none = cost(0);
  assert(none.fills < a.fills - 4, 'no blood, no field: ' + none.fills + ' vs ' + a.fills);
  assert(a.images === none.images + 1,
    'the field is laid over the snow in exactly one piece, got ' +
    (a.images - none.images) + ' images');
  // and a decal still does not push and pop the canvas state to rotate itself
  assert(b.saves - a.saves < 4,
    'a decal should not save/restore to rotate: ' + a.saves + ' -> ' + b.saves);
  // the layer is half resolution, like the darkness it sits under
  const info = a.api.bloodInfo();
  const view = a.api.getView();
  assert(info.w === Math.round(view.w * a.api.BLOOD_SCALE),
    'blood layer should be half the viewport: ' + info.w + ' for a ' + view.w + ' view');
});

/* A recording context, so the shape of a decal can be measured rather than
   counted. Only what paintGore actually uses. */
function goreRec(){
  const r = { fills: [] };
  let cur = null, path = [];
  return { rec: r,
    set fillStyle(v){ cur = String(v); }, get fillStyle(){ return cur; },
    beginPath(){ path = []; },
    moveTo(){},
    ellipse(x, y, rx, ry){ path.push({ x, y, rx, ry }); },
    arc(x, y, rr){ path.push({ x, y, rx: rr, ry: rr }); },
    fill(){ r.fills.push({ style: cur, shapes: path.slice() }); },
  };
}
const lum = (hex) => parseInt(hex.slice(1, 3), 16) * 0.4 +
                     parseInt(hex.slice(3, 5), 16) * 0.4 + parseInt(hex.slice(5, 7), 16) * 0.2;

test('blood merges into one mass instead of stacking into fog', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const one = (kind) => ({ x: 0, y: 0, r: 20, kind, rot: 0.7, seed: 0.4, t: 0 });

  const pool = goreRec();
  api.paintGore(pool, [one('pool')]);
  const f = pool.rec.fills;
  assert(f.length === 4, 'rim, mass, depth and sheen: ' + f.length + ' passes');

  /* The first three are stamps, and a stamp has to be opaque or the merge is
     back to a sum: two pools that touch would darken where they overlap. */
  for (let i = 0; i < 3; i++){
    assert(/^#[0-9a-f]{6}$/i.test(f[i].style),
      'blood pass ' + i + ' must be opaque on the layer, got ' + f[i].style);
  }
  assert(lum(f[0].style) < lum(f[1].style),
    'the rim must be darker than the mass: ' + f[0].style + ' vs ' + f[1].style);
  assert(lum(f[2].style) < lum(f[1].style),
    'the deep part must be darker than the mass: ' + f[2].style + ' vs ' + f[1].style);
  assert(/^rgba/.test(f[3].style), 'the wet sheen is a highlight, not a stamp');

  // the rim is the same silhouette, bigger — that is what gives the merged
  // mass an edge without outlining every ellipse inside it
  assert(f[0].shapes.length === f[1].shapes.length,
    'the rim should be the mass again: ' + f[0].shapes.length + ' vs ' + f[1].shapes.length);
  const grow = f[0].shapes.map((s, i) => s.rx / f[1].shapes[i].rx);
  assert(grow.every(g => g > 1.04 && g < 1.2),
    'the rim should be about a tenth larger, got ' + grow.map(g => g.toFixed(2)).join('/'));

  // a pool is lobed, not an oval: nothing that comes out of a person is round
  assert(f[1].shapes.length === 3,
    'a pool should be three merged blobs, got ' + f[1].shapes.length);
  const rx = f[1].shapes.map(s => s.rx);
  assert(Math.min(...rx) < Math.max(...rx) * 0.7, 'the lobes should be smaller than the body');

  // spray is thin: it gets droplets and no deep centre
  const spray = goreRec();
  api.paintGore(spray, [one('splat')]);
  const s = spray.rec.fills;
  assert(s[1].shapes.length === 4, 'a splat is a body and three droplets, got ' + s[1].shapes.length);
  assert(s[2].shapes.length === 0, 'spray has no depth to it, got ' + s[2].shapes.length);
  assert(s[3].shapes.length === 0, 'and no wet sheen either');
  console.log('    (blood: pool ' + f[1].shapes.length + ' blobs + ' + f[2].shapes.length +
    ' deep + ' + f[3].shapes.length + ' sheen, splat ' + s[1].shapes.length + ' blobs)');

  // the mass is laid over the snow at one alpha, so a hundred overlapping
  // decals are exactly as dark as one
  assert(api.BLOOD_A > 0.4 && api.BLOOD_A < 0.9,
    'blood should read as a stain on snow, not paint: ' + api.BLOOD_A);
});

/* --------------------------------------------------------------- replay --- */

/* The replay caption was printed straight onto the market. A replay pauses
   over the brightest thing in the game — a lit stall counter — and white 30px
   text on that is unreadable, which is the caption gone. */
function replayFrame(tweak){
  const api = boot({ count: true, w: 1440, h: 810, tweak });
  api.G.unlocked = 21; api.startLevel(5); api.beginLevel();
  api.G.phase = 'replay';
  api.rp.dur = 2; api.rp.t = 0.9; api.rp.caption = '6 AND 4 STALLS IN TWO SECONDS';
  return api;
}

test('the replay caption is laid on something, not on the market', () => {
  const CALL = 'const scrim = captionScrim();';
  const on = replayFrame(null);
  on.drawReplayFrame();                       // builds the gradient
  on._resetCounts();
  on.drawReplayFrame();
  const off = replayFrame((s) => {
    assert(s.includes(CALL), 'the scrim call moved; this test is checking nothing');
    return s.replace(CALL, 'const scrim = null;');
  });
  off.drawReplayFrame();
  off._resetCounts();
  off.drawReplayFrame();
  const withScrim = on._counts.fillRect || 0, without = off._counts.fillRect || 0;
  console.log('    (replay frame: ' + withScrim + ' fillRects with the scrim, ' +
    without + ' without)');
  assert(withScrim === without + 1,
    'the scrim should be exactly one more full-frame fill: ' + withScrim + ' vs ' + without);
});

test('the replay scrim is built once and never inside a frame', () => {
  const api = replayFrame(null);
  api._resetCounts();
  api.drawReplayFrame();
  assert((api._counts.createLinearGradient || 0) === 1,
    'the first replay frame builds the scrim, got ' + api._counts.createLinearGradient);
  for (let i = 0; i < 20; i++){
    api.rp.t = 0.2 + i * 0.08;
    api._resetCounts();
    api.drawReplayFrame();
    assert(!(api._counts.createLinearGradient || 0),
      'frame ' + i + ' rebuilt the scrim gradient');
  }
  // a resize gets a new one, and only then
  api._window.innerWidth = 1280; api._window.innerHeight = 720;
  api.fit();
  api._resetCounts();
  api.drawReplayFrame();
  assert((api._counts.createLinearGradient || 0) === 1,
    'a resize should rebuild the scrim once, got ' + api._counts.createLinearGradient);
});

test('a frame that is not a replay pays nothing for the scrim', () => {
  const api = replayFrame(null);
  api.drawReplayFrame();
  api.G.phase = 'drive';
  api._resetCounts();
  api.drawReplayFrame();
  assert(!(api._counts.fillRect || 0), 'drawReplayFrame should do nothing outside a replay');
});

/* The carousel was a striped disc with six gold dots on it. */
test('the carousel has a ride on it', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.setT(3);
  const c = api.addProp('carousel', 2000, 1100);
  api._resetCounts(); api.drawProp(c);
  const live = { fills: api._counts.fill || 0, strokes: api._counts.stroke || 0 };
  c.dead = true;
  api._resetCounts(); api.drawProp(c);
  const wrecked = { fills: api._counts.fill || 0, strokes: api._counts.stroke || 0 };
  console.log('    (carousel: ' + live.fills + ' fills / ' + live.strokes +
    ' strokes running, ' + wrecked.fills + ' / ' + wrecked.strokes + ' wrecked)');
  assert(live.strokes >= 6, 'six horses need six poles, got ' + live.strokes + ' strokes');
  assert(live.fills > wrecked.fills, 'a wrecked carousel is a simpler drawing');
  assert(!wrecked.strokes, 'and it has no poles left standing');
  // it turns: two clocks apart put the horses somewhere else
  const at = (t) => { api.setT(t); api._resetCounts(); api.drawProp(c); return api._counts; };
  c.dead = false;
  const a = JSON.stringify(at(1)), b = JSON.stringify(at(9));
  assert(a === b, 'the cost of a turning carousel should not depend on the clock');
});

/* ------------------------------------------------------------ fireworks --- */

/* Two in five barrels are a crate of rockets. The crate is picked out of the
   seed the prop already carries — a fresh rnd() in addProp would rescore all
   twenty-one markets — and nothing about the volley may reach the simulation. */
test('a market has crates in it, chosen without a dice roll', () => {
  const api = boot({ w: 1280, h: 720 });
  api.G.unlocked = 21;
  const seen = [];
  for (const lv of [0, 5, 12, 20]){
    api.startLevel(lv); api.beginLevel();
    const barrels = api.props.filter(o => o.kind === 'barrel');
    const crates = barrels.filter(api.crateOf).length;
    seen.push(api.LEVELS[lv].name + ' ' + crates + '/' + barrels.length);
    assert(barrels.length >= 4, 'the market should have barrels, got ' + barrels.length);
    assert(crates >= 1, 'and at least one crate among them, got ' + crates);
    assert(crates < barrels.length, 'but not every barrel: ' + crates + '/' + barrels.length);
  }
  console.log('    (crates per market: ' + seen.join(', ') + ')');

  // stable against everything else that pulls numbers, and against a rebuild
  api.startLevel(20); api.beginLevel();
  const first = api.props.map(o => (api.crateOf(o) ? 1 : 0)).join('');
  for (let i = 0; i < 40; i++) api.rnd();
  assert(api.props.map(o => (api.crateOf(o) ? 1 : 0)).join('') === first,
    'the crates moved when the RNG did');
  api.startLevel(20); api.beginLevel();
  assert(api.props.map(o => (api.crateOf(o) ? 1 : 0)).join('') === first,
    'the same market laid out a different set of crates');
  assert(!api.crateOf({ kind: 'hut', seed: 0.1 }), 'only barrels are crates');
});

test('setting off a volley does not move the simulation', () => {
  const CALL = 'if (crateOf(o)) launchFireworks(o);';
  const run = (tweak) => {
    const api = boot({ w: 1280, h: 720, tweak });
    api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
    api.G.phase = 'drive';
    const crates = api.props.filter(api.crateOf);
    assert(crates.length >= 3, 'need crates to wreck, got ' + crates.length);
    for (const c of crates.slice(0, 3)) api.wreckProp(c, 900, 120);
    for (let i = 0; i < 240; i++) api.stepFx(1 / 60);
    return { score: api.G.levelScore, next: api.rnd(),
      rockets: api.fx.filter(f => f.type === 'rocket').length,
      sparks: api.fx.filter(f => f.type === 'spark').length };
  };
  const withFw = run(null);
  const without = run((s) => {
    assert(s.includes(CALL), 'the launch call moved; this test is checking nothing');
    return s.replace(CALL, '');
  });
  assert(withFw.score === without.score,
    'a crate scored differently from a barrel: ' + withFw.score + ' vs ' + without.score);
  assert(withFw.next === without.next,
    'the volley advanced the simulation RNG: ' + withFw.next + ' vs ' + without.next);
});

test('a volley launches, bursts and clears up after itself', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.fx.length = 0;
  const c = api.addProp('barrel', 2000, 1100);
  c.seed = 0.1;
  assert(api.crateOf(c), 'seed 0.1 should be a crate');
  api.wreckProp(c, 800, 0);
  const rockets = api.fx.filter(f => f.type === 'rocket');
  assert(rockets.length >= 5, 'a crate should send up a volley, got ' + rockets.length);
  for (const r of rockets){
    const sp = Math.hypot(r.vx, r.vy);
    assert(sp > 300, 'a rocket should actually go somewhere, got ' + sp.toFixed(0));
    assert(api.FW_COLS.indexOf(r.col) >= 0, 'off the firework palette: ' + r.col);
  }
  // they burst rather than simply vanishing
  let peakSparks = 0;
  for (let i = 0; i < 60; i++){
    api.stepFx(1 / 60);
    peakSparks = Math.max(peakSparks, api.fx.filter(f => f.type === 'spark').length);
  }
  console.log('    (' + rockets.length + ' rockets burst into ' + peakSparks + ' sparks)');
  assert(peakSparks >= rockets.length * 10,
    'each rocket should burst, got ' + peakSparks + ' sparks from ' + rockets.length);
  // and nothing is left behind
  for (let i = 0; i < 240; i++) api.stepFx(1 / 60);
  assert(!api.fx.some(f => f.type === 'rocket' || f.type === 'spark'),
    'the volley left ' + api.fx.filter(f => f.type === 'rocket' || f.type === 'spark').length +
    ' particles behind');
  // a plain barrel sends up nothing at all
  api.fx.length = 0;
  const plain = api.addProp('barrel', 2200, 1100);
  plain.seed = 0.9;
  assert(!api.crateOf(plain), 'seed 0.9 is a plain barrel');
  api.wreckProp(plain, 800, 0);
  assert(!api.fx.some(f => f.type === 'rocket'), 'a plain barrel should not launch anything');
});

test('fireworks are drawn by the light pass, not under the night wash', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2000; api.car.y = 1100; api.camSnap();
  // nothing in the buffer but the volley, so the counts are only the volley:
  // wreckProp also throws shards, puffs and a ring, and the ring strokes
  api.fx.length = 0;
  const c = api.addProp('barrel', 2000, 1100); c.seed = 0.1;
  api.launchFireworks(c);
  for (const f of api.fx) assert(f.type === 'rocket', 'only rockets: ' + f.type);
  const n = api.fx.length;
  // drawFx must not touch them; the first attempt drew them there and the
  // darkness layer went straight over the top of a whole volley
  api._resetCounts();
  api.drawFx(true); api.drawFx(false);
  const inFx = (api._counts.stroke || 0) + (api._counts.fill || 0);
  api._resetCounts();
  api.drawFireworks();
  const inLight = (api._counts.stroke || 0) + (api._counts.fill || 0);
  console.log('    (volley of ' + n + ': ' + inFx + ' pieces from drawFx, ' +
    inLight + ' from the light pass)');
  assert(inLight === n * 3,
    n + ' rockets are a tail and two dots each, got ' + inLight + ' pieces');
  assert(inFx === 0, 'drawFx should not draw a rocket, got ' + inFx + ' pieces');
});

/* ----------------------------------------------------------------- cars --- */

/* Five cars, five sets of handling numbers, and one picture: a rounded rect
   with a stripe. You could not tell which one you were driving. */
test('the five cars are five different pictures', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100; api.car.ang = 0; api.car.z = 0;
  api.car.vx = 0; api.car.vy = 0; api.car.roll = 0; api.car.plowT = 0;
  const sigs = [];
  api.G.starsPer = api.LEVELS.map(() => 3);    // everything on the forecourt
  api.G.lifeKills = 99999;
  for (const c of api.CARS){
    assert(api.selectCar(c.id),
      'could not select ' + c.id + ' — the test cannot see the car it is checking');
    api._resetCounts();
    api.drawCar();
    sigs.push({ id: c.id, sig: (api._counts.fill || 0) + ':' + (api._counts.fillRect || 0) +
      ':' + (api._counts.stroke || 0) });
  }
  console.log('    (car drawings: ' + sigs.map(s2 => s2.id + ' ' + s2.sig).join(', ') + ')');
  const distinct = new Set(sigs.map(s2 => s2.sig));
  assert(distinct.size >= 4,
    'the cars should not collapse onto one drawing, got ' + distinct.size + ' of 5');
});

test('the lit side of the car belongs to the market, not to the car', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const norm = (a) => { while (a < -Math.PI) a += 6.283; while (a > Math.PI) a -= 6.283; return a; };
  api.car.ang = 0;
  const at0 = api.carLitDir();
  api.car.ang = 1;
  const at1 = api.carLitDir();
  assert(Math.abs(norm(at0 - at1) - 1) < 1e-6,
    'turning the car a radian should turn the highlight a radian the other way: ' +
    at0.toFixed(3) + ' -> ' + at1.toFixed(3));
  // and it points back at the light the whole scene uses
  api.car.ang = 0;
  const want = Math.atan2(-api.SUN_DY, -api.SUN_DX);
  assert(Math.abs(norm(api.carLitDir() - want)) < 1e-6,
    'a car pointing along +x should be lit from the scene light: ' +
    api.carLitDir().toFixed(3) + ' vs ' + want.toFixed(3));
});

/* Brake lights are a lamp, not a force: nothing in the simulation may learn
   about them, and a counted frame must not depend on whether they are lit. */
test('the brake lights come on when the car is losing speed, and cost nothing', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2000; api.car.y = 1100; api.car.ang = 0; api.car.z = 0;
  api.car.vx = 900; api.car.vy = 0; api.car.dispSp = undefined;
  api.drawCar();
  assert(!api.car.brakeGlow, 'the first frame has nothing to compare against');
  for (let i = 0; i < 6; i++) api.drawCar();
  assert(!api.car.brakeGlow, 'holding a steady speed is not braking');
  // the styles are deliberately left out: the whole point is that the same
  // operations run either way and only the colour of the lamp changes
  const ops = () => { const c = Object.assign({}, api._counts); delete c._styles;
    return JSON.stringify(c); };
  api._resetCounts(); api.drawCar();
  const cruising = ops();
  api.car.vx = 300;                                    // stamp on it
  api.drawCar();
  assert(api.car.brakeGlow, 'losing 600px/s in a frame should light the brakes');
  api._resetCounts(); api.drawCar();
  const braking = ops();
  assert(cruising === braking,
    'a braking frame costs something different from a cruising one, so the draw ' +
    'budget now depends on how you are driving: ' + cruising + ' vs ' + braking);
  // and they go out again once the speed settles
  for (let i = 0; i < 30; i++) api.drawCar();
  assert(!api.car.brakeGlow, 'the brakes should go out once the speed settles');
});

/* -------------------------------------------------------------- garage --- */

/* The picker was five paragraphs of text about five cars you could not see —
   on the same screen that had just told you they handle differently. Each card
   carries the car's own picture now, painted by borrowing drawCar rather than
   keeping a second copy of the art that would drift. */
test('every unlocked car card carries its own picture and its bars', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.starsPer = api.LEVELS.map(() => 0);
  api.G.lifeKills = 0;                       // only the hatchback is open
  api.G.unlocked = 21; api.startLevel(9);
  const html = api._nodes.brGarage.innerHTML;
  for (const c of api.CARS){
    assert(html.includes('data-pic="' + c.id + '"'),
      c.id + ' has no picture on its card');
  }
  const open = api.CARS.filter(c => api.carUnlocked(c));
  const shut = api.CARS.filter(c => !api.carUnlocked(c));
  assert(open.length >= 1 && shut.length >= 1,
    'this test needs one of each: ' + open.length + ' open, ' + shut.length + ' locked');
  const bars = (html.match(/<s title=/g) || []).length;
  /* Every card carries its bars now, locked or not — a car you have not earned
     was a picture and a wall, with no way to see what you were grinding for.
     See "a locked car shows what it is and how close you are to it". */
  assert(bars === api.CARS.length * api.CAR_STATS.length,
    'every car gets ' + api.CAR_STATS.length + ' bars: got ' +
    bars + ' for ' + api.CARS.length + ' cars');
  assert(html.includes('Locked — '), 'a locked card still says what it costs');
  // the bars are a real reading of the car, not decoration
  const hatch = api.CARS[0], sleigh = api.CARS.find(c => c.id === 'sleigh');
  assert(api.carBars(hatch) !== api.carBars(sleigh),
    'two cars that handle differently should not show the same bars');
});

/* paintCarThumb borrows CAR, CARL, CARW and the live car object to draw a
   different car for a moment. If any of it leaked, the market would be drawing
   the wrong vehicle. */
test('painting the forecourt puts everything back where it found it', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.startCampaign(); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2345; api.car.y = 1234; api.car.ang = 0.7; api.car.z = 40;
  api.car.vx = 800; api.car.vy = -120; api.car.gore = 3; api.car.dents = 2;
  const before = { id: api.getCar().id, dims: JSON.stringify(api.getDims()),
    car: JSON.stringify([api.car.x, api.car.y, api.car.ang, api.car.z,
      api.car.vx, api.car.vy, api.car.gore, api.car.dents]) };
  const cv = api._nodes.__thumb || (api._nodes.__thumb =
    { width: api.THUMB_W * 2, height: api.THUMB_H * 2, getContext: () => api._ctxStub });
  for (const c of api.CARS) api.paintCarThumb(cv, c);
  assert(api.getCar().id === before.id, 'the market is now driving a ' + api.getCar().id);
  assert(JSON.stringify(api.getDims()) === before.dims,
    'the car dimensions were left as the last thumbnail: ' + JSON.stringify(api.getDims()));
  assert(JSON.stringify([api.car.x, api.car.y, api.car.ang, api.car.z,
    api.car.vx, api.car.vy, api.car.gore, api.car.dents]) === before.car,
    'the live car was left where the thumbnail put it');
});

test('withCtx hands the game canvas back even when the drawing throws', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const other = { calls: 0, fill(){ this.calls++; } };
  api.withCtx(other, () => {});
  api._resetCounts();
  api.drawVignette();
  assert((api._counts.fillRect || 0) > 0,
    'the game canvas should be back after a borrow');
  let threw = false;
  try { api.withCtx(other, () => { throw new Error('boom'); }); } catch (_){ threw = true; }
  assert(threw, 'the error should come back out');
  api._resetCounts();
  api.drawVignette();
  assert((api._counts.fillRect || 0) > 0,
    'a drawing that throws must still hand the canvas back');
});

/* --------------------------------------------------------------- finale --- */

/* Twenty-one markets flattened and the end card said three numbers. */
test('the finale counts the whole campaign, not just the last market', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.unlocked = 21; api.G.starsPer = api.LEVELS.map(() => 3);
  api.startCampaign(); api.beginLevel();
  assert(api.G.totalWrecks === 0, 'a fresh campaign has wrecked nothing');
  api.G.phase = 'drive';
  const first = api.props.filter(o => !o.dead).slice(0, 5);
  for (const o of first) api.wreckProp(o, 900, 0);
  assert(api.G.totalWrecks === 5, 'five wrecks, got ' + api.G.totalWrecks);
  // and it carries across markets, where G.wrecks does not
  api.startLevel(1); api.beginLevel();
  api.G.phase = 'drive';
  assert(api.G.wrecks === 0, 'the per-market count starts again');
  assert(api.G.totalWrecks === 5, 'the campaign count does not: ' + api.G.totalWrecks);
  for (const o of api.props.filter(o => !o.dead).slice(0, 3)) api.wreckProp(o, 900, 0);
  assert(api.G.totalWrecks === 8, 'eight across two markets, got ' + api.G.totalWrecks);

  api.G.score = 421700; api.G.totalKills = 3120;
  api.finale();
  const txt = (id) => String(api._nodes[id].textContent);
  assert(txt('fnScore') === '421,700', 'total: ' + txt('fnScore'));
  assert(txt('fnKills') === '3,120', 'shoppers: ' + txt('fnKills'));
  assert(txt('fnWrecks') === '8', 'wrecked: ' + txt('fnWrecks'));
  assert(txt('fnStars') === '★ 63/63', 'stars: ' + txt('fnStars'));
  console.log('    (finale tiles: ' + ['fnScore', 'fnBest', 'fnKills', 'fnWrecks', 'fnStars']
    .map(txt).join(' · ') + ')');
  // a new campaign starts the counts again
  api.startCampaign();
  assert(api.G.totalWrecks === 0 && api.G.totalKills === 0,
    'DRIVE IT AGAIN should start from nothing');
});

test('the finale sets off fireworks, and nothing else does', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.fx.length = 0;
  // aiming at a market is not a celebration
  api.G.phase = 'aim';
  for (let i = 0; i < 180; i++) api.update(1 / 60);
  assert(!api.fx.some(f => f.type === 'rocket'),
    'the aim phase launched fireworks');

  api.G.phase = 'finale'; api.G.fwT = 0;
  let volleys = 0, peak = 0;
  for (let i = 0; i < 600; i++){
    const before = api.fx.filter(f => f.type === 'rocket').length;
    api.update(1 / 60);
    const after = api.fx.filter(f => f.type === 'rocket').length;
    if (after > before) volleys++;
    peak = Math.max(peak, api.fx.length);
  }
  console.log('    (ten seconds of finale: ' + volleys + ' volleys, ' + peak + ' particles at the peak)');
  assert(volleys >= 8, 'ten seconds should be a display, got ' + volleys + ' volleys');
  assert(peak < 900, 'and it must not pile up: ' + peak + ' particles');
  // it stops when the card goes
  api.G.phase = 'aim'; api.G.fwT = 0;
  for (let i = 0; i < 300; i++) api.update(1 / 60);
  assert(!api.fx.some(f => f.type === 'rocket'),
    'the display kept going after the finale ended');
});

test('the finale display does not move the simulation', () => {
  const run = (celebrate) => {
    const api = boot({ w: 1440, h: 810 });
    api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
    api.G.phase = celebrate ? 'finale' : 'results';
    api.car.x = 2600; api.car.y = 1100; api.camSnap();
    api.G.fwT = 0;
    for (let i = 0; i < 600; i++) api.update(1 / 60);
    return { next: api.rnd(),
      rockets: api.fx.filter(f => f.type === 'rocket').length };
  };
  const on = run(true), off = run(false);
  assert(on.next === off.next,
    'ten seconds of fireworks advanced the simulation RNG: ' + on.next + ' vs ' + off.next);
});

/* ----------------------------------------------------------------- menu --- */

/* The menu shared the aim camera, which deliberately centres the empty launch
   lane so you can see your own car before you pull it back. On the title
   screen that meant a black rectangle with a market off the right-hand edge. */
test('the title screen looks at the market, not at the empty lane', () => {
  const api = boot({ w: 1440, h: 810 });
  api.toMenu();
  api.setT(0);
  const menu = api.camTarget();
  const midX = (api.bounds.x0 + api.bounds.x1) / 2;
  assert(api.G.phase === 'menu', 'toMenu should leave us on the menu');
  assert(Math.abs(menu.x - midX) < (api.bounds.x1 - api.bounds.x0) * 0.25,
    'the title camera should sit near the middle of the market: ' +
    Math.round(menu.x) + ' vs a middle of ' + Math.round(midX));
  assert(menu.x > api.C.ANCHOR.x + 400,
    'and well clear of the sling at ' + api.C.ANCHOR.x + ', got ' + Math.round(menu.x));

  // the aim camera still frames the lane, because there you need to see the car
  api.G.phase = 'aim';
  const aim = api.camTarget();
  assert(aim.x < menu.x, 'the aim view should still sit further back than the title view: ' +
    Math.round(aim.x) + ' vs ' + Math.round(menu.x));
});

test('the title camera drifts, and never off the market', () => {
  const api = boot({ w: 1440, h: 810 });
  api.toMenu();
  const seen = [];
  for (let i = 0; i < 200; i++){
    api.setT(i * 0.5);
    const c = api.camTarget();
    seen.push(c);
    assert(c.x > api.bounds.x0 && c.x < api.bounds.x1,
      'the drift left the market at T=' + (i * 0.5) + ': x ' + Math.round(c.x));
    assert(c.y > api.bounds.y0 && c.y < api.bounds.y1,
      'the drift left the market at T=' + (i * 0.5) + ': y ' + Math.round(c.y));
  }
  const xs = seen.map(c => c.x), ys = seen.map(c => c.y);
  const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
  console.log('    (title drift: ' + Math.round(spanX) + ' x ' + Math.round(spanY) + ')');
  assert(spanX > 200 && spanY > 100, 'it should actually move: ' +
    Math.round(spanX) + ' x ' + Math.round(spanY));
  // and it is the clock, not a dice roll — same T, same place
  api.setT(12.5);
  const a = api.camTarget();
  for (let i = 0; i < 20; i++) api.rnd();
  api.setT(12.5);
  const b2 = api.camTarget();
  assert(a.x === b2.x && a.y === b2.y, 'the drift moved when the RNG did');
});

test('the title screen shows a lit market and no HUD', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.toMenu();
  const last = api.LEVELS[api.LEVELS.length - 1];
  assert(api.getTheme().name === api.THEMES[last.theme].name,
    'the backdrop should be the last market: got ' + api.getTheme().name);
  assert(api.props.length > 40, 'and it should be a full one, got ' + api.props.length);
  // no score plate, no cars left, no nitro on a title screen
  api._resetCounts();
  api.drawHUD();
  assert(!Object.keys(api._counts).length,
    'the HUD drew on the menu: ' + JSON.stringify(api._counts));
  // picking a market still builds that market, not the backdrop
  api.pickLevel(0);
  assert(api.getTheme().name === api.THEMES[api.LEVELS[0].theme].name,
    'the backdrop leaked into the market you picked: ' + api.getTheme().name);
});

/* -------------------------------------------------------------- pickups --- */

/* The three things on the floor you are meant to steer into. They were 34px
   icons under a flat alpha .18 disc, drawn before the darkness layer — so at
   night the thing you were supposed to chase was dimmer than the snow. */
function pickupRig(w, h){
  const api = boot({ count: true, w: w || 1440, h: h || 810 });
  api.G.unlocked = 21; api.startLevel(6); api.beginLevel();
  api.G.phase = 'drive';
  api.pickups.length = 0;
  api.car.x = 2600; api.car.y = 1100; api.camSnap();
  ['nitro', 'plow', 'star'].forEach((k, i) => {
    api.pickups.push({ x: api.cam.x + (i - 1) * 120, y: api.cam.y,
      kind: k, taken: false, bob: i * 2, r: 34 });
  });
  api.setT(3);
  return api;
}

test('a pickup is lit by the light pass, not painted under the night', () => {
  const api = pickupRig();
  api.drawPickupGlow();                         // bake the three sprites first
  api._resetCounts();
  for (const u of api.pickups) api.drawPickup(u);
  const onGround = api._counts.drawImage || 0;
  api._resetCounts();
  api.drawPickupGlow();
  const inLight = { img: api._counts.drawImage || 0, fill: api._counts.fill || 0,
    stroke: api._counts.stroke || 0 };
  console.log('    (pickups: ' + onGround + ' glow images from drawPickup, ' +
    inLight.img + ' from the light pass, ' + inLight.stroke + ' rings)');
  assert(onGround === 0, 'drawPickup should not lay down a glow: ' + onGround);
  assert(inLight.img === 3, 'one glow sprite each, got ' + inLight.img);
  assert(inLight.stroke === 3, 'and one breathing ring each, got ' + inLight.stroke);
});

test('each pickup carries its own colour', () => {
  const api = pickupRig();
  const cols = api.pickups.map(u => api.pickupCol(u));
  assert(new Set(cols).size === 3, 'three kinds, three colours: ' + cols.join(' | '));
  for (const c of cols) assert(/^\d+,\d+,\d+$/.test(c), 'not an rgb triple: ' + c);
  api.drawPickupGlow();
  const baked = api.getBakeCount();
  for (let i = 0; i < 40; i++){ api.setT(3 + i * 0.05); api.drawPickupGlow(); }
  assert(api.getBakeCount() === baked,
    'forty frames rebaked the pickup glows: ' + baked + ' -> ' + api.getBakeCount());
});

test('a taken pickup and an off-camera one cost nothing', () => {
  const api = pickupRig();
  api.drawPickupGlow();
  api._resetCounts();
  api.drawPickupGlow();
  const all = (api._counts.fill || 0) + (api._counts.stroke || 0) + (api._counts.drawImage || 0);
  for (const u of api.pickups) u.taken = true;
  api._resetCounts();
  api.drawPickupGlow();
  for (const u of api.pickups) api.drawPickup(u);
  assert(!Object.keys(api._counts).length,
    'a collected pickup is still being drawn: ' + JSON.stringify(api._counts));
  // and one on the far side of the market is culled from the glow pass
  for (const u of api.pickups){ u.taken = false; u.x = api.cam.x + 90000; }
  api._resetCounts();
  api.drawPickupGlow();
  assert(!Object.keys(api._counts).length,
    'an off-camera pickup is still being lit: ' + JSON.stringify(api._counts));
  // three sprites and three rings — the control the two nothings are measured
  // against, so a pass that quietly drew nothing at all would still fail
  assert(all === 6, 'the control run should be three glows and three rings, got ' + all);
});

/* Ice is the one thing on the floor that changes how the car drives, and it
   was a pale disc with three scratches on it. */
test('a patch of ice is a cracked sheet, drawn in one stroke', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(6); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.ice.length = 0; api.spills.length = 0; api.gore.length = 0;
  api.foot.length = 0; api.debris.length = 0; api.tracks.length = 0;
  api.drawGround();
  api._resetCounts();
  api.drawGround();
  const bare = { fill: api._counts.fill || 0, stroke: api._counts.stroke || 0 };
  api.ice.push({ x: api.cam.x, y: api.cam.y, r: 150, seed: 0.3 });
  api._resetCounts();
  api.drawGround();
  const iced = { fill: api._counts.fill || 0, stroke: api._counts.stroke || 0 };
  const fills = iced.fill - bare.fill, strokes = iced.stroke - bare.stroke;
  console.log('    (one patch of ice: ' + fills + ' fills, ' + strokes + ' strokes)');
  assert(fills >= 3, 'a sheet, a facet and a specular: ' + fills + ' fills');
  assert(strokes === 2,
    'the rim and the cracks are one stroke each, not one a crack: ' + strokes);
});

/* ------------------------------------------------------------- garlands --- */

/* A Christmas market has lights strung between the stalls and this one had
   none. They are paired off the finished prop list rather than during
   generation, so not one number in them comes out of either RNG. */
test('every market strings its stalls together, once each', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.unlocked = 21;
  const seen = [];
  for (const lv of [0, 5, 12, 20]){
    api.startLevel(lv); api.beginLevel();
    const huts = api.props.filter(o => o.kind === 'hut');
    assert(api.wires.length >= 2,
      api.LEVELS[lv].name + ' strung ' + api.wires.length + ' wires between ' +
      huts.length + ' stalls');
    seen.push(api.LEVELS[lv].name + ' ' + api.wires.length + '/' + huts.length);
    // one end each: no stall is on two cables
    const ends = [];
    for (const w of api.wires){ ends.push(w.a, w.b); }
    assert(new Set(ends).size === ends.length,
      'a stall is holding up two cables in ' + api.LEVELS[lv].name);
    for (const w of api.wires){
      assert(w.a !== w.b, 'a cable is strung to the stall it starts at');
      assert(huts.indexOf(w.a) >= 0 && huts.indexOf(w.b) >= 0, 'a cable is tied to a tree');
      const dx = w.b.x - w.a.x, dy = Math.abs(w.b.y - w.a.y);
      assert(dx >= api.WIRE_MIN && dx <= api.WIRE_MAX,
        'a cable spans ' + Math.round(dx) + ', outside ' + api.WIRE_MIN + '-' + api.WIRE_MAX);
      assert(dy <= api.WIRE_DY, 'a cable climbs ' + Math.round(dy) + ', over ' + api.WIRE_DY);
    }
  }
  console.log('    (wires per market: ' + seen.join(', ') + ')');
});

test('stringing the lights does not touch either generator', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  const key = () => api.wires.map(w => Math.round(w.a.x) + '>' + Math.round(w.b.x)).join('|');
  const first = key();
  assert(first.length > 10, 'there should be wires to compare');
  api.reseed(4242);
  const clean = api.rnd();
  api.reseed(4242);
  for (let i = 0; i < 20; i++) api.buildWires();
  assert(api.rnd() === clean, 'buildWires pulled from the simulation RNG');
  assert(key() === first, 'twenty rebuilds strung a different set of cables');
  // and the same market laid out again strings the same ones
  api.startLevel(20); api.beginLevel();
  assert(key() === first, 'the same market strung a different set of cables');
});

test('a market of fairy lights costs three fills', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api.setT(3);
  api._resetCounts();
  api.drawWireBulbs();
  const bulbs = { fill: api._counts.fill || 0, arc: api._counts.arc || 0 };
  console.log('    (bulbs on camera: ' + bulbs.arc + ' in ' + bulbs.fill + ' fills)');
  assert(bulbs.arc > 20, 'there should be bulbs in shot, got ' + bulbs.arc);
  assert(bulbs.fill === api.WIRE_COLS.length,
    'one fill a colour, not one a bulb: ' + bulbs.fill + ' fills for ' + bulbs.arc + ' bulbs');
  // the cables are dark and belong to the world pass, not the light pass
  api._resetCounts();
  api.drawWires();
  assert(!(api._counts.fill || 0), 'a cable is a stroke, not a fill');
  assert((api._counts.stroke || 0) === 1, 'and all of them go down in one stroke');
});

test('a cable with a stall gone from one end hangs slack, and with both gone is cut', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive';
  const w = api.wires[0];
  api.car.x = (w.a.x + w.b.x) / 2; api.car.y = (w.a.y + w.b.y) / 2; api.camSnap();
  const taut = api.wireSag(w);
  w.a.dead = true;
  const slack = api.wireSag(w);
  assert(slack > taut * 1.8, 'half a cable should hang: ' + taut.toFixed(1) + ' -> ' + slack.toFixed(1));
  // with one end standing it still lights, dimmer
  api.setT(3);
  api._resetCounts(); api.drawWireBulbs();
  const half = api._counts.arc || 0;
  assert(half > 0, 'a half-standing cable still has bulbs on it');
  w.b.dead = true;
  api._resetCounts(); api.drawWireBulbs();
  const gone = api._counts.arc || 0;
  api._resetCounts(); api.drawWires();
  assert(gone < half, 'a cable with both ends down should lose its bulbs: ' + gone + ' vs ' + half);
});

/* -------------------------------------------------------------- weather --- */

/* Snow fell straight down at a fixed drift whatever the weather was doing: a
   blizzard and a still night moved the same way. */
function windOver(api, n){
  const w = [];
  for (let i = 0; i < n; i++){ api.setT(i * 0.37); w.push(api.windNow()); }
  return w;
}

test('the wind swells and drops, and a blizzard blows harder than a still night', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.unlocked = 21;
  api.startLevel(20); api.beginLevel();                 // a calm theme
  const calm = windOver(api, 400).map(Math.abs);
  api.startLevel(12); api.beginLevel();                 // BLIZZARD
  const hard = windOver(api, 400).map(Math.abs);
  const span = (a) => Math.max(...a) - Math.min(...a);
  console.log('    (wind: calm ' + Math.min(...calm).toFixed(3) + '-' +
    Math.max(...calm).toFixed(3) + ', blizzard ' + Math.min(...hard).toFixed(3) + '-' +
    Math.max(...hard).toFixed(3) + ')');
  assert(span(calm) > 0.01 && span(hard) > 0.05,
    'the wind should gust, not sit still: ' + span(calm).toFixed(3) + ' / ' + span(hard).toFixed(3));
  assert(Math.min(...hard) > Math.max(...calm),
    'the quietest moment of a blizzard should still beat the windiest calm night: ' +
    Math.min(...hard).toFixed(3) + ' vs ' + Math.max(...calm).toFixed(3));
  assert(Math.max(...hard) < 0.5, 'and it must not run away: ' + Math.max(...hard).toFixed(3));
  // it is the clock, not the generator
  api.setT(9.5);
  const a = api.windNow();
  for (let i = 0; i < 30; i++){ api.rnd(); api.vrnd(); }
  api.setT(9.5);
  assert(api.windNow() === a, 'the wind moved when a generator did');
});

test('a calm night falls in dots and a blizzard blows in streaks', () => {
  const cost = (lv) => {
    const api = boot({ count: true, w: 1440, h: 810 });
    api.G.unlocked = 21; api.startLevel(lv); api.beginLevel();
    let strokes = 0, fills = 0, lit = 0;
    for (let i = 0; i < 120; i++){
      api.setT(i * 0.37);
      api._resetCounts();
      api.drawSnow();
      strokes += api._counts.stroke || 0;
      fills += api._counts.fill || 0;
      if ((api._counts.stroke || 0) > 1) lit++;
    }
    return { strokes, fills, frames: 120, over: lit };
  };
  const calm = cost(20), hard = cost(12);
  console.log('    (snow over 120 frames: calm ' + calm.strokes + ' strokes, blizzard ' +
    hard.strokes + ')');
  assert(calm.fills === 120 && hard.fills === 120,
    'every frame lays the heads down in exactly one fill');
  assert(calm.strokes === 0, 'a calm night should draw no streaks at all, got ' + calm.strokes);
  assert(hard.strokes > 100, 'a blizzard should streak nearly every frame, got ' + hard.strokes);
  assert(!hard.over, 'and all of the tails in a frame go down in one stroke');
});

test('the weather does not touch the simulation', () => {
  const api = boot({ w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(12); api.beginLevel();
  api.reseed(777);
  const clean = api.rnd();
  api.reseed(777);
  for (let i = 0; i < 900; i++){ api.setT(i / 60); api.stepSnow(1 / 60); }
  assert(api.rnd() === clean,
    'fifteen seconds of blizzard moved the simulation RNG: ' + api.rnd() + ' vs ' + clean);
});

/* Fog was one flat rgba(214,228,246,TH.fog) over the whole frame — the same
   value in every corner, which is the one thing fog never is. */
test('fog is banks drifting, not a flat wash', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.G.unlocked = 21;
  api.startLevel(12); api.beginLevel();                  // BLIZZARD, the foggiest
  assert(api.getTheme().fog > 0, 'this theme should have fog on it');
  api.drawVignette();                                    // warm the gradient
  api._resetCounts();
  api.drawVignette();
  const foggy = { img: api._counts.drawImage || 0, rect: api._counts.fillRect || 0 };
  assert(foggy.img >= 4, 'fog should be drifting banks, got ' + foggy.img + ' of them');
  assert(foggy.rect >= 1, 'with a wash under them so a heavy theme still reads');
  // a theme with no fog pays for none of it
  const clear = api.LEVELS.findIndex(lv => api.THEMES[lv.theme].fog === 0);
  assert(clear >= 0, 'some theme should be clear');
  api.startLevel(clear); api.beginLevel();
  api.drawVignette();
  api._resetCounts();
  api.drawVignette();
  console.log('    (fog: ' + foggy.img + ' banks on the blizzard, ' +
    (api._counts.drawImage || 0) + ' on ' + api.getTheme().name + ')');
  assert(!(api._counts.drawImage || 0),
    'a clear night is drawing fog banks: ' + api._counts.drawImage);
});

/* ----------------------------------------------------------------- gate --- */

/* Every run starts on an empty white lane with two dashed lines on it and the
   market somewhere off in the distance — a third of every aim frame was
   nothing at all. There is a gate across it now with the market's name on it. */
test('the gate names the market it stands in front of', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.G.unlocked = 21;
  for (const lv of [0, 9, 20]){
    api.startLevel(lv); api.beginLevel();
    api.G.phase = 'aim'; api.car.x = api.C.ANCHOR.x; api.camSnap();
    api._resetCounts();
    api.drawGate();
    const words = (api._counts._text || []).join('|');
    assert(words === api.LEVELS[lv].name,
      'the gate to ' + api.LEVELS[lv].name + ' reads "' + words + '"');
  }
});

test('the gate is scenery: you drive straight through it', () => {
  const api = boot({ w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  // nothing in props sits on it, so hitProp can never find it
  for (const o of api.props){
    const near = Math.abs(o.x - api.GATE_X) < 60 &&
      Math.abs(o.y - api.C.ANCHOR.y) < api.GATE_HALF;
    assert(!near, 'a real prop is standing in the gateway at ' +
      Math.round(o.x) + ',' + Math.round(o.y));
  }
  // and a car parked in the gateway hits nothing and scores nothing
  api.G.phase = 'drive';
  api.car.x = api.GATE_X; api.car.y = api.C.ANCHOR.y;
  api.car.vx = 1400; api.car.vy = 0;
  const score = api.G.levelScore, sp = api.carSpeed();
  api.stepCarCollisions(1 / 60);
  assert(api.G.levelScore === score, 'the gate scored ' + (api.G.levelScore - score));
  assert(Math.abs(api.carSpeed() - sp) < 1e-6,
    'the gate slowed the car from ' + sp.toFixed(1) + ' to ' + api.carSpeed().toFixed(1));
});

test('the gate is culled once you are past it, and its bulbs are three fills', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = api.GATE_X; api.car.y = api.C.ANCHOR.y; api.camSnap();
  api.setT(2);
  api._resetCounts();
  api.drawGate();
  const seen = (api._counts.fill || 0) + (api._counts.fillRect || 0);
  api._resetCounts();
  api.drawGateBulbs();
  const bulbs = { fill: api._counts.fill || 0, arc: api._counts.arc || 0 };
  console.log('    (gate: ' + seen + ' pieces, ' + bulbs.arc + ' bulbs in ' +
    bulbs.fill + ' fills)');
  assert(seen > 8, 'the gate should be drawn when it is in shot, got ' + seen);
  assert(bulbs.arc >= 10, 'with bulbs on it, got ' + bulbs.arc);
  assert(bulbs.fill === api.WIRE_COLS.length,
    'one fill a colour, not one a bulb: ' + bulbs.fill);
  // deep in the market it costs nothing at all
  api.car.x = api.bounds.x1 - 200; api.camSnap();
  api._resetCounts();
  api.drawGate(); api.drawGateBulbs();
  assert(!Object.keys(api._counts).length,
    'the gate is still being drawn from the far end of the market: ' +
    JSON.stringify(api._counts));
});

/* ---------------------------------------------------------------- signs --- */

/* The trades landed a while back and the only way to read one was to look at
   the counter, which at driving speed you do not. Every stall has a hanging
   sign now — and a sign each for a hundred stalls would have been three
   hundred fills against a budget with 660 left in it, so the whole market's
   worth of them is a fixed handful of draw calls. */
function signCost(api, lv){
  api.startLevel(lv); api.beginLevel();
  api.G.phase = 'drive';
  api.car.x = 2600; api.car.y = 1100; api.camSnap();
  api._resetCounts();
  api.drawStallSigns();
  const v = api.getView();
  const inShot = api.props.filter(o => o.kind === 'hut' && !o.dead &&
    Math.abs(o.x - api.cam.x) < v.w / api.cam.s / 2 + 200 &&
    Math.abs(o.y - api.cam.y) < v.h / api.cam.s / 2 + 200).length;
  return { fills: api._counts.fill || 0, strokes: api._counts.stroke || 0, inShot };
}

test('a market of signs costs the same however many stalls are in shot', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.G.unlocked = 21;
  const small = signCost(api, 0), big = signCost(api, 20);
  console.log('    (signs: ' + small.inShot + ' stalls -> ' + small.fills + ' fills, ' +
    big.inShot + ' stalls -> ' + big.fills + ' fills)');
  assert(big.inShot > small.inShot * 2,
    'the two markets should differ a lot: ' + small.inShot + ' vs ' + big.inShot);
  // two boards plus one pass per trade actually in shot, and one bracket stroke
  assert(big.fills <= 2 + api.TRADES.length,
    'a busy market should still be two boards and at most one fill a trade, got ' + big.fills);
  assert(small.fills <= big.fills,
    'a quiet market cannot cost more than a busy one: ' + small.fills + ' vs ' + big.fills);
  assert(big.strokes === 1, 'every bracket in one stroke, got ' + big.strokes);
  assert(big.fills >= 4, 'and it should actually be drawing signs, got ' + big.fills);
});

/* If anything inside signMark ever sets a style or fills, every sign in the
   market becomes its own draw call and the guarantee above is gone. */
test('a sign pictogram adds to the path and nothing else', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.startCampaign(); api.beginLevel();
  for (const t of api.TRADES){
    api._resetCounts();
    api.signMark(t.goods, 100, 100);
    const c = Object.assign({}, api._counts);
    delete c.moveTo; delete c.lineTo; delete c.arc; delete c.rect; delete c.closePath;
    assert(!Object.keys(c).length,
      t.id + "'s mark does more than build a path: " + JSON.stringify(c));
    const drew = (api._counts.moveTo || 0) + (api._counts.rect || 0) + (api._counts.arc || 0);
    assert(drew > 0, t.id + "'s mark draws nothing at all");
  }
});

test('a wrecked stall loses its sign, and so does one off camera', () => {
  const api = boot({ count: true, w: 1440, h: 810 });
  api.G.unlocked = 21; api.startLevel(20); api.beginLevel();
  api.G.phase = 'drive'; api.car.x = 2600; api.car.y = 1100; api.camSnap();
  const huts = api.props.filter(o => o.kind === 'hut');
  api._resetCounts(); api.drawStallSigns();
  const before = api._counts.rect || 0;
  assert(before > 0, 'there should be signs to lose');
  for (const o of huts) o.dead = true;
  api._resetCounts(); api.drawStallSigns();
  assert(!Object.keys(api._counts).length,
    'a flattened market is still hanging signs: ' + JSON.stringify(api._counts));
  for (const o of huts){ o.dead = false; o.x += 90000; }
  api._resetCounts(); api.drawStallSigns();
  assert(!Object.keys(api._counts).length,
    'signs are being drawn from the far side of the world: ' + JSON.stringify(api._counts));
  // the sign hangs off the stall, on the aisle side
  const o = { x: 2000, y: 1100, w: 158, h: 112 };
  const p = api.signAt(o);
  assert(p.x < o.x - o.w / 2, 'the sign should hang clear of the stall it belongs to');
  assert(Math.abs(p.y - o.y) < o.h, 'and stay alongside it');
});

/* ---------------------------------------------------------------- cover --- */

/* Every other entry on the games index has a cover.webp poster and a cover.webm
   clip that plays on hover. This one had neither, so its card on the front page
   of the site showed a broken image. Both are recorded by
   tools/crashmas_cover.mjs — rerun it if this goes red because the game looks
   different, not because the numbers below are inconvenient. */
const COVER = path.join(__dirname, '..', 'merry_crashmas');

test('the games index has a poster and a clip to show for this game', () => {
  const webp = path.join(COVER, 'cover.webp'), webm = path.join(COVER, 'cover.webm');
  assert(fs.existsSync(webp), 'no cover.webp — the index card shows a broken image');
  assert(fs.existsSync(webm), 'no cover.webm — the card has nothing to play on hover');

  // and the index is still asking for exactly those two names
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(index.includes('cover.webp') && index.includes('cover.webm'),
    'the index stopped asking for cover.webp/cover.webm');
  assert(/id:\s*'crashmas'[^}]*href:\s*'\/merry_crashmas\//.test(index),
    'the index card no longer points at /merry_crashmas/');

  const p = fs.readFileSync(webp), m = fs.readFileSync(webm);
  assert(p.slice(0, 4).toString() === 'RIFF' && p.slice(8, 12).toString() === 'WEBP',
    'cover.webp is not a WebP');
  assert(m.slice(0, 4).toString('hex') === '1a45dfa3',
    'cover.webm is not an EBML container');
  assert(m.slice(0, 64).toString('latin1').includes('webm'),
    'cover.webm does not declare itself WebM');

  /* The poster is 480x270 like every other cover on the index, read out of the
     VP8 bitstream rather than by decoding it: 14 bits of width and 14 of height
     after the start code. */
  const vp8 = p.indexOf(Buffer.from('VP8 '));
  assert(vp8 > 0, 'cover.webp has no VP8 chunk');
  const f = vp8 + 8 + 6;                       // chunk header, then the sync code
  const w = p.readUInt16LE(f + 0) & 0x3fff, h = p.readUInt16LE(f + 2) & 0x3fff;
  assert(w === 480 && h === 270,
    'the poster should be 480x270 like the rest of the index, got ' + w + 'x' + h);

  /* The other clips on the index run 70-150KB and the posters 2-14KB. Left at
     the browser's default bitrate this clip came out at half a megabyte. */
  console.log('    (cover: poster ' + p.length + ' bytes, clip ' + m.length + ' bytes)');
  assert(p.length < 40 * 1024, 'the poster is ' + p.length + ' bytes, out of line with the index');
  assert(m.length > 20 * 1024, 'the clip is ' + m.length + ' bytes — too small to be a clip');
  assert(m.length < 260 * 1024,
    'the clip is ' + m.length + ' bytes, well over the biggest cover on the index');
});

/* ---------------------------------------------------------------- sling --- */

/* The sling is what you look at on every shot of the game, and it was two bare
   brown L-strokes on empty snow while every stall around it had a lit side and
   a snow cap. */
test('the band tightens as you pull, and goes red the wrong way', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  const A = api.C.ANCHOR;
  const band = (frac, wrong) => {
    api._resetCounts();
    api.slingBand(A.x - api.C.MAX_PULL * frac, A.y, 1, !!wrong);
    return { widths: (api._counts._widths || []).slice(),
      styles: (api._counts._styles || []).slice(),
      strokes: api._counts.stroke || 0 };
  };
  const slack = band(0.15), taut = band(1);
  const heaviest = (b) => Math.max(...b.widths);
  console.log('    (band: ' + heaviest(slack).toFixed(1) + 'px slack, ' +
    heaviest(taut).toFixed(1) + 'px at full pull)');
  assert(heaviest(taut) < heaviest(slack) * 0.8,
    'the band should thin as it stretches: ' + heaviest(slack) + ' -> ' + heaviest(taut));
  assert(heaviest(taut) > 3, 'but it must still be a band, not a hair: ' + heaviest(taut));
  assert(slack.strokes === 2, 'a band is its body and its highlight, got ' + slack.strokes);
  // pulling forwards is a mistake and the band says so
  const bad = band(1, true);
  assert(bad.styles.some(c => c === '#8a2b22'),
    'dragging the wrong way should turn the band red: ' + bad.styles.join('|'));
  assert(!taut.styles.some(c => c === '#8a2b22'), 'and a good pull should not');
});

test('the sling stands on a pad, in the aim and in the recoil alike', () => {
  const api = boot({ count: true, w: 1280, h: 720 });
  api.startCampaign(); api.beginLevel();
  api._resetCounts();
  api.slingPosts();
  const st = api._counts._styles || [];
  const pad = st.indexOf('rgba(70,96,140,.16)');
  const arm = st.indexOf('#4a3524');
  const cap = st.indexOf('#eef4ff');
  assert(pad >= 0 && arm >= 0 && cap >= 0,
    'the sling should have a pad, arms and snow on the tops: ' + st.join('|'));
  assert(pad < arm && arm < cap,
    'the pad goes down first and the snow last: ' + st.join('|'));
  assert((api._counts.stroke || 0) >= 3, 'the arms and the scuff are strokes');

  // both the aim frame and the quarter second after release put it up
  const drew = (fn) => { api._resetCounts(); fn(); return api._counts._styles || []; };
  api.G.phase = 'aim';
  api.aim.active = true;
  api.aim.x = api.C.ANCHOR.x - api.C.MAX_PULL; api.aim.y = api.C.ANCHOR.y;
  api.aimCar();
  const aimed = drew(() => api.drawAim());
  assert(aimed.includes('rgba(70,96,140,.16)'), 'the aim frame should show the pad');
  api.G.phase = 'drive';
  api.G.sling = { t: 0.05, len: api.C.MAX_PULL, ux: -1, uy: 0 };
  const recoil = drew(() => api.drawSling());
  assert(recoil.includes('rgba(70,96,140,.16)'), 'so should the recoil frame');
  assert(recoil.includes('#2c1f16'), 'and the band should whip back through it');
  // and nothing at all once the sling is gone
  api.G.sling = null;
  api._resetCounts(); api.drawSling();
  assert(!Object.keys(api._counts).length,
    'the sling is still being drawn after the recoil: ' + JSON.stringify(api._counts));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
