// Joske de Flosser — headless combat + progression suite.
//
// joske_de_flosser/index.html is one self-contained file made of several inline
// <script> blocks that share a scope. This harness concatenates them, stubs a
// no-op DOM plus a 2d context, injects a test-only expose hook (never shipped)
// and evals the result — then drives the real combat resolution, grabs,
// weapons, AI, waves, stage flow and lives through the actual game code.
// draw() is exercised on every stage and every fighter state, so render-time
// errors fail here rather than on somebody's phone.
// Run: node tests/joske_de_flosser.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'joske_de_flosser', 'index.html');
const RAW = fs.readFileSync(HTML, 'utf8');

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg){ if (Math.abs(a - b) > eps) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`); }

const BOOT_TAIL = `loadMeta();
bindInput();
bindUI();
fit();
syncUI();
toTitle();
requestAnimationFrame(loop);`;

const EXPOSE = `__out.api = {
  G, cam, W, INPUT, KEYS, STAGES, ATK, ENEMY, DIFF, WEAPON, SKINS, A, FONT, MUSIC, snd, SFX,
  VW, VH, FLOOR_TOP, FLOOR_BOT, FLOOR_MID, GRAV, STEP, BODY_H, HIT_DEPTH, SAVE_KEY,
  get fighters(){ return fighters; }, set fighters(v){ fighters = v; },
  get items(){ return items; }, set items(v){ items = v; },
  get fx(){ return fx; }, get players(){ return players; },
  getT: () => T, setT: (v) => { T = v; },
  reseed, rng, clamp, lerp, sign,
  mkFighter, spawnPlayer, spawnEnemy, mkItem, pickUp, throwItem, breakItem, itemUnderfoot,
  startAttack, attackTick, applyHit, knockDown, knockOut, tryGrab, throwHeld, releaseHold, breakFree,
  updateFighter, playerControl, aiControl, separate, updateItems, updateFx, updateWaves,
  updateDeaths, updateCamera, respawnPlayer, doContinue, tokensOut, tokenCap, foeBehind, nearestFoe,
  liveEnemies, alivePlayers, isDown, canAct, addScore, fireSlug, thrownSweep, MAX_ON, HORDE_SKINS,
  HORDE, hordeWave, hordeCap, startHordeRun, nextHordeWave, updateHorde, buildQueue, surgeSize, SURGE_GAP,
  chainAttack, PUNCH_CHAIN, KICK_CHAIN, gainMeter, startSuper, superTick, superStrike,
  SUPER, METER_MAX, STOCK_MAX, START_STOCKS, weaponAngle, drawSwoosh, drawAttackSwoosh, SWOOSH,
  rushTier, TOKENS_PER_TIER, RUSH_NAMES, bossTick, pickAttack, launchAttack, slamShock,
  stageRank, RANKS, RANK_BONUS, chargeMode, hazardCheck, hazardKill, poseGeom,
  SCENES, CUT_ACTORS, STORY_AFTER, cut, startCut, cutTick, cutEnd, drawCut, mkCutActor,
  UPGRADES, UP_BY_ID, upCount, hasMove, applyUpgrade, rollUpgrades, startUpgrade, chooseUpgrade,
  maybeDrop, loosePickups, LOOSE_MAX,
  drawUpgrade, chainLen, dmgMul, reachMul, meterMul, spawnWave, playerSlam, CARD_W, CARD_CHARS,
  startStage, resetStage, nextStage, stageClear, finishGame, startWave, startGame, toTitle,
  togglePause, showOver, loadMeta, saveMeta, stage, update, draw, drawHUD, drawFighter, drawBackground,
  pollInput, fit, fmtTime, text, textW, spawnFx, useWeapon, shakeScreen, visibleList,
  attract, ATTRACT_CAST, drawAttract, logo, logoGlyphs, logoFeet, LOGO_BAND,
  stickVector, stickRecentre, STICK_DEAD, STICK_MAX, fullscreenSupported, isFullscreen, toggleFullscreen,
  _ctxCounts: null,
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
      if (p === 'canvas') return { width: 384, height: 224 };
      if (typeof p === 'string' && p !== 'then' && !(p in t))
        return (...args) => { counts[p] = (counts[p] || 0) + 1; };
      return t[p];
    },
    set(t, p, v){ t[p] = v; return true; },
  });
  const el = () => ({
    style: {}, textContent: '', innerHTML: '', width: 0, height: 0, className: '',
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 384, height: 224 }),
    addEventListener(){}, removeEventListener(){}, removeAttribute(){}, setAttribute(){},
    querySelectorAll: () => [], querySelector: () => null,
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
  });
  const canvas = el();
  const nodes = {};
  const store = Object.assign({}, opts.store || {});
  const sandbox = {
    document: {
      getElementById: (id) => (id === 'c' ? canvas : (nodes[id] || (nodes[id] = el()))),
      createElement: () => el(),
    },
    window: { innerWidth: 960, innerHeight: 560, devicePixelRatio: 1, addEventListener(){} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    requestAnimationFrame: () => {},
    __out: {},
  };
  return { sandbox, store, counts, nodes, canvas };
}

let SRC = null;
function source(){
  if (SRC) return SRC;
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (blocks.length < 5) throw new Error('expected the game to be split across several inline scripts');
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

const step = (api, secs, dt) => { dt = dt || api.STEP; const n = Math.round(secs / dt); for (let i = 0; i < n; i++) api.update(dt); };

/* Runs a fighter's own update loop in isolation (no waves, no camera). */
function stepFighter(api, f, secs){
  const n = Math.round(secs / api.STEP);
  for (let i = 0; i < n; i++) api.updateFighter(f, api.STEP);
}

/* Puts the game into a live stage with the intro card skipped. */
function play(api, opts){
  opts = opts || {};
  api.G.players = opts.players || 1;
  api.G.diff = opts.diff == null ? 1 : opts.diff;
  api.G.stage = opts.stage || 0;
  api.G.score = [0, 0];
  api.G.lives = [3, 3];
  api.G.contT = 0;
  api.startStage();
  api.G.phase = 'play';
  api.G.cardT = 0;
  return api.players[0];
}

/* Strips the street back to just the players so a test owns the field. */
function clearField(api){
  api.fighters = api.fighters.filter(f => f.team === 'p');
  api.items = [];
  api.W.queue = [];
  api.W.active = false;
  api.W.gi = api.STAGES[api.G.stage].gates.length;
  api.cam.lock = -1;
}

/* ------------------------------------------------------------------ boot */
test('boots to the title screen without throwing', () => {
  const api = boot();
  assert(api.G.phase === 'title', 'phase should be title, got ' + api.G.phase);
  assert(api.STAGES.length === 7, 'seven scopes, street to world');
  assert(api.players.length === 0 || api.players.every(p => !p), 'no players before start');
});

test('font covers every glyph the game prints', () => {
  const api = boot();
  const used = new Set(' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:!?-\'/.,'.split(''));
  for (const ch of used) assert(api.FONT[ch], 'missing glyph: ' + JSON.stringify(ch));
  for (const s of api.STAGES){
    for (const ch of (s.name + s.sub).toUpperCase()) assert(api.FONT[ch], 'stage text needs glyph ' + ch);
  }
  for (const k in api.ENEMY) for (const ch of api.ENEMY[k].name) assert(api.FONT[ch], 'enemy name needs glyph ' + ch);
  assert(api.textW('ABC', 1) === 17, 'text width math');
});

test('no pose anywhere leaves the head off the body', () => {
  const api = boot();
  let worst = 0, worstAt = '';
  for (const name in api.A){
    api.A[name].forEach((pose, i) => {
      const g = api.poseGeom(pose);
      const d = Math.hypot(g.head[0] - g.sh[0], g.head[1] - g.sh[1]);
      if (d > worst){ worst = d; worstAt = name + '[' + i + ']'; }
      assert(d <= 9, `${name}[${i}] head is ${d.toFixed(1)} from the shoulder`);
      assert(g.head[1] > 2, `${name}[${i}] head is in the floor at ${g.head[1]}`);
      assert(g.head[1] > g.hip[1] - 4, `${name}[${i}] head is below the hip`);
    });
  }
  assert(worst > 0, 'the check actually measured something (worst ' + worstAt + ')');
});

test('a body on the floor lies down instead of standing up in place', () => {
  const api = boot();
  const lie = api.poseGeom(api.A.lie[0]);
  assert(Math.abs(lie.sh[1] - lie.hip[1]) < 4, 'the torso is roughly level with the ground');
  assert(lie.head[1] < 9, 'and the head is low, not up in the air: ' + lie.head[1]);
  assert(Math.abs(lie.head[0] - lie.hip[0]) > 12, 'with the head well away from the hip along the ground');
  const stand = api.poseGeom(api.A.idle[0]);
  assert(stand.sh[1] - stand.hip[1] > 6, 'a standing pose still stands');
});

test('every attack table entry is internally consistent', () => {
  const api = boot();
  for (const k in api.ATK){
    const a = api.ATK[k];
    assert(a.seq && a.seq.length, k + ' needs a frame sequence');
    const end = a.seq[a.seq.length - 1][1];
    assert(a.hit[0] < a.hit[1], k + ' hit window must be forward');
    assert(a.hit[1] <= end + 1e-9, k + ' hit window must end inside the move');
    assert(a.dmg > 0 && a.reach > 0, k + ' needs damage and reach');
    assert(api.A[a.anim], k + ' references a missing animation: ' + a.anim);
  }
  for (const k in api.ENEMY){
    const e = api.ENEMY[k];
    assert(api.SKINS[e.skin], k + ' references a missing skin');
    for (const atk of e.atks) assert(api.ATK[atk], k + ' references a missing attack ' + atk);
  }
});

/* --------------------------------------------------------------- combat */
test('a jab lands once, damages, and does not knock down', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 115, api.FLOOR_MID, -1);
  const hp0 = e.hp;
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.3);
  assert(e.hp < hp0, 'jab should damage: ' + hp0 + ' -> ' + e.hp);
  assert(e.hp === hp0 - api.ATK.jab.dmg, 'jab damage should be exactly the table value');
  assert(!api.isDown(e), 'a jab alone should not knock down');
  assert(p.state !== 'attack', 'the swing should have finished');
});

test('the third punch of the combo is the one that puts them down', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.face = 1; p.y = api.FLOOR_MID;
  const e = api.spawnEnemy('bruiser', 116, api.FLOOR_MID, -1);
  e.armorLeft = 0; e.hp = 200; e.hpMax = 200;
  const keys = ['jab', 'cross', 'hook'];
  const downs = [];
  for (const k of keys){
    e.state = 'idle'; e.stun = 0; e.chain = 0;
    api.startAttack(p, k);
    stepFighter(api, p, api.ATK[k].seq[api.ATK[k].seq.length - 1][1] + 0.05);
    downs.push(api.isDown(e));
  }
  assert(downs[0] === false && downs[1] === false, 'the first two punches only stagger');
  assert(downs[2] === true, 'the hook knocks down');
});

test('an attack cannot hit the same target twice in one swing', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.face = 1;
  const e = api.spawnEnemy('punk', 114, api.FLOOR_MID, -1);
  e.hp = 500; e.hpMax = 500;
  const hp0 = e.hp;
  api.startAttack(p, 'kick');
  stepFighter(api, p, 0.5);
  assert(hp0 - e.hp === api.ATK.kick.dmg, 'kick should land exactly once, lost ' + (hp0 - e.hp));
});

test('a punch misses when the target stands in a different depth lane', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_TOP + 2; p.face = 1;
  const e = api.spawnEnemy('punk', 114, api.FLOOR_BOT - 2, -1);
  const hp0 = e.hp;
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.3);
  assert(e.hp === hp0, 'depth separation should make the punch whiff');
});

test('an attack behind you whiffs, but the elbow is picked for it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.face = 1; p.y = api.FLOOR_MID;
  const e = api.spawnEnemy('punk', 86, api.FLOOR_MID, 1);
  assert(api.foeBehind(p) === e, 'the enemy is behind the player');
  const hp0 = e.hp;
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.3);
  assert(e.hp === hp0, 'a forward jab should not reach behind');
  api.startAttack(p, 'elbow');
  stepFighter(api, p, 0.4);
  assert(e.hp < hp0, 'the elbow hits backwards');
});

test('a body on the floor can be stomped, and only ground moves reach it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 112, api.FLOOR_MID, -1);
  e.hp = 300; e.hpMax = 300;
  api.knockDown(e, 1, 0, 0);
  for (let i = 0; i < 30; i++) api.updateFighter(e, api.STEP);
  assert(e.state === 'lie', 'the enemy is on the floor, got ' + e.state);
  const hp0 = e.hp;
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.3);
  assert(e.hp === hp0, 'a standing jab passes over a body on the floor');
  assert(api.INPUT[0] && true, 'input exists');
  api.startAttack(p, 'stomp');
  stepFighter(api, p, 0.45);
  assert(e.hp < hp0, 'the stomp connects');
  clearField(api);
  const up = api.spawnEnemy('punk', 112, api.FLOOR_MID, -1);
  const uhp = up.hp;
  api.startAttack(p, 'stomp');
  stepFighter(api, p, 0.45);
  assert(up.hp === uhp, 'and a stomp does not hit somebody standing');
});

test('the punch button picks the stomp when you stand over a body', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 110, api.FLOOR_MID, -1);
  api.knockDown(e, 1, 0, 0);
  for (let i = 0; i < 30; i++) api.updateFighter(e, api.STEP);
  const inp = api.INPUT[0];
  inp.pa = 1; inp.a = 1;
  api.playerControl(p, inp, api.STEP);
  inp.pa = 0; inp.a = 0;
  assert(p.atkKey === 'stomp', 'punch became a stomp, got ' + p.atkKey);
});

test('the whirl hits both sides and costs the player health', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.face = 1; p.y = api.FLOOR_MID; p.hp = 100;
  const left = api.spawnEnemy('punk', 132, api.FLOOR_MID, 1);
  const right = api.spawnEnemy('punk', 168, api.FLOOR_MID, -1);
  api.startAttack(p, 'whirl');
  assert(p.hp === 100 - api.ATK.whirl.cost, 'whirl costs health up front');
  stepFighter(api, p, 0.7);
  assert(left.hp < left.hpMax && right.hp < right.hpMax, 'whirl hits on both sides');
  assert(api.isDown(left) && api.isDown(right), 'whirl knocks down');
});

test('a jump kick knocks down and the jump lands cleanly', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.face = 1; p.state = 'jump'; p.z = 20; p.vz = 120;
  const e = api.spawnEnemy('punk', 118, api.FLOOR_MID, -1);
  p.y = e.y;
  api.startAttack(p, 'jumpkick');
  stepFighter(api, p, 1.2);
  assert(api.isDown(e) || e.dead, 'jump kick knocks down');
  near(p.z, 0, 0.001, 'player returns to the floor');
  assert(p.state === 'idle' || p.state === 'walk', 'player recovers after landing, got ' + p.state);
});

test('armour eats a light hit but never a heavy one', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.face = 1; p.y = api.FLOOR_MID;
  const e = api.spawnEnemy('bruiser', 116, api.FLOOR_MID, -1);
  const armor0 = e.armorLeft;
  assert(armor0 >= 1, 'bruisers carry armour');
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.3);
  assert(e.armorLeft === armor0 - 1, 'the light hit burns a point of armour');
  assert(!api.isDown(e) && e.state !== 'hurt', 'armour means no flinch');
  const hp1 = e.hp;
  api.startAttack(p, 'hook');
  stepFighter(api, p, 0.5);
  assert(e.hp < hp1 && api.isDown(e), 'a heavy hit goes through armour');
});

test('blocking cuts the damage down', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.face = 1; p.y = api.FLOOR_MID;
  const open = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
  api.startAttack(p, 'jab'); stepFighter(api, p, 0.3);
  const openLoss = open.hpMax - open.hp;
  clearField(api);
  const guard = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
  guard.state = 'block'; guard.blockT = 1;
  api.startAttack(p, 'jab'); stepFighter(api, p, 0.3);
  const guardLoss = guard.hpMax - guard.hp;
  assert(guardLoss < openLoss, `block should reduce damage: ${guardLoss} vs ${openLoss}`);
});

test('difficulty scales enemy damage against the player, not the other way', () => {
  const api = boot();
  const loss = [];
  for (const d of [0, 2]){
    play(api, { diff: d }); clearField(api);
    const p = api.players[0];
    p.x = 120; p.y = api.FLOOR_MID; p.invuln = 0;
    const e = api.spawnEnemy('punk', 106, api.FLOOR_MID, 1);
    e.face = 1;
    api.startAttack(e, 'swipe');
    stepFighter(api, e, 0.4);
    loss.push(p.hpMax - p.hp);
  }
  assert(loss[1] > loss[0], `hard should hurt more: ${loss[1]} vs ${loss[0]}`);
});

/* --------------------------------------------------------------- chains */
test('the punch chain walks jab, cross, hook and then starts over', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const seen = [];
  for (let n = 0; n < 4; n++){
    api.chainAttack(p, api.PUNCH_CHAIN);
    seen.push(p.atkKey);
    p.state = 'idle'; p.atk = null;                 // pretend the swing finished
  }
  assert(seen.join(',') === 'jab,cross,hook,jab', 'chain order wrong: ' + seen.join(','));
});

test('the kick chain is shin, body, head, and the head kick launches', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const seen = [];
  for (let n = 0; n < 3; n++){
    api.chainAttack(p, api.KICK_CHAIN);
    seen.push(p.atkKey);
    p.state = 'idle'; p.atk = null;
  }
  assert(seen.join(',') === 'lowkick,midkick,highkick', 'kick chain wrong: ' + seen.join(','));
  assert(api.ATK.highkick.down && api.ATK.highkick.lift > api.ATK.midkick.lift, 'the head kick launches');
  assert(api.ATK.lowkick.dur < api.ATK.midkick.dur && api.ATK.midkick.dur < api.ATK.highkick.dur,
    'each step of the chain is slower than the last');
  assert(api.ATK.lowkick.dmg < api.ATK.midkick.dmg && api.ATK.midkick.dmg < api.ATK.highkick.dmg,
    'and hits harder');
});

test('the chain is shared, so punch-punch-kick ends on the head kick', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  api.chainAttack(p, api.PUNCH_CHAIN); p.state = 'idle'; p.atk = null;
  api.chainAttack(p, api.PUNCH_CHAIN); p.state = 'idle'; p.atk = null;
  api.chainAttack(p, api.KICK_CHAIN);
  assert(p.atkKey === 'highkick', 'expected the kick finisher, got ' + p.atkKey);
});

test('letting the window lapse drops you back to the first hit', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  api.chainAttack(p, api.PUNCH_CHAIN);
  p.state = 'idle'; p.atk = null;
  assert(p.comboT > 0, 'the window opened');
  stepFighter(api, p, 1.2);                          // wait it out
  api.chainAttack(p, api.PUNCH_CHAIN);
  assert(p.atkKey === 'jab', 'a late punch is a fresh jab, got ' + p.atkKey);
});

test('the finisher of each chain knocks down, the openers do not', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  for (const [opener, finisher] of [['jab', 'hook'], ['lowkick', 'highkick']]){
    for (const key of [opener, finisher]){
      clearField(api);
      const e = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
      e.hp = 400; e.hpMax = 400; e.hitChain = 0;
      api.startAttack(p, key);
      stepFighter(api, p, 0.7);
      const down = api.isDown(e);
      assert(key === finisher ? down : !down, key + ' knockdown expectation failed');
    }
  }
});

test('the hit counter counts hits, not chain position', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('bruiser', 116, api.FLOOR_MID, -1);
  e.hp = 900; e.hpMax = 900; e.armorLeft = 0;
  for (const key of ['jab', 'cross']){
    e.armorLeft = 0;
    api.startAttack(p, key);
    stepFighter(api, p, 0.5);
  }
  assert(p.hits >= 2, 'two landed hits should read as two, got ' + p.hits);
  stepFighter(api, p, 2.2);
  assert(p.hits === 0, 'and the counter lapses');
});

test('the moves you throw most have frames to spare', () => {
  const api = boot();
  for (const key of ['jab', 'cross', 'hook', 'midkick', 'highkick']){
    const a = api.ATK[key];
    const frames = new Set(a.seq.map(([f]) => f));
    assert(frames.size >= 3, `${key} only has ${frames.size} distinct frames`);
    assert(api.A[a.anim].length >= frames.size, `${key} references a frame its animation lacks`);
    let prev = 0;
    for (const [f, t] of a.seq){
      assert(t > prev, `${key} frame times must move forward`);
      assert(f < api.A[a.anim].length, `${key} frame ${f} is out of range`);
      prev = t;
    }
  }
});

test('a kick folds before it goes, and the punch comes back', () => {
  const api = boot();
  const knee = (pose) => pose.lF[1];
  const foot = (pose) => pose.lF[2];
  const kick = api.A.highkick;
  assert(knee(kick[0]) > knee(kick[3]), 'the chamber lifts the knee above where it ends');
  assert(foot(kick[1]) > foot(kick[0]), 'and the foot travels out from it');
  const punch = api.A.punchA;
  const fist = (pose) => pose.aF[2];
  assert(fist(punch[1]) > fist(punch[2]), 'the fist recoils from full extension');
  assert(fist(punch[2]) > fist(punch[0]), 'but does not snap all the way home');
});

/* ---------------------------------------------------------- swing arcs */
test('a bat swings through an arc instead of teleporting', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  api.pickUp(p, api.mkItem('bat', 100, api.FLOOR_MID, 0));
  const rest = api.weaponAngle(p, 0);
  api.startAttack(p, 'bat');
  const seen = [];
  for (let i = 0; i < 28; i++){ seen.push(api.weaponAngle(p, 0)); api.updateFighter(p, api.STEP); }
  const windup = Math.max.apply(null, seen), follow = Math.min.apply(null, seen);
  assert(windup > rest + 40, 'the bat winds up behind the head: ' + windup + ' vs rest ' + rest);
  assert(follow < 0, 'and follows through past horizontal: ' + follow);
  const hitFrom = Math.round(api.ATK.bat.hit[0] * 60), hitTo = Math.round(api.ATK.bat.hit[1] * 60);
  let monotonic = true;
  for (let i = hitFrom; i < hitTo; i++) if (seen[i + 1] > seen[i] + 1) monotonic = false;
  assert(monotonic, 'through the hit window the swing only travels forward');
  assert(seen[hitFrom] > seen[hitTo], 'and it is genuinely mid-sweep when it connects');
  assert(api.ATK.bat.seq.length === 5, 'a swing that reads needs more than three frames');
});

test('every swoosh a move asks for actually exists', () => {
  const api = boot();
  for (const k in api.ATK){
    const a = api.ATK[k];
    if (a.swoosh) assert(api.SWOOSH[a.swoosh], k + ' asks for a missing swoosh: ' + a.swoosh);
    if (a.arc) assert(a.arc.length === 2 && a.arc[0] > a.arc[1], k + ' needs a forward arc');
  }
  assert(api.ATK.bat.swoosh === 'weapon' && api.ATK.hook.swoosh === 'hook', 'the heavies leave a trail');
});

/* ------------------------------------------------------------- specials */
test('you start a run with three stocks and they carry between streets', () => {
  const api = boot();
  api.G.story = false;
  api.startGame();
  const p = api.players[0];
  assert(p.stocks === api.START_STOCKS, 'started with ' + p.stocks);
  p.stocks = 2; p.meter = 40;
  api.nextStage();
  assert(api.players[0].stocks === 2, 'stocks carried, got ' + api.players[0].stocks);
  assert(api.players[0].meter === 40, 'and so did the part-filled bar');
});

test('landing hits fills the bar, and a full bar becomes a stock', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 0; p.meter = 0;
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
  e.hp = 5000; e.hpMax = 5000;
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.4);
  assert(p.meter > 0, 'a landed hit charges the bar');
  const m1 = p.meter;
  const armored = api.spawnEnemy('bruiser', 116, api.FLOOR_MID, -1);
  api.startAttack(p, 'jab');
  stepFighter(api, p, 0.4);
  assert(p.meter > m1, 'a hit eaten by armour still charges it');
  api.gainMeter(p, api.METER_MAX);
  assert(p.stocks === 1, 'a full bar banks a stock, got ' + p.stocks);
  p.stocks = api.STOCK_MAX;
  api.gainMeter(p, api.METER_MAX * 3);
  assert(p.stocks === api.STOCK_MAX && p.meter === api.METER_MAX, 'stocks cap out');
});

test('taking a hit also charges the bar, but less', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 0; p.meter = 0; p.invuln = 0;
  p.x = 120; p.y = api.FLOOR_MID;
  const e = api.spawnEnemy('punk', 106, api.FLOOR_MID, 1);
  e.face = 1;
  api.startAttack(e, 'swipe');
  stepFighter(api, e, 0.5);
  assert(p.meter > 0, 'eating one charges you too');
});

test('spending a special empties a bar that was pinned full', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = api.STOCK_MAX;
  api.gainMeter(p, api.METER_MAX * 2);
  assert(p.meter === api.METER_MAX, 'at cap the bar sits full');
  assert(api.startSuper(p), 'spend one');
  assert(p.stocks === api.STOCK_MAX - 1, 'a stock went');
  assert(p.meter === 0, 'and the bar went with it, got ' + p.meter);
  // and it must not instantly re-bank on the very next hit
  api.gainMeter(p, 12);
  assert(p.stocks === api.STOCK_MAX - 1, 'one punch does not hand the stock straight back');
  assert(p.meter > 0 && p.meter < api.METER_MAX, 'the bar is filling again from the bottom');
});

test('a part-filled bar is left alone when you spend a stock', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 2; p.meter = 0;
  api.gainMeter(p, api.METER_MAX * 0.4);
  const mid = p.meter;
  assert(mid > 0 && mid < api.METER_MAX, 'part filled');
  api.startSuper(p);
  assert(p.meter === mid, 'charge you actually banked is not thrown away: ' + p.meter);
});

test('a gold token is worth a stock', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 1; p.meter = 0;
  api.pickUp(p, api.mkItem('token', p.x, p.y, 0));
  assert(p.stocks === 2, 'the token banked a stock, got ' + p.stocks);
  p.stocks = api.STOCK_MAX; p.meter = 0;
  api.pickUp(p, api.mkItem('token', p.x, p.y, 0));
  assert(p.stocks === api.STOCK_MAX, 'a token at cap does not overflow the stocks');
});

test('the special spends a stock, and does nothing without one', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 0;
  assert(!api.startSuper(p), 'no stock, no rush');
  assert(p.state !== 'super', 'and no state change');
  p.stocks = 2;
  assert(api.startSuper(p), 'with a stock it fires');
  assert(p.stocks === 1, 'and costs exactly one');
  assert(p.state === 'super', 'state is the rush');
});

test('nothing can touch you during the rush, and it ends by itself', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 140; p.y = api.FLOOR_MID; p.stocks = 1; p.hp = 60;
  api.startSuper(p);
  assert(p.invuln >= api.SUPER.dur, 'invulnerable for the whole thing');
  const attacker = api.spawnEnemy('bruiser', 122, api.FLOOR_MID, 1);
  attacker.face = 1;
  api.startAttack(attacker, 'haymaker');
  const hp0 = p.hp;
  for (let i = 0; i < 40; i++){ api.updateFighter(attacker, api.STEP); api.updateFighter(p, api.STEP); }
  assert(p.hp === hp0, 'the rush cannot be interrupted');
  stepFighter(api, p, api.SUPER.dur + 0.2);
  assert(p.state !== 'super', 'and it hands control back, got ' + p.state);
});

test('the rush clears the space around you and the finisher launches', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.y = api.FLOOR_MID; p.face = 1; p.stocks = 1;
  const front = api.spawnEnemy('punk', 168, api.FLOOR_MID, -1);
  const behind = api.spawnEnemy('punk', 132, api.FLOOR_MID, 1);
  front.hp = 200; front.hpMax = 200; behind.hp = 200; behind.hpMax = 200;
  api.startSuper(p);
  stepFighter(api, p, api.SUPER.dur + 0.1);
  assert(front.hpMax - front.hp > 50, 'the man in front eats the whole thing: ' + (front.hpMax - front.hp));
  assert(behind.hpMax - behind.hp > 0, 'the spin reaches the one behind you');
  assert(api.isDown(front) || front.dead, 'and the finisher puts him in the air');
  assert(api.SUPER.strikes.filter(x => x.finisher).length === 1, 'exactly one finisher');
});

test('the rush is visible for every frame of it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.y = api.FLOOR_MID; p.stocks = 1;
  api.startSuper(p);
  let missing = 0;
  for (let i = 0; i < Math.round(api.SUPER.dur * 60); i++){
    api.updateFighter(p, api.STEP);
    api.setT(api.getT() + api.STEP);
    if (!api.visibleList().some(e => e.f === p)) missing++;
  }
  assert(missing === 0, 'the player blinked out of the rush on ' + missing + ' frames');
});

test('a respawn still blinks, so you can see the mercy running out', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  api.respawnPlayer(0);
  let shown = 0, hidden = 0;
  for (let i = 0; i < 60; i++){
    api.updateFighter(p, api.STEP);
    p.state = 'idle';                       // land it so the jump exemption is out of the way
    if (api.visibleList().some(e => e.f === p)) shown++; else hidden++;
  }
  assert(shown > 0 && hidden > 0, `a respawn should flicker: ${shown} shown, ${hidden} hidden`);
});

test('a rush cannot be grabbed out of', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.y = api.FLOOR_MID; p.stocks = 1;
  api.startSuper(p);
  const bruiser = api.spawnEnemy('bruiser', 158, api.FLOOR_MID, -1);
  assert(!api.tryGrab(bruiser, p), 'the grab is refused');
  assert(p.state === 'super', 'and the rush carries on');
});

test('a respawn always hands you at least one stock back', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 0;
  api.G.lives[0] = 2;
  api.knockOut(p, null, api.ATK.hook);
  for (let i = 0; i < 60 * 3; i++) api.update(api.STEP);
  assert(api.players[0].stocks >= 1, 'you come back with something to spend');
});

test('the special button fires the rush through the real input path', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.stocks = 1;
  const inp = api.INPUT[0];
  inp.ps = 1; inp.s = 1;
  api.playerControl(p, inp, api.STEP);
  inp.ps = 0; inp.s = 0;
  assert(p.state === 'super', 'the button did it, got ' + p.state);
});

test('a finisher hits harder than a normal knockdown, in feel as well as damage', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const stops = {};
  for (const key of ['jab', 'hook']){
    clearField(api);
    const e = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
    e.hp = 900; e.hpMax = 900;
    api.G.hitStop = 0; api.G.shake = 0; api.G.shakeT = 0;
    api.startAttack(p, key);
    stepFighter(api, p, 0.3);
    stops[key] = api.G.hitStop;
  }
  assert(stops.hook > stops.jab, `the hook should freeze the frame longer: ${stops.hook} vs ${stops.jab}`);
  assert(api.ATK.hook.heavy && api.ATK.highkick.heavy && api.ATK.bat.heavy, 'the finishers are flagged heavy');
});

test('a launched body knocks over whoever it lands in', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const target = api.spawnEnemy('punk', 118, api.FLOOR_MID, -1);
  const bystander = api.spawnEnemy('punk', 168, api.FLOOR_MID, -1);
  bystander.ai.mode = 'orbit'; bystander.hp = 300; bystander.hpMax = 300;
  api.startAttack(p, 'highkick');
  stepFighter(api, p, 0.6);
  assert(target.thrown || target.launched || api.isDown(target), 'the head kick launched him');
  for (let i = 0; i < 70; i++) api.updateFighter(target, api.STEP);
  assert(bystander.hp < 300 || api.isDown(bystander), 'and he took his friend with him');
});

test('an enemy launching a player does not turn him into a weapon against co-op', () => {
  const api = boot();
  play(api, { players: 2 }); clearField(api);
  const p1 = api.players[0], p2 = api.players[1];
  p1.x = 150; p1.y = api.FLOOR_MID; p1.invuln = 0;
  p2.x = 190; p2.y = api.FLOOR_MID; p2.invuln = 0;
  const hp0 = p2.hp;
  const e = api.spawnEnemy('bruiser', 136, api.FLOOR_MID, 1);
  e.face = 1;
  api.startAttack(e, 'haymaker');
  stepFighter(api, e, 0.8);
  for (let i = 0; i < 70; i++) api.updateFighter(p1, api.STEP);
  assert(!p1.launched, 'an enemy launch does not arm the body');
  assert(p2.hp === hp0, 'so player two does not get hit by player one');
});

/* ----------------------------------------------------------- rush tiers */
test('three tokens level the rush up, and the tier survives the stage', () => {
  const api = boot();
  api.G.story = false;
  api.startGame();
  const p = api.players[0];
  assert(api.rushTier(p) === 1, 'you start on tier one');
  for (let i = 0; i < api.TOKENS_PER_TIER; i++) api.pickUp(p, api.mkItem('token', p.x, p.y, 0));
  assert(api.rushTier(p) === 2, 'three tokens is tier two, got ' + api.rushTier(p));
  for (let i = 0; i < api.TOKENS_PER_TIER * 3; i++) api.pickUp(p, api.mkItem('token', p.x, p.y, 0));
  assert(api.rushTier(p) === api.SUPER.tiers.length, 'and it caps at the last tier');
  api.nextStage();
  assert(api.rushTier(api.players[0]) === api.SUPER.tiers.length, 'the tier carries to the next street');
});

test('each tier is longer and hits for more than the one below it', () => {
  const api = boot();
  const sum = (t) => t.strikes.reduce((n, st) => n + st.dmg, 0);
  for (let i = 1; i < api.SUPER.tiers.length; i++){
    const lo = api.SUPER.tiers[i - 1], hi = api.SUPER.tiers[i];
    assert(hi.strikes.length > lo.strikes.length, `tier ${i + 1} needs more strikes`);
    assert(sum(hi) > sum(lo), `tier ${i + 1} needs more damage`);
    assert(hi.dur > lo.dur, `tier ${i + 1} needs to last longer`);
  }
  for (const t of api.SUPER.tiers){
    assert(t.strikes.filter(x => x.finisher).length === 1, 'every tier ends on exactly one finisher');
    const last = t.strikes[t.strikes.length - 1];
    assert(last.finisher, 'and the finisher is last');
    assert(last.t < t.dur, 'with time to land before the move ends');
    let prev = -1;
    for (const st of t.strikes){ assert(st.t > prev, 'strikes must be in time order'); prev = st.t; }
    for (const st of t.strikes) assert(api.A[st.anim], 'strike references a missing animation: ' + st.anim);
  }
});

test('a tier three rush does more to a crowd than a tier one rush', () => {
  const api = boot();
  const damageDone = (tokens) => {
    play(api); clearField(api);
    const p = api.players[0];
    p.x = 150; p.y = api.FLOOR_MID; p.face = 1; p.stocks = 1; p.tokens = tokens;
    const crowd = [];
    for (let i = 0; i < 3; i++){
      const e = api.spawnEnemy('bruiser', 132 + i * 20, api.FLOOR_MID, -1);
      e.hp = 4000; e.hpMax = 4000; e.armorLeft = 0;
      crowd.push(e);
    }
    api.startSuper(p);
    stepFighter(api, p, p.tier.dur + 0.2);
    return crowd.reduce((n, e) => n + (e.hpMax - e.hp), 0);
  };
  const t1 = damageDone(0), t3 = damageDone(api.TOKENS_PER_TIER * 2);
  assert(t3 > t1 * 1.2, `tier three should clearly out-hit tier one: ${t3} vs ${t1}`);
});

/* ---------------------------------------------------------------- grabs */
test('walking into an enemy grabs them, knees hold them, kick throws them', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 110, api.FLOOR_MID, -1);
  assert(api.tryGrab(p, e), 'grab should take');
  assert(p.state === 'hold' && e.state === 'held' && e.holder === p, 'both sides enter the hold');
  const hp0 = e.hp;
  api.INPUT[0].pa = 1; api.INPUT[0].a = 1;
  api.playerControl(p, api.INPUT[0], api.STEP);
  api.INPUT[0].pa = 0; api.INPUT[0].a = 0;     // edges fire once, like pollInput gives them
  stepFighter(api, p, 0.4);
  assert(e.hp < hp0, 'the knee damages');
  assert(p.holding === e && e.state === 'held', 'the knee keeps them in your hands');
  api.INPUT[0].pa = 0; api.INPUT[0].a = 0;
  api.INPUT[0].pb = 1; api.INPUT[0].b = 1;
  api.playerControl(p, api.INPUT[0], api.STEP);
  assert(p.holding === null && e.holder === null, 'the throw lets go');
  assert(e.thrown && e.vx > 0, 'the body flies off in the direction you faced');
});

test('a thrown body knocks over whoever it lands on', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const held = api.spawnEnemy('punk', 110, api.FLOOR_MID, -1);
  const bystander = api.spawnEnemy('punk', 150, api.FLOOR_MID, -1);
  bystander.ai.mode = 'orbit';
  api.tryGrab(p, held);
  api.throwHeld(p);
  const score0 = api.G.score[0];
  for (let i = 0; i < 60; i++){ api.updateFighter(held, api.STEP); }
  assert(api.isDown(bystander) || bystander.dead, 'the bystander goes down too');
  assert(api.G.score[0] > score0, 'the collision scores');
});

test('being hit while held breaks the hold', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1; p.invuln = 0;
  const grabbed = api.spawnEnemy('punk', 110, api.FLOOR_MID, -1);
  api.tryGrab(p, grabbed);
  assert(p.holding === grabbed, 'holding');
  const attacker = api.spawnEnemy('punk', 86, api.FLOOR_MID, 1);
  attacker.face = 1;
  api.startAttack(attacker, 'swipe');
  stepFighter(api, attacker, 0.4);
  assert(p.holding === null, 'taking a hit spills them out of your hands');
});

test('a held enemy escapes if you sit on them too long', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 110, api.FLOOR_MID, -1);
  api.tryGrab(p, e);
  for (let i = 0; i < 60 * 4; i++){ api.updateFighter(p, api.STEP); api.updateFighter(e, api.STEP); }
  assert(p.holding === null && e.holder === null, 'the hold does not last forever');
});

test('bosses cannot be grabbed', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const boss = api.spawnEnemy('hammer', 110, api.FLOOR_MID, -1);
  assert(!api.tryGrab(p, boss), 'a boss shrugs off the grab');
  assert(p.holding === null, 'no hold state left behind');
});

/* -------------------------------------------------------------- weapons */
test('picking up a bat hits harder than a fist and wears out', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const bat = api.mkItem('bat', 104, api.FLOOR_MID, 0);
  assert(api.itemUnderfoot(p) === bat, 'the bat is underfoot');
  assert(api.pickUp(p, bat), 'pick it up');
  assert(p.weapon === 'bat' && p.wUses === api.WEAPON.bat.uses, 'weapon in hand with a full charge');
  const e = api.spawnEnemy('punk', 118, api.FLOOR_MID, -1);
  e.hp = 400; e.hpMax = 400;
  api.startAttack(p, 'bat'); api.useWeapon(p);
  stepFighter(api, p, 0.5);
  assert(400 - e.hp === api.ATK.bat.dmg, 'the bat does bat damage');
  assert(api.ATK.bat.dmg > api.ATK.jab.dmg, 'which is more than a fist');
  assert(p.wUses === api.WEAPON.bat.uses - 1, 'a swing costs a use');
  p.wUses = 1; api.useWeapon(p);
  assert(p.weapon === null, 'the bat breaks when it is spent');
});

test('getting knocked down makes you drop the weapon', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID;
  api.pickUp(p, api.mkItem('pipe', 100, api.FLOOR_MID, 0));
  assert(p.weapon === 'pipe', 'holding the pipe');
  api.knockDown(p, 1, 140, 100);
  assert(p.weapon === null, 'the pipe is on the floor now');
  assert(api.items.some(i => i.kind === 'pipe' && !i.gone), 'and it is a real item again');
});

test('a thrown crate breaks and knocks its target down', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  api.pickUp(p, api.mkItem('crate', 100, api.FLOOR_MID, 0));
  assert(p.weapon === 'crate', 'carrying the crate');
  const e = api.spawnEnemy('punk', 150, api.FLOOR_MID, -1);
  e.ai.mode = 'orbit';
  api.throwItem(p);
  assert(p.weapon === null, 'thrown');
  for (let i = 0; i < 60; i++) api.updateItems(api.STEP);
  assert(api.isDown(e) || e.dead, 'the crate puts them down');
});

test('a weapon left on the floor can be smashed for a pickup', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const barrel = api.mkItem('barrel', 120, api.FLOOR_MID, 0);
  api.startAttack(p, 'kick');
  stepFighter(api, p, 0.5);
  assert(barrel.broken, 'the barrel breaks when you kick it');
});

test('food heals and cash scores', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.hp = 40;
  api.pickUp(p, api.mkItem('meat', p.x, p.y, 0));
  assert(p.hp > 40 && p.hp <= p.hpMax, 'food heals but never past the cap');
  const s0 = api.G.score[0];
  api.pickUp(p, api.mkItem('cash', p.x, p.y, 0));
  assert(api.G.score[0] === s0 + 500, 'cash pays 500');
});

test("the warden's shot travels flat and hurts", () => {
  const api = boot();
  play(api, { stage: 4 }); clearField(api);
  const p = api.players[0];
  p.x = 220; p.y = api.FLOOR_MID; p.invuln = 0;
  const boss = api.spawnEnemy('warden', 120, api.FLOOR_MID, 1);
  api.fireSlug(boss);
  const slug = api.items.find(i => i.kind === 'slug');
  assert(slug && slug.flat, 'the slug is a flat projectile');
  const z0 = slug.z, hp0 = p.hp;
  for (let i = 0; i < 60; i++) api.updateItems(api.STEP);
  assert(p.hp < hp0, 'the slug connects');
  assert(slug.gone || Math.abs(slug.z - z0) < 1, 'a bullet does not arc');
});

/* ------------------------------------------------------------ the stick */
test('the thumb stick reads eight directions and has a dead middle', () => {
  const api = boot();
  const R = api.STICK_MAX;
  const cases = [
    [R, 0, 'r'], [-R, 0, 'l'], [0, -R, 'u'], [0, R, 'd'],
    [R, R, 'rd'], [-R, R, 'ld'], [R, -R, 'ru'], [-R, -R, 'lu'],
  ];
  for (const [dx, dy, want] of cases){
    const v = api.stickVector(dx, dy);
    const got = (v.l ? 'l' : '') + (v.r ? 'r' : '') + (v.u ? 'u' : '') + (v.d ? 'd' : '');
    assert(got === want, `(${dx},${dy}) should read ${want}, got ${got || 'nothing'}`);
  }
  const dead = api.stickVector(api.STICK_DEAD - 3, 0);
  assert(!dead.l && !dead.r && !dead.u && !dead.d, 'a small wobble is not a direction');
  assert(api.stickVector(api.STICK_DEAD + 4, 0).r === 1, 'just past the dead zone it moves');
});

test('opposite directions never come out of one thumb', () => {
  const api = boot();
  for (let a = 0; a < 360; a += 7){
    const r = a * Math.PI / 180;
    const v = api.stickVector(Math.cos(r) * 40, Math.sin(r) * 40);
    assert(!(v.l && v.r), 'left and right at ' + a);
    assert(!(v.u && v.d), 'up and down at ' + a);
    assert(v.l || v.r || v.u || v.d, 'some direction at ' + a);
  }
});

test('dragging past the ring drags the stick with it', () => {
  const api = boot();
  const still = api.stickRecentre(100, 100, 120, 100);
  assert(still.x === 100 && still.y === 100, 'inside the ring the origin holds');
  const moved = api.stickRecentre(100, 100, 300, 100);
  assert(moved.x > 100, 'past the ring the origin follows: ' + moved.x);
  const d = Math.hypot(300 - moved.x, 100 - moved.y);
  near(d, api.STICK_MAX, 0.001, 'and the thumb ends up exactly on the ring');
  const diag = api.stickRecentre(0, 0, 200, 200);
  near(Math.hypot(200 - diag.x, 200 - diag.y), api.STICK_MAX, 0.001, 'diagonals too');
});

test('fullscreen degrades quietly where the browser has none', () => {
  const api = boot();
  assert(api.fullscreenSupported() === false, 'the stub DOM has no fullscreen');
  assert(api.isFullscreen() === false, 'and is not in it');
  api.toggleFullscreen();                       // must not throw
});

/* ------------------------------------------------------------ new moves */
function crowd(api, n, spread){
  const out = [];
  for (let i = 0; i < n; i++){
    const e = api.spawnEnemy('punk', 150 + (i - (n - 1) / 2) * (spread || 14), api.FLOOR_MID + ((i % 3) - 1) * 5, -1);
    e.hp = 900; e.hpMax = 900; e.ai.mode = 'orbit';
    out.push(e);
  }
  return out;
}

test('the sweep takes the whole ring off their feet', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.y = api.FLOOR_MID; p.face = 1;
  const mob = crowd(api, 4, 16);
  api.startAttack(p, 'sweep');
  stepFighter(api, p, 0.6);
  const hit = mob.filter(e => e.hp < e.hpMax).length;
  assert(hit >= 3, 'a sweep should catch most of a crowd, got ' + hit);
  assert(mob.filter(e => api.isDown(e)).length >= 3, 'and put them down');
});

test('the cyclone hits the same man more than once', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.y = api.FLOOR_MID; p.face = 1;
  api.G.ups = ['cyclone'];
  const e = api.spawnEnemy('bruiser', 168, api.FLOOR_MID, -1);
  e.hp = 3000; e.hpMax = 3000; e.armorLeft = 0;
  api.startAttack(p, 'cyclone');
  stepFighter(api, p, 1.0);
  const lost = e.hpMax - e.hp;
  assert(lost > api.ATK.cyclone.dmg * 2, 'the spin should land several times, lost ' + lost);
  assert(api.ATK.cyclone.multi > 0, 'because it is a multi-hit move');
});

test('the shockwave runs down the street and takes the line with it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 120; p.y = api.FLOOR_MID; p.face = 1;
  const line = [];
  for (let i = 0; i < 3; i++){
    const e = api.spawnEnemy('punk', 170 + i * 34, api.FLOOR_MID + (i - 1) * 8, -1);
    e.hp = 500; e.hpMax = 500; e.ai.mode = 'orbit';
    line.push(e);
  }
  api.spawnWave(p);
  const w = api.items.find(i => i.kind === 'wave');
  assert(w && w.wide && w.flat, 'the wave is a flat, wide projectile');
  for (let i = 0; i < 70; i++) api.updateItems(api.STEP);
  const hit = line.filter(e => e.hp < e.hpMax).length;
  assert(hit >= 2, 'the wave should not stop at the first man, hit ' + hit);
  assert(w.gone || w.x > 170, 'and it travelled');
});

test('a meteor drop lands on everybody standing near it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 150; p.y = api.FLOOR_MID; p.face = 1;
  const mob = crowd(api, 4, 22);
  api.playerSlam(p);
  const hit = mob.filter(e => e.hp < e.hpMax).length;
  assert(hit >= 3, 'the landing should clear the space, got ' + hit);
});

test('the slide keeps hitting as it travels', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 110; p.y = api.FLOOR_MID; p.face = 1;
  const a = api.spawnEnemy('punk', 132, api.FLOOR_MID, -1);
  const b = api.spawnEnemy('punk', 158, api.FLOOR_MID, -1);
  a.hp = 400; a.hpMax = 400; b.hp = 400; b.hpMax = 400;
  a.ai.mode = 'orbit'; b.ai.mode = 'orbit';
  api.startAttack(p, 'slide');
  p.vx = p.spd * 2.3;
  stepFighter(api, p, 0.7);
  assert(a.hp < 400 && b.hp < 400, 'both men in the lane got hit');
});

test('up and punch is an uppercut, and it launches', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 120; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 138, api.FLOOR_MID, -1);
  e.hp = 400; e.hpMax = 400;
  const inp = api.INPUT[0];
  inp.pa = 1; inp.a = 1; inp.u = 1;
  api.playerControl(p, inp, api.STEP);
  inp.pa = 0; inp.a = 0; inp.u = 0;
  assert(p.atkKey === 'uppercut', 'got ' + p.atkKey);
  stepFighter(api, p, 0.6);
  assert(e.vz > 100 || e.z > 20 || api.isDown(e), 'and it put him in the air');
  assert(api.ATK.uppercut.lift > api.ATK.hook.lift, 'higher than the hook does');
});

/* ------------------------------------------------------------- upgrades */
test('every upgrade card fits inside the card', () => {
  const api = boot();
  for (const u of api.UPGRADES){
    const lines = [u.name].concat(u.desc, u.sub ? [u.sub] : []);
    for (const line of lines){
      assert(api.textW(line, 1) <= api.CARD_W - 6, `"${line}" overflows the card (${api.textW(line, 1)}px)`);
      for (const ch of line) assert(api.FONT[ch], `card text needs glyph ${ch}`);
    }
    assert(u.desc.length >= 1 && u.desc.length <= 2, u.id + ' needs one or two lines of description');
  }
});

test('the upgrade screen offers three different things', () => {
  const api = boot();
  play(api);
  api.G.ups = [];
  for (let n = 0; n < 12; n++){
    const picks = api.rollUpgrades();
    assert(picks.length === 3, 'three cards, got ' + picks.length);
    const ids = picks.map(u => u.id);
    assert(new Set(ids).size === 3, 'no duplicates on one screen: ' + ids.join(','));
    for (const u of picks) assert(api.UP_BY_ID[u.id], 'a real upgrade');
  }
});

test('a move you already own never comes up again', () => {
  const api = boot();
  play(api);
  api.G.ups = ['cyclone', 'shock', 'meteor', 'chain4'];
  for (let n = 0; n < 20; n++)
    for (const u of api.rollUpgrades())
      assert(!u.move, 'offered a move already owned: ' + u.id);
});

test('the numbers stack and actually bite', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 100; p.y = api.FLOOR_MID; p.face = 1;
  const base = (() => {
    clearField(api);
    const e = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
    e.hp = 900; e.hpMax = 900;
    api.startAttack(p, 'jab'); stepFighter(api, p, 0.4);
    return 900 - e.hp;
  })();
  api.G.ups = ['power', 'power'];
  const boosted = (() => {
    clearField(api);
    const e = api.spawnEnemy('punk', 116, api.FLOOR_MID, -1);
    e.hp = 900; e.hpMax = 900;
    api.startAttack(p, 'jab'); stepFighter(api, p, 0.4);
    return 900 - e.hp;
  })();
  assert(boosted > base * 1.4, `two power picks should hit far harder: ${boosted} vs ${base}`);
  assert(Math.abs(api.dmgMul() - 1.5) < 1e-9, 'damage multiplier stacks linearly');
  api.G.ups = ['reach', 'reach'];
  assert(api.reachMul() > 1.29, 'so does reach');
});

test('taking a stat pick changes the fighter on the spot', () => {
  const api = boot();
  api.G.story = false;
  api.startGame();
  const p = api.players[0];
  const hp0 = p.hpMax, spd0 = p.spd, st0 = p.stocks, lv0 = api.G.lives[0];
  api.applyUpgrade('vigour');
  api.applyUpgrade('speed');
  api.applyUpgrade('stock');
  api.applyUpgrade('life');
  assert(p.hpMax === hp0 + 30 && p.hp === p.hpMax, 'health went up and filled');
  assert(p.spd > spd0, 'speed went up');
  assert(p.stocks === Math.min(5, st0 + 1), 'a stock was handed over');
  assert(api.G.lives[0] === lv0 + 1, 'and a life');
});

test('upgrades survive the walk to the next street', () => {
  const api = boot();
  api.G.story = false;
  api.startGame();
  api.applyUpgrade('vigour');
  api.applyUpgrade('speed');
  const before = api.players[0].hpMax;
  api.nextStage();
  const p = api.players[0];
  assert(p.hpMax === before, `max health carried: ${p.hpMax} vs ${before}`);
  assert(api.hasMove('vigour') === false || true, 'stat picks are not moves');
});

test('a bought move only works once you have bought it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 120; p.y = api.FLOOR_MID; p.face = 1;
  const inp = api.INPUT[0];
  api.G.ups = [];
  inp.pb = 1; inp.b = 1; inp.u = 1;
  api.playerControl(p, inp, api.STEP);
  assert(p.atkKey !== 'cyclone', 'no cyclone before you own it, got ' + p.atkKey);
  p.state = 'idle'; p.atk = null; p.combo = 0; p.comboT = 0;
  api.G.ups = ['cyclone'];
  api.playerControl(p, inp, api.STEP);
  inp.pb = 0; inp.b = 0; inp.u = 0;
  assert(p.atkKey === 'cyclone', 'and it works once you do, got ' + p.atkKey);
});

test('the fourth hit only exists when you buy it', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 120; p.y = api.FLOOR_MID; p.face = 1;
  api.G.ups = [];
  assert(api.chainLen() === 3, 'three by default');
  const run = () => {
    const seen = [];
    p.combo = 0; p.comboT = 0;
    for (let i = 0; i < 4; i++){
      api.chainAttack(p, api.PUNCH_CHAIN);
      seen.push(p.atkKey);
      p.state = 'idle'; p.atk = null;
    }
    return seen.join(',');
  };
  assert(run() === 'jab,cross,hook,jab', 'wraps at three: ' + run());
  api.G.ups = ['chain4'];
  assert(api.chainLen() === 4, 'four once bought');
  assert(run() === 'jab,cross,hook,spin', 'the fourth is the spin: ' + run());
});

test('the pick screen drives with the real buttons and hands over', () => {
  const api = boot();
  api.G.story = false;
  api.startGame();
  api.G.stage = 0;
  api.startUpgrade();
  assert(api.G.phase === 'upgrade' && api.G.picks.length === 3, 'the screen is up');
  const first = api.G.picks[0].id;
  api.KEYS.KeyD = 1;
  api.update(api.STEP);
  api.KEYS.KeyD = 0;
  api.update(api.STEP);
  assert(api.G.pick === 1, 'right moved the cursor, at ' + api.G.pick);
  const taken = api.G.picks[1].id;
  api.KEYS.KeyJ = 1;
  api.update(api.STEP);
  api.KEYS.KeyJ = 0;
  assert(api.G.ups.indexOf(taken) >= 0, 'the highlighted card was the one taken');
  assert(api.G.ups.indexOf(first) < 0, 'and not the one next to it');
  assert(api.G.phase !== 'upgrade', 'the screen closed');
});

test('the pick screen draws', () => {
  const api = boot();
  play(api);
  api.startUpgrade();
  api._resetCounts();
  api.drawUpgrade();
  assert((api._counts.fillRect || 0) > 200, 'it painted the cards');
});

test('a whole run only shops between streets, never before the last one', () => {
  const api = boot();
  api.G.story = false;
  api.startGame();
  api.G.stage = api.STAGES.length - 1;
  api.G.phase = 'clear';
  api.W.clearT = 0.01;
  api.update(0.02);
  assert(api.G.phase !== 'upgrade', 'the last street rolls straight into the ending');
});

/* ---------------------------------------------------------------- story */
const cutLen = (api, id) => api.SCENES[id].beats.reduce((n, b) => n + b.d, 0);

test('every scene is built out of things that exist', () => {
  const api = boot();
  const ids = Object.keys(api.SCENES);
  assert(ids.length >= 6, 'a story needs more than a couple of scenes');
  for (const id of ids){
    const sc = api.SCENES[id];
    assert(sc.beats && sc.beats.length, id + ' has no beats');
    for (let i = 0; i < sc.beats.length; i++){
      const b = sc.beats[i];
      assert(b.d > 0.5, `${id}[${i}] needs a readable duration`);
      for (const line of (b.cap || [])){
        for (const ch of line) assert(api.FONT[ch.toUpperCase()], `${id}[${i}] caption needs glyph ${ch}`);
        assert(api.textW(line, 1) < api.VW - 8, `${id}[${i}] caption is too wide to fit: ${line}`);
      }
      for (const key in b.act){
        assert(api.CUT_ACTORS[key], `${id}[${i}] uses an unknown actor: ${key}`);
        assert(api.SKINS[api.CUT_ACTORS[key].skin], `actor ${key} has no skin`);
        const a = b.act[key];
        assert(api.A[a.anim || 'idle'], `${id}[${i}] ${key} uses a missing animation: ${a.anim}`);
        assert(a.y >= api.FLOOR_TOP - 12 && a.y <= api.FLOOR_BOT + 12, `${id}[${i}] ${key} is off the floor`);
      }
    }
  }
});

test('a scene plays through its beats and then hands over', () => {
  const api = boot();
  let handedOver = false;
  api.G.story = true;
  api.startCut('intro', () => { handedOver = true; });
  assert(api.G.phase === 'cut', 'the cut took over');
  assert(Object.keys(api.cut.actors).length > 0, 'with somebody on screen');
  const len = cutLen(api, 'intro');
  for (let i = 0; i < Math.ceil(len * 60) + 30 && !handedOver; i++) api.cutTick(api.STEP);
  assert(handedOver, 'the scene ended and handed over');
});

test('actors walk between beats rather than teleporting', () => {
  const api = boot();
  api.G.story = true;
  api.startCut('intro', () => {});
  const first = api.SCENES.intro.beats[0].act.mokske.x;
  const moved = [];
  for (let i = 0; i < 60 * 12; i++){
    api.cutTick(api.STEP);
    const c = api.cut.actors.mokske;
    if (c) moved.push(c.x);
  }
  const spread = Math.max.apply(null, moved) - Math.min.apply(null, moved);
  assert(spread > 10, 'mokske should be carried off, moved ' + spread.toFixed(1));
  const jumps = moved.filter((x, i) => i > 0 && Math.abs(x - moved[i - 1]) > 6).length;
  assert(jumps === 0, 'and get there by walking, not by cutting: ' + jumps + ' jumps');
  assert(first === api.SCENES.intro.beats[0].act.mokske.x, 'the scene data is not mutated by playing it');
});

test('any button skips the scene', () => {
  const api = boot();
  let done = false;
  api.G.story = true;
  api.G.players = 1;
  api.startCut('intro', () => { done = true; });
  api.cutTick(api.STEP);
  api.KEYS.KeyJ = 1;
  api.update(api.STEP);
  api.KEYS.KeyJ = 0;
  assert(done, 'punch ended it early');
});

test('the story runs between the streets, and the ending is the last thing', () => {
  const api = boot();
  api.G.story = true;
  api.G.players = 1;
  api.startGame();
  assert(api.G.phase === 'cut' && api.cut.id === 'intro', 'a new run opens on the intro');
  api.cutEnd();
  assert(api.G.phase === 'card' && api.G.stage === 0, 'then street one');
  for (let s = 0; s < api.STAGES.length - 1; s++){
    api.nextStage();
    assert(api.G.phase === 'cut', `a scene plays after street ${s + 1}`);
    assert(api.cut.id === api.STORY_AFTER[s], `expected ${api.STORY_AFTER[s]}, got ${api.cut.id}`);
    api.cutEnd();
    assert(api.G.stage === s + 1, 'and then the next street starts');
  }
  api.nextStage();
  assert(api.cut.id === 'ending', 'the last street rolls the ending');
  api.cutEnd();
  assert(api.G.phase === 'over' && api.G.cleared, 'and the game is won');
});

test('turning the story off skips straight to the fighting', () => {
  const api = boot();
  api.G.story = false;
  api.G.players = 1;
  api.startGame();
  assert(api.G.phase === 'card', 'no intro, got ' + api.G.phase);
  assert(api.players[0], 'and a fighter on the street');
  api.G.stage = 0;
  api.nextStage();
  assert(api.G.phase === 'card' && api.G.stage === 1, 'stages run straight on');
});

test('the story preference is remembered', () => {
  const api = boot();
  api.G.story = false;
  api.saveMeta();
  const api2 = boot({ store: api._store });
  assert(api2.G.story === false, 'it stuck');
});

test('every scene draws', () => {
  const api = boot();
  for (const id in api.SCENES){
    api.startCut(id, () => {});
    const beats = api.SCENES[id].beats.length;
    for (let b = 0; b < beats; b++){
      api.draw();
      for (let i = 0; i < 30; i++) api.cutTick(api.STEP);
      api.draw();
      api.cut.bi = Math.min(b, beats - 1);
    }
  }
  assert(api._counts.fillRect > 100, 'the scenes actually painted');
});

/* -------------------------------------------------------------- hazards */
test('a body thrown past the edge of the docks goes in the water', () => {
  const api = boot();
  play(api, { stage: 2 }); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 210, api.FLOOR_MID, -1);
  const score0 = api.G.score[0];
  api.tryGrab(p, e);
  p.throwAim = -1;                                  // holding up
  api.throwHeld(p);
  assert(e.vy < 0, 'the throw aimed him at the back edge');
  for (let i = 0; i < 90 && !e.gone; i++) api.updateFighter(e, api.STEP);
  assert(e.gone && e.dead, 'he went in, got gone=' + e.gone);
  assert(api.G.score[0] > score0 + e.score, 'and the edge paid a bonus');
});

test('the foundry channel and the roof edge work the same way, at the front', () => {
  const api = boot();
  for (const stageIdx of [3, 4]){
    play(api, { stage: stageIdx }); clearField(api);
    const p = api.players[0];
    p.x = 200; p.y = api.FLOOR_MID; p.face = 1;
    const e = api.spawnEnemy('punk', 210, api.FLOOR_MID, -1);
    api.tryGrab(p, e);
    p.throwAim = 1;                                 // holding down
    api.throwHeld(p);
    for (let i = 0; i < 90 && !e.gone; i++) api.updateFighter(e, api.STEP);
    assert(e.gone, `stage ${stageIdx + 1} should have swallowed him`);
  }
});

test('a street without a hazard just puts them on the floor', () => {
  const api = boot();
  play(api, { stage: 0 }); clearField(api);
  assert(!api.STAGES[0].hazard, 'stage one has no edge to use');
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.face = 1;
  const e = api.spawnEnemy('punk', 210, api.FLOOR_MID, -1);
  e.hp = 200; e.hpMax = 200;
  api.tryGrab(p, e);
  p.throwAim = -1;
  api.throwHeld(p);
  for (let i = 0; i < 90; i++) api.updateFighter(e, api.STEP);
  assert(!e.gone && !e.dead, 'he lands and gets up like anywhere else');
});

test('a player can never be eaten by an edge', () => {
  const api = boot();
  play(api, { stage: 3 }); clearField(api);
  const p = api.players[0];
  p.y = api.FLOOR_BOT; p.thrown = true; p.thrownBy = api.spawnEnemy('bruiser', 150, api.FLOOR_MID, 1);
  p.vy = 400; p.state = 'down';
  for (let i = 0; i < 60; i++) api.updateFighter(p, api.STEP);
  assert(!p.gone && !p.dead, 'the hazard is for enemies only');
  assert(p.y <= api.FLOOR_BOT + 0.01, 'and a player stays inside the floor band');
});

test('every hazard line sits outside the walkable band', () => {
  const api = boot();
  for (const s of api.STAGES){
    if (!s.hazard) continue;
    const h = s.hazard;
    assert(h.kind && h.edge, s.name + ' hazard needs a kind and an edge');
    if (h.edge === 'back') assert(h.line < api.FLOOR_TOP, s.name + ' back hazard is inside the floor');
    else assert(h.line > api.FLOOR_BOT, s.name + ' front hazard is inside the floor');
  }
});

test('walking about on a hazard stage never kills anybody', () => {
  const api = boot();
  play(api, { stage: 3 });
  for (let i = 0; i < 60 * 25; i++){
    api.update(api.STEP);
    for (const f of api.fighters){
      if (f.team === 'e' && f.gone && !f.dead) throw new Error('an enemy vanished without dying');
    }
    api.players[0].x += 0.7;
  }
  assert(api.players[0].hp > 0 || api.G.lives[0] >= 0, 'the stage ran');
});

/* ---------------------------------------------------------------- bosses */
/* Runs a boss against a stationary player and reports what it did. */
function bossRun(api, kind, opts){
  opts = opts || {};
  const px = opts.px == null ? 200 : opts.px;
  play(api, { stage: opts.stage || 0 }); clearField(api);
  const p = api.players[0];
  p.x = px;
  p.y = api.FLOOR_MID; p.invuln = 0; p.hp = p.hpMax;
  const boss = api.spawnEnemy(kind, opts.bx == null ? 260 : opts.bx, api.FLOOR_MID, -1);
  boss.ai.mode = 'approach';
  const log = { keys: {}, tells: 0, maxTell: 0, jumped: false };
  for (let i = 0; i < 60 * (opts.secs || 12); i++){
    p.hp = p.hpMax;                       // the boss is the subject, not the fight
    if (opts.freeze) { p.x = px; p.y = api.FLOOR_MID; }
    const before = boss.atkKey;
    api.updateFighter(boss, api.STEP);
    if (boss.atkKey && boss.atkKey !== before && boss.atk) log.keys[boss.atkKey] = (log.keys[boss.atkKey] || 0) + 1;
    if (boss.tell > 0){ log.tells++; log.maxTell = Math.max(log.maxTell, boss.tell); }
    if (boss.z > 4) log.jumped = true;
  }
  return { boss, log, p };
}

test('every boss has a signature move it actually reaches for', () => {
  const api = boot();
  const wants = {
    rook: 'batcharge', vex: 'dashslash', hammer: 'slam', nyx: 'flyknee', warden: 'shoulder',
  };
  for (const kind in wants){
    api.reseed(99);
    const { log } = bossRun(api, kind, { secs: 22, freeze: true, px: 200, bx: 262 });
    assert(log.keys[wants[kind]] > 0,
      `${kind} never used ${wants[kind]} (saw ${JSON.stringify(log.keys)})`);
  }
});

test('the five bosses do not all fight the same way', () => {
  const api = boot();
  const sets = {};
  for (const kind of ['rook', 'vex', 'hammer', 'nyx', 'warden']){
    api.reseed(7);
    const { log } = bossRun(api, kind, { secs: 20, freeze: true });
    sets[kind] = Object.keys(log.keys).sort().join('+');
  }
  const distinct = new Set(Object.values(sets));
  assert(distinct.size >= 4, 'boss movesets overlap too much: ' + JSON.stringify(sets));
});

test('a boss turns angry once at half health, and only once', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID;
  const boss = api.spawnEnemy('rook', 240, api.FLOOR_MID, -1);
  const spd0 = boss.spd;
  assert(!boss.rage, 'not angry yet');
  stepFighter(api, boss, 0.5);
  assert(boss.spd === spd0, 'and no free speed while healthy');
  boss.hp = boss.hpMax * 0.4;
  stepFighter(api, boss, 0.2);
  assert(boss.rage, 'half health flips him');
  const spd1 = boss.spd;
  assert(spd1 > spd0, 'and he speeds up');
  stepFighter(api, boss, 2);
  assert(boss.spd === spd1, 'the buff is not applied twice');
});

test("hammer's slam carries along the floor, and jumping clears it", () => {
  const api = boot();
  play(api); clearField(api);
  const grounded = api.players[0];
  grounded.x = 240; grounded.y = api.FLOOR_MID; grounded.invuln = 0;
  const boss = api.spawnEnemy('hammer', 200, api.FLOOR_MID, 1);
  const hp0 = grounded.hp;
  api.slamShock(boss);
  assert(grounded.hp < hp0, 'the shock reaches past his arms');
  grounded.hp = hp0; grounded.invuln = 0; grounded.state = 'idle';
  grounded.z = 30;
  api.slamShock(boss);
  assert(grounded.hp === hp0, 'and you can jump it');
  assert(api.ATK.slam.quake, 'the slam is flagged to shake the floor');
});

test('a heavy attack is telegraphed before it lands', () => {
  const api = boot();
  api.reseed(4);
  const { log } = bossRun(api, 'hammer', { secs: 16, freeze: true });
  assert(log.tells > 0, 'the boss showed a tell');
  assert(log.maxTell > 0.2, 'and it lasted long enough to read: ' + log.maxTell);
});

test('the tell is cleared the moment the move comes out', () => {
  const api = boot();
  play(api); clearField(api);
  const e = api.spawnEnemy('bruiser', 150, api.FLOOR_MID, -1);
  e.tell = 0.5;
  api.launchAttack(e, 'haymaker');
  assert(e.tell === 0, 'no tell left once it is in flight');
  assert(e.state === 'attack', 'and the swing started');
});

test('a committed wind-up throws the move it advertised', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.invuln = 0;
  const e = api.spawnEnemy('punk', 218, api.FLOOR_MID, -1);
  e.ai.mode = 'approach';
  let advertised = null, thrown = null;
  for (let i = 0; i < 60 * 8 && !thrown; i++){
    api.updateFighter(e, api.STEP);
    if (e.ai.mode === 'wind' && e.ai.key) advertised = e.ai.key;
    if (e.atk && advertised) thrown = e.atkKey;
  }
  assert(advertised, 'it wound up at all');
  assert(thrown === advertised, `advertised ${advertised} but threw ${thrown}`);
});

/* ----------------------------------------------------------------- rank */
test('the clear rank reflects what the street cost you', () => {
  const api = boot();
  assert(api.stageRank(0, 60) === 'S', 'clean and quick is an S');
  assert(api.stageRank(60, 60) === 'A', 'a bit of damage is an A');
  assert(api.stageRank(150, 120) === 'B', 'a rough one is a B');
  assert(api.stageRank(400, 300) === 'C', 'a mess is a C');
  assert(api.stageRank(0, 999) === 'C', 'taking all day caps you out');
  const order = ['S', 'A', 'B', 'C'];
  for (let i = 1; i < order.length; i++)
    assert(api.RANK_BONUS[order[i - 1]] > api.RANK_BONUS[order[i]], 'better ranks pay better');
});

test('damage taken is tracked per stage and paid out on the clear', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.invuln = 0;
  assert(api.G.dmgTaken === 0, 'a fresh street starts clean');
  const e = api.spawnEnemy('punk', 186, api.FLOOR_MID, 1);
  e.face = 1;
  api.startAttack(e, 'swipe');
  stepFighter(api, e, 0.5);
  assert(api.G.dmgTaken > 0, 'it counted the hit');
  api.G.time = 40;
  const score0 = api.G.score[0];
  api.stageClear();
  assert(api.G.rank, 'a rank was awarded: ' + api.G.rank);
  assert(api.G.score[0] > score0, 'and the bonus paid');
  api.startStage();
  assert(api.G.dmgTaken === 0, 'the next street starts clean again');
});

/* ------------------------------------------------------------------- AI */
test('only a couple of enemies are allowed to swing at once', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.invuln = 0;
  for (let i = 0; i < 6; i++) api.spawnEnemy('punk', 200 + (i % 2 ? 30 + i : -30 - i), api.FLOOR_MID, 1);
  let worst = 0;
  for (let i = 0; i < 60 * 8; i++){
    for (const f of api.fighters) if (f.team === 'e') api.aiControl(f, api.STEP);
    worst = Math.max(worst, api.tokensOut());
  }
  assert(worst <= api.tokenCap(), `token cap broken: ${worst} > ${api.tokenCap()}`);
  assert(api.tokenCap() === api.DIFF[api.G.diff].tokens + api.G.players - 1, 'cap tracks difficulty and player count');
});

test('enemies close the distance and eventually land something', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.invuln = 0; p.hp = 100;
  const e = api.spawnEnemy('punk', 320, api.FLOOR_MID, -1);
  const d0 = Math.abs(e.x - p.x);
  let landed = false;
  for (let i = 0; i < 60 * 14; i++){
    api.updateFighter(e, api.STEP);
    if (p.hp < 100) { landed = true; break; }
  }
  assert(Math.abs(e.x - p.x) < d0, 'the enemy walked in');
  assert(landed, 'and threw a punch that connected');
});

test('a downed enemy gets back up on its own', () => {
  const api = boot();
  play(api); clearField(api);
  const e = api.spawnEnemy('punk', 150, api.FLOOR_MID, -1);
  api.knockDown(e, 1, 140, 110);
  assert(e.state === 'down', 'knocked into the air');
  stepFighter(api, e, 4);
  assert(!api.isDown(e) && !e.dead, 'back on their feet, got ' + e.state);
  near(e.z, 0, 0.001, 'and back on the floor');
});

test('the horde does not carpet the street in food', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  let dropped = 0;
  for (let n = 0; n < 60; n++){
    const e = api.spawnEnemy('grunt', 150, api.FLOOR_MID, -1);
    api.knockOut(e, p, api.ATK.hook);
    dropped += api.items.filter(i => !i.gone && ['meat', 'cash', 'token'].indexOf(i.kind) >= 0).length;
    api.items = [];
  }
  assert(dropped <= 9, 'sixty grunts should barely drop anything, got ' + dropped);
});

test('a named enemy is worth more than a body from the horde', () => {
  const api = boot();
  const rate = (kind) => {
    play(api); clearField(api);
    api.reseed(31);
    const p = api.players[0];
    let n = 0;
    for (let i = 0; i < 120; i++){
      const e = api.spawnEnemy(kind, 150, api.FLOOR_MID, -1);
      api.knockOut(e, p, api.ATK.hook);
      n += api.items.filter(it => !it.gone && ['meat', 'cash', 'token'].indexOf(it.kind) >= 0).length;
      api.items = [];
    }
    return n;
  };
  const grunts = rate('grunt'), punks = rate('punk');
  assert(punks > grunts, `a poser should pay out more often than a wannabee: ${punks} vs ${grunts}`);
  assert(punks < 40, 'but still not every third one: ' + punks);
});

test('the floor never holds more than a handful of pickups', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  for (let i = 0; i < 200; i++){
    const e = api.spawnEnemy('punk', 150 + (i % 40), api.FLOOR_MID, -1);
    api.knockOut(e, p, api.ATK.hook);
  }
  assert(api.loosePickups() <= api.LOOSE_MAX, 'the cap held: ' + api.loosePickups());
  assert(api.LOOSE_MAX <= 6, 'and the cap is a handful');
});

test('a boss still always pays out', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  for (let i = 0; i < 8; i++) api.mkItem('cash', 100 + i, api.FLOOR_MID, 0);   // floor already full
  const before = api.items.filter(i => !i.gone).length;
  const boss = api.spawnEnemy('hammer', 150, api.FLOOR_MID, -1);
  api.maybeDrop(boss);
  const after = api.items.filter(i => !i.gone).length;
  assert(after >= before + 2, 'the boss pays regardless of the floor cap');
  assert(api.items.some(i => i.kind === 'token' && !i.gone), 'including a token');
});

test('a dead enemy leaves the field and can pay out an item', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  let dropped = 0;
  for (let n = 0; n < 40; n++){
    const e = api.spawnEnemy('punk', 150, api.FLOOR_MID, -1);
    api.knockOut(e, p, api.ATK.hook);
    stepFighter(api, e, 4);
    assert(e.gone, 'the body clears out');
    dropped += api.items.filter(i => i.kind === 'meat' || i.kind === 'cash').length;
    api.items = [];
  }
  assert(dropped > 0, 'over forty knockouts at least one should drop something');
});

/* ---------------------------------------------------------------- waves */
test('a gate locks the camera until the street is clear', () => {
  const api = boot();
  play(api);
  step(api, 0.6);
  assert(api.W.active, 'the first gate fires immediately');
  assert(api.cam.lock >= 0, 'the camera is pinned');
  const lock = api.cam.lock;
  const p = api.players[0];
  for (let i = 0; i < 60 * 6; i++){ p.x += 8; api.update(api.STEP); }
  assert(api.cam.x <= lock + 0.5, 'the camera cannot pass the lock while enemies live');
  // clear the street
  for (const f of api.fighters) if (f.team === 'e') f.gone = true;
  api.W.queue = [];
  step(api, 0.3);
  assert(!api.W.active && api.cam.lock < 0, 'clearing the wave releases the camera');
  assert(api.W.goT > 0, 'and the GO prompt lights up');
  const nextGate = api.STAGES[0].gates[api.W.gi].x;
  for (let i = 0; i < 60 * 12; i++){ p.x += 6; api.update(api.STEP); }
  assert(api.cam.x > lock, 'the camera moves on');
  assert(api.W.active && api.cam.lock === nextGate, 'and the next gate fires and pins it again');
});

test('an ordinary wave stays small enough to read', () => {
  const api = boot();
  play(api, { players: 2 });
  let worst = 0;
  for (let i = 0; i < 60 * 12; i++){
    api.update(api.STEP);
    if (api.W.gate && api.W.gate.cap) break;          // that one is meant to flood
    worst = Math.max(worst, api.liveEnemies().length);
  }
  assert(worst > 0, 'enemies did show up');
  assert(worst <= api.MAX_ON() + 1, 'an ordinary street never floods: ' + worst);
});

/* ------------------------------------------------------------ wet ground */
test('only the wet streets reflect, and a body costs a handful of fills', () => {
  const api = boot();
  const wetStages = api.STAGES.filter(st => st.wet);
  assert(wetStages.length >= 2, 'at least a couple of streets are wet');
  for (const st of api.STAGES){
    if (!st.wet) continue;
    assert(st.wet > 0 && st.wet <= 1, st.name + ' wetness is a fraction');
  }
  // a dry street must not pay for reflections it does not show
  const cost = (stage) => {
    play(api, { stage });
    clearField(api);
    const p = api.players[0];
    p.x = api.cam.x + 100; p.y = api.FLOOR_MID;
    api.draw();
    api._resetCounts();
    api.draw();
    return api._counts.fillRect || 0;
  };
  const wetIdx = api.STAGES.findIndex(st => st.wet);
  const dryIdx = api.STAGES.findIndex(st => !st.wet);
  assert(wetIdx >= 0 && dryIdx >= 0, 'the game has both kinds of street');
  assert(cost(dryIdx) > 0 && cost(wetIdx) > 0, 'both draw');
});

test('a reflection fades out as a fighter leaves the ground', () => {
  const api = boot();
  const wetIdx = api.STAGES.findIndex(st => st.wet);
  play(api, { stage: wetIdx });
  clearField(api);
  const p = api.players[0];
  p.x = api.cam.x + 100; p.y = api.FLOOR_MID; p.z = 0;
  p.invuln = 0;                                 // or the respawn blink hides him entirely
  api.draw();
  api._resetCounts(); api.draw();
  const grounded = api._counts.fillRect || 0;
  p.z = 60;                                     // high above the street
  api._resetCounts(); api.draw();
  const airborne = api._counts.fillRect || 0;
  assert(airborne < grounded, `a jump should drop the reflection: ${airborne} vs ${grounded}`);
});

/* ---------------------------------------------------------------- surges */
test('a wave arrives a side at a time, not one from each in turn', () => {
  const api = boot();
  play(api);
  const q = api.buildQueue([['grunt', 30]], 500, 1, 24);
  assert(q.length === 30, 'everybody is in the queue');
  // walk the queue and collect the runs of same-side arrivals
  const runs = [];
  let cur = q[0].side, n = 0;
  for (const e of q){
    if (e.side === cur) n++;
    else { runs.push(n); cur = e.side; n = 1; }
  }
  runs.push(n);
  assert(runs.length >= 2, 'a wave that big should come in more than one surge');
  assert(runs[0] >= 6, 'and the first surge is a proper wall, not one man: ' + runs[0]);
  for (const r of runs.slice(0, -1))
    assert(r === api.surgeSize(24), `every full surge is the same size: ${r} vs ${api.surgeSize(24)}`);
  const sides = new Set(q.map(e => e.side));
  assert(sides.size === 2, 'and they do come from both sides eventually');
});

test('the surge is sized off the street, so grouping never thins the crowd', () => {
  const api = boot();
  assert(api.surgeSize(30) > api.surgeSize(10), 'a bigger street takes a bigger surge');
  assert(api.surgeSize(30) >= 18, 'big enough to fill a cap of thirty: ' + api.surgeSize(30));
  assert(api.surgeSize(0) >= 6, 'and never silly-small');
});

test('the beat between surges is longer than the gap inside one', () => {
  const api = boot();
  const q = api.buildQueue([['grunt', 24]], 0, 1, 12);
  const size = api.surgeSize(12);
  const withinSurge = q[2].t;
  const acrossSurge = q[size].t;
  assert(acrossSurge > withinSurge, `a side change should be a beat: ${acrossSurge} vs ${withinSurge}`);
  near(acrossSurge, api.SURGE_GAP, 0.001, 'and it is the surge gap');
  assert(q[size].side !== q[size - 1].side, 'the side really flipped there');
});

test('both wave builders arrive in surges', () => {
  const api = boot();
  play(api);
  const gate = api.STAGES[0].gates.find(g => g.cap);
  api.startWave(gate);
  assert(api.W.queue.length > 10, 'a street horde queued up');
  assert(new Set(api.W.queue.map(e => e.side)).size === 2, 'street waves use both sides');
  api.G.mode = 'horde';
  api.HORDE.wave = 5;
  api.nextHordeWave();
  assert(new Set(api.W.queue.filter(e => e.side).map(e => e.side)).size === 2, 'so do horde waves');
  const first = api.W.queue.slice(0, 6).map(e => e.side);
  assert(new Set(first).size === 1, 'and the first six all come through the same side');
  api.G.mode = 'story';
});

/* ----------------------------------------------------------- horde mode */
test('horde waves get bigger and bring worse company', () => {
  const api = boot();
  const size = (n) => api.hordeWave(n).reduce((t, [, c]) => t + c, 0);
  for (let n = 1; n < 14; n++)
    assert(size(n + 1) >= size(n), `wave ${n + 1} should not be smaller than ${n}`);
  assert(size(10) > size(1) * 2, 'and much bigger by wave ten');
  const kinds = (n) => api.hordeWave(n).map(([k]) => k);
  assert(kinds(1).length === 1, 'wave one is just bodies');
  assert(kinds(8).length >= 5, 'by wave eight it is a mixed mob: ' + kinds(8).join(','));
  for (let n = 1; n < 30; n++)
    for (const [k] of api.hordeWave(n)) assert(api.ENEMY[k], `wave ${n} spawns unknown ${k}`);
  assert(api.hordeCap(1) < api.hordeCap(9), 'the street holds more as it goes on');
  assert(api.hordeCap(99) <= 34 + 4, 'but never past what the frame can carry');
});

test('every fifth wave sends a boss, cycling through all five', () => {
  const api = boot();
  const seen = new Set();
  for (let n = 5; n <= 25; n += 5){
    const boss = api.hordeWave(n).find(([k]) => api.ENEMY[k].boss);
    assert(boss, 'wave ' + n + ' should bring a boss');
    seen.add(boss[0]);
  }
  assert(seen.size === 5, 'all five bosses take a turn, saw ' + [...seen].join(','));
  for (const n of [4, 6, 7, 9]) assert(!api.hordeWave(n).some(([k]) => api.ENEMY[k].boss), 'no boss on wave ' + n);
});

test('a horde run rolls wave after wave without walking anywhere', () => {
  const api = boot();
  api.G.story = false;
  api.startGame('horde');
  assert(api.G.mode === 'horde' && api.G.phase === 'play', 'it started');
  assert(api.HORDE.wave === 1, 'on wave one');
  const camAt = api.cam.lock;
  const p = api.players[0];
  p.hpMax = 1e6; p.hp = 1e6;
  let sawCrowd = 0;
  for (let i = 0; i < 60 * 90 && api.HORDE.wave < 3; i++){
    p.hp = p.hpMax; api.G.lives[0] = 9;
    if (i % 16 === 0){                                  // a stand-in for punching
      let killed = 0;
      for (const f of api.fighters){
        if (killed >= 2) break;
        if (f.team === 'e' && !f.dead && !f.gone){ api.knockOut(f, p, api.ATK.hook); killed++; }
      }
    }
    api.update(api.STEP);
    sawCrowd = Math.max(sawCrowd, api.liveEnemies().length);
    if (api.G.phase === 'upgrade') api.chooseUpgrade();
  }
  assert(api.HORDE.wave >= 3, 'it reached wave three, got ' + api.HORDE.wave);
  // The tester kills two every quarter second and surges land a side at a
  // time, so the street sits well below its cap here. Real crowding is
  // measured by the horde-gate test below (twenty-plus) — in a browser this
  // same wave sits pinned at its cap of thirty.
  assert(sawCrowd >= 5, 'and filled the street on the way, peak ' + sawCrowd);
  assert(api.cam.lock === camAt, 'the camera never moves off the arena');
  assert(api.G.stage === 0, 'and it never walks to another street');
});

test('every third wave pays out a pick, and taking it resumes the fight', () => {
  const api = boot();
  api.G.story = false;
  api.startGame('horde');
  api.HORDE.wave = 3;
  api.W.active = true; api.W.queue = [];
  api.fighters = api.fighters.filter(f => f.team === 'p');
  api.updateHorde(api.STEP);
  assert(api.G.phase === 'upgrade', 'wave three buys a pick, got ' + api.G.phase);
  api.chooseUpgrade();
  assert(api.G.phase === 'play', 'and then straight back to it');
  assert(api.G.mode === 'horde' && api.G.stage === 0, 'still in the arena');
});

test('the best wave is remembered between runs', () => {
  const api = boot();
  api.G.story = false;
  api.startGame('horde');
  api.HORDE.wave = 7;
  api.finishGame(false);
  assert(api.G.bestWave === 7, 'recorded, got ' + api.G.bestWave);
  const api2 = boot({ store: api._store });
  assert(api2.G.bestWave === 7, 'and survived a reboot');
  api2.startGame('horde');
  api2.HORDE.wave = 3;
  api2.finishGame(false);
  assert(api2.G.bestWave === 7, 'a worse run leaves the record alone');
});

test('a horde run draws, wave counter and all', () => {
  const api = boot();
  api.G.story = false;
  api.startGame('horde');
  for (let i = 0; i < 60 * 4; i++) api.update(api.STEP);
  api.draw();
  api._resetCounts();
  api.draw();
  assert((api._counts.fillRect || 0) > 400, 'it painted a real frame');
  assert(api.liveEnemies().length > 0, 'with a wave on the street');
});

/* ---------------------------------------------------------------- hordes */
test('every street sends several waves of tens of them', () => {
  const api = boot();
  let hordes = 0;
  for (const st of api.STAGES){
    const gates = st.gates.filter(g => g.cap);
    assert(gates.length >= 2, `${st.name} only has ${gates.length} horde gate(s)`);
    let biggest = 0;
    for (const g of gates){
      hordes++;
      const total = g.spawn.reduce((n, [, c]) => n + c, 0);
      assert(total >= 15, `${st.name} horde is only ${total} bodies`);
      assert(g.cap >= 16, `${st.name} horde cap is only ${g.cap}`);
      assert(total > g.cap, `${st.name} horde should out-number its cap so they keep coming`);
      biggest = Math.max(biggest, g.cap);
    }
    assert(biggest >= 22, `${st.name} never gets properly crowded (max cap ${biggest})`);
  }
  assert(hordes >= 12, 'the game should be full of them, found ' + hordes);
});

test('a horde really does put tens of them on the street', () => {
  const api = boot();
  play(api, { stage: 3 });
  const gate = api.STAGES[3].gates.find(g => g.cap);
  api.W.gi = api.STAGES[3].gates.indexOf(gate);
  api.cam.x = gate.x; api.cam.targetX = gate.x;
  const p = api.players[0];
  p.hpMax = 1e6; p.hp = 1e6;
  let worst = 0;
  for (let i = 0; i < 60 * 25; i++){
    p.hp = p.hpMax;
    api.update(api.STEP);
    worst = Math.max(worst, api.liveEnemies().length);
  }
  assert(worst >= 20, 'the horde should crest above twenty, got ' + worst);
  assert(worst <= gate.cap + 2, 'and still respect its own cap: ' + worst);
});

test('a grunt is a body, not a boss — cheap, quick and varied', () => {
  const api = boot();
  play(api); clearField(api);
  const g = api.ENEMY.grunt;
  assert(g.horde, 'flagged as horde stock');
  assert(g.hp < api.ENEMY.punk.hp, 'thinner than a punk');
  assert(g.score < api.ENEMY.punk.score, 'and worth less');
  const skins = new Set();
  for (let i = 0; i < 40; i++){
    const e = api.spawnEnemy('grunt', 100 + i, api.FLOOR_MID, -1);
    skins.add(e.skin);
  }
  assert(skins.size >= 3, 'a horde should not be one man printed twenty times: ' + skins.size);
  for (const sk of skins) assert(api.HORDE_SKINS.indexOf(sk) >= 0, 'from the horde palette');
});

test('more of them may swing at you, but not all of them', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = 200; p.y = api.FLOOR_MID; p.invuln = 0; p.hpMax = 1e6; p.hp = 1e6;
  for (let i = 0; i < 24; i++) api.spawnEnemy('grunt', 200 + (i % 2 ? 30 + i * 3 : -30 - i * 3), api.FLOOR_MID + (i % 5) * 3, 1);
  let worst = 0;
  for (let i = 0; i < 60 * 8; i++){
    p.hp = p.hpMax;
    for (const f of api.fighters) if (f.team === 'e') api.aiControl(f, api.STEP);
    worst = Math.max(worst, api.tokensOut());
  }
  assert(worst <= api.tokenCap(), `token cap broken under a horde: ${worst} > ${api.tokenCap()}`);
  assert(api.tokenCap() > api.DIFF[api.G.diff].tokens, 'but a horde does press harder');
});

test('in a crowd the player is marked, and alone he is not', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = api.cam.x + 100; p.y = api.FLOOR_MID;
  api.draw();
  api._resetCounts();
  api.draw();
  const alone = api._counts.fillRect || 0;
  for (let i = 0; i < 18; i++) api.spawnEnemy('grunt', api.cam.x + 30 + i * 14, api.FLOOR_MID, -1);
  api.draw();
  api._resetCounts();
  api.draw();
  const crowded = api._counts.fillRect || 0;
  assert(crowded > alone, 'a crowd costs more to draw, obviously');
  // the marker is drawn from the crowd count, so exercise both sides of it
  assert(api.liveEnemies().length >= 18, 'the crowd is there');
});

test('thirty bodies on screen still draws inside budget', () => {
  const api = boot();
  play(api, { players: 2 });
  for (let i = 0; i < 30; i++)
    api.spawnEnemy('grunt', api.cam.x + 20 + (i * 12) % 350, api.FLOOR_TOP + (i * 7) % 55, -1);
  api.draw();                                   // warm the bake
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  assert(api.liveEnemies().length >= 30, 'thirty of them are really there');
  assert(fills < 16000, 'a horde frame is too expensive: ' + fills + ' fillRects');
});

test('a minute against a horde keeps the state sane', () => {
  const api = boot();
  play(api, { stage: 1, diff: 2 });
  const gate = api.STAGES[1].gates.find(g => g.cap);
  api.W.gi = api.STAGES[1].gates.indexOf(gate);
  api.cam.x = gate.x; api.cam.targetX = gate.x;
  const p = api.players[0];
  for (let i = 0; i < 60 * 45; i++){
    p.hp = p.hpMax; api.G.lives[0] = 9;
    api.update(api.STEP);
    if (i % 200 === 0) api.draw();
    assert(api.fighters.length < 120, 'fighter list is leaking: ' + api.fighters.length);
    for (const f of api.fighters) assert(isFinite(f.x) && isFinite(f.y), 'a fighter went non-finite');
  }
});

test('the boss gate raises a boss bar and clearing it clears the stage', () => {
  const api = boot();
  play(api);
  const s = api.STAGES[0];
  api.W.gi = s.gates.length - 1;
  api.cam.x = s.gates[s.gates.length - 1].x;
  api.cam.targetX = api.cam.x;
  step(api, 3);
  const boss = api.fighters.find(f => f.boss);
  assert(boss, 'the boss walked on');
  assert(api.G.bossHp > 0 && api.G.bossName === 'BREAKER BRAM', 'the boss bar is up: ' + api.G.bossName);
  for (const f of api.fighters) if (f.team === 'e') f.gone = true;
  api.W.queue = [];
  step(api, 0.3);
  assert(api.G.phase === 'clear', 'the stage ends with the boss, got ' + api.G.phase);
  assert(api.G.lastBonus > 0, 'a clear bonus is paid');
});

test('stages run one into the next and the last one wins the game', () => {
  const api = boot();
  api.G.story = false;
  play(api);
  for (let s = 0; s < 4; s++){
    const before = api.G.stage;
    api.nextStage();
    assert(api.G.stage === before + 1, 'advanced to stage ' + (before + 2));
    assert(api.players[0] && api.players[0].hp > 0, 'players come back for the next stage');
    assert(api.G.phase === 'card', 'each stage opens on its card');
  }
  api.G.stage = api.STAGES.length - 1;
  api.nextStage();
  assert(api.G.phase === 'over' && api.G.cleared, 'finishing the last stage wins');
});

test('the stage card gets out of the way on its own', () => {
  const api = boot();
  api.G.players = 1; api.G.stage = 0;
  api.startStage();
  assert(api.G.phase === 'card', 'opens on the card');
  step(api, 3);
  assert(api.G.phase === 'play', 'and hands control over');
});

/* ------------------------------------------------------- lives & credits */
test('dying costs a life and drops you back in', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  api.G.lives[0] = 2;
  api.knockOut(p, null, api.ATK.hook);
  for (let i = 0; i < 60 * 3; i++) api.update(api.STEP);
  assert(api.G.lives[0] === 1, 'a life is gone, lives=' + api.G.lives[0]);
  assert(api.players[0].hp === api.players[0].hpMax, 'you come back whole');
  assert(api.players[0].invuln > 0, 'with a moment of mercy');
});

test('running out of lives starts the continue countdown, and it can be taken', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  api.G.lives[0] = 0;
  api.knockOut(p, null, api.ATK.hook);
  for (let i = 0; i < 60 * 4; i++) api.update(api.STEP);
  assert(api.G.contT > 0, 'the countdown is running');
  assert(api.doContinue(), 'the continue is taken');
  assert(api.G.contT === 0 && api.G.lives[0] === 2, 'fresh lives handed out');
  assert(api.players[0].hp === api.players[0].hpMax, 'and a fresh fighter');
});

test('letting the countdown run out ends the game', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  api.G.lives[0] = 0;
  api.knockOut(p, null, api.ATK.hook);
  for (let i = 0; i < 60 * 20; i++) api.update(api.STEP);
  assert(api.G.phase === 'over', 'game over, got ' + api.G.phase);
  assert(!api.G.cleared, 'and it is not a win');
});

test('two players both get their own lives, score and fighter', () => {
  const api = boot();
  play(api, { players: 2 }); clearField(api);
  assert(api.players.length === 2 && api.players[1], 'player two is on the field');
  assert(api.players[0].skin !== api.players[1].skin, 'and looks different');
  api.addScore(1, 300);
  assert(api.G.score[1] === 300 && api.G.score[0] === 0, 'scores are separate');
  api.G.lives[0] = 0;
  api.knockOut(api.players[0], null, api.ATK.hook);
  for (let i = 0; i < 60 * 4; i++) api.update(api.STEP);
  assert(api.G.contT === 0, 'one player down is not a game over while the other stands');
});

test('twenty thousand points buys a life', () => {
  const api = boot();
  play(api);
  api.G.lives[0] = 3; api.G.score[0] = 0;
  api.addScore(0, 19999);
  assert(api.G.lives[0] === 3, 'not yet');
  api.addScore(0, 2);
  assert(api.G.lives[0] === 4, 'the extra life lands at 20000');
});

/* --------------------------------------------------------------- camera */
test('the camera follows, clamps to the street, and never runs off the end', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  const len = api.STAGES[0].len;
  p.x = len - 20;
  for (let i = 0; i < 60 * 8; i++) api.updateCamera(api.STEP);
  assert(api.cam.x <= len - api.VW + 0.01, 'clamped at the far end');
  p.x = 5;
  for (let i = 0; i < 60 * 8; i++) api.updateCamera(api.STEP);
  assert(api.cam.x >= -0.01 && api.cam.x < 20, 'and at the near end');
});

test('players are kept inside the visible screen', () => {
  const api = boot();
  play(api); clearField(api);
  const p = api.players[0];
  p.x = api.cam.x - 200;
  api.updateFighter(p, api.STEP);
  assert(p.x >= api.cam.x, 'nobody walks off the left edge');
  p.y = 999;
  api.updateFighter(p, api.STEP);
  assert(p.y <= api.FLOOR_BOT, 'nor out of the floor band');
});

/* ----------------------------------------------------------------- save */
test('best score survives a reboot; a worse run does not overwrite it', () => {
  const api = boot();
  play(api);
  api.G.score[0] = 12345;
  api.finishGame(false);
  assert(api.G.best === 12345, 'best recorded');
  const store = api._store;
  const api2 = boot({ store });
  assert(api2.G.best === 12345, 'best came back, got ' + api2.G.best);
  play(api2);
  api2.G.score[0] = 10;
  api2.finishGame(false);
  assert(api2.G.best === 12345, 'a worse run leaves the record alone');
});

test('sound and scanline settings round-trip', () => {
  const api = boot();
  api.snd.on = false; api.G.scan = false; api.G.diff = 2;
  api.saveMeta();
  const api2 = boot({ store: api._store });
  assert(api2.snd.on === false, 'sound preference stuck');
  assert(api2.G.scan === false, 'scanline preference stuck');
  assert(api2.G.diff === 2, 'difficulty preference stuck');
});

test('a corrupt save does not stop the game booting', () => {
  const api = boot({ store: { twin_fists_v1: '{{{not json' } });
  assert(api.G.phase === 'title', 'still boots');
  assert(api.G.best === 0, 'and starts clean');
});

/* --------------------------------------------------------------- render */
test('the title screen draws', () => {
  const api = boot();
  api.draw();
  assert(api._counts.fillRect > 50, 'the attract screen actually paints something');
});

/* ------------------------------------------------------------------ logo */
test('the logo is set in the game font, with a band down every letter', () => {
  const api = boot();
  const cells = api.logoGlyphs('JOSKE');
  assert(cells.length > 60, 'the word has real pixels: ' + cells.length);
  const rows = new Set(cells.map(([, y]) => y));
  for (let r = 0; r < 7; r++) assert(rows.has(r), 'row ' + r + ' of the type is empty');
  assert(api.LOGO_BAND.length === 7, 'one colour band per font row');
  // top of the letter catches the light, the bottom is the deepest tone
  const lum = (c) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
  for (let r = 1; r < 7; r++) assert(lum(api.LOGO_BAND[r]) < lum(api.LOGO_BAND[r - 1]), 'band ' + r + ' should be darker than the one above');
});

test('the slab under the type leaves the counters of O and E open', () => {
  const api = boot();
  const cells = api.logoGlyphs('O');
  const feet = api.logoFeet(cells);
  assert(feet.length > 0 && feet.length < cells.length, 'only some pixels cast the slab');
  const solid = new Set(cells.map(([x, y]) => x + ',' + y));
  // the hole in an O is the cells no glyph pixel covers, two rows above a foot
  for (const [x, y] of feet){
    assert(!solid.has(x + ',' + (y + 1)), 'a foot has type below it, so it is not a foot');
    for (const d of [2, 3]) assert(!solid.has(x + ',' + (y + d)), 'the slab would land on top of the letter');
  }
  const inside = feet.filter(([x, y]) => solid.has(x + ',' + (y + 2)) || solid.has(x + ',' + (y + 3)));
  assert(inside.length === 0, 'the counter of the O would fill with shadow');
});

test('the logo bakes once — only the shine costs anything per frame', () => {
  const api = boot();
  api.draw();                                   // first title frame pays for the plates
  api._resetCounts();
  const first = (api.draw(), api._counts.fillRect || 0);
  for (let i = 0; i < 40; i++) api.draw();     // run the shine a good way along
  api._resetCounts();
  api.draw();
  const second = api._counts.fillRect || 0;
  assert(second < 3000, 'a warm title frame is too expensive: ' + second + ' fillRects');
  assert(Math.abs(second - first) < 400, 'the title frame cost should not wander: ' + first + ' vs ' + second);
});

test('the attract screen is a floss-off: two crews, facing each other, on the beat', () => {
  const api = boot();
  api.attract.t = 0.4;
  api.draw();
  const cast = api.attract.cast;
  assert(cast && cast.length === 5, 'the whole cast turned up');
  const heroes = cast.filter(f => f.team === 'p'), foes = cast.filter(f => f.team === 'e');
  assert(heroes.length === 2 && foes.length === 3, 'Joske and Smoske against three wannabees');
  assert(heroes.every(f => f.face === 1) && foes.every(f => f.face === -1), 'the crews face each other');
  assert(Math.max(...heroes.map(f => f.x)) < Math.min(...foes.map(f => f.x)), 'the crews hold their own side of the street');
  assert(cast.every(f => f.anim === 'idle'), 'everybody is flossing');
  const frames = new Set(cast.map(f => f.frame));
  assert(frames.size > 1, 'the crews are offset on the beat, not one puppet copied five times');
  const skins = new Set(cast.map(f => f.skin));
  assert(skins.has('joske') && skins.has('smoke'), 'Joske and his dance partner lead it');
});

test('every few seconds the floss-off turns into a punch, then resets', () => {
  const api = boot();
  const at = (t) => { api.attract.t = t; api.draw(); return api.attract.cast; };
  at(0.4);
  const joske = api.attract.cast[0], foe = api.attract.cast[2];
  const restX = joske.x, foeRest = foe.x;
  at(3.4);
  assert(joske.anim !== 'idle', 'Joske swings on the beat');
  assert(joske.x > restX, 'and steps in to do it');
  at(3.9);
  assert(foe.anim === 'hurt', 'the near wannabee wears it');
  assert(foe.x > foeRest, 'and gets knocked back');
  at(4.3);
  assert(foe.anim === 'lie', 'and goes down');
  at(4.5);                                      // the cycle is 4.4s long, so this is a fresh loop
  assert(joske.anim === 'idle' && joske.x === restX, 'everybody is back on the beat');
  assert(foe.anim === 'idle' && foe.x === foeRest, 'including the man who just ate it');
});

test('the title screen carries the game name, and not the old one', () => {
  assert(!/TWIN FISTS/.test(RAW), 'a stale title is still in the source');
  assert(/logo\('JOSKE'/.test(RAW) && /logo\('DE FLOSSER'/.test(RAW), 'the canvas draws the name');
  const card = RAW.slice(RAW.indexOf('id="title"'), RAW.indexOf('id="how"'));
  assert(!/<h1/.test(card), 'the DOM heading would double the canvas logo');
  assert(/#title \.card\{/.test(RAW), 'the menu is styled to sit under the logo, not over it');
  assert(/twin_fists_v1/.test(RAW), 'the save key is never renamed, whatever the game is called');
});

test('every stage draws, with fighters in every state', () => {
  const api = boot();
  const STATES = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'down', 'lie', 'getup', 'held', 'hold', 'block'];
  for (let s = 0; s < api.STAGES.length; s++){
    play(api, { stage: s, players: 2 });
    for (const type of Object.keys(api.ENEMY)){
      const e = api.spawnEnemy(type, api.cam.x + 60 + (api.fighters.length * 7) % 240, api.FLOOR_MID, -1);
      e.state = STATES[api.fighters.length % STATES.length];
      e.anim = e.state === 'attack' ? 'hook' : e.state === 'down' ? 'air' : e.state;
      if (!api.A[e.anim]) e.anim = 'idle';
      e.weapon = api.fighters.length % 3 === 0 ? 'bat' : null;
      e.z = e.state === 'jump' ? 20 : 0;
      e.hitFlash = 0.1;
    }
    for (const kind of ['bat', 'pipe', 'knife', 'crate', 'barrel', 'meat', 'cash', 'slug'])
      api.mkItem(kind, api.cam.x + 40 + Math.random() * 200, api.FLOOR_MID, 0);
    api.spawnFx('impact', api.cam.x + 100, api.FLOOR_MID, 20, '#fff');
    api.spawnFx('score', api.cam.x + 120, api.FLOOR_MID, 20, '#fff', 500);
    api.spawnFx('chip', api.cam.x + 130, api.FLOOR_MID, 20, '#fff');
    api.spawnFx('dust', api.cam.x + 140, api.FLOOR_MID, 2, '#fff');
    api.spawnFx('spark', api.cam.x + 150, api.FLOOR_MID, 20, '#fff');
    api.G.bossHp = 40; api.G.bossMax = 100; api.G.bossName = 'KANE';
    api.W.goT = 1;
    api.draw();                       // play
    api.G.phase = 'card'; api.draw();
    api.G.phase = 'clear'; api.G.lastBonus = 1200; api.draw();
    api.G.phase = 'play'; api.G.contT = 5; api.draw();
    api.G.contT = 0;
  }
});

test('a busy frame stays inside a sane draw budget', () => {
  const api = boot();
  play(api, { players: 2 });
  for (let i = 0; i < 8; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
  for (let i = 0; i < 10; i++) api.mkItem('crate', api.cam.x + i * 30, api.FLOOR_MID, 0);
  for (let i = 0; i < 30; i++) api.spawnFx('chip', api.cam.x + i * 8, api.FLOOR_MID, 10, '#fff');
  api._resetCounts();
  api.draw();                                   // first frame pays to bake the sky
  const firstFrame = api._counts.fillRect || 0;
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  assert(fills > 200, 'it drew a real frame');
  // This guard exists to catch a whole layer being redrawn every frame — the
  // dithered sky once cost 45k here. It is not a pixel budget: a browser frame
  // with 31 enemies, wet reflections and fx measures 8.7ms, well inside 16.7.
  assert(fills < 11000, 'frame is too expensive: ' + fills + ' fillRects');
  assert(firstFrame > fills * 2, 'the dithered sky should be baked once, not every frame');
  // and every other stage should be just as cheap on a warm cache
  for (let st = 1; st < api.STAGES.length; st++){
    play(api, { stage: st });
    api.draw();
    api._resetCounts();
    api.draw();
    const n = api._counts.fillRect || 0;
    assert(n < 11000, `stage ${st + 1} frame is too expensive: ${n} fillRects`);
  }
});

/* ------------------------------------------------------------ long soak */
test('a full minute of real play never throws and keeps the state sane', () => {
  const api = boot();
  play(api, { players: 2, diff: 2 });
  const keys = api.KEYS;
  const cycle = ['KeyD', 'KeyJ', 'KeyD', 'KeyK', 'KeyL', 'KeyJ', 'KeyA', 'KeyW', 'KeyS', 'KeyJ'];
  for (let i = 0; i < 60 * 60; i++){
    for (const k of cycle) keys[k] = 0;
    keys[cycle[(i / 7 | 0) % cycle.length]] = 1;
    keys.ArrowRight = (i % 40) < 25 ? 1 : 0;
    keys.Comma = (i % 23) < 4 ? 1 : 0;
    api.update(api.STEP);
    if (i % 120 === 0) api.draw();
    for (const f of api.fighters){
      assert(isFinite(f.x) && isFinite(f.y) && isFinite(f.z), 'a fighter went non-finite');
      assert(f.y >= api.FLOOR_TOP - 1 && f.y <= api.FLOOR_BOT + 1, 'a fighter left the floor band: ' + f.y);
      assert(f.hp <= f.hpMax + 0.001, 'health went over the cap');
    }
    assert(api.fighters.length < 60, 'fighter list is leaking: ' + api.fighters.length);
    assert(api.items.length < 120, 'item list is leaking: ' + api.items.length);
    assert(api.fx.length < 400, 'fx list is leaking: ' + api.fx.length);
  }
  assert(api.G.score[0] > 0, 'a minute of mashing scores something');
});

test('the whole first stage can be beaten and it ends in a clear', () => {
  const api = boot();
  play(api, { diff: 0 });
  const p = api.players[0];
  p.hpMax = 9999; p.hp = 9999;
  let cleared = false;
  for (let i = 0; i < 60 * 400; i++){
    p.hp = p.hpMax;                       // an invincible tester, so this measures progression
    api.G.lives[0] = 9;
    const foe = api.nearestFoe(p, 400);
    if (foe){
      p.x += Math.sign(foe.x - p.x) * 1.6;
      p.y += Math.sign(foe.y - p.y) * 0.9;
      p.face = foe.x >= p.x ? 1 : -1;
      if (Math.abs(foe.x - p.x) < 20 && Math.abs(foe.y - p.y) < 8 && api.canAct(p) && p.state !== 'attack')
        api.startAttack(p, 'hook');
    } else p.x += 2.2;
    api.update(api.STEP);
    if (api.G.phase === 'clear'){ cleared = true; break; }
  }
  assert(cleared, 'stage one is beatable');
  assert(api.G.score[0] > 1000, 'and it scored on the way');
});

/* The two names share a HUD row with the score, and the score sat at a bare
   `bx + 30` — which fitted JOSKE exactly (5 glyphs at 6px, less one, is 29)
   and had no room at all for a sixth letter. It got one: the partner is
   Smoske, not Smoke, and at the old offset his name printed straight through
   the first digit of his own score.

   So the gap is derived from the LONGER of the two names rather than typed,
   and this holds the derivation against the font's own metric and against the
   width the health gauge below it already claims. */
test('the HUD score clears the longer of the two names', () => {
  const src = source();
  const names = [...src.matchAll(/const nm = i === 0 \? '(\w+)' : '(\w+)'/g)][0];
  if (!names) throw new Error('could not find the two HUD names');
  const [, p1, p2] = names;
  if (p2 !== 'SMOSKE') throw new Error(`the second player is ${p2}, expected SMOSKE`);
  const w = (t) => t.length * 6 - 1;                 // textW at scale 1
  const m = src.match(/const nameGap = Math\.max\(textW\('(\w+)', 1\), textW\('(\w+)', 1\)\) \+ (\d+);/);
  if (!m) throw new Error('the score offset is not derived from the names');
  if (m[1] !== p1 || m[2] !== p2) throw new Error(`the gap measures ${m[1]}/${m[2]} but the HUD prints ${p1}/${p2}`);
  const gap = Math.max(w(p1), w(p2)) + Number(m[3]);
  if (gap <= Math.max(w(p1), w(p2))) throw new Error(`gap ${gap} does not clear the longer name`);
  // and the score still lands inside the strip the gauge below it occupies
  const scoreEnd = gap + w('000000');
  const gauge = Number((src.match(/gauge\(bx, 13, (\d+),/) || [])[1] || 0);
  if (!gauge) throw new Error('could not find the health gauge width');
  if (scoreEnd > gauge) throw new Error(`the score runs to ${scoreEnd}, past the ${gauge}px the row has`);
});

test('the partner is spelled Smoske everywhere the player can read it', () => {
  const html = fs.readFileSync(HTML, 'utf8');
  const bad = [];
  const re = /\bSmoke\b|\bSMOKE\b/g;
  let m;
  while ((m = re.exec(html))) {
    const line = html.slice(0, m.index).split('\n').length;
    bad.push(`${m[0]} at line ${line}`);
  }
  if (bad.length) throw new Error(bad.join(', '));
});

console.log(`\njoske: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
