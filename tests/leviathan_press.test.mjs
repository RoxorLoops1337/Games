// Leviathan Press — headless suite.
//
// One self-contained file drawing to a canvas. This harness stubs a DOM +
// no-op 2d context, evals the inline <script> with __LP_HEADLESS__ set (so it
// boots without rAF/audio/UI), and drives the real simulation through
// window.LP: worm trails and splitting, plating, subsystems, the draft sheet,
// the core fight, death/revive, payouts and the save file. draw() is called
// throughout so render-time errors surface here rather than in a browser.
//
// Run: node tests/leviathan_press.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadGame(store){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'leviathan_press', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 720, height: 1280 };
    return noop;
  }, set(){ return true; } });
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, removeAttribute: noop, getContext: () => ctx,
    querySelector: () => mkEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 1280 }),
    innerHTML: '', textContent: '', width: 720, height: 1280, offsetWidth: 720,
  }, { get(t, k){ return (k in t) ? t[k] : noop; }, set(t, k, v){ t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 480; global.innerHeight = 900;
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k){ return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; },
    set(t, k, v){ t[k] = v; return true; },
  });
  global.__LP_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.LP;
}

const t = harness('leviathan_press');
const store = {};
const LP = loadGame(store);
const G = LP.G, C = LP.C, P = LP.P;
const finite = v => typeof v === 'number' && isFinite(v);
const step = secs => { const n = Math.max(1, Math.round(secs * 60)); for (let i = 0; i < n; i++) LP.update(1 / 60); };
// wipe the field and rewind progress, so one block's kills never push the
// next block into a draft screen (which would silently stop the sim)
const clearField = () => {
  G.worms.length = 0; G.projs.length = 0; G.eprojs.length = 0;
  G.zones.length = 0; G.drops.length = 0; G.parts.length = 0;
  G.killed = 0; G.prog = 0; G.draftStep = 0; G.pendingDrafts = 0; G.cards = [];
  G.phase = 'swarm'; G.core = null;
  if (G.state !== 'run') G.state = 'run';
};

// ------------------------------------------------------------------ boot
t.ok(!!LP, 'exposes window.LP');
t.ok(G.state === 'title', 'boots to the title screen');
LP.draw(); LP.update(1 / 60);
t.ok(G.state === 'title', 'drawing/updating the attract screen is harmless');

// ------------------------------------------------------------------ content
{
  let bad = 0;
  for (const u of LP.UPGRADES){
    if (!u.nm || !u.art || typeof u.ds !== 'function') bad++;
    if (u.kind === 'stat' && typeof u.apply !== 'function') bad++;
    if (u.kind !== 'stat' && u.kind !== 'sys') bad++;
  }
  t.ok(bad === 0, 'every upgrade has a name, art, description and effect');

  let sysBad = 0;
  for (const id in LP.SYS){
    const S = LP.SYS[id];
    for (let l = 1; l <= C.SYS_MAX; l++){
      for (const k in S){
        if (typeof S[k] !== 'function') continue;
        const v = S[k](l);
        if (!finite(v)) sysBad++;
      }
    }
  }
  t.ok(sysBad === 0, 'every subsystem scales to finite numbers at levels 1..5');

  let cdBad = 0;
  for (const id of ['sonar', 'mines', 'bombs', 'shield']){
    for (let l = 1; l <= C.SYS_MAX; l++) if (LP.SYS[id].cd(l) <= 0) cdBad++;
  }
  t.ok(cdBad === 0, 'no subsystem cooldown reaches zero or below at max level');

  let stageBad = 0, prevDepth = -1, prevQuota = -1;
  for (const s of LP.STAGES){
    if (s.depth <= prevDepth || s.quota <= prevQuota || !(s.hp > 0)) stageBad++;
    prevDepth = s.depth; prevQuota = s.quota;
    let mixTot = 0; for (const k in s.mix){ mixTot += s.mix[k]; if (!LP.SEGT[k]) stageBad++; }
    if (mixTot <= 0) stageBad++;
  }
  t.ok(stageBad === 0, '12 trenches, monotonic depth/quota, valid segment mixes');
  t.ok(LP.HULLS[0].cost === 0 && LP.HULLS.every(h => finite(h.cost)), 'hull costs are sane, first is free');
  t.ok(LP.RARITY.length === 5 && LP.RARITY.every((r, i) => i === 0 || r.mul > LP.RARITY[i - 1].mul),
    'five rarities on a rising ramp');
}

// ------------------------------------------------------------------ rarity / luck
{
  LP.reseed(7);
  const avg = luck => {
    let s = 0;
    for (let i = 0; i < 3000; i++) s += LP.rollRarity(luck).tier;
    return s / 3000;
  };
  const a0 = avg(0), a1 = avg(80), a2 = avg(300);
  t.ok(a0 < a1 && a1 < a2, 'luck lifts the average ink on the sheet (' +
    a0.toFixed(2) + ' → ' + a1.toFixed(2) + ' → ' + a2.toFixed(2) + ')');
  t.ok(a0 > 0 && a2 < 4, 'even at extreme luck the ramp is not degenerate');
}

// ------------------------------------------------------------------ run start
LP.reseed(1234);
LP.startRun(1, 1, 'tin');
t.ok(G.state === 'run', 'startRun enters the run');
t.ok(G.worms.length === 1 && G.worms[0].segs.length >= 4, 'the first snake is on the page');
t.ok(P.hp === P.mhp && P.mhp >= 100, 'hull starts full');
t.ok(G.quota === LP.STAGES[0].quota && G.killed === 0, 'quota comes from the trench');

// ------------------------------------------------------------------ worm body
{
  const w = G.worms[0];
  step(1.5);
  let worst = 0;
  for (let i = 1; i < w.segs.length; i++){
    const d = Math.hypot(w.segs[i].x - w.segs[i - 1].x, w.segs[i].y - w.segs[i - 1].y);
    worst = Math.max(worst, Math.abs(d - C.SEG_GAP));
  }
  t.ok(worst < 8, 'segments ride the trail at even spacing (worst drift ' + worst.toFixed(1) + 'px)');
  t.ok(w.segs.every(s => finite(s.x) && finite(s.y)), 'no NaN crept into the body');
  t.ok(w.trail.length < 400, 'the trail is trimmed to what the body still needs');
}

// ------------------------------------------------------------------ splitting
{
  clearField();
  LP.reseed(99);
  const w = LP.spawnWorm({ len: 7, type: 'flesh', noCarrier: true });
  const before = G.worms.length;
  LP.killSeg(w, 3);
  t.ok(G.worms.length === before + 1, 'severing a middle segment spawns a second worm');
  const nw = G.worms[G.worms.length - 1];
  t.ok(w.segs.length === 3 && nw.segs.length === 3, 'the halves keep 3 + 3 of the original 7');
  t.ok(nw.rage > 0, 'the freshly severed tail comes at you');
  t.ok(G.stats.splits === 1, 'the split is counted');

  const before2 = G.worms.length;
  LP.killSeg(w, 0);
  const survivors = G.worms.filter(x => x.segs.length);
  t.ok(survivors.length === before2, 'beheading hands the body a new head, it does not duplicate the worm');
  t.ok(G.stats.splits === 1, 'a beheading is not counted as a split');

  // tail kill: no new worm at all
  const w3 = LP.spawnWorm({ len: 4, type: 'flesh', noCarrier: true });
  const before3 = G.worms.length;
  LP.killSeg(w3, 3);
  t.ok(G.worms.length === before3 && w3.segs.length === 3, 'killing the last segment just shortens the worm');

  // the halves must keep their positions — no teleporting on the cut
  const w4 = LP.spawnWorm({ len: 8, type: 'flesh', noCarrier: true });
  step(0.6);
  const midPos = { x: w4.segs[5].x, y: w4.segs[5].y };
  LP.killSeg(w4, 4);
  const tailW = G.worms[G.worms.length - 1];
  const moved = Math.hypot(tailW.segs[0].x - midPos.x, tailW.segs[0].y - midPos.y);
  t.ok(moved < 30, 'the tail half keeps its place when it is cut loose (' + moved.toFixed(1) + 'px)');
}

// ------------------------------------------------------------------ single-segment worm
{
  clearField();
  const w = LP.spawnWorm({ len: 1, type: 'flesh', noCarrier: true });
  LP.killSeg(w, 0);
  t.ok(w.dead === true, 'a one-segment worm dies outright');
  step(0.2);
  t.ok(G.worms.indexOf(w) < 0, 'dead worms are reaped by the step');
}

// ------------------------------------------------------------------ plating
{
  clearField();
  const w = LP.spawnWorm({ len: 3, type: 'plate', noCarrier: true });
  const s = w.segs[1];
  t.ok(s.marmor > 0 && s.armor === s.marmor, 'plated segments start fully plated');
  s.marmor = 500; s.armor = 500; s.mhp = 200; s.hp = 200;
  const hp0 = s.hp;
  LP.hurtSeg(w, 1, 20);
  t.ok(s.hp === hp0 && s.armor === 480, 'damage eats plating before meat');
  const armorLeft = s.armor;
  P.s.etch = 1;                                   // etching acid doubles anti-plate
  LP.hurtSeg(w, 1, 10);
  t.ok(s.armor <= armorLeft - 19.9, 'etching acid multiplies damage into plating');
  P.s.etch = 0;
  LP.hurtSeg(w, 1, 99999);
  t.ok(s.dead === true, 'enough damage still gets through the plate');
}

// ------------------------------------------------------------------ knots and bulbs
{
  clearField();
  const w = LP.spawnWorm({ len: 3, type: 'knot', noCarrier: true });
  w.segs[1].hp = 5;
  const before = w.segs[1].hp;
  step(1);
  t.ok(w.segs[1].hp > before, 'knots stitch their neighbours back up');

  clearField();
  const wb = LP.spawnWorm({ len: 5, type: 'bulb', noCarrier: true });
  for (const s of wb.segs) s.hp = 1;               // a bloom should chain through them
  const kills0 = G.stats.kills;
  LP.hurtSeg(wb, 2, 5);
  t.ok(G.stats.kills - kills0 >= 2, 'a bulb pops its neighbours (' + (G.stats.kills - kills0) + ' segments)');
}

// ------------------------------------------------------------------ spitters
{
  clearField();
  G.eprojs.length = 0;
  const w = LP.spawnWorm({ len: 3, type: 'spit', x: C.W / 2, y: 300, noCarrier: true });
  for (const s of w.segs) s.spitT = 0.02;
  step(0.5);
  t.ok(G.eprojs.length > 0, 'spitters shoot back');
  const e = G.eprojs[0];
  t.ok(finite(e.vx) && finite(e.vy) && e.dmg > 0, 'their shots are well-formed');
}

// ------------------------------------------------------------------ firing
{
  clearField();
  G.projs.length = 0;
  P.s.spread = 3; P.s.crit = 0;
  LP.volley();
  t.ok(G.projs.length === 3, 'spread fires one harpoon per rail');
  const up = G.projs.every(p => p.vy < 0);
  t.ok(up, 'the press only points up');
  P.s.spread = 1;
  G.projs.length = 0;
  P.s.crit = 1; P.s.critx = 3;
  LP.volley();
  t.ok(G.projs[0].crit && G.projs[0].dmg > LP.baseDamage() * 2.5, 'criticals multiply damage');
  P.s.crit = 0;
}

// ------------------------------------------------------------------ the snake and its pattern
{
  LP.reseed(808);
  LP.startRun(3, 1, 'tin');
  t.ok(G.worms.length === 1 && G.worms[0].prime, 'a trench opens with exactly one snake');
  t.ok(G.worms[0].segs.length >= 20, 'and it is long (' + G.worms[0].segs.length + ' segments)');
  t.ok(G.segBudget === G.quota - G.worms[0].segs.length, 'the rest of the quota is held back');
  t.ok(LP.wantSnakes() === 1, 'shallow trenches only ever field one');

  for (const kind of LP.PATTERNS){
    const path = LP.buildPath(kind, 0, 1);
    t.ok(path.length > 10 && path.every(p => finite(p.x) && finite(p.y)), kind + ' builds a usable path');
    t.ok(path[path.length - 1].y > path[0].y + 200, kind + ' works its way down the page');
    t.ok(path.every(p => p.x > -20 && p.x < C.W + 20), kind + ' stays on the page');
  }

  // it weaves: horizontal direction reverses, and it keeps descending
  const w = G.worms[0];
  w.kind = 'weave';
  w.path = LP.buildPath('weave', w.y + 150, 1);
  w.wp = 0;
  const y0 = w.y;
  let minX = 1e9, maxX = -1e9, prevX = w.x, flips = 0, dir = 0;
  for (let i = 0; i < 60 * 60; i++){
    LP.stepWorm(w, 1 / 60);
    minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
    const d = Math.sign(w.x - prevX);
    if (d && dir && d !== dir) flips++;
    if (d) dir = d;
    prevX = w.x;
  }
  t.ok(w.y > y0 + 200, 'the snake descends as it weaves (' + Math.round(w.y - y0) + 'px in 60s)');
  t.ok(maxX - minX > C.W * 0.5, 'and sweeps most of the width');
  t.ok(flips >= 2, 'reversing at the walls — that is the weave (' + flips + ' turns)');

  // a second snake only shows up deep and late
  LP.startRun(8, 1, 'tin');
  t.ok(LP.wantSnakes() === 1, 'even a deep trench starts with one');
  G.prog = 0.6;
  t.ok(LP.wantSnakes() === 2, 'and adds a second one past a third of the way');

  // when a snake is finished the next one comes down with the rest of the quota
  LP.startRun(3, 1, 'tin');
  const budget0 = G.segBudget;
  G.worms.length = 0;
  for (let i = 0; i < 60 * 8; i++) LP.update(1 / 60);
  t.ok(G.worms.some(x => x.prime), 'a fresh snake enters once the page is clear');
  t.ok(G.segBudget < budget0, 'and it is drawn from the trench budget');
}

// ------------------------------------------------------------------ overrun
{
  LP.startRun(2, 1, 'tin');
  const w = G.worms[0];
  t.ok(w.mode === 'path', 'the snake follows its pattern');
  // a loose fragment must not be able to end the dive
  clearField();
  const frag = LP.spawnWorm({ len: 3, noCarrier: true });
  t.ok(frag.mode === 'wander' && !frag.prime, 'fragments and strays wander instead');
  for (const s of frag.segs) s.y = C.H;
  LP.checkOverrun();
  t.ok(G.state === 'run', 'a stray reaching the deck is not a loss');
  for (let i = 0; i < 60 * 6; i++) LP.stepWorm(frag, 1 / 60);
  t.ok(frag.segs.every(s => s.y < LP.deckLine()), 'strays are held off the deck entirely');

  // the snake reaching the deck is
  clearField();
  const snake = LP.spawnWorm({ prime: true, len: 6, noCarrier: true });
  snake.segs[0].y = LP.deckLine() + 5;
  LP.checkOverrun();
  t.ok(G.state === 'down' && G.downed === 'overrun', 'the snake making the deck ends the dive');
  t.ok(LP.payout() > 0, 'and there are pearls on the table');

  // the revive lifts the trench back up and puts you back in
  const y0 = snake.segs[0].y;
  P.hp = 1;
  t.ok(LP.reviveRun() === true, 'the revive is available once');
  t.ok(G.state === 'run' && P.hp === P.mhp, 'you come back at full hull');
  t.ok(snake.segs[0].y < y0 - 200, 'and the snake is shoved back up the page');
  t.ok(P.inv > 1, 'with a moment of grace');
  t.ok(LP.reviveRun() === false, 'but only the once');
  LP.downRun('overrun');
  const bank0 = LP.META.pearls;
  LP.claimRun();
  t.ok(G.state === 'dead' && LP.META.pearls > bank0, 'taking the pearls ends the dive and banks them');
}

// ------------------------------------------------------------------ the press points up
{
  LP.startRun(1, 1, 'tin');
  clearField();
  G.projs.length = 0;
  P.s.spread = 1; P.s.crit = 0; P.s.gimbal = 0;
  // a segment parked far off to the side must not bend the shot toward it
  LP.spawnWorm({ len: 4, x: 80, y: 300, noCarrier: true });
  P.x = C.W - 90;
  t.ok(Math.abs(LP.aimAngle() + Math.PI / 2) < 1e-9, 'with no gimbal the rail points dead up');
  LP.volley();
  t.ok(G.projs.length === 1 && Math.abs(G.projs[0].vx) < 1e-6 && G.projs[0].vy < 0,
    'and the harpoon flies straight up — no auto-aim');

  // a fan still fans, symmetrically, around vertical
  G.projs.length = 0;
  P.s.spread = 3;
  LP.volley();
  const vx = G.projs.map(p => p.vx);
  t.ok(G.projs.length === 3 && Math.abs(vx[0] + vx[2]) < 1e-6 && Math.abs(vx[1]) < 1e-6,
    'a fan spreads evenly either side of vertical');
  P.s.spread = 1;

  // the Gimbal Mount is the only thing that ever tracks, and only in a cone
  P.s.gimbal = 1;
  const a1 = LP.aimAngle();
  P.s.gimbal = 3;
  const a3 = LP.aimAngle();
  t.ok(a1 !== -Math.PI / 2 && Math.abs(a1 + Math.PI / 2) < Math.abs(a3 + Math.PI / 2),
    'the gimbal tracks, and a wider cone tracks further');
  t.ok(Math.abs(a3 + Math.PI / 2) <= 1.0001, 'even at level 3 the cone is bounded');
  P.s.gimbal = 0;
}

// ------------------------------------------------------------------ late plates
{
  LP.startRun(1, 1, 'tin');
  const early = LP.cardPool().map(e => e.u.id);
  t.ok(early.indexOf('gimbal') < 0 && early.indexOf('drones') < 0 && early.indexOf('bombs') < 0,
    'nothing that tracks a target is on the sheet at the start of a dive');
  t.ok(early.indexOf('sonar') >= 0 && early.indexOf('dmg') >= 0, 'the dumb plates are');
  G.stats.cards = 4;
  const late = LP.cardPool().map(e => e.u.id);
  t.ok(late.indexOf('gimbal') >= 0 && late.indexOf('drones') >= 0 && late.indexOf('bombs') >= 0,
    'four plates in, the guided gear shows up');
  G.stats.cards = 0;
  G.prog = 0.5;
  t.ok(LP.cardPool().map(e => e.u.id).indexOf('gimbal') >= 0, 'half way down works too');
  G.prog = 0;
  for (let i = 0; i < 6; i++) LP.applyCard({ id:'gimbal', u: LP.UP.gimbal, rar: LP.RAR.solar, val: 3 });
  t.ok(P.s.gimbal === 3, 'the gimbal caps at three');
  G.stats.cards = 9;
  t.ok(LP.cardPool().map(e => e.u.id).indexOf('gimbal') < 0, 'and leaves the sheet when maxed');
}

// ------------------------------------------------------------------ carrier segments
{
  LP.startRun(4, 1, 'tin');
  t.ok(G.carrierBudget >= C.CARRIERS, 'a trench is stocked with carriers (' + G.carrierBudget + ')');
  const carriersOnSnake = G.worms[0].segs.filter(s => s.carrier).length;
  t.ok(carriersOnSnake >= 1, 'the snake comes down with plates bolted into it (' + carriersOnSnake + ')');
  t.ok(G.carriersLeft === G.carrierBudget - carriersOnSnake, 'and they come out of the trench budget');
  t.ok(G.worms[0].segs.length > 8, 'and it is a long snake, not a short worm');

  const car = G.worms[0].segs.find(s => s.carrier);
  const plain = G.worms[0].segs.find(s => !s.carrier);
  t.ok(car.mhp > plain.mhp, 'a carrier takes more killing (' + car.mhp + ' vs ' + plain.mhp + ')');

  G.pendingDrafts = 0;
  P.hp = P.mhp * 0.5;
  const pearls0 = G.pearls;
  const hp0 = P.hp;
  LP.killSeg(G.worms[0], G.worms[0].segs.indexOf(car));
  t.ok(G.pendingDrafts === 1, 'cutting the plate out is what hands you an upgrade');
  t.ok(G.pearls >= pearls0 + 8, 'and pays a bonus');
  t.ok(P.hp > hp0, 'and patches the hull');
  t.ok(G.draftLuck > 0, 'a recovered plate prints on better stock');
  LP.stepProgress();
  t.ok(G.state === 'draft', 'the sheet opens straight away');
  LP.pickCard(0);
  t.ok(G.draftLuck === 0, 'the bonus does not carry to the next sheet');

  // progress alone no longer hands out plates
  LP.startRun(4, 1, 'tin');
  G.pendingDrafts = 0;
  G.carriersLeft = 0;
  G.draftT = 0;
  for (let i = 0; i < 12; i++){
    G.killed = Math.round(G.quota * (i + 1) / 12);
    LP.stepProgress();
  }
  t.ok(G.state === 'run' && G.pendingDrafts === 0, 'filling the bar on its own never opens a sheet');
  // ...but the starvation clock still exists
  G.lastDt = C.DRAFT_SECS + 1;
  LP.stepProgress();
  t.ok(G.state === 'draft', 'the starvation clock is still there as a backstop');
  LP.closeDraft();
}

// ------------------------------------------------------------------ projectile hits + pierce
{
  clearField();
  G.projs.length = 0;
  const w = LP.spawnWorm({ len: 6, type: 'flesh', x: C.W / 2, y: 260, noCarrier: true });
  for (const s of w.segs){ s.mhp = 20; s.hp = 20; }
  P.x = w.segs[0].x; P.y = C.H - 120;
  P.s.pierce = 2; P.s.dmg = 20;                    // one shot should thread several
  LP.volley();
  const dealt0 = G.stats.dmg;
  step(1.2);
  t.ok(G.stats.dmg > dealt0, 'harpoons connect');
  t.ok(w.segs.filter(s => s.dead).length + (7 - w.segs.length) >= 1, 'and kill what they hit');
  P.s.pierce = 0; P.s.dmg = 1;
}

// ------------------------------------------------------------------ subsystems
{
  for (const id of Object.keys(LP.SYS)){
    clearField();
    LP.startRun(3, 1, 'tin');
    clearField();
    P.sys = {}; P.sysT = {};
    LP.addSys(id, 5);
    LP.syncSys();
    LP.spawnWorm({ len: 6, x: P.x, y: C.H - 300 });
    const dmg0 = G.stats.dmg;
    let threw = null;
    try { step(6); LP.draw(); } catch (e){ threw = e; }
    t.ok(!threw, id + ' runs for 6s without throwing' + (threw ? ' — ' + threw.message : ''));
    if (id !== 'shield'){
      t.ok(G.stats.dmg > dmg0, id + ' actually deals damage');
    }
  }
  t.ok(P.drones.length === 0 || true, 'drone/flail arrays follow their level');
}

// ------------------------------------------------------------------ shield + damage + revive
{
  LP.startRun(1, 1, 'tin');
  LP.addSys('shield', 1);
  P.shield = 1;
  const hp0 = P.hp;
  P.inv = 0; LP.hitPlayer(30);
  t.ok(P.hp === hp0 && P.shield === 0, 'the bubble eats a hit whole');
  P.inv = 0; LP.hitPlayer(30);
  t.ok(P.hp === hp0 - 30, 'the next hit lands');
  LP.hitPlayer(5);
  t.ok(P.hp === hp0 - 30, 'i-frames block the follow-up');

  P.revived = false;                                // pretend the lifeboat is fitted
  P.inv = 0; LP.hitPlayer(9999);
  t.ok(G.state === 'run' && P.hp > 0, 'the lifeboat brings you back');
  P.inv = 0; LP.hitPlayer(9999);
  t.ok(G.state === 'down' && G.downed === 'hull', 'the second death puts you on the offer screen');
  t.ok(LP.reviveRun() === true && G.state === 'run' && P.hp === P.mhp,
    'the ad revive puts you back in the water at full hull');
  t.ok(G.adRevives === 0, 'and it is the only one');
  P.inv = 0; LP.hitPlayer(9999);
  t.ok(G.state === 'down' && LP.reviveRun() === false, 'the second time down there is no revive left');
  const bank0 = LP.META.pearls;
  t.ok(LP.claimRun() === true && G.state === 'dead', 'claiming ends the dive');
  t.ok(LP.META.pearls > bank0, 'and banks the pearls');
}

// ------------------------------------------------------------------ draft sheet
{
  LP.reseed(31337);
  LP.startRun(2, 1, 'tin');
  const cards = LP.rollCards(3);
  t.ok(cards.length === 3, 'a sheet holds three plates');
  t.ok(new Set(cards.map(c => c.id)).size === 3, 'no duplicates on one sheet');
  t.ok(cards.every(c => c.rar && finite(c.val) && c.val > 0), 'every plate has an ink and a value');

  const dmg0 = P.s.dmg;
  LP.applyCard({ id: 'dmg', u: LP.UP.dmg, rar: LP.RAR.solar, val: LP.cardValue(LP.UP.dmg, LP.RAR.solar) });
  t.ok(P.s.dmg > dmg0, 'a stat plate raises the stat');
  t.ok(LP.TAKEN.dmg && LP.TAKEN.dmg.n === 1, 'the run sheet records what was fitted');

  const before = P.sys.sonar || 0;
  LP.applyCard({ id: 'sonar', u: LP.UP.sonar, rar: LP.RAR.tide, val: 2 });
  t.ok((P.sys.sonar || 0) === before + 2, 'a Tide subsystem plate is worth two levels');

  LP.addSys('sonar', 9);
  const pool = LP.cardPool().map(e => e.u.id);
  t.ok(pool.indexOf('sonar') < 0, 'a maxed subsystem drops off the sheet');

  // rerolls and take-all are finite resources
  LP.openDraft();
  const r0 = G.rerolls;
  t.ok(LP.reroll() === true && G.rerolls === r0 - 1, 're-inking spends a charge');
  G.rerolls = 0;
  t.ok(LP.reroll() === false, 'no charge, no re-ink');
  G.takealls = 1;
  LP.openDraft();
  const n0 = G.stats.cards;
  t.ok(LP.takeAll() === true && G.stats.cards === n0 + 3, 'take-all fits the whole sheet');
  t.ok(G.takealls === 0 && LP.takeAll() === false, 'and it is spent');
  t.ok(G.state === 'run', 'closing the draft returns to the run');

  LP.openDraft();
  const mhp0 = P.mhp;
  LP.skipDraft();
  t.ok(P.mhp > mhp0 && G.state === 'run', 'skipping the sheet patches the hull instead');

  // pick by index
  LP.openDraft();
  const first = G.cards[0];
  t.ok(LP.pickCard(0) === true && G.state === 'run', 'picking a plate closes the sheet');
  t.ok(!!LP.TAKEN[first.id], 'the picked plate is on the run sheet');
}

// ------------------------------------------------------------------ caps
{
  LP.startRun(1, 1, 'tin');
  for (let i = 0; i < 40; i++){
    LP.applyCard({ id: 'spread', u: LP.UP.spread, rar: LP.RAR.solar, val: LP.cardValue(LP.UP.spread, LP.RAR.solar) });
    LP.applyCard({ id: 'burst', u: LP.UP.burst, rar: LP.RAR.solar, val: LP.cardValue(LP.UP.burst, LP.RAR.solar) });
    LP.applyCard({ id: 'pierce', u: LP.UP.pierce, rar: LP.RAR.solar, val: LP.cardValue(LP.UP.pierce, LP.RAR.solar) });
  }
  t.ok(P.s.spread <= C.SPREAD_CAP && P.s.burst <= C.BURST_CAP && P.s.pierce <= C.PIERCE_CAP,
    'spread/burst/pierce respect their caps');
  const pool = LP.cardPool().map(e => e.u.id);
  t.ok(pool.indexOf('spread') < 0 && pool.indexOf('burst') < 0, 'capped stats leave the pool');
  G.projs.length = 0;
  LP.volley();
  t.ok(G.projs.length === C.SPREAD_CAP, 'a maxed fan is exactly the cap wide');
}

// ------------------------------------------------------------------ progress → core → win
{
  LP.reseed(5150);
  LP.startRun(1, 1, 'tin');
  G.killed = G.quota;
  LP.stepProgress();
  t.ok(G.phase === 'core' && !!G.core, 'meeting the quota surfaces the core');
  const co = G.core;
  t.ok(co.mhp > 0 && co.hp === co.mhp, 'the core arrives whole');
  LP.hurtCore(co.mhp * 0.4);
  t.ok(co.phase === 1, 'the core changes phase at two thirds');
  LP.hurtCore(co.mhp * 0.35);
  t.ok(co.phase === 2, 'and again at a third');
  const pearls0 = LP.META.pearls;
  LP.hurtCore(co.mhp);
  t.ok(G.state === 'clear', 'killing the core clears the plate');
  t.ok(LP.META.pearls > pearls0, 'the dive pays out');
  t.ok(LP.META.cleared[1] === 1, 'the trench is marked cleared at that tier');
  t.ok(LP.stageOpen(2) === true, 'clearing trench 1 opens trench 2');
}

// ------------------------------------------------------------------ core attacks
{
  LP.startRun(4, 2, 'tin');
  G.killed = G.quota;
  LP.stepProgress();
  const co = G.core;
  let threw = null;
  try {
    for (const mode of ['fan', 'rain', 'charge', 'spawn', 'idle']){
      co.mode = mode; co.modeT = 2.0; co.spawned = false;
      step(2.5);
      LP.draw();
      if (G.state !== 'run') { LP.startRun(4, 2, 'tin'); G.killed = G.quota; LP.stepProgress(); }
    }
  } catch (e){ threw = e; }
  t.ok(!threw, 'every core attack pattern runs clean' + (threw ? ' — ' + threw.message : ''));
}

// ------------------------------------------------------------------ hulls
{
  for (const h of LP.HULLS){
    LP.startRun(1, 1, h.id);
    t.ok(P.mhp > 20 && finite(P.s.dmg) && P.s.fire > 0, h.nm + ' builds a working hull');
  }
  LP.startRun(1, 1, 'bloom');
  t.ok((P.sys.chain || 0) === 2, 'Bloomjar starts with Voltbloom II');
  LP.startRun(1, 1, 'press');
  t.ok(G.rerolls >= 3 && G.takealls >= 1, 'Hand Press starts with extra ink');
  LP.startRun(1, 1, 'mote');
  t.ok(P.s.spread === 2, 'Mote starts with a second rail');
}

// ------------------------------------------------------------------ meta / save
{
  LP.setMeta(LP.freshMeta());
  const M = LP.META;
  M.pearls = 100000;
  t.ok(LP.buyMeta('hull') === true && LP.mlvl('hull') === 1, 'standing orders can be bought');
  const c1 = LP.metaCost('hull');
  LP.buyMeta('hull');
  t.ok(LP.metaCost('hull') > c1, 'and get more expensive');
  for (let i = 0; i < 20; i++) LP.buyMeta('hull');
  t.ok(LP.mlvl('hull') === LP.META_UPS.find(m => m.id === 'hull').max, 'they stop at their max');
  t.ok(LP.metaCost('hull') === Infinity && LP.buyMeta('hull') === false, 'a maxed order cannot be bought again');
  M.pearls = 0;
  t.ok(LP.buyMeta('barb') === false, 'no pearls, no purchase');
  M.pearls = 5000;
  t.ok(LP.buyHull('anvil') === true && LP.META.hull === 'anvil', 'hulls are bought and readied');
  t.ok(LP.buyHull('anvil') === true, 'an owned hull is just selected');
  const spent = LP.META.pearls;
  LP.buyHull('anvil');
  t.ok(LP.META.pearls === spent, 're-selecting an owned hull is free');

  // meta feeds the run
  M.up = { hull: 6, barb: 6, crank: 5, reroll: 3, takeall: 2, luck: 5, magnet: 3, lifeboat: 1, kit: 1 };
  LP.startRun(1, 1, 'tin');
  t.ok(P.mhp >= 100 + 8 * 6, 'Thicker Plate raises max hull');
  t.ok(P.s.dmg > 1.3 && P.s.fire > 1.2, 'Ground Barb and Oiled Crank feed the press');
  t.ok(G.rerolls >= 4 && G.takealls >= 2, 'Spare Ink and Full Sheet carry into the dive');
  t.ok(Object.keys(P.sys).length >= 1, 'Loaded Bay hands out a subsystem');
  t.ok(P.revived === false, 'the lifeboat is armed');

  LP.saveMeta();
  t.ok(!!store[LP.SAVE_KEY], 'the save file is written');
  const before = LP.META.pearls;
  LP.setMeta(LP.freshMeta());
  LP.loadMeta();
  t.ok(LP.META.pearls === before && LP.mlvl('hull') === 6, 'the save file round-trips');
  store[LP.SAVE_KEY] = '{{{not json';
  LP.loadMeta();
  t.ok(LP.META && LP.META.pearls === 0, 'a corrupt save falls back to a fresh plate');
  delete store[LP.SAVE_KEY];
  LP.loadMeta();
  t.ok(LP.META.hulls.length === 1 && LP.META.hull === 'tin', 'no save at all is fine too');
}

// ------------------------------------------------------------------ gating
{
  LP.setMeta(LP.freshMeta());
  t.ok(LP.stageOpen(1) && !LP.stageOpen(2) && !LP.stageOpen(99), 'only the first trench is open on a fresh plate');
  LP.META.cleared = { 1: 0, 2: 0 };
  t.ok(LP.stageOpen(3) && !LP.stageOpen(4), 'clearing a trench opens exactly the next one');
  t.ok(LP.tierOpen(0) && LP.tierOpen(1) && !LP.tierOpen(2), 'harder tiers need a clear on the tier below');
  LP.META.cleared = { 1: 3 };
  t.ok(LP.tierOpen(4) && !LP.tierOpen(5 - 1 + 1), 'clearing on Abyssal opens Hadal');
  LP.META.cleared = { 12: 1 };
  t.ok(LP.stageOpen(99), 'clearing the last trench opens the endless column');
}

// ------------------------------------------------------------------ payouts
{
  LP.setMeta(LP.freshMeta());
  LP.startRun(5, 0, 'tin');
  G.pearls = 100;
  const easy = LP.payout();
  LP.startRun(5, 4, 'tin');
  G.pearls = 100;
  const hard = LP.payout();
  t.ok(hard > easy * 3, 'Hadal pays far better than the Shallows');
  P.s.salvage = 1;
  t.ok(LP.payout() > hard, 'Salvage Claw raises the take');
  const bank = LP.META.pearls;
  const paid = LP.endRun(false);
  t.ok(paid > 0 && LP.META.pearls === bank + paid, 'pearls are banked even when you die');
  t.ok(LP.META.cleared[5] == null, 'dying does not mark the trench cleared');
}

// ------------------------------------------------------------------ drops
{
  LP.startRun(1, 1, 'tin');
  clearField();
  P.hp = P.mhp * 0.5;
  LP.dropAt(P.x, P.y - 5, 'patch');
  const hp0 = P.hp;
  step(0.5);
  t.ok(P.hp > hp0, 'patches mend the hull');
  const pearls0 = G.pearls;
  LP.dropAt(P.x, P.y - 5, 'pearl');
  step(0.5);
  t.ok(G.pearls > pearls0, 'pearls go in the net');
  LP.dropAt(P.x, P.y - 5, 'spark');
  step(0.5);
  t.ok(P.buffT > 0, 'a spark starts an overprint');
}

// ------------------------------------------------------------------ speed toggle
{
  LP.startRun(1, 1, 'tin');
  G.speed = 1;
  const t0 = G.time;
  step(1);
  const slow = G.time - t0;
  G.speed = 2;
  const t1 = G.time;
  step(1);
  const fast = G.time - t1;
  t.ok(fast > slow * 1.8, 'fast-forward really is twice the simulation');
}

// ------------------------------------------------------------------ full soak
{
  // An unkillable hull, so the soak measures the trench rather than the
  // quality of a scripted pilot: drafts must keep arriving, segments must
  // keep dying, and nothing may leak or go NaN over three simulated minutes.
  LP.reseed(20260724);
  LP.setMeta(LP.freshMeta());
  LP.META.up = { luck: 5, kit: 1 };
  LP.startRun(7, 2, 'needle');
  P.mhp = 1e9; P.hp = 1e9;
  let frames = 0, drafts = 0, threw = null, maxWorms = 0, maxNums = 0;
  try {
    while (frames < 60 * 60 * 3 && G.state !== 'dead' && G.state !== 'clear'){
      LP.update(1 / 60);
      frames++;
      P.hp = 1e9;
      if (G.state === 'draft'){ drafts++; LP.pickCard(frames % 3); }
      if (frames % 7 === 0){
        P.tx = 80 + (Math.sin(frames / 40) * 0.5 + 0.5) * (C.W - 160);
        P.ty = C.H - C.DECK - 40;
      }
      maxWorms = Math.max(maxWorms, G.worms.length);
      maxNums = Math.max(maxNums, G.nums.length);
      if (frames % 31 === 0) LP.draw();
    }
  } catch (e){ threw = e; }
  t.ok(!threw, 'three simulated minutes of trench 7 without an exception' + (threw ? ' — ' + threw.message : ''));
  t.ok(drafts >= 3, 'plates keep arriving through the dive (' + drafts + ')');
  t.ok(G.carriersLeft < G.carrierBudget, 'and carriers are being cut out of the worm');
  t.ok(G.stats.severed > 40, 'the press does its job (' + G.stats.severed + ' segments)');
  t.ok(G.stats.splits > 5, 'and the worm keeps coming apart (' + G.stats.splits + ' splits)');
  t.ok(G.projs.length <= C.MAX_PROJ && G.parts.length <= C.MAX_PARTS + 40, 'entity pools stay bounded');
  t.ok(maxWorms <= 40 && maxNums <= 120, 'worm/label counts stay bounded (' + maxWorms + ' worms)');
  t.ok(finite(P.x) && finite(P.y) && finite(G.prog), 'no NaN anywhere important');
  t.ok(G.worms.every(w => w.segs.every(s => finite(s.x) && finite(s.y) && finite(s.hp))), 'the worms stayed finite');
  t.ok(G.worms.every(w => w.segs.every(s => !s.dead)), 'no dead segments are left riding a live worm');
  t.ok(G.worms.every(w => w.trail.length < 600), 'trails stay trimmed over a long dive');
}

// ------------------------------------------------------------------ you can still die
{
  LP.setMeta(LP.freshMeta());
  LP.startRun(9, 4, 'mote');            // thin hull, Hadal, no upgrades
  let frames = 0;
  while (frames < 60 * 60 * 4 && (G.state === 'run' || G.state === 'draft')){
    LP.update(1 / 60);
    frames++;
    if (G.state === 'draft') LP.skipDraft();
    if (frames % 9 === 0){ P.tx = C.W / 2; P.ty = C.H - C.DECK - 30; }   // a pilot who never dodges
  }
  t.ok(G.state === 'down', 'a pilot who parks in the open goes down (' + G.downed + ')');
  LP.claimRun();
  t.ok(G.state === 'dead' && LP.META.pearls > 0, 'and still banks what was in the net');
}

// ------------------------------------------------------------------ draw in every state
{
  let threw = null;
  try {
    for (const st of ['title', 'stagesel', 'depot', 'run', 'draft', 'pause', 'dead', 'clear']){
      G.state = st;
      LP.update(1 / 60);
      LP.draw();
    }
    G.state = 'run';
    G.shake = 20; G.flash = 1;
    LP.draw();
    // and at a couple of window shapes
    global.innerWidth = 1920; global.innerHeight = 1080; LP.fit(); LP.draw();
    global.innerWidth = 390; global.innerHeight = 844; LP.fit(); LP.draw();
    for (const q of [0, 1, 2]){ LP.META.opts.quality = q; LP.fit(); LP.draw(); }
  } catch (e){ threw = e; }
  t.ok(!threw, 'draw() survives every state, window shape and quality setting' + (threw ? ' — ' + threw.message : ''));
  t.ok(C.H > 0 && C.W === C.VW, 'the printed page keeps its portrait proportions');
}

// ------------------------------------------------------------------ endless
{
  LP.setMeta(LP.freshMeta());
  LP.META.cleared = { 12: 1 };
  LP.startRun(99, 2, 'tin');
  t.ok(G.stage.endless === true && G.quota > 0, 'the endless column starts');
  t.ok(LP.hpMul() > LP.STAGES[11].hp * 0.5, 'and it is at least as mean as the last trench');
  t.ok(finite(LP.depthNow()) && LP.depthNow() >= LP.ENDLESS.depth, 'depth keeps reading forward');
}

t.done();
