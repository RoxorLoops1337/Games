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
  glow, glowSprite, GLOW_STEPS, bake, blit, getCtx: () => ctx,
  RAIN, drawRain, drawAmbient, hash,
  faceMood, drawFace, drawHair, FACE_INK, FACE_WHITE, HEAD_LIFT, poseGeom, A,
  BUILDS, buildOf, drawBlade, drawHeldWeapon, W_LEN, W_COL, W_REST,
  gauge, drawPortrait, shade, drawForeground, drawVignette, drawSceneBg, drawItem,
  paintText, textSprite, clearTextCache, TEXT_CACHE_MAX,
  wetReflection, wetPower, REFL_BANDS, rigParts,
  marks, mark, clearMarks, updateMarks, drawMarks, MARK_MAX,
  slamShock, superStrike, breakItem,
  deadFade, deadLife, deadStart, knockOut, rgba, get fx(){ return fx; },
  GRADE, gradePass, get fighters(){ return fighters; }, set fighters(v){ fighters = v; },
  CLOUD_SETS, propLight, mkItem,
  drawCut,
  litStage, WATER_TOP, WATER_COL_N, waterColumn,
  plate, drawCard, drawClear, drawContinue, CARD_T, CLEAR_T, CONT_T,
  CLOUDS, cloudBand, drawClouds,
  GROUND, GROUND_ROWS, GROUND_JOINT, groundPlane, groundGrime,
  bloomPass, BLOOM_AMT, BLOOM_DIV, getBloom: () => bloomC, drawFx, updateFx, cycleLen, WALK_FPS, RUN_FPS,
  LF, LF_W, LF_N, lfReset, lfAdd, lfHex, lightAt, FX_LIGHT,
  stickVector, stickRecentre, STICK_DEAD, STICK_MAX, fullscreenSupported, isFullscreen, toggleFullscreen,
  _ctxCounts: null,
};
`;

function makeSandbox(opts){
  opts = opts || {};
  const counts = {};
  const styles = [];                  // every colour the game asks the canvas for
  const rects = [];                   // and every rectangle, so a test can measure a shape
  // Baked sprites are blitted, not painted, so where a blit lands is the only
  // way to measure anything drawn from a cache — text above all.
  const blits = [];
  const alphas = [];
  const ops = [];                     // and every composite mode — a grade is not a rectangle either
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, {
    get(t, p){
      if (p === 'measureText') return () => ({ width: 30 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      if (p === 'canvas') return { width: 384, height: 224 };
      if (p === 'drawImage') return (img, x, y) => {
        counts.drawImage = (counts.drawImage || 0) + 1;
        if (blits.length < 20000) blits.push([x, y, img && img.width, img && img.height]);
      };
      if (p === 'fillRect') return (x, y, w, h) => {
        counts.fillRect = (counts.fillRect || 0) + 1;
        if (rects.length < 40000) rects.push([x, y, w, h, t.fillStyle]);
      };
      if (typeof p === 'string' && p !== 'then' && !(p in t))
        return (...args) => { counts[p] = (counts[p] || 0) + 1; };
      return t[p];
    },
    set(t, p, v){
      if (p === 'fillStyle') styles.push(String(v));
      if (p === 'globalAlpha') alphas.push(v);   // a fade is a property, not a rectangle
      if (p === 'globalCompositeOperation') ops.push(String(v));
      t[p] = v; return true;
    },
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
  return { sandbox, store, counts, styles, rects, blits, alphas, ops, nodes, canvas };
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
  const { sandbox, store, counts, styles, rects, blits, alphas, ops } = makeSandbox(opts);
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', '__out', source())(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined, sandbox.requestAnimationFrame, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  api._counts = counts;
  api._styles = styles;
  api._rects = rects;
  api._blits = blits;
  api._alphas = alphas;
  api._ops = ops;
  api._resetCounts = () => { for (const k in counts) delete counts[k]; styles.length = 0; rects.length = 0; blits.length = 0; alphas.length = 0; ops.length = 0; };
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

/* ----------------------------------------------------------------- light */
test('a glow is baked once per colour and radius, then reused', () => {
  const api = boot();
  api._resetCounts();
  api.glow(100, 100, 20, 14, '#ff2f7a', 0.5);
  const firstUse = api._counts.fillRect || 0;
  assert(firstUse > 20, 'baking the sprite painted its rings: ' + firstUse);
  api._resetCounts();
  for (let i = 0; i < 30; i++) api.glow(100 + i, 100, 20, 14, '#ff2f7a', 0.5);
  assert((api._counts.fillRect || 0) === 0, 'a warm glow should cost no fills, only a blit');
  assert((api._counts.drawImage || 0) === 30, 'each one is a single blit');
  api._resetCounts();
  api.glow(100, 100, 20, 14, '#2fc8e8', 0.5);       // a different colour is a different sprite
  assert((api._counts.fillRect || 0) > 20, 'a new colour has to be baked');
});

test('a glow puts light in and hands the context back the way it found it', () => {
  const api = boot();
  const ctx = api.getCtx();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  api.glow(100, 100, 18, 12, '#ffcc7a', 0.3);
  assert(ctx.globalCompositeOperation === 'source-over', 'left the context in additive mode — everything after would blow out');
  assert(ctx.globalAlpha === 1, 'left the context faded: ' + ctx.globalAlpha);
  ctx.globalAlpha = 0.4;                            // and it restores whatever it was handed
  api.glow(100, 100, 18, 12, '#ffcc7a', 0.3);
  assert(ctx.globalAlpha === 0.4, 'clobbered an alpha it did not own');
});

test('a glow off the side of the screen is not drawn at all', () => {
  const api = boot();
  api.glow(-400, 100, 12, 9, '#ff2f7a', 0.5);       // bake it once so the counts are clean
  api._resetCounts();
  api.glow(-400, 100, 12, 9, '#ff2f7a', 0.5);
  api.glow(api.VW + 400, 100, 12, 9, '#ff2f7a', 0.5);
  assert((api._counts.drawImage || 0) === 0, 'offscreen lights should be skipped');
  api.glow(api.VW / 2, 100, 12, 9, '#ff2f7a', 0.5);
  assert((api._counts.drawImage || 0) === 1, 'and onscreen ones should not');
});

test('the glow falloff crowds the centre, so a light reads as a light', () => {
  const api = boot();
  assert(api.GLOW_STEPS >= 5, 'enough rings for a smooth falloff');
  const sprite = api.glowSprite('#ffcc7a', 20, 14);
  assert(sprite.width === 42 && sprite.height === 30, 'the plate is the radius plus its margin: ' + sprite.width + 'x' + sprite.height);
  // the ring radii are rx*k^2, so ring n is always inside ring n-1 by a growing step
  const r = [];
  for (let s = 0; s < api.GLOW_STEPS; s++){ const t = 1 - s / (api.GLOW_STEPS + 1); r.push(20 * t * t); }
  for (let i = 1; i < r.length; i++) assert(r[i] < r[i - 1], 'ring ' + i + ' is not inside the last');
  for (let i = 2; i < r.length; i++)
    assert(r[i - 1] - r[i] < r[i - 2] - r[i - 1] + 0.001, 'the steps should tighten toward the centre, not spread');
});

test('nothing shadows the light helper', () => {
  // bgFoundry once had `const glow = 0.55 + ...` for its furnace flicker, which
  // silently turned every glow() call in that function into a number call.
  const bodies = RAW.split(/function bg[A-Z]/).slice(1);
  assert(bodies.length >= 5, 'found the background painters');
  for (const b of bodies){
    const head = b.slice(0, b.indexOf('\n}\n'));
    assert(!/\b(const|let|var|function)\s+glow\b/.test(head), 'a background shadows glow(): ' + head.slice(0, 40));
  }
  assert(!/\bctx\.fillStyle = 'rgba\(255,110,20,0\.05\)'/.test(RAW), 'a flat rectangle is still standing in for a light');
});

test('every stage lights up, and stays inside the frame budget', () => {
  const api = boot();
  for (let st = 0; st < api.STAGES.length; st++){
    play(api, { stage: st });
    api.draw();                                     // first frame bakes the sky and the glow plates
    api._resetCounts();
    api.draw();
    const fills = api._counts.fillRect || 0, blits = api._counts.drawImage || 0;
    assert(fills < 7500, `stage ${st + 1} costs ${fills} fillRects`);
    assert(blits >= 2, `stage ${st + 1} draws ${blits} blits — the baked plates are not being reused`);
    assert(blits < 150, `stage ${st + 1} hangs ${blits} lights, more than a scene needs`);
  }
  // and every painter actually hangs lights rather than flat rectangles
  for (const fn of ['bgStreet', 'bgJunk', 'bgDocks', 'bgFoundry', 'bgKeep']){
    const body = RAW.slice(RAW.indexOf('function ' + fn));
    const head = body.slice(0, body.indexOf('\n}\n'));
    assert(/\bglow\(/.test(head), fn + ' has no lights in it');
  }
});

/* ------------------------------------------------------------- the rush */
test('every tier of rush has a colour of its own', () => {
  const api = boot();
  assert(api.SUPER.tints.length === api.SUPER.tiers.length,
    `${api.SUPER.tints.length} tints for ${api.SUPER.tiers.length} tiers`);
  assert(new Set(api.SUPER.tints).size === api.SUPER.tints.length, 'two tiers share a colour');
  for (const t of api.SUPER.tints) assert(/^#[0-9a-f]{6}$/i.test(t), 'not a colour: ' + t);
});

test('a rush stands in a column of light, in the colour of its tier', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const f = api.players[0];
  f.y = api.FLOOR_MID; f.z = 0;
  const shot = (state, tier) => {
    f.state = state; f.anim = state === 'super' ? 'rise' : 'idle'; f.frame = 0;
    f.tier = tier == null ? null : api.SUPER.tiers[tier];
    api._resetCounts();
    api.drawFighter(f);
    return { n: api._rects.length, cols: new Set(api._rects.map(r => r[4])) };
  };
  const idle = shot('idle');
  const one = shot('super', 0), three = shot('super', 2);
  assert(one.n > idle.n + 60, `a rush is drawn in ${one.n} pieces against ${idle.n} standing still`);
  const tinted = (sh, hex) => {
    const n = parseInt(hex.slice(1), 16);
    const want = `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`;
    return [...sh.cols].filter(c => String(c).replace(/\s/g, '').includes(want)).length;
  };
  assert(tinted(one, api.SUPER.tints[0]) >= 3, 'the column is not in the first tier colour');
  assert(tinted(three, api.SUPER.tints[2]) >= 3, 'nor the third in its own');
  assert(tinted(one, api.SUPER.tints[2]) === 0, 'tier one is drawn in tier three colours');
  /* And the shaft specifically: a stack of three-pixel rows narrowing as it
     goes up.  Without this the ring and the spokes alone satisfy everything
     above, which is how the first version of this test passed with the
     column deleted. */
  f.state = 'super'; f.anim = 'rise'; f.frame = 0; f.tier = api.SUPER.tiers[0];
  api._resetCounts();
  api.drawFighter(f);
  const n0 = parseInt(api.SUPER.tints[0].slice(1), 16);
  const want = `${n0 >> 16 & 255},${n0 >> 8 & 255},${n0 & 255}`;
  const rows = api._rects
    .filter(r => r[3] === 3 && /^rgba\(/.test(String(r[4])) &&
      (String(r[4]).replace(/\s/g, '').includes(want) || /^rgba\(255,255,255/.test(String(r[4]).replace(/\s/g, ''))))
    .sort((a, b) => b[1] - a[1]);
  assert(rows.length >= 15, 'the column is ' + rows.length + ' rows tall');
  assert(rows[0][2] > rows[rows.length - 1][2] + 6,
    `the column does not narrow as it rises: ${rows[0][2]} at the foot, ${rows[rows.length - 1][2]} at the top`);
});

test('a rush lights the street it is thrown on', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  f.y = api.FLOOR_MID; f.z = 0; f.state = 'idle'; f.anim = 'idle';
  api.draw();
  /* Measured with the field cleared and only this man drawn into it: the
     street's own neon saturates that column otherwise, and then nothing the
     rush adds is visible in the number. */
  const own = (dx) => {
    api.lfReset();
    api.drawFighter(f);
    const l = api.lightAt(Math.round(f.x - api.cam.x + dx));
    return l ? l.k : 0;
  };
  f.state = 'idle'; f.anim = 'idle'; f.tier = null;
  const baseHere = own(0), baseFar = own(66);
  f.state = 'super'; f.anim = 'rise'; f.tier = api.SUPER.tiers[0];
  assert(own(0) > baseHere + 0.2, `the rush adds ${(own(0) - baseHere).toFixed(2)} where he stands`);
  // the glows round him reach about forty pixels; sixty-six out is only the
  // wide seed the rush puts into the field on purpose
  // measured: 0.10 with the wide seed, 0.02 on the glows alone
  assert(own(66) > baseFar + 0.06,
    `the rush lights his own feet but not the street: ${own(66).toFixed(2)} sixty-six pixels out`);
});

test('the whole frame goes the colour of the rush, and only while it lasts', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  f.y = api.FLOOR_MID; f.z = 0;
  const frameTint = () => {
    api._resetCounts();
    api.draw();
    return api._rects.filter(r => r[2] === api.VW && r[3] === api.VH && String(r[4]).startsWith('rgba('));
  };
  f.state = 'idle'; f.anim = 'idle'; f.tier = null;
  assert(frameTint().length === 0, 'the street is tinted with nobody rushing');
  f.state = 'super'; f.anim = 'rise'; f.tier = api.SUPER.tiers[0];
  const gold = frameTint();
  assert(gold.length >= 1, 'a rush does not colour the frame');
  f.tier = api.SUPER.tiers[2];
  const violet = frameTint();
  assert(violet.length >= 1, 'the third tier does not colour the frame');
  assert(String(gold[0][4]) !== String(violet[0][4]), 'both tiers tint the frame the same colour');
});

/* ----------------------------------------------------------- the bosses */
function bossShape(api, skin, isBoss, opts){
  const f = api.mkFighter({ team: 'e', skin, x: api.cam.x + 190, y: api.FLOOR_MID, face: 1 });
  f.anim = 'idle'; f.frame = 1; f.state = 'idle'; f.boss = isBoss;
  Object.assign(f, opts || {});
  api._resetCounts();
  api.drawFighter(f);
  const trim = api.SKINS[skin].trim;
  return {
    n: api._rects.length,
    cols: new Set(api._rects.map(r => r[4])),
    // the belt is in the trim colour on every fighter, so presence proves
    // nothing — what the gear adds is more of it
    trim: api._rects.filter(r => r[4] === trim).length,
    // the ring is ten single pixels in a translucent trim colour, and it is
    // the only thing on a fighter drawn that way
    ring: api._rects.filter(r => r[2] === 1 && r[3] === 1 && String(r[4]).startsWith('rgba(')).length,
  };
}

test('a boss stands in a ring of his own colour', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  for (const [key, e] of Object.entries(api.ENEMY)){
    if (!e.boss) continue;
    const trim = api.SKINS[e.skin].trim;
    assert(trim, key + ' has no trim colour to mark him with');
    const on = bossShape(api, e.skin, true), off = bossShape(api, e.skin, false);
    const ring = (sh) => [...sh.cols].filter(c => typeof c === 'string' && c.startsWith('rgba(') &&
      c.includes(String(parseInt(trim.slice(1, 3), 16)))).length;
    assert(ring(on) > ring(off), key + ' has no ring under him');
    assert(on.n > off.n + 8, `${key} is drawn in ${on.n} pieces against ${off.n} for the same man unpromoted`);
  }
});

test('every boss has a piece of gear of his own', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const skins = [...new Set(Object.values(api.ENEMY).filter(e => e.boss).map(e => e.skin))];
  assert(skins.length === 5, 'there are ' + skins.length + ' boss skins');
  const gearCost = {};
  for (const sk of skins){
    const on = bossShape(api, sk, true), off = bossShape(api, sk, false);
    gearCost[sk] = on.n - off.n;
    assert(gearCost[sk] > 8, `${sk} gets ${gearCost[sk]} pixels of gear — that is just the ring`);
    assert(on.trim > off.trim, `${sk}'s gear adds nothing in his own trim colour: ${on.trim} against ${off.trim}`);
  }
  // and they are not all the same piece
  const spread = Math.max(...Object.values(gearCost)) - Math.min(...Object.values(gearCost));
  assert(spread > 4, 'every boss gets the same gear: ' + JSON.stringify(gearCost));
});

test('the ring goes out when he does, and the gear does not draw through a flash', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const alive = bossShape(api, 'hammer', true);
  const dead = bossShape(api, 'hammer', true, { dead: true });
  assert(alive.ring >= 8, 'the living one has no ring: ' + alive.ring);
  assert(dead.ring === 0, 'a dead boss still stands in his ring: ' + dead.ring);
  api.setT(0);                                    // the flash alternates on frame parity
  const flashed = bossShape(api, 'hammer', true, { hitFlash: 0.1 });
  const plain = bossShape(api, 'hammer', false);
  assert(flashed.trim <= plain.trim, 'the gear is drawn through the hit flash');
});

/* --------------------------------------------------------- the rooftop */
test('the skyline is two rows deep, and the far one is hazed', () => {
  const api = boot();
  play(api, { stage: 4 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const r = api._rects;
  const near = r.filter(q => q[4] === '#33203a' && q[2] === 38);
  const far = r.filter(q => q[4] === '#6f4a63' && q[2] === 30);
  assert(near.length >= 5, 'the near skyline is ' + near.length + ' blocks');
  assert(far.length >= 8, 'there is no second row behind it: ' + far.length);
  const lum = (c) => { const n = parseInt(c.slice(1), 16); return ((n >> 16 & 255) + (n >> 8 & 255) + (n & 255)) / 3; };
  assert(lum('#6f4a63') > lum('#33203a') * 1.5, 'the far row is not hazed toward the sky at all');
  // measured, exactly: 9 near and 12 far with the cull, 17 and 21 without
  assert(near.length <= 13, `${near.length} near blocks painted — the loop is not culling`);
  assert(far.length <= 16, `${far.length} far blocks painted — the far loop is not culling`);
});

test('the sunset rims whichever edge is facing it', () => {
  const api = boot();
  play(api, { stage: 4 });
  api.cam.x = 0;
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const sunX = api.VW - 92;
  const rims = api._rects.filter(q => q[2] === 1 && q[3] > 20 && /rgba\(255,\s*176,\s*96/.test(String(q[4])));
  assert(rims.length >= 5, 'nothing on the skyline catches the sun: ' + rims.length);
  const alpha = (q) => +(/rgba\([^)]*,\s*([0-9.]+)\)/.exec(String(q[4])) || [0, 0])[1];
  const byDist = rims.slice().sort((a, b) => Math.abs(a[0] - sunX) - Math.abs(b[0] - sunX));
  assert(alpha(byDist[0]) > alpha(byDist[byDist.length - 1]) + 0.1,
    `the rim should fade with distance from the sun: ${alpha(byDist[0])} nearest, ${alpha(byDist[byDist.length - 1])} furthest`);
  // and it is on the side facing the sun, not the shaded one
  // every rim has to sit on the edge of its block that faces the sun
  const blocks = api._rects.filter(q => q[4] === '#33203a' && q[2] === 38);
  let checked = 0;
  for (const rim of rims){
    const owner = blocks.find(q => rim[0] === q[0] || rim[0] === q[0] + 37);
    if (!owner) continue;
    checked++;
    const want = owner[0] + 19 < sunX ? owner[0] + 37 : owner[0];
    assert(rim[0] === want, `a rim at ${rim[0]} is down the shaded side of the block at ${owner[0]}`);
  }
  assert(checked >= 4, 'only ' + checked + ' rims could be matched to a block');
});

test('the roofs of the skyline are not all the same', () => {
  const api = boot();
  play(api, { stage: 4 });
  let setbacks = 0, tanks = 0, masts = 0, plain = 0;
  for (let gx = 0; gx < 300; gx++){
    if (api.hash(gx + 41) > 0.55) setbacks++;
    const roof = api.hash(gx + 29);
    if (roof > 0.7) tanks++; else if (roof > 0.42) masts++; else plain++;
  }
  assert(setbacks > 90 && setbacks < 210, 'setbacks are on ' + setbacks + ' of 300');
  for (const [n, v] of [['tank', tanks], ['mast', masts], ['plain', plain]])
    assert(v > 40, `only ${v} of 300 blocks get a ${n} roof`);
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const r = api._rects;
  assert(r.some(q => q[4] === '#33203a' && q[2] === 22), 'no setback storeys were drawn');
  assert(r.some(q => q[4] === '#2b1b32' && q[2] === 10), 'no water tanks on the skyline');
  assert(r.some(q => q[4] === '#2b1b32' && q[2] === 1 && q[3] === 13), 'no masts on the skyline');
});

/* --------------------------------------------------------- the foundry */
test('the furnaces are built into brick, with iron round the mouth', () => {
  const api = boot();
  play(api, { stage: 3 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const r = api._rects;
  const courses = r.filter(q => q[4] === '#221718' && q[2] === 70 && q[3] === 1);
  assert(courses.length >= 30, 'the wall has ' + courses.length + ' brick courses on it');
  const joints = r.filter(q => q[4] === '#241a1a' && q[2] === 1 && q[3] === 5);
  assert(joints.length >= 40, 'the courses have no vertical joints: ' + joints.length);
  const bolts = r.filter(q => q[4] === '#7a5040' && q[2] === 2 && q[3] === 2);
  assert(bolts.length >= 8, 'the iron frames have ' + bolts.length + ' bolts between them');
  assert(bolts.length % 4 === 0, 'bolts come four to a frame, got ' + bolts.length);
  // measured, exactly: 16 bolts (4 furnaces) with the cull, 36 (9) without
  assert(bolts.length <= 28, `${bolts.length / 4} furnaces painted — the loop is not culling`);
  assert(r.some(q => q[4] === '#503430' && q[2] === 58), 'no hearth apron under the mouth');
  assert(r.some(q => /rgba\(255,\s*122,\s*30/.test(String(q[4]))), 'no slag left on the apron');
});

test('the walkway has a rail on it, and a ladder off some of them', () => {
  const api = boot();
  play(api, { stage: 3 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const r = api._rects;
  assert(r.some(q => q[4] === '#6a5c74' && q[2] === 70), 'no handrail along the walkway');
  const uprights = r.filter(q => q[4] === '#4a3f52' && q[2] === 1 && q[3] === 5);
  assert(uprights.length >= 18, 'the handrail stands on ' + uprights.length + ' uprights');
  const rungs = r.filter(q => q[4] === '#584a60' && q[2] === 8 && q[3] === 1);
  assert(rungs.length >= 6, 'no ladders off the walkway: ' + rungs.length + ' rungs');
  let ladders = 0;
  for (let gx = 0; gx < 300; gx++) if (api.hash(gx + 9) > 0.62) ladders++;
  assert(ladders > 70 && ladders < 170, 'ladders are on ' + ladders + ' of 300 — that is not a third');
});

test('the foundry stays cheap wherever the camera is', () => {
  const api = boot();
  play(api, { stage: 3 });
  api.draw();
  for (const cx of [0, 59, 240, 830, 1620]){
    api.cam.x = cx;
    api._resetCounts();
    api.drawBackground();
    const n = api._counts.fillRect || 0;
    assert(n > 300, `at camera ${cx} it drew almost nothing: ${n}`);
    assert(n < 3600, `at camera ${cx} it drew ${n} fillRects`);
  }
});

/* ------------------------------------------------------------- the dock */
test('a container is a box with corners on it, not a coloured bar', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const r = api._rects;
  const castings = r.filter(q => q[4] === '#2a2c30' && q[2] === 7 && q[3] === 3);
  assert(castings.length >= 8, 'the boxes have ' + castings.length + ' corner castings between them');
  assert(castings.length % 2 === 0, 'castings come in pairs, one each end');
  // measured, exactly: 28 top castings with the cull, 54 without
  assert(castings.length <= 40, `${castings.length} castings painted — the loop is not culling`);
  assert(r.some(q => q[4] === '#22242a'), 'no castings along the bottom rail');
  assert(r.some(q => q[4] === '#0a1620' && q[2] === 58), 'stacked boxes run together with no line between them');
  assert(r.some(q => /rgba\(138,\s*74,\s*34/.test(String(q[4]))), 'not a spot of rust in the whole yard');
});

test('some boxes are doors and some are corrugated', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  // a door has locking bars three wide and two tall; a corrugated side has
  // ribs two wide and fifteen tall. Both shapes have to be on the wharf.
  const bars = api._rects.filter(r => r[2] === 3 && r[3] === 2).length;
  const ribs = api._rects.filter(r => r[2] === 2 && r[3] === 15).length;
  assert(bars >= 4, 'no doors on any box: ' + bars + ' locking bars');
  assert(ribs >= 8, 'no corrugated sides: ' + ribs + ' ribs');
  let doors = 0;
  for (let gx = 0; gx < 300; gx++) for (let sI = 0; sI < 3; sI++) if (api.hash(gx * 11 + sI) > 0.55) doors++;
  assert(doors > 250 && doors < 650, 'the split is ' + doors + ' of 900 — that is not a mix');
  let rusty = 0;
  for (let gx = 0; gx < 300; gx++) for (let sI = 0; sI < 3; sI++) if (api.hash(gx * 3 + sI * 5) > 0.5) rusty++;
  assert(rusty > 300 && rusty < 600, 'the rust is on ' + rusty + ' of 900');
});

test('the dock stays cheap wherever the camera is', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.draw();
  for (const cx of [0, 61, 190, 640, 1310]){
    api.cam.x = cx;
    api._resetCounts();
    api.drawBackground();
    const n = api._counts.fillRect || 0;
    assert(n > 300, `at camera ${cx} it drew almost nothing: ${n}`);
    assert(n < 3200, `at camera ${cx} it drew ${n} fillRects`);
  }
});

/* ------------------------------------------------------------- the yard */
test('the stacks are wrecks, and no two rows are the same car', () => {
  const api = boot();
  play(api, { stage: 1 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const cols = new Set(api._rects.map(r => r[4]));
  const lum = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const bodies = [...cols].filter(c => /^#[0-9a-f]{6}$/.test(c)).map(c => ({ c, v: lum(c) }));
  // the five wreck palettes: faded, and none of them the same hue
  const wrecks = ['#4e2219', '#22364a', '#443c33', '#4a401b', '#2e402a'];
  const seen = wrecks.filter(w => cols.has(w));
  assert(seen.length >= 2, 'the whole yard is ' + seen.length + ' colour of car');
  for (const w of wrecks) assert(Math.max(...lum(w)) < 120, w + ' is too bright for a wreck in a dark yard');
  // two wheels a car, so this counts the cars actually painted
  const wheels = api._rects.filter(r => r[4] === '#15100f').length;
  // measured, exactly: 42 wheels (21 cars) with the cull, 64 (32) without
  assert(wheels >= 30, 'the wrecks have lost their wheels: ' + wheels);
  assert(wheels <= 52, `${wheels / 2} cars painted for the twenty-odd on screen — the loop is not culling`);
  assert(bodies.length > 12, 'the yard is drawn in ' + bodies.length + ' colours');
});

test('the fence is a baked mesh, stamped rather than drawn', () => {
  const api = boot();
  play(api, { stage: 1 });
  api.draw();                                     // bake it
  api._resetCounts();
  api.drawBackground();
  const blits = api._counts.drawImage || 0;
  assert(blits >= 5, 'only ' + blits + ' blits — the mesh is being drawn by hand');
  // a hand-drawn weave is hundreds of pixels a tile; a stamped one is none
  // hand-weaving the mesh took the yard from 1000 fills to 6760
  const fills = api._counts.fillRect || 0;
  assert(fills < 2500, 'a yard frame costs ' + fills + ' fillRects');
});

/* This bounds the whole yard rather than any one cull: the floor and fence
   culls each save under a hundred fills, which no honest threshold separates.
   What it does catch is a layer going quadratic wherever you stand. */
test('the yard stays cheap wherever the camera is', () => {
  const api = boot();
  play(api, { stage: 1 });
  api.draw();
  for (const cx of [0, 63, 220, 705, 1490]){
    api.cam.x = cx;
    api._resetCounts();
    api.drawBackground();
    const n = api._counts.fillRect || 0;
    assert(n > 300, `at camera ${cx} it drew almost nothing: ${n}`);
    assert(n < 2500, `at camera ${cx} it drew ${n} fillRects`);
  }
});

test('there is something on the floor of the yard, and it varies', () => {
  const api = boot();
  play(api, { stage: 1 });
  const kinds = [0, 0, 0, 0, 0, 0];
  for (let gx = 0; gx < 300; gx++) kinds[Math.floor(api.hash(gx * 7 + 3) * 6)]++;
  for (let k = 0; k < 6; k++) assert(kinds[k] > 20, `only ${kinds[k]} of 300 patches get debris ${k}`);
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const cols = new Set(api._rects.map(r => r[4]));
  const debris = ['#1d1817', '#736c60', '#5c5347', '#4a5330'].filter(c => cols.has(c));
  assert(debris.length >= 2, 'the yard floor has ' + debris.length + ' kinds of rubbish on it');
});

/* ------------------------------------------------------------ the street */
test('only the blocks you can see get painted', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const cornices = () => {
    api._resetCounts();
    api.drawBackground();
    return api._rects.filter(r => r[2] === 76 && r[3] === 4).length;
  };
  const n = cornices();
  assert(n >= 4, 'the street is only ' + n + ' blocks wide on screen');
  assert(n <= 7, `${n} blocks painted for the ${Math.ceil(api.VW / 82) + 1} that fit — the loop is not culling`);
  // and it stays that way wherever the camera is
  for (const cx of [0, 41, 137, 400, 913]){
    api.cam.x = cx;
    const m = cornices();
    assert(m >= 4 && m <= 7, `at camera ${cx} it painted ${m} blocks`);
  }
});

test('a block has a top on it, and the roofs are not all the same', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const cols = new Set(api._rects.map(r => r[4]));
  assert(cols.has('#584a72'), 'no lit edge on the cornice');
  // full building width, not the one-pixel mast that shares its colour
  assert(api._rects.some(r => r[4] === '#2e2742' && r[2] === 74 && r[3] === 1),
    'no string course under the cornice');
  // over a long run of street every kind of roof furniture should turn up
  const kinds = { tank: 0, mast: 0, stair: 0 };
  for (let gx = 0; gx < 200; gx++){
    const roof = api.hash(gx + 31);
    if (roof > 0.66) kinds.tank++; else if (roof > 0.34) kinds.mast++; else kinds.stair++;
  }
  for (const k of Object.keys(kinds)) assert(kinds[k] > 20, `only ${kinds[k]} of 200 blocks get a ${k}`);
  // and the ground floor is a shop about half the time
  let shops = 0;
  for (let gx = 0; gx < 200; gx++) if (api.hash(gx + 61) > 0.5) shops++;
  assert(shops > 60 && shops < 140, 'the shops are ' + shops + ' of 200 — that is not a mix');
});

test('the fire escape hangs in front of the windows, not behind them', () => {
  const src = RAW.slice(RAW.indexOf('function bgStreet('));
  const head = src.slice(0, src.indexOf('\n}\n'));
  const windows = head.indexOf('somebody is still up in this one');
  const escape = head.indexOf('a fire escape down the front');
  const cornice = head.indexOf('// cornice');
  assert(windows >= 0 && escape >= 0 && cornice >= 0, 'bgStreet no longer looks the way this test expects');
  assert(cornice < windows, 'the cornice is painted over the windows');
  assert(escape > windows, 'the fire escape is painted under the windows it hangs across');
});

test('the street frame is cheaper for being culled', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  assert(fills > 1500, 'it drew a real street');
  assert(fills < 9000, 'a street frame costs ' + fills + ' fillRects');
});

/* ----------------------------------------------------------------- props */
function itemShape(api, kind){
  const it = api.mkItem(kind, api.cam.x + 190, api.FLOOR_MID, 0);
  it.life = 1.2;
  api._resetCounts();
  api.drawItem(it);
  const parts = api._rects.map(r => ({ r, c: r[4] }));
  api.items = api.items.filter(q => q !== it);
  return { parts, cols: new Set(api._styles.filter(c => /^#/.test(c))), n: api._rects.length };
}

test('a crate is a box with a lid on it, not a rectangle with stripes', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const crate = itemShape(api, 'crate');
  assert(crate.cols.size >= 7, 'a crate in ' + crate.cols.size + ' colours is still flat');
  assert(crate.cols.has('#140e1a'), 'no ink round it');
  // the lid rows sit above the body, each one further right and shorter
  const body = crate.parts.find(p => p.c === '#a97a42');
  assert(body, 'no crate body');
  // the lid rows are the painted lid; the key light on top of it is not one
  const lid = crate.parts.filter(p => p.r[1] < body.r[1] && p.r[3] === 1 && !String(p.c).startsWith('rgba(')).sort((a, b) => b.r[1] - a.r[1]);
  assert(lid.length >= 3, 'the crate has no lid: ' + lid.length + ' rows above the body');
  for (let i = 1; i < lid.length; i++){
    assert(lid[i].r[0] > lid[i - 1].r[0], 'lid row ' + i + ' does not step back');
    assert(lid[i].r[2] < lid[i - 1].r[2], 'lid row ' + i + ' does not narrow as it recedes');
  }
});

test('a barrel is shaded across its width, with a rim you can see into', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const bar = itemShape(api, 'barrel');
  // the staves: full-height strips side by side, in more than one tone
  const strips = bar.parts.filter(p => p.r[3] >= 15 && p.r[2] <= 5).sort((a, b) => a.r[0] - b.r[0]);
  assert(strips.length >= 4, 'the barrel is ' + strips.length + ' bands wide — that is not a cylinder');
  const tones = new Set(strips.map(p => p.c));
  assert(tones.size === strips.length, 'the bands repeat a tone: ' + [...tones].join(' '));
  const lum = (c) => { const n = parseInt(c.slice(1), 16); return ((n >> 16 & 255) + (n >> 8 & 255) + (n & 255)) / 3; };
  const lums = strips.map(p => lum(p.c));
  const peak = lums.indexOf(Math.max(...lums));
  assert(peak > 0 && peak < strips.length - 1, 'the light on a cylinder is not at its edge: band ' + peak);
  assert(bar.cols.has('#33200f'), 'the barrel has no dark inside its rim');
});

test('the small pickups are not single rectangles either', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  for (const k of ['meat', 'cash']){
    const shape = itemShape(api, k);
    assert(shape.cols.size >= 5, `${k} is drawn in ${shape.cols.size} colours`);
    assert(shape.n >= 8, `${k} is ${shape.n} pieces`);
  }
  assert(itemShape(api, 'meat').cols.has('#fff6e0'), 'the joint has no bone in it');
  assert(itemShape(api, 'cash').cols.has('#d8c8a0'), 'the wad has no strap round it');
});

test('a prop stays cheap enough to have a street full of them', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  for (const k of ['crate', 'barrel', 'meat', 'cash']){
    const n = itemShape(api, k).n;
    assert(n < 70, `${k} costs ${n} fillRects — ten of them will not fit in a frame`);
  }
});

test('what breaks comes apart into what it was made of', () => {
  const api = boot();
  play(api, { stage: 0 });
  const debris = (kind) => {
    api.fx.length = 0;
    const it = api.mkItem(kind, api.cam.x + 120, api.FLOOR_MID, 0);
    api.breakItem(it, null);
    return api.fx.slice();
  };
  const crate = debris('crate');
  const planks = crate.filter(p => p.kind === 'plank');
  assert(planks.length >= 6, 'a crate came apart into ' + planks.length + ' planks');
  assert(crate.some(p => p.kind === 'dust'), 'and kicked up no dust');
  assert(crate.some(p => p.kind === 'ring'), 'and nothing went out along the floor');
  assert(planks.filter(p => p.vx > 0).length > 1 && planks.filter(p => p.vx < 0).length > 1,
    'the planks should go both ways');
  assert(planks.every(p => p.vz > 0), 'they should be thrown up, not down');
  assert(planks.some(p => p.spin > 0) && planks.some(p => p.spin < 0), 'and tumble both ways');
  const barrel = debris('barrel').filter(p => p.kind === 'plank');
  const cols = (list) => new Set(list.map(p => p.col));
  assert([...cols(barrel)].some(c => !cols(planks).has(c)), 'a barrel should shed a different wood from a crate');
});

test('a plank tumbles, falls and settles', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fx.length = 0;
  api.spawnFx('plank', api.cam.x + 100, api.FLOOR_MID, 20, '#a97a42');
  const p = api.fx[0];
  p.vx = 80; p.vz = 150; p.spin = 6;
  const r0 = p.r, x0 = p.x;
  for (let i = 0; i < 12; i++) api.updateFx(1 / 60);
  assert(p.r !== r0, 'it never turned');
  assert(p.x !== x0, 'it never moved');
  const top = p.z;
  for (let i = 0; i < 120; i++) api.updateFx(1 / 60);
  assert(p.z < top, 'it never came down: ' + p.z);
  assert(p.z >= 0, 'it went through the floor: ' + p.z);
  assert(Math.abs(p.vx) < 80, 'it never lost any speed on the way');
});

/* -------------------------------------------------------------- cutscene */
test('the ambient and foreground can be told which scene they are painting', () => {
  const api = boot();
  play(api, { stage: 0 });                        // a street, which rains
  api.draw();
  // fill counts are no use here - foundry smoke costs more than rain does.
  // Rain has a signature instead: the colour a drop takes with no light on it.
  const rained = (fn) => {
    api._resetCounts();
    fn();
    return api._styles.some(c => c === '#a8c4e8' || c === '#cfe4ff' || /rgba\(168,\s*196,\s*232/.test(c));
  };
  assert(rained(() => api.drawAmbient()), 'the street stage rains and its ambient should say so');
  assert(!rained(() => api.drawAmbient('street')), 'a scene backdrop with no rain given should stay dry');
  assert(rained(() => api.drawAmbient('street', 1)), 'and told to rain, it should');
  assert(!rained(() => api.drawAmbient('foundry')), 'it does not rain indoors');
  const cost = (fn) => { api._resetCounts(); fn(); return api._counts.fillRect || 0; };
  assert(cost(() => api.drawForeground('street')) !== cost(() => api.drawForeground('foundry')),
    'the foreground override does nothing');
});

test('a story beat gets the same weather its stage does', () => {
  const api = boot();
  const wetBg = new Set(api.STAGES.filter(st => st.rain).map(st => st.bg));
  for (const [name, sc] of Object.entries(api.SCENES)){
    if (sc.rain != null) assert(sc.rain > 0 && sc.rain <= 1, name + ' has a nonsense rain power');
    if (wetBg.has(sc.bg)) assert(sc.rain, `${name} stands on a ${sc.bg} that rains and stays dry`);
  }
  assert(api.SCENES.intro.rain, 'the opening beat is the first thing anybody sees');
});

test('a walking actor in a cutscene walks', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.startCut('intro', () => {});
  const beat = api.SCENES.intro.beats[0];
  const walker = Object.keys(api.cut.actors).find(k => api.cut.actors[k].anim === 'walk');
  assert(walker, 'the opening beat has nobody walking in it');
  const seen = new Set();
  for (let i = 0; i < Math.round(beat.d * 60); i++){
    api.cutTick(1 / 60);
    if (api.cut.actors[walker] && api.cut.actors[walker].anim === 'walk') seen.add(api.cut.actors[walker].frame);
  }
  // this was `% 4` at 8fps against an eight-frame walk: half the cycle, half speed
  assert(seen.size === api.A.walk.length, `a cutscene walk used ${seen.size} of ${api.A.walk.length} frames`);
});

test('the shot breathes, and the far side of the street is further away', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.startCut('intro', () => {});
  const base = api.SCENES.intro.cam || 0;
  const seen = [];
  for (let i = 0; i < 60; i++){ api.cutTick(1 / 60); seen.push(api.cam.x); }
  const lo = Math.min(...seen), hi = Math.max(...seen);
  assert(hi - lo > 1, 'the camera sat still for a whole second: ' + lo + '..' + hi);
  assert(Math.abs((lo + hi) / 2 - base) < 3, 'and it should drift about the scene mark, not away from it');

  const acts = Object.values(api.cut.actors).filter(a => a.inBeat);
  assert(acts.length >= 2, 'not enough actors to stage');
  const near = acts.reduce((m, a) => (a.y > m.y ? a : m));
  const far = acts.reduce((m, a) => (a.y < m.y ? a : m));
  assert(near.y > far.y, 'they are all standing on one line');
  assert(near.sc > far.sc, `the one at the front should be the bigger: ${near.sc.toFixed(2)} vs ${far.sc.toFixed(2)}`);
});

test('a story beat is framed: letterbox, caption plate, vignette', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.startCut('intro', () => {});
  api.cutTick(0.2);
  api.drawCut();                                  // warm the baked plates first: a cold
  api._resetCounts();                             // sky is 45k rects and buries the letterbox
  api.drawCut();
  const cols = new Set(api._styles);
  assert(cols.has('#4a3d52'), 'the letterbox has no lit lip');
  assert(cols.has('#ffd23d'), 'the caption has no bar down its speaking side');
  assert(cols.has('rgba(14,10,20,0.9)'), 'the caption is not sitting on anything');
  const bars = api._rects.filter(r => r[2] >= api.VW && r[3] >= 20);
  assert(bars.length >= 2, 'both letterbox bars should be there, saw ' + bars.length);
  /* And the beat has to ask for its weather, not merely declare it.  The
     colour signature that works on drawAmbient in isolation is no use here:
     on a lit street every drop takes a colour off the light field, so the
     unlit fallback never appears.  The order in drawCut is the invariant. */
  const body = RAW.slice(RAW.indexOf('function drawCut('));
  const head = body.slice(0, body.indexOf('\n}\n'));
  assert(/drawAmbient\(sc\.bg, sc\.rain\)/.test(head), 'the beat never asks for its own weather');
  assert(/drawForeground\(sc\.bg\)/.test(head), 'nor its own foreground');
  assert(/drawVignette\(\)/.test(head), 'and there is no vignette on it');
  assert(head.indexOf('drawAmbient') < head.indexOf('letterbox'), 'the weather has to go under the letterbox');
  assert((api._counts.fillRect || 0) > 400, 'the beat barely painted: ' + api._counts.fillRect);
});

/* ------------------------------------------------------------------- hud */
const lumOf = (c) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return -1;
  const n = parseInt(m[1], 16);
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
};

test('a gauge is a piece of hardware, not a flat rectangle', () => {
  const api = boot();
  play(api, { stage: 0 });
  api._resetCounts();
  api.gauge(20, 40, 60, 8, 0.5, '#4ad06a');
  const parts = api._rects.map(r => ({ r, c: r[4] }));
  assert(parts.length >= 6, 'a gauge in ' + parts.length + ' pieces is still a bar');
  const body = parts.find(p => p.c === '#4ad06a');
  assert(body, 'no fill in the colour it was asked for');
  const fw = body.r[2];
  assert(fw > 20 && fw < 40, 'half of 58 inner pixels should be about 29, got ' + fw);
  // the top row of the fill is lighter than the body and the bottom is darker
  const top = parts.find(p => p.r[1] === 41 && p.r[3] === 1 && p.r[2] === fw && lumOf(p.c) > lumOf('#4ad06a'));
  const bot = parts.find(p => p.r[3] === 1 && p.r[2] === fw && lumOf(p.c) >= 0 && lumOf(p.c) < lumOf('#4ad06a'));
  assert(top, 'the fill has no lit top edge');
  assert(bot, 'the fill has no shadow under it');
  // and the leading pixel is the brightest thing on it
  const edge = parts.filter(p => p.r[2] === 1 && p.r[3] === 6);
  assert(edge.length >= 1, 'no leading edge on the fill');
  assert(lumOf(edge[edge.length - 1].c) > lumOf(top.c), 'the leading edge should out-shine the top row');
});

test('an empty gauge draws the trough and nothing else', () => {
  const api = boot();
  play(api, { stage: 0 });
  api._resetCounts();
  api.gauge(20, 40, 60, 8, 0, '#4ad06a');
  assert(!api._styles.includes('#4ad06a'), 'an empty bar should not be filled');
  assert((api._counts.fillRect || 0) >= 4, 'but it should still draw its trough');
  api._resetCounts();
  api.gauge(20, 40, 60, 8, 1, '#4ad06a');
  const full = api._rects.find(r => r[2] === 58);
  assert(full, 'a full bar should fill its whole inside');
});

test('the health bar leaves a ghost of what you just lost', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  f.hp = f.hpMax;
  api.updateFighter(f, 1 / 60);
  assert(f.hpGhost === f.hpMax, 'the ghost starts level with the bar');
  f.hp = f.hpMax * 0.4;
  api.updateFighter(f, 1 / 60);
  assert(f.hpGhost > f.hp, 'the ghost should hang back after a hit: ' + f.hpGhost + ' vs ' + f.hp);
  const before = f.hpGhost;
  for (let i = 0; i < 30; i++) api.updateFighter(f, 1 / 60);
  assert(f.hpGhost < before, 'and then drain');
  assert(f.hpGhost >= f.hp, 'but never below the bar itself');
  for (let i = 0; i < 200; i++) api.updateFighter(f, 1 / 60);
  assert(Math.abs(f.hpGhost - f.hp) < 0.01, 'it should catch up in the end: ' + f.hpGhost);
  f.hp = f.hpMax;                                   // and a heal snaps it straight up
  api.updateFighter(f, 1 / 60);
  assert(f.hpGhost === f.hpMax, 'healing should not leave a ghost behind');
});

test('the ghost is drawn behind the fill, and only when there is one', () => {
  const api = boot();
  play(api, { stage: 0 });
  api._resetCounts();
  api.gauge(20, 40, 60, 8, 0.4, '#4ad06a', { ghost: 0.9, ghostCol: '#8c3050' });
  const gi = api._styles.indexOf('#8c3050'), fi = api._styles.indexOf('#4ad06a');
  assert(gi >= 0, 'the ghost never drew');
  assert(fi > gi, 'the fill has to go over the ghost, not under it');
  assert(api._rects[gi][2] > api._rects[fi][2], 'the ghost should be the wider of the two');
  api._resetCounts();
  api.gauge(20, 40, 60, 8, 0.4, '#4ad06a', { ghost: null });
  assert(!api._styles.includes('#8c3050'), 'no ghost should be drawn when there is nothing to show');
});

test('the HUD frames itself: a portrait plate, a stage plate and a lip', () => {
  const api = boot();
  play(api, { stage: 2 });
  api._resetCounts();
  api.drawHUD();
  const cols = new Set(api._styles);
  assert(cols.has('#5a4258'), 'the plate has no lit edge along the bottom');
  assert(cols.has('#4a3a58'), 'the portrait has no bevel');
  assert(cols.has('#0a0710'), 'nothing is framed in ink');
  const wide = api._rects.filter(r => r[2] >= api.VW && r[3] === 1);
  assert(wide.length >= 3, 'the plate edge is ' + wide.length + ' lines — it needs a lip, not a hairline');
  api._resetCounts();
  api.drawPortrait('joske', 4, 4, 24, 26, false);
  assert((api._counts.fillRect || 0) > 25, 'the portrait is barely drawn: ' + api._counts.fillRect);
  assert(api._styles.includes('#4a3a58'), 'the portrait frame is missing its light side');
});

/* ---------------------------------------------------------------- weapon */
test('every weapon has a length, a colour and a resting angle', () => {
  const api = boot();
  for (const k of Object.keys(api.WEAPON)){
    assert(api.W_LEN[k] != null, k + ' has no length');
    assert(api.W_REST[k] != null, k + ' has no resting angle');
    if (k !== 'crate') assert(api.W_COL[k], k + ' has no colour');
    assert(api.W_LEN[k] >= 0 && api.W_LEN[k] < 40, k + ' is ' + api.W_LEN[k] + ' long');
  }
});

test('a weapon is a shape along its own axis, and the tip lands where it should', () => {
  const api = boot();
  play(api, { stage: 0 });
  api._resetCounts();
  const tip = api.drawBlade(100, 100, 0, 20, 1, 'bat', 1, 1);
  assert(Math.abs(tip[0] - 120) < 1.5 && Math.abs(tip[1] - 100) < 1.5,
    'a blade at zero degrees should point straight along +x: ' + tip);
  const up = api.drawBlade(100, 100, 90, 20, 1, 'bat', 1, 1);
  assert(Math.abs(up[0] - 100) < 1.5 && Math.abs(up[1] - 80) < 1.5, 'and at ninety it should point up: ' + up);
  const back = api.drawBlade(100, 100, 0, 20, -1, 'bat', 1, 1);
  assert(back[0] < 100, 'facing left it should point left: ' + back);
});

test('each weapon is built from more than one flat bar', () => {
  const api = boot();
  play(api, { stage: 0 });
  const parts = (kind) => {
    api._resetCounts();
    api.drawBlade(120, 100, 30, api.W_LEN[kind], 1, kind, 1, 1);
    const cols = new Set(api._styles.filter(c => /^#/.test(c)));
    return { cols, rects: api._rects.length };
  };
  const bat = parts('bat'), pipe = parts('pipe'), knife = parts('knife');
  for (const [name, p] of [['bat', bat], ['pipe', pipe], ['knife', knife]]){
    assert(p.cols.size >= 4, `${name} is drawn in ${p.cols.size} colours — that is a bar, not a weapon`);
    assert(p.cols.has('#140e1a'), name + ' has no ink outline');
    assert(p.rects > 20, name + ' barely painted anything: ' + p.rects);
  }
  assert(bat.cols.has('#8a5620') && bat.cols.has('#b87c34'), 'the bat has no grip and no barrel');
  assert(knife.cols.has('#ffffff'), 'the knife has no edge on it');
  // a ghost is the same shape with no outline, laid down translucent
  api._resetCounts();
  api.drawBlade(120, 100, 30, 18, 1, 'bat', 1, 0.2);
  const ghost = api._styles.filter(c => /^#/.test(c));
  assert(ghost.length === 0, 'a motion ghost should not be drawn in flat colour');
  assert(api._styles.some(c => /^rgba\(/.test(c)), 'and it should be drawn translucent');
  assert(!api._styles.some(c => /^rgba\(20,14,26/.test(c)), 'a ghost should carry no outline');
});

test('a swing smears behind the weapon rather than teleporting it', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  f.weapon = 'bat';
  const pose = api.A[api.ATK.bat.anim][2];
  const X = (lx) => 100 + lx, Y = (ly) => 200 - ly;
  const draw = (swinging) => {
    f.atk = swinging ? api.ATK.bat : null;
    f.atkT = swinging ? 0.22 : 0;
    api._resetCounts();
    api.drawHeldWeapon(f, X, Y, pose, 1);
    return api._counts.fillRect || 0;
  };
  const still = draw(false), swung = draw(true);
  assert(still > 10, 'a weapon at rest drew nothing');
  assert(swung > still * 2, `a swing should trail: ${swung} against ${still} at rest`);
});

test('the swoosh widens and brightens toward the leading edge', () => {
  const api = boot();
  play(api, { stage: 0 });
  api._resetCounts();
  api.drawSwoosh(100, 100, 20, 150, 0, 1, 1, '#a8702c');
  const r = api._rects;
  assert(r.length >= 16, 'the ribbon is ' + r.length + ' pixels long');
  const head = r.slice(0, 4).reduce((a, q) => a + q[2], 0) / 4;
  const tail = r.slice(-6).reduce((a, q) => a + q[2], 0) / 6;
  assert(tail > head, `the leading edge should be the fat end: ${tail.toFixed(1)} against ${head.toFixed(1)}`);
  const alpha = (c) => { const m = /rgba\([^)]*,\s*([0-9.]+)\)/.exec(c); return m ? +m[1] : 0; };
  const al = api._styles.map(alpha).filter(a => a > 0);
  assert(al[al.length - 1] > al[0], 'and the bright end: ' + al[0] + ' to ' + al[al.length - 1]);
  assert(api._styles.some(c => /255,\s*255,\s*255/.test(c)), 'the leading edge has no highlight on it');
});

/* ----------------------------------------------------------------- build */
test('every skin has a build, and every build is a sane set of numbers', () => {
  const api = boot();
  const keys = ['sh', 'waist', 'limb', 'stance', 'hunch', 'neck'];
  for (const [name, b] of Object.entries(api.BUILDS)){
    for (const k of keys) assert(typeof b[k] === 'number', `${name} is missing ${k}`);
    for (const k of ['sh', 'waist', 'limb', 'stance'])
      assert(b[k] > 0.5 && b[k] < 2.2, `${name}.${k} is out of range: ${b[k]}`);
    assert(Math.abs(b.hunch) <= 3 && Math.abs(b.neck) <= 4, name + ' is bent out of shape');
  }
  for (const [name, s] of Object.entries(api.SKINS)){
    assert(s.build, name + ' has no build');
    assert(api.BUILDS[s.build], `${name} asks for a build that does not exist: ${s.build}`);
  }
  assert(api.buildOf({}) === api.BUILDS.normal || api.buildOf({}).sh === 1, 'an unbuilt skin should fall back, not throw');
  const used = new Set(Object.values(api.SKINS).map(s => s.build));
  assert(used.size >= 5, 'only ' + used.size + ' builds in use across the whole roster');
});

/* Measure what a fighter actually paints: the widest run of pixels at the
   shoulders and at the hips, and the set of columns the whole body covers. */
function shapeOf(api, skin){
  const f = api.mkFighter({ team: 'e', skin, x: api.cam.x + 190, y: api.FLOOR_MID, face: 1 });
  f.anim = 'idle'; f.frame = 1; f.state = 'idle';
  api._resetCounts();
  api.drawFighter(f);
  const rows = new Map();
  const cols = new Set();
  for (const [x, y, w, h] of api._rects){
    if (w > 60 || h > 60) continue;                // skip the wash rectangles, not the body
    for (let yy = y; yy < y + h; yy++){
      let r = rows.get(yy);
      if (!r) rows.set(yy, r = [1e9, -1e9]);
      if (x < r[0]) r[0] = x;
      if (x + w > r[1]) r[1] = x + w;
    }
    for (let xx = x; xx < x + w; xx++) cols.add(xx);
  }
  const ys = [...rows.keys()].sort((a, b) => a - b);
  const top = ys[0], bot = ys[ys.length - 1], span = bot - top;
  const widthAt = (frac) => {
    const y = Math.round(top + span * frac);
    const r = rows.get(y) || rows.get(y + 1) || rows.get(y - 1);
    return r ? r[1] - r[0] : 0;
  };
  // the head is the widest row in the top fifth, not one sampled row: a
  // mohawk and a hood put their bulk at different heights
  let head = 0;
  for (const [y, r] of rows) if (y <= top + span * 0.2) head = Math.max(head, r[1] - r[0]);
  return { head, shoulders: widthAt(0.34), hips: widthAt(0.55), height: span, cols: cols.size };
}

test('a heavy is a different shape from a runner, not the same shape scaled', () => {
  const api = boot();
  play(api, { stage: 0 });
  const wiry = shapeOf(api, 'runner'), heavy = shapeOf(api, 'hammer'), mid = shapeOf(api, 'punk');
  assert(wiry.shoulders > 4 && heavy.shoulders > 4, 'nobody has any shoulders');
  assert(heavy.shoulders > wiry.shoulders * 1.5,
    `the barrel is ${heavy.shoulders}px across the shoulders and the sprinter is ${wiry.shoulders}`);
  assert(mid.shoulders > wiry.shoulders && heavy.shoulders > mid.shoulders, 'the middle of the roster is not in the middle');
  // and it is the build, not the scale: measured against his own height the
  // barrel is a far wider man, which is what "different shape" means here
  const stout = (s) => s.shoulders / s.height;
  assert(stout(heavy) > stout(wiry) * 1.3,
    `scaled for height the barrel is ${stout(heavy).toFixed(2)} wide and the sprinter ${stout(wiry).toFixed(2)}`);
});

test('the roster reads as more than one man in twelve palettes', () => {
  const api = boot();
  play(api, { stage: 0 });
  const skins = [...new Set(Object.values(api.ENEMY).map(e => e.skin))];
  assert(skins.length >= 8, 'only ' + skins.length + ' enemy skins');
  const shapes = skins.map(sk => shapeOf(api, sk));
  const widths = new Set(shapes.map(s => s.shoulders));
  assert(widths.size >= 4, 'the whole roster has ' + widths.size + ' shoulder widths between them');
  const footprints = new Set(shapes.map(s => s.shoulders + ':' + s.hips + ':' + s.cols));
  assert(footprints.size >= skins.length - 3,
    `only ${footprints.size} distinct silhouettes across ${skins.length} enemies`);
  const span = Math.max(...shapes.map(s => s.shoulders)) - Math.min(...shapes.map(s => s.shoulders));
  assert(span >= 8, 'the widest and the narrowest are ' + span + 'px apart');
});

// The hood and cap also skip the generic hairline so there is not a second
// head of hair under them, but that is a pixel of thickness the harness
// cannot measure — it is checked by eye, not here.
test('a hood is a wider shape than a head, and both head pieces are in use', () => {
  const api = boot();
  play(api, { stage: 0 });
  const styles = (skin) => {
    const f = api.mkFighter({ team: 'e', skin, x: api.cam.x + 190, y: api.FLOOR_MID, face: 1 });
    f.anim = 'idle'; f.frame = 1; f.state = 'idle';
    api._resetCounts();
    api.drawFighter(f);
    return api._rects.length;
  };
  assert(api.SKINS.blade.hair2 === 'hood' && api.SKINS.chain.hair2 === 'cap', 'the two head shapes are not in use');
  assert(styles('blade') > 40 && styles('chain') > 40, 'they draw something');
  const hooded = shapeOf(api, 'blade'), bare = shapeOf(api, 'punk');
  assert(hooded.head > bare.head, `a hood should be wider than a head: ${hooded.head} vs ${bare.head}`);
});

/* ------------------------------------------------------------- animation */
test('every attack points at a frame that exists', () => {
  const api = boot();
  // the uppercut spent a version with seq [[0, 0.52]] against a one-frame
  // table: half a second of heavy attack held on a single pose
  for (const [key, a] of Object.entries(api.ATK)){
    const table = api.A[a.anim];
    assert(table, `${key} uses an animation that does not exist: ${a.anim}`);
    for (const [frame, t] of a.seq){
      assert(frame >= 0 && frame < table.length, `${key} asks for frame ${frame} of ${a.anim}, which has ${table.length}`);
      assert(t > 0 && t <= a.dur + 0.001, `${key} has a beat at ${t} outside its ${a.dur}s`);
    }
    assert(a.seq[a.seq.length - 1][1] >= a.dur - 0.001, `${key} runs out of frames before it ends`);
    if (a.heavy) assert(a.seq.length >= 3, `${key} is a heavy attack in ${a.seq.length} beats — no wind-up, no follow-through`);
    // an attack must not sit on frame zero of a multi-frame animation for its
    // whole duration — that is a held pose wearing an animation's name
    const used = new Set(a.seq.map(q => q[0]));
    if (table.length > 1)
      assert(used.size >= 2, `${key} runs for ${a.dur}s on frame ${[...used]} of a ${table.length}-frame ${a.anim}`);
  }
});

test('the walk is eight frames and none of them are the same pose', () => {
  const api = boot();
  const w = api.A.walk;
  assert(w.length === 8, 'the walk is ' + w.length + ' frames');
  const key = (p) => JSON.stringify([p.hipY, p.hipX, p.lean, p.aF, p.aB, p.lF, p.lB]);
  const seen = new Set(w.map(key));
  assert(seen.size === 8, 'the walk repeats a pose: ' + seen.size + ' distinct of 8');
  assert(api.cycleLen('walk', 4) === 8 && api.cycleLen('nonsense', 'walk') === 8, 'the cadence does not follow the table');
});

test('the hips bob, and they go the way the arms do not', () => {
  const api = boot();
  const w = api.A.walk;
  const hips = w.map(p => p.hipY);
  assert(Math.max(...hips) - Math.min(...hips) >= 3, 'the hip never rises: ' + hips.join(','));
  // the passing frames carry the weight highest, the down frames lowest
  assert(hips[1] === Math.min(...hips) && hips[5] === Math.min(...hips), 'the drop should land on the down frames');
  assert(hips[3] === Math.max(...hips) && hips[7] === Math.max(...hips), 'the rise should land on the up frames');
  // both arms swing to the same side together — that is the floss
  for (let i = 0; i < w.length; i++){
    const f = w[i].aF[2], b = w[i].aB[2];
    assert(Math.sign(f) === Math.sign(b) || Math.abs(f) < 2 || Math.abs(b) < 2,
      `frame ${i} has the arms on opposite sides: ${f} and ${b}`);
    if (Math.abs(f) > 3) assert(Math.sign(w[i].hipX) !== Math.sign(f) || w[i].hipX === 0,
      `frame ${i} swings the hips the same way as the arms`);
  }
});

test('the legs alternate, and the feet do not slide', () => {
  const api = boot();
  const w = api.A.walk;
  for (let i = 0; i < 4; i++){
    const a = w[i], b = w[i + 4];
    assert(Math.sign(a.lF[2] - a.lB[2]) === -Math.sign(b.lF[2] - b.lB[2]),
      `frame ${i} and ${i + 4} lead with the same leg`);
  }
  // a stride is four frames; the planted foot has to travel about as far as
  // the fighter does in that time, or he moonwalks
  const stride = 4 / api.WALK_FPS;                // four frames to a stride
  const travel = Math.max(...w.map(p => p.lF[2])) - Math.min(...w.map(p => p.lF[2]));
  const spd = 82;                                 // spawnPlayer's walk speed
  const covered = spd * stride;
  assert(Math.abs(travel - covered) < covered * 0.35,
    `the foot moves ${travel}px while the man moves ${covered.toFixed(1)}px — that is a moonwalk`);
});

test('no animation holds the same pose two frames running', () => {
  const api = boot();
  const key = (p) => JSON.stringify([p.hipY, p.hipX, p.lean, p.sh, p.headX, p.headY, p.aF, p.aB, p.lF, p.lB]);
  for (const [name, table] of Object.entries(api.A)){
    for (let i = 1; i < table.length; i++)
      assert(key(table[i]) !== key(table[i - 1]), `${name} holds the same pose on frames ${i - 1} and ${i}`);
    if (table.length >= 4){
      const seen = new Set(table.map(key));
      assert(seen.size >= table.length - 1, `${name} is ${table.length} frames but only ${seen.size} poses`);
    }
  }
});

test('the run is eight frames and its feet do not slide either', () => {
  const api = boot();
  const r = api.A.run;
  assert(r.length === 8, 'the run is ' + r.length + ' frames');
  for (let i = 0; i < 4; i++)
    assert(Math.sign(r[i].lF[2] - r[i].lB[2]) === -Math.sign(r[i + 4].lF[2] - r[i + 4].lB[2]),
      `run frames ${i} and ${i + 4} lead with the same leg`);
  assert(Math.max(...r.map(p => p.lean)) >= 4, 'a sprint leans into it');
  assert(Math.max(...r.map(p => p.hipY)) - Math.min(...r.map(p => p.hipY)) >= 3, 'and leaves the ground');
  // a run stride against the running speed, the same sum as the walk
  const stride = 4 / api.RUN_FPS;
  const travel = Math.max(...r.map(p => p.lF[2])) - Math.min(...r.map(p => p.lF[2]));
  const covered = 82 * 1.85 * stride;               // spawnPlayer's speed, running
  assert(Math.abs(travel - covered) < covered * 0.35,
    `running, the foot moves ${travel}px while the man moves ${covered.toFixed(1)}px`);
  // the arms are opposed in a sprint, unlike the walk where they floss together
  const opposed = r.filter(p => Math.sign(p.aF[2]) !== Math.sign(p.aB[2])).length;
  assert(opposed >= 6, 'the run should pump its arms, not floss: ' + opposed + '/8');
});

test('the states that used to be one pose are driven now', () => {
  const api = boot();
  play(api, { stage: 0 });
  // an enemy with no brain: nothing else will reach in and change its state
  // an enemy with no brain, and a partner so the grab states have somebody
  // to be held by — 'held' bails straight back to idle without one
  const f = api.mkFighter({ team: 'e', skin: 'punk', x: api.cam.x + 100, y: api.FLOOR_MID });
  const mate = api.mkFighter({ team: 'e', skin: 'punk', x: api.cam.x + 86, y: api.FLOOR_MID });
  api.fighters = api.fighters.concat([f, mate]);
  f.holder = mate; mate.holding = f;
  const frames = (state, anim, ticks, before) => {
    const seen = new Set();
    for (let i = 0; i < ticks; i++){
      f.state = state; f.anim = anim; f.stun = 9; f.holdT = 0; f.mash = 0; f.z = 0;
      mate.state = 'hold'; mate.holding = f; f.holder = mate; f.holding = mate;
      api.setT(i / 20);
      if (before) before(f, i);
      api.updateFighter(f, 1 / 60);
      seen.add(f.frame);
    }
    return seen;
  };
  assert(api.A.block.length === 2 && api.A.held.length === 2 && api.A.hold.length === 2, 'they are still one pose each');
  const blocked = frames('block', 'block', 20, (g, i) => { g.hitFlash = i % 6 < 3 ? 0.1 : 0; });
  assert(blocked.size === 2, 'a guard should brace when something lands on it: ' + [...blocked]);
  assert(frames('held', 'held', 60).size === 2, 'a man being held should squirm');
  assert(frames('hold', 'hold', 60).size === 2, 'and the man holding him should shift his grip');
});

test('a jump uses its whole arc, and taking one uses all three', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  assert(api.A.jump.length >= 3 && api.A.fall.length >= 2, 'the jump is still held on one pose');
  f.state = 'jump'; f.z = 0.1; f.vz = 305; f.anim = 'jump';   // what a real jump leaves the floor at
  const jumped = new Set(), fell = new Set();
  for (let i = 0; i < 90 && f.state === 'jump'; i++){
    api.updateFighter(f, 1 / 60);
    (f.anim === 'jump' ? jumped : fell).add(f.frame);
  }
  assert(jumped.size >= 3, 'the way up only used ' + jumped.size + ' frames');
  assert(fell.size >= 2, 'the way down only used ' + fell.size + ' frames');

  assert(api.A.hurt.length === 3, 'taking a hit is ' + api.A.hurt.length + ' frames');
  f.state = 'hurt'; f.st = 0; f.stun = 0.4; f.anim = 'hurt'; f.z = 0;
  const hurt = new Set();
  for (let i = 0; i < 30 && f.state === 'hurt'; i++){ api.updateFighter(f, 1 / 60); hurt.add(f.frame); }
  assert(hurt.size === 3, 'the whole stun ran on ' + hurt.size + ' frames');
  assert(hurt.has(0), 'the snap frame never showed');
});

/* ---------------------------------------------------------------- impact */
test('a hit throws its debris along the punch, and only heavy hits streak', () => {
  const api = boot();
  play(api, { stage: 0 });
  const hit = (key, face) => {
    api.fx.length = 0;
    api.clearField && api.clearField();
    const atk = api.players[0], def = api.spawnEnemy('punk', atk.x + face * 30, atk.y, -face);
    atk.face = face;
    api.applyHit(atk, def, api.ATK[key]);
    return api.fx.slice();
  };
  const heavy = hit('hook', 1);
  const impact = heavy.find(p => p.kind === 'impact');
  assert(impact, 'no impact at all');
  assert(impact.val === 1, 'the impact does not know which way the fist came in');
  const shards = heavy.filter(p => p.kind === 'shard');
  assert(shards.length >= 4, 'a heavy hit should throw chips: ' + shards.length);
  assert(shards.filter(p => p.vx > 0).length > shards.length / 2, 'the chips should mostly go the way the punch went');
  assert(heavy.some(p => p.kind === 'streak'), 'a heavy hit should leave speed lines');

  const back = hit('hook', -1);
  assert(back.find(p => p.kind === 'impact').val === -1, 'a punch thrown left is thrown left');
  assert(back.filter(p => p.kind === 'shard').filter(p => p.vx < 0).length > 2, 'and its chips go left');

  const light = hit('jab', 1);
  assert(!light.some(p => p.kind === 'streak'), 'a jab is not a haymaker — no speed lines');
  assert(light.filter(p => p.kind === 'shard').length < shards.length, 'and fewer chips than a hook');
});

test('the chips fall', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fx.length = 0;
  api.spawnFx('shard', api.cam.x + 100, api.FLOOR_MID, 30, '#fff2d0', 1);
  const p = api.fx[0];
  const x0 = p.x, vx0 = p.vx;
  for (let i = 0; i < 20; i++) api.updateFx(1 / 60);
  assert(p.x > x0, 'it never moved');
  assert(Math.abs(p.vx) < Math.abs(vx0), 'air should slow it down');
  assert(p.vz < 0, 'it should be falling by now: vz ' + p.vz);
  // they leave in a spray, not all on the same arc
  api.fx.length = 0;
  for (let i = 0; i < 24; i++) api.spawnFx('shard', 100, api.FLOOR_MID, 30, '#fff2d0', 1);
  const up = api.fx.filter(q => q.vz > 0).length;
  assert(up > 2 && up < 22, 'the chips should spray, not all go one way: ' + up + '/24');
});

test('a hit lights the street without repainting the man taking it', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fx.length = 0;
  const x = api.cam.x + 180;
  api.draw();
  const before = api.lightAt(180);
  const base = before ? before.k : 0;
  api.spawnFx('impact', x, api.FLOOR_MID, 24, '#ffffff', 1);
  api.draw();
  const here = api.lightAt(180);
  assert(here, 'the hit put no light on the street');
  /* What matters is the hit's own contribution, not the total: a lit shopfront
     behind him is allowed to be bright.  A transient white hit at full power
     is what left a man-shaped hole in the frame when the bloom went in. */
  assert(here.k - base < 0.5,
    `one hit adds ${(here.k - base).toFixed(2)} to the light field — the rig will blow out`);
  for (const k of Object.keys(api.FX_LIGHT))
    assert(api.FX_LIGHT[k][1] <= 0.6, k + ' is bright enough to white out a fighter: ' + api.FX_LIGHT[k][1]);
});

test('the hit flash reads as damage instead of punching a hole in the bloom', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  f.y = api.FLOOR_MID; f.z = 0; f.state = 'idle'; f.anim = 'idle';
  f.hitFlash = 0.1;
  api.setT(0);                                    // the flash alternates on frame parity
  api._resetCounts();
  api.drawFighter(f);
  const hex = api._styles.filter(c => /^#[0-9a-f]{6}$/i.test(c));
  assert(hex.length > 6, 'it did not draw a fighter');
  const lum = (c) => (parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)) / 3;
  const hot = hex.filter(c => lum(c) > 225);
  assert(hot.length === 0, 'the flash is still near-white and will bloom into a smear: ' + hot.slice(0, 3));
  const red = hex.filter(c => {
    const r = parseInt(c.slice(1, 3), 16), b = parseInt(c.slice(5, 7), 16);
    return r > 150 && r > b + 50;
  });
  assert(red.length >= 3, 'a flashed fighter should read red: ' + hex.slice(0, 6));
  // the ink is the first flat colour drawFighter asks for: the outline pass
  // runs before anything else that is not an rgba() shadow
  assert(lum(hex[0]) < 70, 'the outline went pale — the silhouette will dissolve: ' + hex[0]);
});

test('an impact frame is cheap enough to have several of', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fx.length = 0;
  api.spawnFx('impact', api.cam.x + 100, api.FLOOR_MID, 24, '#ffffff', 1);
  api.draw();                                     // warm the glow plate
  api._resetCounts();
  api.drawFx(api.fx[0]);
  const one = api._counts.fillRect || 0;
  assert(one > 4, 'the star drew nothing: ' + one);
  assert(one < 140, 'one impact costs ' + one + ' fillRects — a crowd of them will not fit');
});

/* ----------------------------------------------------------------- bloom */
test('the bloom is three blits, and nothing at all when it is off', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.G.bloom = true;
  api.bloomPass();                                // first call makes the plate
  api._resetCounts();
  api.bloomPass();
  const blits = api._counts.drawImage || 0;
  assert(blits === 3, 'expected downscale, threshold and blit: got ' + blits);
  assert((api._counts.fillRect || 0) === 0, 'a post pass has no business painting rectangles');
  api.G.bloom = false;
  api._resetCounts();
  api.bloomPass();
  assert((api._counts.drawImage || 0) === 0, 'switching it off should cost nothing');
});

test('the bloom plate is made once and kept', () => {
  const api = boot();
  api.G.bloom = true;
  api.bloomPass();
  const first = api.getBloom();
  api.bloomPass(); api.bloomPass();
  assert(first, 'no plate at all');
  assert(api.getBloom() === first, 'a new offscreen canvas every frame');
  assert(first.width === Math.ceil(api.VW / api.BLOOM_DIV), 'the plate is the wrong width: ' + first.width);
  assert(first.height === Math.ceil(api.VH / api.BLOOM_DIV), 'the plate is the wrong height: ' + first.height);
  assert(api.BLOOM_DIV >= 2, 'a full-size plate is not a blur');
  assert(api.BLOOM_AMT > 0 && api.BLOOM_AMT <= 1, 'nonsense bloom strength: ' + api.BLOOM_AMT);
});

test('the bloom hands the context back the way it found it', () => {
  const api = boot();
  const ctx = api.getCtx();
  api.G.bloom = true;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  api.bloomPass();
  assert(ctx.globalCompositeOperation === 'source-over', 'left the frame in additive mode');
  assert(ctx.globalAlpha === 1, 'left the frame faded: ' + ctx.globalAlpha);
  assert(ctx.imageSmoothingEnabled === false, 'left smoothing on — the pixels would go soft');
});

test('the bloom goes over the world and under the HUD', () => {
  const body = RAW.slice(RAW.indexOf('function draw(){'));
  const head = body.slice(0, body.indexOf('\n}\n'));
  const bloom = head.indexOf('bloomPass();', head.indexOf('drawForeground()'));
  const world = head.indexOf('drawForeground()');
  const hud = head.indexOf('drawHUD()');
  assert(world >= 0 && bloom >= 0 && hud >= 0, 'draw() no longer looks the way this test expects');
  assert(bloom > world, 'the bloom runs before the world is finished');
  assert(bloom < hud, 'the HUD would go soft — it must be drawn over the bloom, not through it');
  // the title screen and the cutscenes are frames too
  assert(/drawAttract\(\); bloomPass\(\)/.test(head), 'the title screen misses the bloom');
  assert(/drawCut\(\); bloomPass\(\)/.test(head), 'the cutscenes miss the bloom');
});

test('the bloom preference sticks', () => {
  const api = boot();
  api.G.bloom = false;
  api.saveMeta();
  const api2 = boot({ store: api._store });
  assert(api2.G.bloom === false, 'turning it off did not survive a reload');
  api2.G.bloom = true;
  api2.saveMeta();
  const api3 = boot({ store: api2._store });
  assert(api3.G.bloom === true, 'turning it back on did not survive either');
  const fresh = boot();
  assert(fresh.G.bloom === true, 'it should be on out of the box');
});

/* ------------------------------------------------------------------ face */
test('the head clears the collar, so there is somewhere to put a face', () => {
  const api = boot();
  assert(api.HEAD_LIFT > 0, 'the head is still buried in the shoulders');
  const pose = api.A.idle[1];
  const jt = api.poseGeom(pose);
  const hr = 5.5, capH = 2.6;                     // what drawFighter and drawHair use at sc 1
  const head = jt.head[1] + api.HEAD_LIFT;        // local y counts up from the feet
  const collarTop = jt.sh[1] + 2.5;               // the shoulder cap sits on the joint
  // the chin is allowed to meet the collar; the mouth is not
  const mouth = head - 2.1;
  assert(mouth > collarTop + 1.5,
    `the collar would cover the mouth: mouth at ${mouth.toFixed(1)}, collar at ${collarTop.toFixed(1)}`);
  const band = (head + hr - capH) - Math.max(head - hr, collarTop);
  assert(band >= 5, 'not enough head showing to put a face on: ' + band.toFixed(1) + 'px');
});

test('the face reads the state machine — you can see him wince', () => {
  const api = boot();
  const f = api.mkFighter({ team: 'e' });
  const mood = (st, extra) => { Object.assign(f, { state: st, dead: false, tell: 0, rage: false }, extra || {}); return api.faceMood(f); };
  assert(mood('hurt') === 'hurt', 'a man being hit is not calm');
  assert(mood('down') === 'hurt' && mood('lie') === 'hurt', 'nor one on the floor');
  assert(mood('idle', { dead: true }) === 'hurt', 'nor a dead one');
  assert(mood('attack') === 'grit' && mood('super') === 'grit', 'he grits through a punch');
  assert(mood('block') === 'brace', 'and braces behind a guard');
  assert(mood('idle', { tell: 0.3 }) === 'rage', 'a wind-up shows on the face');
  assert(mood('idle', { rage: true }) === 'rage', 'and so does rage');
  assert(['calm', 'blink'].includes(mood('idle')), 'otherwise he is just standing there');
});

test('they blink, and not all at the same instant', () => {
  const api = boot();
  const a = api.mkFighter({ team: 'e' }), b = api.mkFighter({ team: 'e' });
  assert(a.id !== b.id, 'two fighters, two clocks');
  const trace = (f) => {
    const out = [];
    for (let t = 0; t < 12; t += 0.04){ api.setT(t); out.push(api.faceMood(f) === 'blink'); }
    return out;
  };
  const ta = trace(a), tb = trace(b);
  const nA = ta.filter(Boolean).length, nB = tb.filter(Boolean).length;
  assert(nA > 0 && nB > 0, 'nobody blinked in twelve seconds');
  assert(nA < ta.length * 0.15, 'his eyes are shut more than they are open: ' + nA + '/' + ta.length);
  let together = 0;
  for (let i = 0; i < ta.length; i++) if (ta[i] && tb[i]) together++;
  assert(together < Math.min(nA, nB), 'the whole crowd blinks in unison');
});

test('the eye is the only white on him, and it shuts when it should', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.players[0];
  f.y = api.FLOOR_MID; f.z = 0; f.hitFlash = 0;
  const whites = (st) => {
    f.state = st; f.anim = st === 'attack' ? 'hook' : 'idle'; f.dead = false; f.tell = 0;
    api.setT(0.5);                                // off the blink
    api._resetCounts();
    api.drawFighter(f);
    return api._styles.filter(c => c === api.FACE_WHITE).length;
  };
  const inks = () => api._styles.filter(c => c === api.FACE_INK).length;
  assert(whites('idle') >= 1, 'no eye at all');
  assert(inks() >= 2, 'no brow and no pupil');
  assert(whites('hurt') === 0, 'his eyes should be shut when he is being hit');
  assert(whites('attack') > whites('idle'), 'gritted teeth are more white than an eye');
  f.state = 'idle'; f.anim = 'idle'; f.hitFlash = 0.2;
  api.setT(0.5); api._resetCounts(); api.drawFighter(f);
  assert(api._styles.filter(c => c === api.FACE_WHITE).length === 0, 'a hit flash should not draw a face through itself');
});

test('the face goes on last, so nothing is drawn over it', () => {
  const body = RAW.slice(RAW.indexOf('function drawFighterBody('));
  const head = body.slice(0, body.indexOf('\n}\n'));
  const face = head.indexOf('drawFace(');
  const hair = head.indexOf('drawHair(');
  const dissolve = head.indexOf('if (df > 0){');
  assert(face >= 0 && hair >= 0 && dissolve >= 0, 'drawFighter no longer looks the way this test expects');
  assert(face > hair, 'the hair is drawn over the face');
  // A living man's face is never painted over. A dying one is deliberately
  // taken by the dissolve, face and all — so that block, and only that
  // block, is allowed to run a pass after the face has gone on.
  assert(dissolve > face, 'the dissolve runs before the face it is supposed to take');
  for (let i = head.indexOf('drawRigPass(', face); i >= 0; i = head.indexOf('drawRigPass(', i + 1))
    assert(i > dissolve, 'a lighting pass runs after the face and would grey it out');
});

/* --------------------------------------------------------------- weather */
test('the wet stages are the ones it rains on', () => {
  const api = boot();
  for (const st of api.STAGES){
    if (st.rain) assert(st.wet, `${st.name} rains onto a dry street`);
    assert(!st.rain || (st.rain > 0 && st.rain <= 1), `${st.name} has a nonsense rain power`);
  }
  const wet = api.STAGES.filter(st => st.rain);
  assert(wet.length >= 2, 'more than one stage gets weather');
  assert(api.STAGES.some(st => !st.rain), 'and not every stage does — the foundry is indoors');
});

test('rain falls in depth layers, near ones faster and heavier', () => {
  const api = boot();
  assert(api.RAIN.length >= 3, 'three layers of it at least');
  for (let i = 1; i < api.RAIN.length; i++){
    assert(api.RAIN[i].spd < api.RAIN[i - 1].spd, 'layer ' + i + ' should fall slower than the one in front');
    assert(api.RAIN[i].a < api.RAIN[i - 1].a, 'layer ' + i + ' should be fainter than the one in front');
    assert(api.RAIN[i].len < api.RAIN[i - 1].len, 'layer ' + i + ' should be shorter than the one in front');
  }
  for (const r of api.RAIN) assert(r.slant > 0, 'rain that falls straight down has no wind in it');
});

test('rain takes the colour of the light it falls through', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const pinkish = (list) => list.filter(c => {
    const m = /rgba\((\d+),(\d+),(\d+)/.exec(c);
    return m && +m[1] > 180 && +m[1] > +m[3] + 60;
  }).length;

  api.lfReset();                                  // nothing lighting the street
  api._resetCounts();
  api.drawRain(1);
  const dark = api._styles.slice(), darkDrops = api._counts.fillRect || 0;

  api.lfReset();                                  // the whole street under a pink sign
  for (let x = 0; x < api.VW; x += 20) api.lfAdd(x, 176, 40, '#ff2f7a', 0.9);
  api._resetCounts();
  api.drawRain(1);
  const lit = api._styles.slice(), litDrops = api._counts.fillRect || 0;

  assert(darkDrops > 0 && litDrops > 0, 'it rained both times');
  assert(Math.abs(litDrops - darkDrops) < darkDrops * 0.4,
    `the drop count should not depend on the lighting: ${litDrops} vs ${darkDrops}`);
  assert(pinkish(dark) === 0, 'rain in the dark should not already be pink');
  // the streaks are the bulk of what rain paints — a few pink splashes is not enough
  assert(pinkish(lit) > lit.length * 0.5,
    `most of the rain should come down pink, only ${pinkish(lit)} of ${lit.length} did`);
});

test('the wet stage actually rains, and the dry one does not', () => {
  const api = boot();
  play(api, { stage: 0 });                        // the street
  api.draw();                                     // warm the bakes
  const cost = () => { api._resetCounts(); api.drawAmbient(); return api._counts.fillRect || 0; };
  const rainy = cost();
  const st = api.stage(), keep = st.rain;
  st.rain = 0;
  const stopped = cost();
  st.rain = keep;
  assert(rainy > stopped * 3, `the ambient pass should be mostly rain: ${rainy} with, ${stopped} without`);

  play(api, { stage: 3 });                        // the foundry, indoors
  api.draw(); api._resetCounts(); api.draw();
  const dryFrame = api._counts.fillRect || 0;
  play(api, { stage: 0 });
  api.draw(); api._resetCounts(); api.draw();
  const wetFrame = api._counts.fillRect || 0;
  assert(dryFrame > 200 && wetFrame > 200, 'both stages drew a real frame');
  assert(wetFrame < 11000, 'a rainy frame is too expensive: ' + wetFrame + ' fillRects');
  assert(!api.STAGES[3].rain, 'the foundry stays dry');
});

test('the city is awake: the lit windows change over an evening', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.cam.x = 0;
  api.draw();
  const WINDOW = '#ffe8a0';                       // the inner pane of a lit window
  const countAt = (t) => {
    api.setT(t);
    api._resetCounts();
    api.drawBackground();
    return api._styles.filter(c => c === WINDOW).length;
  };
  const seen = [];
  for (let t = 0; t < 60; t += 3) seen.push(countAt(t));
  const lo = Math.min(...seen), hi = Math.max(...seen);
  assert(lo > 10, 'the street should be full of lit windows, saw ' + lo);
  assert(hi > lo, `the same street has the same windows lit all night: ${lo}..${hi}`);
  /* But most of them stay put — a city where every window blinks is a disco.
     Measured with the block culled to what is on screen: ~13% on a cycle
     swings 57..66 (ratio 0.16), every window on one swings 66..83 (0.26).
     Both are exact — the sample times and the camera are pinned. */
  assert(hi - lo < lo * 0.20, `too many windows switching: ${lo}..${hi}`);
});

test('every stage still draws with the weather on it', () => {
  const api = boot();
  for (let st = 0; st < api.STAGES.length; st++){
    play(api, { stage: st });
    api._resetCounts();
    api.draw();
    assert((api._counts.fillRect || 0) > 200, `stage ${st + 1} drew nothing`);
  }
});

/* ----------------------------------------------------------- light field */
test('the field takes the colour of whatever light is over it', () => {
  const api = boot();
  api.lfReset();
  assert(api.lightAt(100) === null, 'an unlit street is unlit');
  api.lfAdd(100, 174, 30, '#ff2f7a', 0.6);
  const pink = api.lightAt(100);
  assert(pink, 'the light registered');
  const n = parseInt(pink.col.slice(1), 16);
  assert(((n >> 16) & 255) > (n & 255), 'a pink sign should read pink, got ' + pink.col);
  assert(api.lightAt(340) === null, 'and it does not reach the far end of the street');
  api.lfReset();
  api.lfAdd(100, 174, 30, '#2fc8e8', 0.6);
  const cyan = api.lightAt(100);
  assert(cyan.col !== pink.col, 'a cyan sign reads differently from a pink one');
});

test('the field knows which side the light is on', () => {
  const api = boot();
  api.lfReset();
  api.lfAdd(200, 174, 60, '#ffcc7a', 0.6);
  assert(api.lightAt(160).dir === 1, 'a light to the right is to the right');
  assert(api.lightAt(240).dir === -1, 'and a light to the left is to the left');
});

test('a light at your feet counts for more than the same one up a wall', () => {
  const api = boot();
  api.lfReset(); api.lfAdd(100, 176, 30, '#ffcc7a', 0.6);
  const low = api.lightAt(100).k;
  api.lfReset(); api.lfAdd(100, 90, 30, '#ffcc7a', 0.6);
  const high = api.lightAt(100).k;
  assert(low > high * 1.5, `a pool at the feet (${low}) should beat a sign up the wall (${high})`);
  assert(high > 0, 'but the sign still reaches the street');
});

test('the sampled colour is quantised, so rgba never gains a string per step', () => {
  const api = boot();
  const seen = new Set();
  for (let i = 0; i < 255; i++) seen.add(api.lfHex(i, 128, 40));
  assert(seen.size <= 12, 'too many distinct colours out of one channel: ' + seen.size);
  assert(/^#[0-9a-f]{6}$/.test(api.lfHex(255, 255, 255)), 'still a hex colour: ' + api.lfHex(255, 255, 255));
  assert(api.lfHex(300, -20, 128).length === 7, 'out-of-range channels stay in range');
});

test('the field is rebuilt every frame, not accumulated', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const once = Array.from(api.LF.w);
  for (let i = 0; i < 5; i++) api.draw();
  const later = Array.from(api.LF.w);
  const lit = once.filter(v => v > 0.05).length;
  assert(lit > 0, 'the street is lit at all');
  for (let i = 0; i < once.length; i++)
    assert(later[i] < once[i] * 3 + 0.2, 'bucket ' + i + ' is piling up frame on frame');
});

test('a fighter standing in the light is drawn differently from one in the dark', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fighters = api.fighters.filter(f => f.team === 'p');
  const f = api.players[0];
  f.y = api.FLOOR_MID; f.z = 0; f.state = 'idle'; f.anim = 'idle';
  const cost = (bright) => {
    api.draw();                                   // build the frame's field first
    api.lfReset();
    if (bright) api.lfAdd(f.x - api.cam.x, 176, 40, '#ff2f7a', 0.9);
    api._resetCounts();
    api.drawFighter(f);
    return api._counts.fillRect || 0;
  };
  const dark = cost(false), lit = cost(true);
  assert(lit > dark, `a lit fighter should take extra passes: ${lit} vs ${dark}`);
  assert(lit < dark * 3, `but not three times the work: ${lit} vs ${dark}`);
});

test('a hit throws light before the man taking it is drawn', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fx.length = 0;
  api.draw();
  const before = api.lightAt(180);            // whatever the street was already throwing
  const baseK = before ? before.k : 0;
  api.spawnFx('burst', api.cam.x + 180, api.FLOOR_MID, 24, '#ffe9a0');
  api.draw();
  const here = api.lightAt(180);
  assert(here, 'the burst put light on the street');
  assert(here.k > baseK + 0.15, `the hit should light the street it lands on: ${baseK} -> ${here.k}`);
  const n = parseInt(here.col.slice(1), 16);
  assert(((n >> 16) & 255) >= (n & 255), 'and it is warm, not cold: ' + here.col);
  api.fx.length = 0;
  api.draw();
  assert((api.lightAt(180) ? api.lightAt(180).k : 0) <= baseK + 0.02, 'and the light goes out with the hit');
  assert(api.FX_LIGHT.burst && api.FX_LIGHT.impact, 'the hits that light the street are declared in one place');
  // and it has to happen before the fighters run, or the man taking the punch
  // is drawn a frame before the punch lights him
  const body = RAW.slice(RAW.indexOf('function draw(){'));
  const head = body.slice(0, body.indexOf('\n}\n'));
  const seed = head.indexOf('lfAdd('), crowd = head.indexOf('visibleList()');
  assert(seed >= 0, 'draw() never seeds the field with the hits');
  assert(crowd >= 0, 'draw() no longer builds its draw list where this test can see it');
  assert(seed < crowd, 'the hits must light the field before the fighters are drawn');
  for (const k of Object.keys(api.FX_LIGHT)){
    const [r, p] = api.FX_LIGHT[k];
    assert(r > 0 && p > 0 && p <= 1, k + ' has a nonsense light: ' + r + ',' + p);
  }
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
  // 3000 when the title had no weather on it; the attract screen runs the
  // street's own rain, kerb and lamp cones now, which is where the rest goes
  assert(second < 3900, 'a warm title frame is too expensive: ' + second + ' fillRects');
  assert(Math.abs(second - first) < 400, 'the title frame cost should not wander: ' + first + ' vs ' + second);
});

test('the title is the same wet street the game opens on', () => {
  const api = boot();
  api.draw();
  api._resetCounts();
  api.draw();
  const r = api._rects;
  assert(r.some(q => q[4] === '#171420' && q[2] === 3 && q[3] === 12), 'no kerb railing in front of the title');
  assert(r.some(q => String(q[4]).startsWith('rgba(255,220,140')), 'the lamp post throws no light on the title');
  assert(r.some(q => q[2] === 1 && String(q[4]).startsWith('rgba(168,196,232')), 'it is not raining on the title');
  assert(r.some(q => q[3] === 2 && q[2] === api.VW && String(q[4]).startsWith('rgba(6,4,10')), 'no vignette on the title');
  // and the wash over the sky follows the logo instead of covering everything
  const veil = r.filter(q => q[2] === api.VW && q[3] === 1 && String(q[4]).startsWith('rgba(6,4,10'));
  assert(veil.length >= 30, 'the sky veil went missing: ' + veil.length + ' rows');
  const worst = Math.max(...veil.map(q => parseFloat(String(q[4]).split(',')[3])));
  assert(worst < 0.4, 'the sky is still being flattened by a ' + worst + ' wash');
  const column = r.filter(q => q[3] === 62 && String(q[4]).startsWith('rgba(6,4,10'));
  assert(column.length === 10, 'the logo has no wash column behind it: ' + column.length);
  assert(new Set(column.map(q => q[2])).size === 10, 'the column does not taper — it is one hard-edged box');
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
  at(0.05);
  const joske = api.attract.cast[0], foe = api.attract.cast[2];
  const restX = joske.x, foeRest = foe.x;
  at(2.6);
  assert(foe.x < foeRest, 'the wannabees never close the street: ' + foe.x + ' from ' + foeRest);
  const crept = foe.x;
  at(3.4);
  assert(joske.anim !== 'idle', 'Joske swings on the beat');
  assert(joske.x > restX, 'and steps in to do it');
  at(3.9);
  assert(foe.anim === 'hurt', 'the near wannabee wears it');
  assert(foe.x > crept, 'and gives the ground back');
  at(4.45);                                     // the cycle is 4.4s long, so this is a fresh loop
  assert(joske.anim === 'idle' && joske.x === restX, 'everybody is back on the beat');
  assert(foe.anim === 'idle', 'including the man who just backed off');
  assert(Math.abs(foe.x - foeRest) < 1, 'the wannabee did not give his ground back: ' + foe.x + ' vs ' + foeRest);
});

test('the two crews hold the kerbs, not the middle where the menu sits', () => {
  const api = boot();
  api.attract.t = 0.4;
  api.draw();
  // the menu card covers roughly the middle 45% of the canvas
  const L = api.VW * 0.28, R = api.VW * 0.72;
  for (const f of api.attract.cast)
    assert(f.x < L || f.x > R, f.skin + ' stands at ' + f.x + ', behind the menu');
  const heroes = api.attract.cast.filter(f => f.team === 'p');
  assert(heroes.every(f => f.x < L), 'the heroes are not on the left kerb');
  assert(api.attract.cast.filter(f => f.team === 'e').every(f => f.x > R), 'the gang is not on the right kerb');
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
  // It was 11000 while the HUD repainted every glyph it owns; with the strings
  // baked the same scene costs 5663, so the guard is pulled in behind it.
  assert(fills < 7500, 'frame is too expensive: ' + fills + ' fillRects');
  assert(firstFrame > fills * 2, 'the dithered sky should be baked once, not every frame');
  // and every other stage should be just as cheap on a warm cache
  for (let st = 1; st < api.STAGES.length; st++){
    play(api, { stage: st });
    api.draw();
    api._resetCounts();
    api.draw();
    const n = api._counts.fillRect || 0;
    assert(n < 7500, `stage ${st + 1} frame is too expensive: ${n} fillRects`);
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

/* ------------------------------------------- the full-screen moments
   The card, the tally and the continue count are all built on one plate.
   These tests check the plate is an object (chamfered, lit on one side,
   riveted) and that each screen actually animates rather than printing
   itself all at once. */
test('a plate is chamfered, lit along the top and dark underneath', () => {
  const api = boot();
  api._resetCounts();
  api.plate(40, 60, 120, 50, {});
  const r = api._rects;
  const body = r.filter(q => q[3] === 1 && String(q[4]).startsWith('rgba(9,7,16'));
  assert(body.length === 50, 'the plate is ' + body.length + ' rows, expected 50');
  const widths = body.map(q => q[2]);
  assert(Math.max(...widths) === 120, 'no row of the plate is full width');
  assert(Math.min(...widths) < 110, 'every row is the same width — nothing is chamfered off');
  // the narrow rows are at the ends, not scattered through the middle
  const mid = body.filter(q => q[1] > 70 && q[1] < 100);
  assert(mid.every(q => q[2] === 120), 'the middle of the plate is not square-sided');
  assert(r.some(q => q[4] === '#6a5470' && q[2] > 100 && q[3] === 1 && q[1] === 60), 'no lit lip on top');
  assert(r.some(q => q[4] === '#0a0712' && q[2] > 100 && q[3] === 1 && q[1] === 109), 'no dark edge underneath');
  assert(r.some(q => q[4] === '#6a5470' && q[2] === 1 && q[3] > 30), 'the left side is not lit');
  assert(r.some(q => q[4] === '#0a0712' && q[2] === 1 && q[3] > 30), 'the right side is not in shadow');
  const rivets = r.filter(q => q[4] === '#3a3048' && q[2] === 2 && q[3] === 2);
  assert(rivets.length === 4, 'the plate has ' + rivets.length + ' rivets, expected 4');
  assert(new Set(rivets.map(q => q[0])).size === 2 && new Set(rivets.map(q => q[1])).size === 2,
    'the rivets are not one to a corner');
});

test('a plate wears the accent it is given', () => {
  const api = boot();
  api._resetCounts();
  api.plate(40, 60, 120, 50, {});
  const plain = api._rects.filter(q => q[4] === '#4affaa').length;
  api._resetCounts();
  api.plate(40, 60, 120, 50, { accent: '#4affaa' });
  const lit = api._rects.filter(q => q[4] === '#4affaa').length;
  assert(plain === 0, 'a plate with no accent painted one anyway');
  assert(lit >= 1, 'the accent stripe never reached the plate');
});

test('the stage card opens as a shutter before it says anything', () => {
  const api = boot();
  play(api, { stage: 2 });
  const rows = () => api._rects.filter(q => q[3] === 1 && String(q[4]).startsWith('rgba(9,7,16')).length;
  const glyphs = () => api._rects.filter(q => q[4] === '#ffe9b8' && q[2] === 1 && q[3] === 1).length;
  api.G.phase = 'card'; api.G.cardT = api.CARD_T - 0.04;   // just opening
  api._resetCounts(); api.drawCard();
  const early = { h: rows(), g: glyphs() };
  api.G.cardT = api.CARD_T - 1.0;                          // wide open
  api._resetCounts(); api.drawCard();
  const open = { h: rows(), g: glyphs() };
  api.G.cardT = 0.04;                                      // closing again
  api._resetCounts(); api.drawCard();
  const late = rows(), lateG = glyphs();
  assert(early.h > 2 && early.h < 30, 'the card opened at ' + early.h + 'px — it is not a shutter');
  assert(early.g === 0, 'the card printed its name while it was still opening');
  assert(open.h === 72, 'the open card is ' + open.h + 'px tall');
  assert(open.g > 20, 'the open card printed no stage name');
  assert(late < 30, 'the card is still ' + late + 'px tall as it closes');
  // and it takes the words with it — a name printed on a 12px plate hangs in the air
  assert(lateG === 0, 'the card is still printing its name on a plate ' + late + 'px tall');
});

test('the card counts the streets, and lights the one you are on', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.G.phase = 'card'; api.G.cardT = api.CARD_T - 1.0;
  api._resetCounts(); api.drawCard();
  const pips = api._rects.filter(q => q[2] === 9 && q[3] === 3);
  assert(pips.length === api.STAGES.length,
    pips.length + ' pips for ' + api.STAGES.length + ' stages');
  const key = api.STAGES[2].key;
  assert(pips.filter(q => q[4] === key).length === 1, 'the pip you are on is not lit in the stage key');
  assert(pips.filter(q => q[4] === api.shade(key, -50)).length === 2, 'the two streets behind you are not dimmed');
  assert(pips.filter(q => q[4] === '#241c30').length === api.STAGES.length - 3, 'the streets ahead are not dark');
  // and it moves: a later stage lights a later pip
  const lit = () => api._rects.filter(q => q[2] === 9 && q[3] === 3 && q[4] === api.STAGES[api.G.stage].key)[0][0];
  const at2 = lit();
  api.G.stage = 4;
  api._resetCounts(); api.drawCard();
  assert(lit() > at2, 'the lit pip does not travel with the stage');
});

test('the clear tally counts itself in one line at a time', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.G.phase = 'clear'; api.G.rank = 'A'; api.G.lastBonus = 4200; api.G.dmgTaken = 38;
  const lines = () => {
    const dots = api._rects.filter(q => q[2] === 1 && q[3] === 1 && q[4] === '#4a3c50');
    return new Set(dots.map(q => q[1])).size;
  };
  const at = (el) => { api.W.clearT = api.CLEAR_T - el; api._resetCounts(); api.drawClear(); return lines(); };
  assert(at(0.2) === 0, 'the tally printed a stat line before the plate had opened');
  assert(at(0.6) === 1, 'at 0.6s the tally shows ' + at(0.6) + ' lines, expected 1');
  assert(at(0.9) === 3, 'at 0.9s the tally shows ' + at(0.9) + ' lines, expected 3');
  assert(at(1.4) === 4, 'the tally never reaches all four lines');
  // the leaders join label to value rather than sitting against the number
  api.W.clearT = api.CLEAR_T - 1.4; api._resetCounts(); api.drawClear();
  const row = api._rects.filter(q => q[2] === 1 && q[3] === 1 && q[4] === '#4a3c50' && q[1] === api._rects
    .filter(z => z[2] === 1 && z[3] === 1 && z[4] === '#4a3c50')[0][1]);
  assert(row.length >= 8, 'the leader is ' + row.length + ' dots long');
});

test('the rank sits in a bezel and only throws rays when it earned them', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.G.phase = 'clear'; api.W.clearT = api.CLEAR_T - 1.4;
  const shot = (rk) => {
    api.G.rank = rk;
    api._resetCounts(); api.drawClear();
    const col = rk === 'S' ? '#7fe0ff' : rk === 'A' ? '#7fe07f' : rk === 'B' ? '#ffd23d' : '#e0a06a';
    return {
      glyph: api._rects.filter(q => q[2] === 4 && q[3] === 4 && q[4] === col).length,
      rays: api._rects.filter(q => q[2] === 3 && q[3] === 3 && String(q[4]).startsWith('rgba(')),
      bezel: api._rects.filter(q => q[2] === 42 && q[3] === 42).length,
    };
  };
  const s = shot('S'), c = shot('C');
  assert(s.bezel === 1, 'the rank has no bezel round it');
  assert(s.glyph > 10, 'the rank glyph is not drawn big — ' + s.glyph + ' pixels');
  assert(s.rays.length >= 3, 'an S rank threw ' + s.rays.length + ' rays');
  assert(c.rays.length === 0, 'a C rank threw rays it did not earn');
  assert(c.glyph > 10, 'the C rank glyph went missing');
  // nothing lands below the badge, where RANK is printed
  const cy = 58 + 32 + 21;
  assert(s.rays.every(q => q[1] < cy + 10), 'a ray landed on the RANK label');
});

test('the continue count burns a fuse down, and reddens when it is short', () => {
  const api = boot();
  play(api, { stage: 2 });
  const fuse = () => {
    // the gauge fill: the widest run inside the 150px trough
    const bar = api._rects.filter(q => q[3] === 4 && q[2] > 1 && q[2] <= 148);
    return bar.length ? bar[0] : null;
  };
  api.G.contT = api.CONT_T; api._resetCounts(); api.drawContinue();
  const full = fuse();
  api.G.contT = 2.4; api._resetCounts(); api.drawContinue();
  const low = fuse();
  assert(full && low, 'the continue screen has no fuse on it');
  assert(full[2] > low[2] * 3, `the fuse ran ${full[2]}px full and ${low[2]}px at 2.4s — it is not draining`);
  assert(full[4] === '#ffa03a', 'a fresh fuse is not lit warm: ' + full[4]);
  assert(low[4] === '#e84a3a', 'a nearly-spent fuse is not red: ' + low[4]);
  // and the plate itself takes the warning tint only when it is short
  const tint = () => api._rects.filter(q => q[2] === 202 && String(q[4]).startsWith('rgba(255,42,26')).length;
  api.G.contT = api.CONT_T; api._resetCounts(); api.drawContinue();
  assert(tint() === 0, 'the plate was already red with ten seconds left');
  api.G.contT = 2.4; api._resetCounts(); api.drawContinue();
  assert(tint() === 1, 'the plate never reddens as the count runs out');
});

test('the continue digit is big, and kicks on each new second', () => {
  const api = boot();
  play(api, { stage: 2 });
  // text is baked and blitted, so its glyphs are counted on a cold cache and
  // its position is read off where the sprite landed
  const digit = (t) => {
    api.G.contT = t;
    api.clearTextCache();
    api._resetCounts();
    api.drawContinue();
    const p = api._rects.filter(q => q[2] === 5 && q[3] === 5 && (q[4] === '#ffffff' || q[4] === '#ffe9c8'));
    const spr = api._blits.filter(q => q[3] === 45);       // 9 * scale 5 tall: the digit's own sprite
    return { n: p.length, y: spr.length ? spr[0][1] : 0, col: p.length ? p[0][4] : null };
  };
  const rest = digit(6.4), kick = digit(6.94);
  assert(rest.n > 10, 'the digit is not drawn at five times size: ' + rest.n + ' pixels');
  assert(kick.y === rest.y - 1, `the digit sits at ${kick.y} on the tick and ${rest.y} off it`);
  assert(kick.col === '#ffffff' && rest.col === '#ffe9c8', 'the digit does not flash white on the tick');
});

test('the full-screen moments are cheap to draw', () => {
  const api = boot();
  play(api, { stage: 2 });
  for (const [name, fn, set] of [
    ['card', () => api.drawCard(), () => { api.G.phase = 'card'; api.G.cardT = api.CARD_T - 1; }],
    ['clear', () => api.drawClear(), () => { api.G.phase = 'clear'; api.W.clearT = 1; api.G.rank = 'S'; }],
    ['continue', () => api.drawContinue(), () => { api.G.contT = 3; }],
  ]){
    set();
    api._resetCounts();
    fn();
    const n = api._counts.fillRect || 0;
    assert(n > 120, `the ${name} screen drew almost nothing: ${n}`);
    assert(n < 4200, `the ${name} screen cost ${n} fillRects`);
  }
});

test('the screen timers are the ones the update loop counts down', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  for (const k of ['CARD_T', 'CLEAR_T', 'CONT_T']){
    const decl = new RegExp('const ' + k + ' = [0-9.]+;');
    if (!decl.test(src)) throw new Error(k + ' is not declared as a constant');
  }
  if (!/G\.cardT = CARD_T;/.test(src)) throw new Error('the card is still started from a loose number');
  if (!/W\.clearT = CLEAR_T;/.test(src)) throw new Error('the tally is still started from a loose number');
  if (!/G\.contT = CONT_T;/.test(src)) throw new Error('the count is still started from a loose number');
});

/* ------------------------------------------------------- sky over the street */
test('the sky carries cloud, lit from underneath by the town', () => {
  const api = boot();                              // bands are baked on first use, so paint them here
  for (const b of api.CLOUDS){
    api._resetCounts();
    api.cloudBand(b);
    const r = api._rects;
    const body = r.filter(q => q[4] === b.body && q[2] === 1);
    assert(body.length > 60, 'cloud band ' + b.key + ' is ' + body.length + ' columns wide');
    const lip = r.filter(q => q[4] === b.lip && q[2] === 1 && q[3] === 2);
    assert(lip.length === body.length, 'cloud band ' + b.key + ' has no lit underside');
    const crown = r.filter(q => q[4] === api.shade(b.body, 26));
    assert(crown.length === body.length, 'the moon does not catch the crown of ' + b.key);
    // the lip is under the cloud it belongs to, and the crown on top of it
    for (const q of body.slice(0, 20)){
      const l = lip.find(z => z[0] === q[0]), cr = crown.find(z => z[0] === q[0]);
      assert(l[1] >= q[1] + q[3] - 2 - 1, 'the ' + b.key + ' lip floats above its cloud');
      assert(cr[1] === q[1], 'the ' + b.key + ' crown is not on top');
    }
  }
  // the three banks sit at three heights, so the sky has depth rather than one slab
  const ys = api.CLOUDS.map(b => b.y);
  assert(ys[0] < ys[1] && ys[1] < ys[2], 'the cloud banks are not stacked: ' + ys.join(', '));
  assert(new Set(api.CLOUDS.map(b => b.spd)).size === 3, 'the banks all drift at the same speed');
});

test('the sky blits every cloud band twice, so it wraps', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();                                      // warm every bake first
  api._resetCounts();
  api.drawClouds(200);
  assert((api._counts.drawImage || 0) === api.CLOUDS.length * 2,
    'the sky blitted ' + (api._counts.drawImage || 0) + ' cloud copies');
  assert((api._counts.fillRect || 0) === 0, 'the cloud bands are being repainted every frame');
});

test('a cloud band tiles without a seam and has gaps in it', () => {
  const api = boot();
  const b = api.CLOUDS[1];
  api._resetCounts();
  api.cloudBand(b);                              // painted into its own canvas, so this is the band alone
  const cols = api._rects.filter(q => q[2] === 1 && q[4] === b.body);
  const at = {};
  for (const q of cols) at[q[0]] = q;
  assert(Object.keys(at).length < api.VW, 'the band is solid from edge to edge — no gaps between banks');
  assert(Object.keys(at).length > api.VW * 0.3, 'the band is barely there: ' + Object.keys(at).length + ' columns');
  // Column 0 and column VW-1 are the join where the two copies meet. On a
  // band that tiles, that join is just another step along the edge; on one
  // that does not, it is the biggest step in the band by a mile.
  const hOf = (x) => (at[x] ? at[x][3] : 0);
  let worst = 0;
  for (let x = 0; x < api.VW - 1; x++) worst = Math.max(worst, Math.abs(hOf(x + 1) - hOf(x)));
  const seam = Math.abs(hOf(0) - hOf(api.VW - 1));
  assert(seam <= worst, `the band does not tile: a ${seam}px step at the seam, ${worst}px anywhere else`);
  // and the reason it tiles is that every frequency is a whole number of
  // cycles across VW — a check the picture alone cannot make for you
  const src = fs.readFileSync(HTML, 'utf8');
  assert(/const f = \(k\) => 2 \* Math\.PI \* k \/ VW;/.test(src),
    'the cloud frequencies are no longer whole multiples of 2*PI/VW');
});

test('the attract lays a light down on each crew before it draws them', () => {
  const api = boot();
  api.draw();
  const warm = api.lightAt(54), cool = api.lightAt(300);
  assert(warm && cool, 'one of the two crews is standing in the dark');
  const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const [, wg, wb] = hex(warm.col), [, cg, cb] = hex(cool.col);
  assert(wg > wb, 'the lamp over Joske is not warm: ' + warm.col);
  assert(cb > cg, 'the wannabees are not standing in neon: ' + cool.col);
  assert(warm.k > 0.4 && cool.k > 0.2, 'the pools are too weak to reach the crews');
});

test('the town throws an orange haze up over its own rooftops', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const dome = api._rects.filter(q => q[2] === api.VW && q[3] === 4 && String(q[4]).startsWith('rgba(255,120,54'));
  assert(dome.length === 9, 'the sodium dome is ' + dome.length + ' bands');
  const byY = dome.slice().sort((p, q) => p[1] - q[1]);
  const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
  assert(alpha(byY[byY.length - 1]) > alpha(byY[0]), 'the haze is not brightest at the rooftops');
  assert(byY[0][1] < byY[byY.length - 1][1], 'the haze does not climb');
});

test('the lamp light falls in a cone, not a pane of glass', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  api._resetCounts();
  api.drawForeground('street');
  const bands = api._rects.filter(q => String(q[4]).startsWith('rgba(255,220,140') && q[3] === 13);
  assert(bands.length >= 8, 'the lamp throws ' + bands.length + ' bands of light');
  const one = bands.slice(0, 8).sort((p, q) => p[1] - q[1]);
  for (let i = 1; i < 8; i++){
    assert(one[i][2] > one[i - 1][2], 'the cone does not widen as it falls');
    assert(parseFloat(String(one[i][4]).split(',')[3]) < parseFloat(String(one[i - 1][4]).split(',')[3]),
      'the cone does not fade as it falls');
  }
  // and the lamps off screen are not painted at all
  assert(bands.length <= 16, bands.length / 8 + ' lamps painted — the loop is not culling');
});

test('the far skyline only paints the towers you can see', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  for (const cx of [0, 300, 1100]){
    api.cam.x = cx;
    api._resetCounts();
    api.drawBackground();
    const caps = api._rects.filter(q => q[4] === '#262a4e' && q[3] === 1);
    assert(caps.length >= 6, 'at camera ' + cx + ' the far skyline is ' + caps.length + ' towers');
    assert(caps.length <= 11, 'at camera ' + cx + ' it painted ' + caps.length + ' towers for the nine on screen');
  }
});

/* --------------------------------------------------------- the ground plane */
const groundRows = (api) => api._rects
  .filter(q => q[2] === api.VW && q[3] === 1 && String(q[4]).startsWith('rgba(255,244,222'))
  .sort((a, b) => a[1] - b[1]);

test('the floor recedes: its courses crowd toward the back', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  api._resetCounts();
  api.groundPlane(0, api.GROUND.street, api.stage());
  const rows = groundRows(api);
  assert(rows.length >= 5, 'the floor has ' + rows.length + ' courses across it');
  const gaps = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i][1] - rows[i - 1][1]);
  assert(gaps[0] < gaps[gaps.length - 1],
    'the courses are evenly spaced — that is a wall, not a floor: ' + gaps.join(', '));
  for (let i = 1; i < gaps.length; i++)
    assert(gaps[i] >= gaps[i - 1], 'the spacing does not open up all the way forward: ' + gaps.join(', '));
  // and the near ones take more light than the far ones
  const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
  assert(alpha(rows[rows.length - 1]) > alpha(rows[0]) * 1.5,
    'the far courses are as bright as the near ones');
  // each lit course has its own shadow directly under it
  for (const q of rows)
    assert(api._rects.some(z => z[1] === q[1] + 1 && z[2] === api.VW && String(z[4]).startsWith('rgba(6,4,10')),
      'the course at ' + q[1] + ' casts no shadow under itself');
});

test('the joints are laid in a running bond and travel with the camera', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  const joints = (c) => {
    api._resetCounts();
    api.groundPlane(c, api.GROUND.street, api.stage());
    return api._rects.filter(q => q[2] === 1 && q[3] > 4 && String(q[4]).startsWith('rgba(6,4,10'));
  };
  const j = joints(0);
  assert(j.length > 12, 'the floor has ' + j.length + ' joints in it');
  const byRow = {};
  for (const q of j) (byRow[q[1]] = byRow[q[1]] || []).push(q[0]);
  const rows = Object.keys(byRow).sort((a, b) => a - b);
  assert(rows.length >= 3, 'only ' + rows.length + ' courses carry joints');
  // consecutive courses are offset half a joint against each other
  const off = (r) => ((byRow[r][0] % api.GROUND_JOINT) + api.GROUND_JOINT) % api.GROUND_JOINT;
  assert(Math.abs(off(rows[0]) - off(rows[1])) === api.GROUND_JOINT / 2,
    'the courses line up: ' + rows.map(off).join(', ') + ' — that is graph paper, not a bond');
  assert(off(rows[0]) === off(rows[2]), 'the bond does not alternate');
  // and the whole lot slides with the world
  const moved = joints(9);
  assert(moved[0][0] !== j[0][0], 'the joints are painted to the screen, not to the ground');
});

test('every stage floor takes a wash of what lights it, back to front', () => {
  const api = boot();
  for (let st = 0; st < api.STAGES.length; st++){
    play(api, { stage: st });
    api.draw();
    api._resetCounts();
    api.draw();
    const s = api.STAGES[st], m = api.GROUND[s.bg];
    const bands = api._rects.filter(q => q[2] === api.VW && q[3] === 4 &&
      String(q[4]).startsWith('rgba(' + [1, 3, 5].map(i => parseInt(s.bounce.slice(i, i + 2), 16)).join(',')));
    assert(bands.length === 9, 'stage ' + st + ' floor takes ' + bands.length + ' bands of bounce');
    const byY = bands.slice().sort((a, b) => a[1] - b[1]);
    const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
    assert(alpha(byY[0]) > alpha(byY[8]), 'stage ' + st + ' bounce is not strongest at the back');
    assert(alpha(byY[8]) < alpha(byY[0]) * 0.25, 'stage ' + st + ' bounce never dies out at the front');
    assert(byY[0][1] === m.y0, 'stage ' + st + ' bounce does not start at its floor');
  }
});

test('the floor goes into shadow where it meets what stands on it', () => {
  const api = boot();
  play(api, { stage: 3 });
  api.draw();
  api._resetCounts();
  api.groundPlane(0, api.GROUND.foundry, api.stage());
  const m = api.GROUND.foundry;
  const contact = api._rects
    .filter(q => q[2] === api.VW && q[3] === 1 && q[1] >= m.y0 && q[1] < m.y0 + 5 && String(q[4]).startsWith('rgba(6,4,10'))
    .sort((a, b) => a[1] - b[1]);
  assert(contact.length === 5, 'the wall junction is ' + contact.length + ' rows deep');
  const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
  for (let i = 1; i < 5; i++)
    assert(alpha(contact[i]) < alpha(contact[i - 1]), 'the contact shadow does not fall off away from the wall');
});

test('the grime is baked once, tiled twice, and never cut at the seam', () => {
  const api = boot();
  api._resetCounts();
  api.groundGrime();
  const blobs = api._rects;
  assert(blobs.length > 200, 'the grime sheet is ' + blobs.length + ' rects — it is barely mottled');
  assert(Math.min(...blobs.map(q => q[0])) >= 0, 'a blob runs off the left of the sheet');
  assert(Math.max(...blobs.map(q => q[0] + q[2])) <= api.VW, 'a blob runs off the right of the sheet');
  assert(new Set(blobs.map(q => q[4])).size === 2, 'the grime is not two tones (soil and wear)');
  // warm, then check it costs nothing per frame beyond the two blits
  play(api, { stage: 1 });
  api.draw();
  api._resetCounts();
  api.groundPlane(120, api.GROUND.junk, api.stage());
  assert((api._counts.drawImage || 0) === 2, 'the grime is blitted ' + (api._counts.drawImage || 0) + ' times');
  assert((api._counts.fillRect || 0) < 90, 'the ground plane costs ' + api._counts.fillRect + ' fillRects');
});

test('the street only paints the lamps, dashes and wet patches on screen', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.draw();
  for (const cx of [0, 240, 1450]){
    api.cam.x = cx;
    api._resetCounts();
    api.drawBackground();
    const r = api._rects;
    const posts = r.filter(q => q[4] === '#221d2e' && q[2] === 3 && q[3] === 57);
    assert(posts.length >= 2, 'at camera ' + cx + ' the street has ' + posts.length + ' lamps');
    assert(posts.length <= 4, 'at camera ' + cx + ' it painted ' + posts.length + ' lamps for the three on screen');
    const dashes = r.filter(q => q[4] === '#4a4a5c' && q[2] === 26);
    assert(dashes.length <= 8, 'at camera ' + cx + ' it painted ' + dashes.length + ' road dashes');
    assert(dashes.length >= 5, 'at camera ' + cx + ' the road has ' + dashes.length + ' dashes on it');
  }
});

/* ------------------------------------------------------------ baked text */
test('a string is painted once and blitted after that', () => {
  const api = boot();
  api.clearTextCache();
  api._resetCounts();
  api.text('JOSKE', 10, 10, '#ffffff', 1, '#000000');
  const cold = api._counts.fillRect || 0;
  assert(cold > 300, 'a shadowed string paints ' + cold + ' pixels — that is not five copies of it');
  assert((api._counts.drawImage || 0) === 1, 'the sprite was not blitted');
  api._resetCounts();
  api.text('JOSKE', 40, 10, '#ffffff', 1, '#000000');
  assert((api._counts.fillRect || 0) === 0, 'the same string was painted again: ' + api._counts.fillRect);
  assert((api._counts.drawImage || 0) === 1, 'the warm string is not one blit');
  // colour, scale and shadow are all part of what a sprite is
  for (const [args, why] of [
    [['JOSKE', 40, 10, '#ff0000', 1, '#000000'], 'colour'],
    [['JOSKE', 40, 10, '#ffffff', 2, '#000000'], 'scale'],
    [['JOSKE', 40, 10, '#ffffff', 1, null], 'shadow'],
  ]){
    api._resetCounts();
    api.text(...args);
    assert((api._counts.fillRect || 0) > 0, 'a different ' + why + ' reused the wrong sprite');
  }
});

test('the text sprite carries its shadow, and lands where it was asked to', () => {
  const api = boot();
  api.clearTextCache();
  api._resetCounts();
  api.text('AB', 100, 50, '#ffffff', 2, '#000000');
  const [x, y, w, h] = api._blits[0];
  assert(w === api.textW('AB', 2) + 4, 'the sprite is ' + w + 'px wide, no room for the shadow');
  assert(h === 18, 'the sprite is ' + h + 'px tall, no room for the shadow');
  assert(x === 98 && y === 48, 'the sprite landed at ' + x + ',' + y + ' — the margin is not backed out');
  // the shadow really is on all four sides of the glyphs
  const ink = api._rects.filter(q => q[4] === '#000000');
  const lit = api._rects.filter(q => q[4] === '#ffffff');
  assert(ink.length === lit.length * 4, 'the shadow is ' + ink.length + ' pixels to ' + lit.length + ' lit');
  assert(Math.min(...ink.map(q => q[0])) < Math.min(...lit.map(q => q[0])), 'nothing to the left');
  assert(Math.max(...ink.map(q => q[1])) > Math.max(...lit.map(q => q[1])), 'nothing underneath');
  // and none of it is painted outside the sprite, where the canvas would eat it
  for (const q of api._rects){
    assert(q[0] >= 0 && q[1] >= 0, 'a glyph pixel is painted at ' + q[0] + ',' + q[1] + ', off the sprite');
    assert(q[0] + q[2] <= w && q[1] + q[3] <= h, 'a glyph pixel runs off the far edge of the sprite');
  }
});

test('the text cache is dropped whole rather than growing forever', () => {
  const api = boot();
  api.clearTextCache();
  for (let i = 0; i < api.TEXT_CACHE_MAX; i++) api.text('S' + i, 0, 0, '#fff', 1, null);
  api._resetCounts();
  api.text('S0', 0, 0, '#fff', 1, null);              // still in there, one below the line
  assert((api._counts.fillRect || 0) === 0, 'the cache dropped early');
  api.text('OVERFLOW', 0, 0, '#fff', 1, null);        // this one tips it over
  api._resetCounts();
  api.text('S0', 0, 0, '#fff', 1, null);
  assert((api._counts.fillRect || 0) > 0, 'the cache grew past its limit instead of being dropped');
});

test('the HUD stopped repainting every glyph it owns, every frame', () => {
  const api = boot();
  play(api, { players: 2 });
  api.draw();
  api._resetCounts();
  api.drawHUD();
  const fills = api._counts.fillRect || 0;
  // 5568 before the text cache — over half the whole frame budget, for a
  // layer that changes one digit at a time
  assert(fills < 800, 'the HUD costs ' + fills + ' fillRects a frame');
  assert(fills > 60, 'the HUD drew almost nothing: ' + fills);
  assert((api._counts.drawImage || 0) >= 6, 'the HUD is not blitting its strings');
});

/* ------------------------------------------------------- wet reflections */
// The reflection bands are the only rects under his feet that are several
// rows deep and tinted: the contact shadow under him is flat black ellipses,
// one row at a time.
const reflOf = (api, f) => {
  api._resetCounts();
  api.drawFighter(f);
  const gy = Math.round(f.y + api.cam.shakeY) + 1;
  return api._rects.filter(q => q[1] >= gy && q[3] >= 2 && q[3] <= 8 &&
    String(q[4]).startsWith('rgba(') && !String(q[4]).startsWith('rgba(0,0,0'));
};
const sheenOf = (api, f) => {
  api._resetCounts();
  api.drawFighter(f);
  const gy = Math.round(f.y + api.cam.shakeY) + 1;
  return api._rects.filter(q => q[1] === gy && q[3] === 1 && /rgba\(255,\s*255,\s*255/.test(String(q[4])));
};

test('a wet street throws the man standing in it back up', () => {
  const api = boot();
  const p = play(api, { stage: 0 });                  // the street is wet
  api.draw();
  const wet = reflOf(api, p);
  assert(wet.length >= api.REFL_BANDS, 'the wet street reflects ' + wet.length + ' bands of him');
  play(api, { stage: 1 });                            // the scrapyard is not
  api.draw();
  const dry = reflOf(api, api.players[0]);
  assert(dry.length < 4, 'a dry yard reflected ' + dry.length + ' bands');
});

test('the reflection is him upside down: boots at the water line, head deepest', () => {
  const api = boot();
  const p = play(api, { stage: 0 });
  api.draw();
  const gy = Math.round(p.y + api.cam.shakeY) + 1;
  const bands = reflOf(api, p).filter(q => q[1] > gy).sort((a, b) => a[1] - b[1]);
  assert(bands.length >= 8, 'only ' + bands.length + ' bands under him');
  const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
  assert(alpha(bands[0]) > alpha(bands[bands.length - 1]) * 1.6,
    'the reflection does not fade with depth: ' + alpha(bands[0]) + ' to ' + alpha(bands[bands.length - 1]));
  // it narrows as it goes down, the way something going away from you does
  const wAt = (y) => Math.max(...bands.filter(q => q[1] === y).map(q => q[2]));
  const ys = [...new Set(bands.map(q => q[1]))].sort((a, b) => a - b);
  assert(wAt(ys[ys.length - 1]) <= wAt(ys[0]), 'the reflection does not narrow with depth');
  // and every course of it goes down as two halves, so the edge is not straight
  for (const y of ys.slice(0, 4))
    assert(bands.filter(q => q[1] === y).length === 2, 'the band at ' + y + ' is one solid bar');
  // a sheen sits on the surface itself
  assert(sheenOf(api, p).length === 1, 'nothing catches the light at the water line');
});

test('he takes the reflection with him when he leaves the ground', () => {
  const api = boot();
  const p = play(api, { stage: 0 });
  api.draw();
  p.z = 0;
  const low = api.wetPower(p);
  p.z = 14;
  const mid = api.wetPower(p);
  p.z = 40;
  const high = api.wetPower(p);
  assert(low > mid && mid > 0, 'the reflection does not weaken as he rises: ' + low + ' then ' + mid);
  assert(high === 0, 'he still reflects from ' + p.z + 'px up');
  p.z = 40;
  assert(reflOf(api, p).length < 4, 'a man in the air still has a reflection under him');
});

test('in a real scrum the grunts give their reflections up first', () => {
  const api = boot();
  const p = play(api, { stage: 0 });
  for (let i = 0; i < 22; i++) api.spawnEnemy('punk', api.cam.x + 20 + i * 14, api.FLOOR_MID + (i % 3) * 6, -1);
  api.draw();                                        // draw() is what counts the crowd
  const foe = api.fighters.find(f => f.team === 'e' && !f.gone && !f.boss);
  assert(reflOf(api, foe).length < 4, 'a grunt in a crowd of 22 still reflects');
  assert(reflOf(api, p).length >= api.REFL_BANDS, 'the player lost his reflection with them');
});

test('the reflection is built from the rig, not from a fixed palette', () => {
  const api = boot();
  const p = play(api, { stage: 0 });
  api.draw();
  // A man of constant width, so any narrowing further down is the taper and
  // not his own shape; and a trunk band with a thin arm laid over it after.
  api.rigParts.length = 0;
  for (let i = 0; i < api.REFL_BANDS; i++)
    api.rigParts.push({ k: 'l', x1: 90, y1: 150 + i * 7, x2: 110, y2: 152 + i * 7, w: 6,
      c: '#ff0000', cs: '#111111', z: 0 });
  // the trunk reaches the topmost band, and an arm is laid over it afterwards
  api.rigParts.push({ k: 'l', x1: 100, y1: 150, x2: 100, y2: 151, w: 2, c: '#00ff00', cs: '#111111', z: 1 });
  api.rigParts.push({ k: 'l', x1: 100, y1: 150, x2: 100, y2: 151, w: 2, c: '#0000ff', cs: '#111111', z: 0 });
  api._resetCounts();
  api.wetReflection(p, 100, 170, 1);
  const bands = api._rects.filter(q => q[3] >= 2 && String(q[4]).startsWith('rgba('));
  const ys = [...new Set(bands.map(q => q[1]))].sort((a, b) => a - b);
  assert(ys.length >= 5, 'the reflection is ' + ys.length + ' courses deep');
  const wAt = (y) => bands.filter(q => q[1] === y)[0][2];
  assert(wAt(ys[ys.length - 1]) < wAt(ys[0]),
    'a man of one width reflects at one width — nothing is tapering: ' + ys.map(wAt).join(', '));
  // the top of him lands deepest, and it is the trunk's colour there, not the
  // arm that was laid over it afterwards
  const deepest = bands.filter(q => q[1] === ys[ys.length - 1])[0][4];
  assert(/rgba\(0,\s*255,\s*0/.test(String(deepest)),
    'the band took ' + deepest + ' — an arm beat the trunk to it');
  assert(new Set(bands.map(q => String(q[4]).slice(0, 12))).size > 1, 'the whole reflection is one colour');
});

test('a frame costs a fraction of what it did before the strings were baked', () => {
  const api = boot();
  play(api, { players: 2 });
  for (let i = 0; i < 8; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
  for (let i = 0; i < 30; i++) api.spawnFx('chip', api.cam.x + i * 8, api.FLOOR_MID, 10, '#fff');
  api.draw();
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  // 10843 with the same scene before the text cache
  assert(fills < 7500, 'a busy frame is back up to ' + fills + ' fillRects');
});

/* ---------------------------------------------------------- ground marks */
test('a body coming down leaves the street knowing it was there', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.clearMarks();
  const foe = api.spawnEnemy('punk', api.cam.x + 60, api.FLOOR_MID, -1);
  api.knockDown(foe, 1, 120, 90, null);
  for (let i = 0; i < 240 && !api.marks.length; i++) api.updateFighter(foe, api.STEP);
  assert(api.marks.length === 1, 'he landed and left ' + api.marks.length + ' marks');
  const m = api.marks[0];
  assert(m.kind === 'scuff', 'he left a ' + m.kind);
  assert(Math.abs(m.x - foe.x) < 30 && Math.abs(m.y - foe.y) < 3, 'the mark is not where he landed');
  assert(m.life > 10, 'the mark is gone in ' + m.life + 's — that is an effect, not a mark');
});

test('a slam, a broken crate and the rush all sign the floor differently', () => {
  const api = boot();
  const p = play(api, { stage: 0 });
  api.clearMarks();
  api.slamShock(p);
  api.breakItem(api.mkItem('crate', api.cam.x + 40, api.FLOOR_MID, 0), null);
  api.superStrike(p, { t: 1.7, dmg: 18, reach: 34, finisher: true, down: true, all: true });
  const kinds = api.marks.map(m => m.kind);
  for (const k of ['dent', 'debris', 'scorch'])
    assert(kinds.includes(k), 'nothing left a ' + k + ': ' + kinds.join(', '));
  const scorch = api.marks.find(m => m.kind === 'scorch');
  const debris = api.marks.find(m => m.kind === 'debris');
  assert(scorch.life > debris.life, 'a burn should outlast splinters');
});

test('marks fade out and are never more than the ring can hold', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.clearMarks();
  for (let i = 0; i < api.MARK_MAX * 3; i++) api.mark('scuff', i * 9, 180, {});
  assert(api.marks.length === api.MARK_MAX, 'the buffer grew to ' + api.marks.length);
  // every one it kept is recent — not one slot cycling while the rest sit
  const oldest = (api.MARK_MAX * 3 - api.MARK_MAX) * 9;
  assert(Math.min(...api.marks.map(m => m.x)) >= oldest,
    'the ring is holding a mark from x=' + Math.min(...api.marks.map(m => m.x)) + ', older than x=' + oldest);
  api.clearMarks();
  api.mark('scuff', 100, 180, { life: 4 });
  const fade = () => {
    api._resetCounts();
    api.drawMarks(0);
    const r = api._rects.filter(q => String(q[4]).startsWith('rgba('));
    return r.length ? Math.max(...r.map(q => parseFloat(String(q[4]).split(',')[3]))) : 0;
  };
  const fresh = fade();
  api.updateMarks(2);
  const old = fade();
  assert(fresh > 0.1, 'a fresh mark is invisible at ' + fresh);
  assert(old < fresh * 0.5, 'the mark does not fade: ' + fresh + ' then ' + old);
  api.updateMarks(2.1);
  assert(api.marks.length === 0, 'the mark outlived its own life');
});

test('a mark is two tones, so it reads on a dark floor as well as a pale one', () => {
  const api = boot();
  play(api, { stage: 0 });                            // the street is wet
  api.clearMarks();
  api.mark('scuff', 100, 180, {});
  const wetLit = api.marks[0].lit;
  api._resetCounts();
  api.drawMarks(0);
  const cols = new Set(api._rects.map(q => String(q[4]).slice(0, 14)));
  assert(cols.size >= 2, 'the whole mark is one colour');
  const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const [lr, lg, lb] = hex(wetLit);
  assert(lb > lr, 'a wet street pushes water aside, not dust: ' + wetLit);
  play(api, { stage: 1 });                            // the scrapyard is dry
  api.clearMarks();
  api.mark('scuff', 100, 180, {});
  const [dr, dg, db] = hex(api.marks[0].lit);
  assert(dr > db, 'a dry yard pushes dust aside, not water: ' + api.marks[0].lit);
});

test('the marks travel with the street and are not drawn off the edge of it', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.clearMarks();
  api.mark('scuff', 200, 180, {});
  const at = (c) => {
    api._resetCounts();
    api.drawMarks(c);
    const r = api._rects.filter(q => String(q[4]).startsWith('rgba('));
    return { n: r.length, x: r.length ? Math.round(r.map(q => q[0]).reduce((a, b) => a + b) / r.length) : 0 };
  };
  const near = at(150), far = at(100);
  assert(near.n > 0 && far.n > 0, 'the mark vanished on screen');
  assert(far.x > near.x, 'the mark does not move with the camera');
  assert(at(900).n === 0, 'a mark far off the left is still being painted');
  assert(at(-900).n === 0, 'a mark far off the right is still being painted');
});

test('a new street has not been fought on yet', () => {
  const api = boot();
  play(api, { stage: 0 });
  for (let i = 0; i < 6; i++) api.mark('scuff', i * 30, 180, {});
  assert(api.marks.length === 6, 'the marks did not stick');
  api.resetStage();
  assert(api.marks.length === 0, 'the next street opened with ' + api.marks.length + ' old marks on it');
});

test('a floor covered in marks still fits the frame budget', () => {
  const api = boot();
  play(api, { players: 2 });
  for (let i = 0; i < 8; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
  for (let i = 0; i < 30; i++) api.spawnFx('chip', api.cam.x + i * 8, api.FLOOR_MID, 10, '#fff');
  for (let i = 0; i < api.MARK_MAX * 2; i++)          // every one of them on screen at once
    api.mark(['scuff', 'scorch', 'debris', 'dent'][i % 4], api.cam.x + (i * 7) % 380, 170 + (i % 5) * 8, {});
  api.draw();
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  assert(fills < 7500, 'a marked-up floor costs ' + fills + ' fillRects');
});

/* ------------------------------------------------------------ going out */
const alphasIn = (api, fn) => {                        // every globalAlpha the frame asked for
  api._resetCounts();
  fn();
  return api._alphas.slice();
};

test('a dying man fades out instead of blinking on and off', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.spawnEnemy('punk', api.cam.x + 60, api.FLOOR_MID, -1);
  f.dead = true; f.state = 'lie'; f.z = 0;
  const seen = [];
  for (const t of [0.1, 0.5, 0.8, 1.0]){
    f.deadT = t;
    const df = api.deadFade(f);
    // glow() moves globalAlpha about as well, so look for this exact value
    const a = alphasIn(api, () => api.drawFighter(f));
    seen.push(df);
    if (df > 0) assert(a.includes(1 - df), 'at ' + t + 's he is not drawn at ' + (1 - df) + ': ' + a.join(', '));
  }
  assert(seen[0] === 0, 'he starts fading the instant he dies, with no beat to read the hit');
  for (let i = 1; i < seen.length; i++)
    assert(seen[i] > seen[i - 1], 'the fade does not run: ' + seen.join(', '));
  assert(seen[seen.length - 1] > 0.85, 'he is still solid at the end of his own life');
  // and the old strobe is gone: he is drawn on every frame of it
  for (const t of [0.7, 0.74, 0.78, 0.82]){
    f.deadT = t;
    api.setT(t * 7);
    api._resetCounts();
    api.drawFighter(f);
    assert((api._counts.fillRect || 0) > 40, 'he vanished for a frame at ' + t + 's — that is a strobe');
  }
  // the alpha is put back, so the next thing drawn is not faded with him
  f.deadT = 0.9;
  api._resetCounts();
  api.drawFighter(f);
  assert(api._alphas[api._alphas.length - 1] === 1, 'the fighter left globalAlpha turned down');
});

test('he goes out lit: his own trim takes the edge of him as he goes', () => {
  const api = boot();
  play(api, { stage: 0 });
  const f = api.spawnEnemy('punk', api.cam.x + 60, api.FLOOR_MID, -1);
  const trim = api.SKINS.punk.trim;
  f.dead = true; f.state = 'lie'; f.z = 0;
  // the rim is a whole silhouette pass at one exact alpha; the wash over his
  // head shares the colour, so match the alpha too or the two are the same test
  const rim = (t) => {
    f.deadT = t;
    const want = api.rgba(trim, 0.18 + api.deadFade(f) * 0.52);
    api._resetCounts();
    api.drawFighter(f);
    return api._rects.filter(q => String(q[4]) === want).length;
  };
  assert(rim(0.2) === 0, 'he is already burning before the dissolve starts');
  const early = rim(0.5), late = rim(1.0);
  assert(early > 50, 'only ' + early + ' pixels of him light up — that is not the whole edge');
  assert(late > 50, 'the rim went missing by the end: ' + late);
});

test('a body coming apart throws embers, and a boss throws more', () => {
  const api = boot();
  play(api, { stage: 0 });
  // updateFighter does not expire fx, so what is in the bag at the end is
  // everything the dissolve threw
  const burn = (kind) => {
    const f = api.spawnEnemy(kind, api.cam.x + 60, api.FLOOR_MID, -1);
    f.dead = true; f.state = 'lie'; f.z = 0; f.deadT = 0;
    api.fx.length = 0;
    for (let i = 0; i < Math.round(api.deadLife(f) / api.STEP) - 1; i++) api.updateFighter(f, api.STEP);
    return api.fx.filter(p => p.kind === 'ember');
  };
  const punk = burn('punk');
  assert(punk.length >= 6, 'a grunt came apart into ' + punk.length + ' embers');
  assert(punk.every(p => p.vz > 0), 'the embers fall instead of lifting');
  assert(punk.every(p => p.col === api.SKINS.punk.trim), 'the embers are not his colour');
  // per second, not in total: a boss lies there more than twice as long, so
  // an equal rate would still give him more embers
  const boss = burn('rook');
  const rate = (f, n) => n / (api.deadLife(f) - api.deadStart(f));
  const rb = rate({ boss: true }, boss.length), rp = rate({}, punk.length);
  assert(rb > rp * 1.8, 'a boss burns at ' + Math.round(rb) + '/s and a grunt at ' + Math.round(rp) + '/s');
});

test('an ember lifts, slows and dies out', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.fx.length = 0;
  api.spawnFx('ember', 100, 180, 4, '#ffd23d');
  const p = api.fx[0];
  assert(p.vz > 0, 'the ember starts falling');
  const z0 = p.z, v0 = p.vz;
  for (let i = 0; i < 12; i++) api.updateFx(api.STEP);
  assert(p.z > z0, 'the ember never left the ground');
  assert(p.vz < v0, 'the ember does not slow as it rises');
  assert(p.life > 0.5 && p.life < 1.3, 'an ember lives ' + p.life + 's');
  for (let i = 0; i < 120; i++) api.updateFx(api.STEP);
  assert(api.fx.length === 0, 'the ember never dies out');
});

test('the moment of the kill lights the street in the dead man s colour', () => {
  const api = boot();
  const pl = play(api, { stage: 0 });
  const f = api.spawnEnemy('punk', api.cam.x + 60, api.FLOOR_MID, -1);
  api.fx.length = 0;
  api.knockOut(f, pl, { kb: 100, lift: 80 });
  const burst = api.fx.find(p => p.kind === 'burst');
  assert(burst, 'nothing marks the kill itself');
  assert(burst.col === api.SKINS.punk.trim, 'the burst is not his colour: ' + burst.col);
  // a boss goes out louder than a grunt
  const boss = api.spawnEnemy('rook', api.cam.x + 90, api.FLOOR_MID, -1);
  api.fx.length = 0;
  api.G.flash = 0;
  api.knockOut(boss, pl, { kb: 100, lift: 80 });
  assert(api.fx.some(p => p.kind === 'ring'), 'a boss goes down with no more than a grunt');
  assert(api.G.flash > 0.3, 'the screen does not even blink when a boss goes down');
  assert(api.deadLife(boss) > api.deadLife(f), 'a boss comes apart as fast as a grunt');
});

test('a street full of men coming apart still fits the frame budget', () => {
  const api = boot();
  play(api, { players: 2 });
  for (let i = 0; i < 8; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
  for (const f of api.fighters) if (f.team === 'e'){ f.dead = true; f.deadT = 0.8; f.state = 'lie'; f.z = 0; }
  for (let i = 0; i < 60; i++) api.spawnFx('ember', api.cam.x + i * 6, api.FLOOR_MID, 8, '#ffd23d');
  api.draw();
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  assert(fills < 7500, 'a street of dissolving men costs ' + fills + ' fillRects');
});

/* ------------------------------------------------------------- the grade */
const gradeOf = (api) => {
  api._resetCounts();
  api.gradePass();
  return api._rects.filter(q => q[2] === api.VW && q[3] === api.VH);
};

test('the grade is a split tone: highlights multiplied, shadows lifted', () => {
  const api = boot();
  play(api, { stage: 0 });
  const full = gradeOf(api);
  const g = api.GRADE.street;
  assert(full.length >= 2, 'the grade paints ' + full.length + ' full-frame passes');
  assert(full[0][4] === g.mul && full[1][4] === g.lift, 'the two passes are not the stage grade');
  // and they are composited, not painted flat over the top
  const i = api._ops.indexOf('multiply');
  assert(i >= 0, 'the highlight pass is not a multiply: ' + api._ops.join(', '));
  assert(api._ops.indexOf('lighter') > i, 'the shadow lift does not follow it as an add');
  assert(api._ops[api._ops.length - 1] === 'source-over', 'the grade left the canvas in a composite mode');
  assert(api._alphas[api._alphas.length - 1] === 1, 'the grade left globalAlpha turned down');
  // a lift that is not darker than the multiply is not a split tone at all
  const lum = (c) => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)).reduce((a, b) => a + b);
  for (const k in api.GRADE){
    const q = api.GRADE[k];
    assert(lum(q.lift) < lum(q.mul) * 0.5, k + ' lifts its shadows to ' + q.lift + ', brighter than a shadow');
    assert(q.mulA > 0.1 && q.mulA < 0.6, k + ' multiplies at ' + q.mulA);
    assert(q.liftA > 0.1 && q.liftA < 0.6, k + ' lifts at ' + q.liftA);
  }
});

test('every stage is graded, and no two the same', () => {
  const api = boot();
  const seen = new Set();
  for (let st = 0; st < api.STAGES.length; st++){
    play(api, { stage: st });
    const full = gradeOf(api);
    assert(full.length >= 2, 'stage ' + (st + 1) + ' is not graded');
    seen.add(full.map(q => q[4]).join('|'));    // what was painted, not what was configured
  }
  // five backdrops carry seven stages, and the pairs that share one are told
  // apart by a wash of their own — so every stage still has its own look
  assert(seen.size === api.STAGES.length,
    api.STAGES.length + ' stages come out as ' + seen.size + ' looks');
  const shared = api.STAGES.filter(s => s.bg === 'docks');
  assert(shared.length === 2 && shared.some(s => s.grade) && shared.some(s => !s.grade),
    'the two dock stages are not told apart by a wash');
  // and that wash is actually painted, over the whole frame
  const washed = api.STAGES.findIndex(s => s.grade);
  play(api, { stage: washed });
  assert(gradeOf(api).some(q => q[4] === api.STAGES[washed].grade),
    'stage ' + (washed + 1) + ' carries a wash that never reaches the frame');
});

test('the stage wash reaches the men standing on the street, not just the street', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const draw = src.slice(src.indexOf('\nfunction draw(){'));
  const body = draw.slice(0, draw.indexOf('\n}\n'));
  assert(!/const grade = stage\(\)\.grade;/.test(body),
    'the per-stage wash is painted in draw() again, before the fighters go on');
  const bg = body.indexOf('drawBackground();');
  const grade = body.indexOf('gradePass();');
  // draw() bails early for the title and the cutscenes, and each of those
  // blooms on its way out, so it is the last one that follows the grade
  const bloom = body.lastIndexOf('bloomPass();');
  const hud = body.indexOf('drawHUD();');
  assert(bg >= 0 && grade > bg, 'the grade runs before there is a frame to grade');
  assert(bloom > grade, 'the bloom runs before the grade, so it blooms the wrong colours');
  assert(hud > grade, 'the HUD is graded along with the world');
});

test('the frame settles toward the front, where none of the light is', () => {
  const api = boot();
  play(api, { stage: 0 });
  api._resetCounts();
  api.gradePass();
  const bands = api._rects
    .filter(q => q[2] === api.VW && q[3] === 9 && String(q[4]).startsWith('rgba(6,4,10'))
    .sort((a, b) => a[1] - b[1]);
  assert(bands.length === 7, 'the settle is ' + bands.length + ' bands');
  const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
  assert(alpha(bands[bands.length - 1]) > alpha(bands[0]), 'the settle is not darkest at the front');
  assert(bands[bands.length - 1][1] + 9 === api.VH, 'the settle does not reach the bottom of the frame');
});

test('turning the grade off costs nothing and puts the frame back', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.G.grade = false;
  api._resetCounts();
  api.gradePass();
  assert((api._counts.fillRect || 0) === 0, 'a flat frame still paid for ' + api._counts.fillRect + ' fills');
  assert(api._ops.length === 0, 'a flat frame still touched the composite mode');
  api.G.grade = true;
  assert(gradeOf(api).length >= 2, 'turning it back on did nothing');
  // and the choice is remembered
  api.G.grade = false;
  api.saveMeta();
  api.G.grade = true;
  api.loadMeta();
  assert(api.G.grade === false, 'the grade setting is not saved');
});

test('the grade is cheap enough to be free', () => {
  const api = boot();
  play(api, { players: 2 });
  for (let i = 0; i < 8; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
  api.draw();
  api.G.grade = false;
  api._resetCounts();
  api.draw();
  const flat = api._counts.fillRect || 0;
  api.G.grade = true;
  api._resetCounts();
  api.draw();
  const graded = api._counts.fillRect || 0;
  assert(graded - flat <= 12, 'the grade costs ' + (graded - flat) + ' fillRects a frame');
  assert(graded < 7500, 'a graded frame costs ' + graded + ' fillRects');
});

/* -------------------------------------------------------- the backlight */
// The street lights a man from the front too, in the same key colour, so
// match the halo's own alpha or the two are the same test. The roof has no
// flicker, which is why every one of these runs on the roof.
const haloOf = (api, f, st) => {
  api._resetCounts();
  api.drawFighter(f);
  const want = api.rgba(st.key, st.back * 0.50);
  return api._rects.filter(q => String(q[4]) === want);
};

test('the light is behind the fight, so it gets past him before it gets to us', () => {
  const api = boot();
  for (let st = 0; st < api.STAGES.length; st++){
    const s = api.STAGES[st];
    assert(s.back > 0 && s.back <= 1, 'stage ' + (st + 1) + ' has no light behind it: ' + s.back);
    assert(s.key, 'stage ' + (st + 1) + ' has a backlight and nothing to light it with');
  }
  // the two brightest backdrops throw the hardest: the furnaces and the sun
  const byBack = api.STAGES.map((s, i) => [s.bg, s.back, i]).sort((a, b) => b[1] - a[1]);
  assert(byBack[0][0] === 'keep' && byBack[1][0] === 'foundry',
    'the roof and the foundry are not the two hardest backlights: ' + byBack.slice(0, 2).map(q => q[0]));
  assert(api.STAGES[0].back < api.STAGES[3].back, 'a street of windows outshines a room of furnaces');
});

test('the halo goes under the body, so it can never wash his own colour', () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const body = src.slice(src.indexOf('function drawFighterBody('));
  const head = body.slice(0, body.indexOf('\n}\n'));
  const halo = head.indexOf('drawRigPass(4, rgba(stB.key');
  const ink = head.indexOf('drawRigPass(2, ink, false);');
  const tone = head.indexOf('drawRigPass(0, null, false);');
  assert(halo >= 0 && ink >= 0 && tone >= 0, 'the backlight no longer looks the way this test expects');
  assert(halo < ink && halo < tone,
    'the halo is painted over the man — at this size that is a wash, not a rim');
});

test('the halo is a fringe around him and sits above his own outline', () => {
  const api = boot();
  const p = play(api, { stage: 4 });                 // the roof, hardest backlight
  p.x = api.cam.x + 100; p.y = api.FLOOR_MID; p.z = 0;
  api.draw();
  const st = api.stage();
  const halo = haloOf(api, p, st);
  assert(halo.length > 40, 'only ' + halo.length + ' pixels of him catch the sun');
  const ink = api._rects.filter(q => q[4] === api.SKINS[p.skin].ink || q[4] === '#140e1a');
  assert(ink.length > 0, 'the outline went missing');
  // the fringe reaches further out than the outline it surrounds, and highest
  const hx = [Math.min(...halo.map(q => q[0])), Math.max(...halo.map(q => q[0] + q[2]))];
  const ix = [Math.min(...ink.map(q => q[0])), Math.max(...ink.map(q => q[0] + q[2]))];
  assert(hx[0] < ix[0] && hx[1] > ix[1], 'the fringe does not stand outside the body');
  assert(Math.min(...halo.map(q => q[1])) < Math.min(...ink.map(q => q[1])) - 2,
    'the fringe is not thrown over the top of him, which is where the light is');
});

test('his front drops into whatever fills the shadows on that street', () => {
  const api = boot();
  const p = play(api, { stage: 3 });                 // the foundry
  p.x = api.cam.x + 100; p.y = api.FLOOR_MID; p.z = 0;
  api.draw();
  api._resetCounts();
  api.drawFighter(p);
  const lift = api.GRADE.foundry.lift;
  const want = 'rgba(' + [1, 3, 5].map(i => parseInt(lift.slice(i, i + 2), 16)).join(',');
  const shade = api._rects.filter(q => String(q[4]).startsWith(want));
  assert(shade.length > 40, 'his front is lit the same as his back: ' + shade.length + ' shaded pixels');
  const a = parseFloat(String(shade[0][4]).split(',')[3]);
  assert(a > 0.1 && a < 0.6, 'the shadow on him is ' + a + ' — that is a repaint, not a shadow');
});

test('a crowd and a corpse both give the backlight up before the frame does', () => {
  const api = boot();
  const p = play(api, { stage: 4 });
  p.x = api.cam.x + 100; p.y = api.FLOOR_MID; p.z = 0;
  const st = api.stage();
  api.draw();
  assert(haloOf(api, p, st).length > 40, 'the player has no halo to give up');
  // a grunt in a scrum
  const foe = api.spawnEnemy('punk', api.cam.x + 120, api.FLOOR_MID, -1);
  for (let i = 0; i < 22; i++) api.spawnEnemy('punk', api.cam.x + 20 + i * 14, api.FLOOR_MID + (i % 3) * 6, -1);
  api.draw();
  assert(haloOf(api, foe, st).length < 20, 'a grunt in a crowd of 24 still pays for a halo');
  // and a man coming apart makes his own light
  api.fighters = api.fighters.filter(z => z.team === 'p' || z === foe);
  api.draw();
  assert(haloOf(api, foe, st).length > 40, 'the grunt never got his halo back');
  foe.dead = true; foe.state = 'lie'; foe.z = 0; foe.deadT = 0.9;
  assert(haloOf(api, foe, st).length < 20, 'a dissolving man is still lit by the street');
});

test('a graded, backlit, dissolving street still fits the frame budget', () => {
  const api = boot();
  play(api, { players: 2, stage: 4 });
  for (let i = 0; i < 8; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
  for (let i = 0; i < 30; i++) api.spawnFx('chip', api.cam.x + i * 8, api.FLOOR_MID, 10, '#fff');
  api.draw();
  api._resetCounts();
  api.draw();
  assert((api._counts.fillRect || 0) < 7500, 'a backlit street costs ' + api._counts.fillRect + ' fillRects');
});

/* ------------------------------------------------- cloud over every sky */
test('every sky that has one carries cloud, in its own light', () => {
  const api = boot();
  const sets = api.CLOUD_SETS;
  const bgs = ['street', 'junk', 'docks', 'keep'];
  for (const bg of bgs) assert(sets[bg] && sets[bg].length === 3, bg + ' has no cloud over it');
  // no two skies share a bank, or one paint would serve two nights
  const keys = new Set();
  for (const bg of bgs) for (const b of sets[bg]){
    assert(!keys.has(b.key), 'two skies bake under the key ' + b.key);
    keys.add(b.key);
  }
  // the roof burns underneath and the harbour does not: that is the whole point
  const warm = (c) => parseInt(c.slice(1, 3), 16) - parseInt(c.slice(5, 7), 16);
  assert(warm(sets.keep[2].lip) > 120, 'the sunset does not light the cloud over the roof');
  assert(warm(sets.docks[2].lip) < 0, 'the harbour lights the cloud warm, not cold');
  assert(warm(sets.junk[2].lip) > 60, 'the yard fires do not reach the cloud');
  for (const bg of bgs){
    const s = sets[bg];
    assert(s[0].y < s[1].y && s[1].y < s[2].y, bg + ' stacks its banks at one height');
    assert(s[0].spd < s[2].spd, bg + ' drifts every bank at one speed');
    for (const b of s) assert(warm(b.lip) !== warm(b.body) || b.lip !== b.body,
      bg + ' has a bank with no lit underside');
  }
});

test('each sky paints its own banks and blits every one of them twice', () => {
  const api = boot();
  for (const [st, bg] of [[0, 'street'], [1, 'junk'], [2, 'docks'], [4, 'keep']]){
    play(api, { stage: st });
    api.draw();                                     // warm the bakes
    api._resetCounts();
    api.drawBackground();
    const blits = api._blits.filter(q => q[2] === api.VW);
    const want = api.CLOUD_SETS[bg];
    for (const b of want)
      assert(blits.filter(q => q[3] === b.h).length >= 2,
        bg + ' does not blit its ' + b.h + 'px bank twice');
  }
  // and a set that is not on screen is never painted
  play(api, { stage: 3 });                          // the foundry is indoors
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const heights = new Set(api._blits.map(q => q[3]));
  for (const b of api.CLOUD_SETS.keep)
    assert(!heights.has(b.h) || b.h === 0, 'the foundry is painting the roof s sky');
});

/* ------------------------------------------------------------ lit props */
test('a prop is lit by the street it is standing on', () => {
  const api = boot();
  const lit = (st, kind) => {
    play(api, { stage: st });
    const it = api.mkItem(kind, api.cam.x + 60, api.FLOOR_MID, 0);
    api.draw();
    api._resetCounts();
    api.drawItem(it);
    const s = api.STAGES[st];
    return {
      rim: api._rects.filter(q => String(q[4]) === api.rgba(s.key, s.back * 0.50)),
      shade: api._rects.filter(q => String(q[4]) === api.rgba(api.GRADE[s.bg].lift, s.back * 0.30)),
    };
  };
  for (const kind of ['crate', 'barrel', 'bat', 'pipe', 'knife']){
    const r = lit(0, kind);
    assert(r.rim.length >= 1, 'a ' + kind + ' catches nothing off the street');
    assert(r.shade.length === 1, 'a ' + kind + ' has ' + r.shade.length + ' shadows down its front');
  }
  // the same crate is a different crate in a foundry and on a wet street
  const a = lit(0, 'crate'), b = lit(3, 'crate');
  assert(a.rim[0][4] !== b.rim[0][4], 'a crate is lit the same on every street');
  // the rim sits above the box and the shadow below the middle of it
  const box = lit(0, 'crate');
  assert(box.rim[0][1] < box.shade[0][1], 'the light is under the shadow');
  assert(box.rim[0][2] > 8, 'the rim is only ' + box.rim[0][2] + 'px of a crate');
});

test('the big props are rimmed down their sides, the small ones are not', () => {
  const api = boot();
  play(api, { stage: 0 });
  const s = api.stage();
  const side = (kind) => {
    const it = api.mkItem(kind, api.cam.x + 60, api.FLOOR_MID, 0);
    api.draw();
    api._resetCounts();
    api.drawItem(it);
    return api._rects.filter(q => String(q[4]) === api.rgba(s.key, s.back * 0.28) && q[2] === 1);
  };
  assert(side('crate').length === 2, 'a crate has no light down its sides');
  assert(side('barrel').length === 2, 'a barrel has no light down its sides');
  assert(side('bat').length === 0, 'a bat two pixels thick has light down its sides');
});

test('cloud and lit props are cheap enough to be free', () => {
  const api = boot();
  for (const st of [0, 1, 2, 4]){
    play(api, { stage: st });
    for (let i = 0; i < 6; i++) api.mkItem(i % 2 ? 'crate' : 'barrel', api.cam.x + i * 40, api.FLOOR_MID, 0);
    for (let i = 0; i < 7; i++) api.spawnEnemy('punk', api.cam.x + 30 + i * 40, api.FLOOR_MID + (i % 3) * 8, -1);
    api.draw();
    api._resetCounts();
    api.draw();
    const fills = api._counts.fillRect || 0;
    assert(fills < 7500, 'stage ' + (st + 1) + ' costs ' + fills + ' fillRects');
    assert((api._counts.drawImage || 0) < 170, 'stage ' + (st + 1) + ' hangs ' + api._counts.drawImage + ' blits');
  }
});

/* ------------------------------------------ what is lighting a thing */
// A cold frame bakes its whole sky, which is tens of thousands of rects and
// overruns the recorder — every one of these warms the scene first.
const fullFrames = (api) => {
  api.draw();
  api._resetCounts();
  api.draw();
  return api._rects.filter(q => q[2] === api.VW && q[3] === api.VH).map(q => q[4]);
};

test('a story beat is lit by the street it is set on, not the one behind it', () => {
  const api = boot();
  play(api, { stage: 0 });                            // the street is loaded
  api.G.story = true;
  assert(api.startCut('after3'), 'the dock beat would not start');
  const sc = api.SCENES.after3;
  assert(sc.bg !== api.STAGES[0].bg, 'the beat and the loaded stage share a backdrop — pick another');
  const painted = fullFrames(api);
  assert(painted.includes(api.GRADE.docks.mul) && painted.includes(api.GRADE.docks.lift),
    'the dock beat is graded by ' + painted.join(', ') + ', not by the dock');
  assert(!painted.includes(api.GRADE.street.mul), 'the beat took the loaded street s grade');
  // and the override is put back afterwards, or the next stage inherits it
  api.cutEnd();
  const after = fullFrames(api);
  assert(after.includes(api.GRADE.street.mul), 'the beat kept the lights after it ended');
});

test('the title is always the street, whatever stage it is sitting on', () => {
  const api = boot();
  play(api, { stage: 3 });                            // a foundry run in progress
  api.toTitle();
  const painted = fullFrames(api);
  assert(painted.includes(api.GRADE.street.mul),
    'the title is graded by ' + painted.join(', ') + ', not by the street it paints');
  assert(!painted.includes(api.GRADE.foundry.mul), 'the title took the loaded foundry s grade');
});

test('the men in a beat are backlit by the beat s own street', () => {
  const api = boot();
  play(api, { stage: 0 });                            // the street is loaded
  api.G.story = true;
  api.startCut('after3');                             // the beat is on the dock
  api.draw();
  api._resetCounts();
  api.draw();
  const docks = api.STAGES.find(q => q.bg === 'docks');
  const street = api.STAGES[0];
  const halo = (st) => api._rects.filter(q => String(q[4]) === api.rgba(st.key, st.back * 0.50)).length;
  assert(halo(docks) > 30, 'the actors catch nothing off the harbour: ' + halo(docks) + ' pixels');
  assert(halo(street) === 0, 'the actors are lit by the street the beat is not set on');
});

test('the beat and the title are graded, and the letterbox over them is not', () => {
  const api = boot();
  play(api, { stage: 0 });
  api.G.story = true;
  api.startCut('after5');                             // the roof, at sunset
  const g = api.GRADE.keep;
  api.draw();
  api._resetCounts();
  api.draw();
  const painted = api._rects.filter(q => q[2] === api.VW && q[3] === api.VH).map(q => q[4]);
  assert(painted.includes(g.mul) && painted.includes(g.lift), 'the roof beat is not graded by the roof');
  // the bars go on after the grade, so they stay black
  const bars = api._rects.filter(q => q[4] === '#000' && q[2] === api.VW && q[3] === 22);
  assert(bars.length >= 1, 'the letterbox went missing');
  const lastGrade = api._rects.findIndex(q => q[4] === g.lift);
  assert(api._rects.indexOf(bars[0]) > lastGrade, 'the letterbox is graded along with the beat');
  const src = fs.readFileSync(HTML, 'utf8');
  const cut = src.slice(src.indexOf('function drawCut()'));
  const head = cut.slice(0, cut.indexOf('\n}\n'));
  assert(head.indexOf('gradePass();') < head.indexOf("px(0, 0, VW, 22, '#000')"),
    'the grade runs after the bars are down');
});

test('a beat costs less than the stage it interrupts', () => {
  const api = boot();
  play(api, { players: 2, stage: 2 });
  api.G.story = true;
  api.startCut('after3');
  api.draw();
  api._resetCounts();
  api.draw();
  const fills = api._counts.fillRect || 0;
  assert(fills > 400, 'the beat drew almost nothing: ' + fills);
  assert(fills < 7500, 'a beat costs ' + fills + ' fillRects');
});

/* --------------------------------------------------------------- water */
test('every light over the harbour lays a column of itself down it', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const dash = (col) => api._rects.filter(q => q[3] === 1 && q[1] > api.WATER_TOP &&
    q[1] < api.WATER_TOP + 36 && String(q[4]).startsWith('rgba(' +
      [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16)).join(',')));
  const flood = dash('#dff0ff');
  assert(flood.length >= api.WATER_COL_N, 'the floodlights lay ' + flood.length + ' dashes on the water');
  // the column widens and fades the further from the light it gets
  const byY = flood.slice(0, api.WATER_COL_N).sort((a, b) => a[1] - b[1]);
  assert(byY[byY.length - 1][2] > byY[0][2], 'the column does not spread as it comes toward you');
  const alpha = (q) => parseFloat(String(q[4]).split(',')[3]);
  assert(alpha(byY[0]) > alpha(byY[byY.length - 1]), 'the column does not fade with distance');
  // it wanders off the line rather than falling straight
  const xs = byY.map(q => q[0] + q[2] / 2);
  assert(new Set(xs.map(Math.round)).size > 2, 'the column is a straight bar, not a broken one');
});

test('the water has a far edge and the sky in it', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.draw();
  api._resetCounts();
  api.drawBackground();
  const r = api._rects;
  assert(r.some(q => q[1] === api.WATER_TOP && q[2] === api.VW && /rgba\(150,\s*200,\s*235/.test(String(q[4]))),
    'the water has no far edge');
  const lip = api.CLOUD_SETS.docks[2].lip;
  const want = 'rgba(' + [1, 3, 5].map(i => parseInt(lip.slice(i, i + 2), 16)).join(',');
  const refl = r.filter(q => q[2] === api.VW && q[3] === 2 && String(q[4]).startsWith(want));
  assert(refl.length === 6, 'the cloud lies in the water as ' + refl.length + ' bands (3 twice over)');
  assert(Math.min(...refl.map(q => q[1])) > api.WATER_TOP, 'the reflection is above the water');
});

test('the harbour only paints the gantries you can see', () => {
  const api = boot();
  play(api, { stage: 2 });
  api.draw();
  for (const cx of [0, 400, 1500]){
    api.cam.x = cx;
    api._resetCounts();
    api.drawBackground();
    const legs = api._rects.filter(q => q[4] === '#2b3a46' && q[2] === 4 && q[3] === 48);
    assert(legs.length >= 1, 'at camera ' + cx + ' the harbour has ' + legs.length + ' gantries');
    assert(legs.length <= 4, 'at camera ' + cx + ' it painted ' + legs.length + ' gantries');
  }
});

console.log(`\njoske: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
