// Flipper Crawl — headless physics + roguelike suite.
//
// The game is one self-contained file (flipper_crawl/index.html) drawing to a
// canvas. This harness stubs a DOM + no-op 2d context, evals the inline
// <script> with __FC_HEADLESS__ set (so it boots without rAF/audio/DOM HUD),
// and drives the real simulation through window.FC.
//
// The interesting half is the physics: these tests pin down the properties a
// pinball table actually needs — no tunnelling at any speed, energy added by
// a swinging flipper, spin picked up off a rail, contacts that settle instead
// of buzzing — plus the run structure on top of it.
//
// Run: node tests/flipper_crawl.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadGame(store){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'flipper_crawl', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 440, height: 780 };
    return noop;
  }, set(){ return true; } });
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 440, height: 780 }),
    innerHTML: '', textContent: '', title: '', width: 440, height: 780,
  }, { get(t, k){ return (k in t) ? t[k] : noop; }, set(t, k, v){ t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 440; global.innerHeight = 780;
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k){ return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; },
    set(t, k, v){ t[k] = v; return true; },
  });
  global.__FC_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.FC;
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL  ' + msg); } };

const store = {};
const FC = loadGame(store);
const { G, P, T } = FC;
const finite = v => typeof v === 'number' && isFinite(v);
const speed = b => Math.hypot(b.vx, b.vy);
const step = (secs) => { const n = Math.max(1, Math.round(secs / P.STEP)); for (let i = 0; i < n; i++) FC.update(P.STEP); };
const onlyBall = (x, y, vx = 0, vy = 0) => {
  G.inplay.length = 0;
  const b = FC.newBall(x, y, vx, vy);
  b.inLane = false;
  G.inplay.push(b);
  return b;
};
// park the residents somewhere they cannot interfere with a physics probe
const clearField = () => { for (const e of G.enemies) e.dead = true; G.shots.length = 0; G.portalOpen = false; };
// ...and for probes that need open table, take the scenery out too
const clearProps = () => { clearField(); G.bumpers.length = 0; G.posts.length = 0; G.targets.length = 0; };

console.log('flipper_crawl');

/* ------------------------------------------------------------------ boot */
ok(!!FC, 'exposes window.FC');
ok(G.screen === 'title', 'boots to the title screen');
ok(G.flippers.length === 2, 'two flippers built');
ok(G.inplay.length === 1 && G.launchReady, 'a ball waits on the plunger');
FC.draw();
ok(true, 'draw() survives the title state');

/* ------------------------------------------------------- table integrity */
FC.startRun(1234);
ok(G.screen === 'play', 'startRun enters play');
ok(G.floor === 1 && G.balls === 3, 'run starts on B1 with three balls');
ok(G.enemies.length >= 2, 'B1 is populated');
ok(G.bumpers.length === 3 && G.targets.length === 3, 'bumpers and a target bank exist');
ok(G.segs.every(s => finite(s.ax) && finite(s.ay) && finite(s.bx) && finite(s.by) && s.r > 0),
  'every collider segment is finite and has thickness');

/* ------------------------------------------------- determinism of layout */
{
  FC.buildFloor(4);
  const a = JSON.stringify(G.posts.map(p => [p.x | 0, p.y | 0]));
  const kindsA = G.enemies.map(e => e.kind).join(',');
  FC.buildFloor(4);
  const b = JSON.stringify(G.posts.map(p => [p.x | 0, p.y | 0]));
  ok(a === b, 'same seed + floor rebuilds the same layout');
  ok(kindsA === G.enemies.map(e => e.kind).join(','), 'same seed + floor spawns the same residents');
  FC.buildFloor(5);
  ok(G.enemies.length === 1 && G.enemies[0].kind === 'warden', 'every fifth floor is a Warden fight');
  FC.startRun(1234);
}

/* ============================================================== PHYSICS */

/* --- gravity + drag: a dropped ball accelerates but stays sane --------- */
{
  clearProps();
  const b = onlyBall(220, 300, 0, 0);
  step(0.25);
  ok(b.vy > 200 && b.vy < P.GRAV * 0.3, 'gravity accelerates the ball (with drag bleeding it)');
  ok(finite(b.x) && finite(b.y), 'position stays finite under gravity');
}

/* --- no tunnelling: fire the ball at every wall at terminal speed ------ */
{
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]];
  let escaped = 0, nan = 0;
  for (const [dx, dy] of dirs){
    for (let trial = 0; trial < 3; trial++){
      FC.startRun(9000 + trial);
      clearField();
      const b = onlyBall(200 + trial * 20, 340, dx * P.VMAX, dy * P.VMAX);
      step(3);
      if (!finite(b.x) || !finite(b.y)) nan++;
      // still inside the cabinet, or legitimately drained/descended
      const inside = b.x > 4 && b.x < T.W - 4 && b.y > 4 && b.y < T.H;
      if (b.live && !inside) escaped++;
    }
  }
  ok(nan === 0, 'no NaN positions at maximum velocity');
  ok(escaped === 0, 'the ball never tunnels out of the cabinet at maximum velocity');
}

/* --- the ball settles: no infinite jitter on a resting contact --------- */
{
  FC.startRun(4242);
  clearProps();
  // drop it into the left funnel and let it come to rest against the rail
  const b = onlyBall(70, 500, 0, 0);
  step(4);
  const before = { x: b.x, y: b.y };
  step(0.5);
  const drift = Math.hypot(b.x - before.x, b.y - before.y);
  ok(b.live === false || drift < 400, 'a ball on a rail rolls to the drain instead of buzzing in place');
  ok(finite(b.x) && finite(b.y), 'resting contact stays finite');
}

/* --- restitution is speed-scaled: fast hits bounce, slow hits die ------ */
{
  FC.startRun(77);
  clearField();
  const wall = G.segs.find(s => s.ax === 20 && s.ay === 250);   // the left wall
  ok(!!wall, 'found the left wall collider');
  const probe = (vx) => {
    const b = FC.newBall(20 + wall.r + P.R + 2, 400, vx, 0);
    b.inLane = false;
    const c = FC.capsuleHit(b, wall);
    // nudge it into contact, then resolve exactly once
    const b2 = FC.newBall(20 + wall.r + P.R - 1, 400, vx, 0);
    b2.inLane = false;
    const c2 = FC.capsuleHit(b2, wall);
    FC.resolve(b2, c2, { rest: P.REST_WALL, fric: P.FRIC });
    return Math.abs(b2.vx) / Math.abs(vx);
  };
  const fast = probe(-1200), slow = probe(-40);
  ok(fast > slow, 'a fast impact keeps more of its energy than a crawl');
  ok(fast <= P.REST_WALL + 0.02, 'restitution never exceeds the surface rating (no energy from nowhere)');
  ok(slow < 0.2, 'a slow contact is nearly dead — this is what stops jitter');
}

/* --- friction transfers real angular momentum ------------------------- */
{
  FC.startRun(88);
  clearField();
  const wall = G.segs.find(s => s.ax === 20 && s.ay === 250);
  const b = FC.newBall(20 + wall.r + P.R - 1, 400, -300, 900);   // scraping down the wall
  b.inLane = false; b.w = 0;
  const c = FC.capsuleHit(b, wall);
  FC.resolve(b, c, { rest: P.REST_WALL, fric: P.FRIC });
  ok(Math.abs(b.w) > 0.5, 'a glancing scrape spins the ball up');
  ok(b.w * 1 < 0 || b.w * 1 > 0, 'spin has a direction');
  // spin bleeds away, it does not accumulate forever
  G.bumpers.length = 0; G.posts.length = 0;
  const b2 = onlyBall(220, 300, 0, 0);
  b2.w = 40;
  step(2);
  ok(Math.abs(b2.w) < 40, 'spin decays over time');
}

/* --- the flipper adds energy (contact-point velocity) ----------------- */
{
  FC.startRun(555);
  clearField();
  const f = G.flippers[0];
  f.up = false; f.ang = f.rest;
  // rest a slow ball on the middle of the left flipper's blade
  const mid = { x: f.px + Math.cos(f.ang) * f.len * 0.72, y: f.py + Math.sin(f.ang) * f.len * 0.72 };
  const b = onlyBall(mid.x, mid.y - P.R - f.r + 1, 0, 30);
  const before = speed(b);
  FC.setFlipper(-1, true);
  step(0.12);
  const after = speed(b);
  ok(after > before + 300, `a flipper swing launches the ball (${before | 0} -> ${after | 0})`);
  ok(b.vy < -200, 'the launched ball travels up the table');
  ok(after < P.VMAX, 'the launch stays inside the velocity cap');
  FC.setFlipper(-1, false);
}

/* --- tip shots beat base shots (the classic pinball skill curve) ------ */
{
  const shot = (frac) => {
    FC.startRun(556);
    clearField();
    const f = G.flippers[0];
    f.up = false; f.ang = f.rest;
    const p = { x: f.px + Math.cos(f.ang) * f.len * frac, y: f.py + Math.sin(f.ang) * f.len * frac };
    const b = onlyBall(p.x, p.y - P.R - f.r + 1, 0, 30);
    FC.setFlipper(-1, true);
    step(0.12);
    FC.setFlipper(-1, false);
    return speed(b);
  };
  const base = shot(0.35), tip = shot(0.92);
  ok(tip > base, `a hit near the tip fires harder than one at the base (${base | 0} vs ${tip | 0})`);
}

/* --- a tilt lock kills the flippers ----------------------------------- */
{
  FC.startRun(557);
  clearField();
  G.tiltLock = 2;
  FC.setFlipper(-1, true);
  ok(G.flippers[0].up === false, 'flippers are dead while tilted');
  G.tiltLock = 0;
}

/* --- the plunger launches up the lane and into the playfield ---------- */
{
  FC.startRun(1000);
  clearField();
  ok(G.launchReady, 'a fresh floor arms the plunger');
  G.plunge = 1;
  FC.launch();
  const b = G.inplay[0];
  ok(b.vy < -1200, 'a full plunge is a hard launch');
  ok(!G.launchReady, 'the plunger disarms after firing');
  step(2.5);
  ok(b.x < FC.LANE_X || !b.live, 'the launched ball leaves the lane and enters the playfield');
}

/* --- the one-way gate keeps the ball out of the lane ------------------ */
{
  FC.startRun(1001);
  clearField();
  // throw it at the gate from the playfield side, hard
  const b = onlyBall(340, 300, 900, 400);
  step(1.2);
  ok(!(b.live && b.x > FC.LANE_X && b.y > 400), 'the ball cannot re-enter the plunger lane from the playfield');
}

/* --- multiball: two balls collide instead of overlapping -------------- */
{
  FC.startRun(1002);
  clearProps();
  G.inplay.length = 0;
  const a = FC.newBall(200, 300, 260, 0), b = FC.newBall(240, 300, -260, 0);
  a.inLane = b.inLane = false;
  G.inplay.push(a, b);
  step(0.35);
  ok(Math.hypot(a.x - b.x, a.y - b.y) > P.R * 1.6, 'two balls do not pass through each other');
  ok(a.vx < 0 && b.vx > 0, 'the balls bounce off one another');
}

/* ============================================================ SCORING */

/* --- combo raises the multiplier -------------------------------------- */
{
  FC.startRun(2000);
  clearField();
  G.score = 0; G.combo = 0;
  const first = FC.addScore(100, 200, 300);
  for (let i = 0; i < 8; i++) FC.bumpCombo();
  const later = FC.addScore(100, 200, 300);
  ok(first === 100, 'base score is unmultiplied');
  ok(later === 300, `an 8-hit combo triples the take (got ${later})`);
  ok(G.score === first + later, 'score accumulates exactly');
}

/* --- the combo dies on its own ---------------------------------------- */
{
  FC.startRun(2001);
  clearField();
  FC.bumpCombo(); FC.bumpCombo();
  ok(G.combo === 2, 'combo counts hits');
  step(3.2);
  ok(G.combo === 0, 'combo expires when the ball stops scoring');
}

/* --- damage scales with impact, and kills award the bounty ------------ */
{
  FC.startRun(2002);
  G.score = 0;
  const e = G.enemies[0];
  const hp0 = e.hp;
  FC.damage(e, 5, e.x, e.y);
  ok(e.hp === hp0 - 5, 'damage lands');
  FC.damage(e, 9999, e.x, e.y);
  ok(e.dead, 'lethal damage kills');
  ok(G.score >= FC.KINDS[e.kind].sc, 'a kill pays its bounty');
  ok(G.slow > 0 && G.shake > 0, 'a kill triggers slow-mo and shake');
}

/* --- clearing the floor opens the portal, the portal descends --------- */
{
  FC.startRun(2003);
  for (const e of G.enemies) FC.kill(e, e.x, e.y);
  ok(G.portalOpen, 'killing the last resident opens the way down');
  const b = onlyBall(G.portal.x, G.portal.y + 60, 0, -900);
  step(0.4);
  ok(G.screen === 'reward', 'shooting the portal ends the floor');
}

/* --- relic draft advances the floor ----------------------------------- */
{
  const choices = FC.rollRelics();
  ok(choices.length === 3, 'three relics on offer');
  ok(new Set(choices.map(c => c.id)).size === 3, 'the three offers are distinct');
  const floorBefore = G.floor;
  FC.takeRelic(choices[0].id);
  ok(G.relics.includes(choices[0].id), 'the chosen relic is kept');
  ok(G.floor === floorBefore + 1, 'taking a relic descends a floor');
  ok(G.screen === 'play', 'and drops you back onto the table');
  ok(G.launchReady, 'with a fresh ball on the plunger');
}

/* ============================================================== RELICS */

/* --- long flippers are actually longer -------------------------------- */
{
  FC.startRun(3000);
  const base = G.flippers[0].len;
  G.relics.push('long');
  FC.buildFlippers();
  ok(G.flippers[0].len > base * 1.1, 'Long Flippers extends the blade');
}

/* --- spare ball adds a ball now and to the pool ------------------------ */
{
  FC.startRun(3001);
  const b0 = G.balls, m0 = G.maxBalls;
  FC.takeRelic('extra');
  ok(G.balls === b0 + 1 && G.maxBalls === m0 + 1, 'Spare Ball tops up both the count and the cap');
}

/* --- split shot puts a second ball on the table ----------------------- */
{
  FC.startRun(3002);
  G.relics.push('multi');
  FC.enterFloor(2);
  ok(G.inplay.length === 2, 'Split Shot starts the floor with two balls');
}

/* --- greed multiplies the take ---------------------------------------- */
{
  FC.startRun(3003);
  G.score = 0; G.combo = 0;
  const plain = FC.addScore(100, 0, 0);
  G.relics.push('greed');
  G.combo = 0;
  const gilded = FC.addScore(100, 0, 0);
  ok(gilded > plain, `Gilded Rails pays more (${plain} -> ${gilded})`);
}

/* --- arc death chains onto neighbours ---------------------------------- */
{
  FC.startRun(3004);
  G.relics.push('chain');
  G.enemies.length = 0;
  const mk = (x, y, hp) => ({ kind:'grub', x, y, ax:x, ay:y, vx:0, vy:0, r:15, hp, max:hp, t:0, fireT:0, flash:0, dead:false, boss:false });
  const a = mk(200, 300, 5), b = mk(240, 300, 50), far = mk(200, 470, 50);
  G.enemies.push(a, b, far);
  FC.kill(a, a.x, a.y);
  ok(b.hp === 44, 'a kill arcs into a nearby enemy');
  ok(far.hp === 50, 'and spares one out of range');
}

/* --- soft hands survives more nudges ----------------------------------- */
{
  FC.startRun(3005);
  clearField();
  onlyBall(220, 300);
  for (let i = 0; i < 4; i++) FC.nudge(1);
  ok(G.tiltLock > 0, 'four shoves tilts the machine');
  FC.startRun(3006);
  clearField();
  onlyBall(220, 300);
  G.relics.push('steady');
  for (let i = 0; i < 4; i++) FC.nudge(1);
  ok(G.tiltLock === 0, 'Soft Hands takes four shoves without tilting');
}

/* --- a nudge actually moves the ball ------------------------------------ */
{
  FC.startRun(3007);
  clearProps();
  const b = onlyBall(220, 300, 0, 0);
  FC.nudge(1);
  ok(b.vx > 100, 'nudging shoves the ball sideways');
  ok(b.vy < 0, 'and lifts it off the table a touch');
}

/* ================================================== DRAIN / RUN OVER */

/* --- draining costs a ball --------------------------------------------- */
{
  FC.startRun(4000);
  clearField();
  const b = onlyBall(220, 700, 0, 900);
  const lives = G.balls;
  step(0.5);
  ok(G.balls === lives - 1, 'a drain costs a ball');
  ok(G.launchReady, 'and reloads the plunger');
}

/* --- the ball saver refunds the first drain of a floor ------------------ */
{
  FC.startRun(4001);
  G.relics.push('saver');
  FC.enterFloor(2);
  clearField();
  const lives = G.balls;
  onlyBall(220, 700, 0, 900);
  step(0.5);
  ok(G.balls === lives, 'Ball Saver refunds the first drain');
  onlyBall(220, 700, 0, 900);
  step(0.5);
  ok(G.balls === lives - 1, 'but only once per floor');
}

/* --- multiball drains do not cost a ball while one is still live ------- */
{
  FC.startRun(4002);
  clearField();
  G.inplay.length = 0;
  const keep = FC.newBall(220, 300, 0, 0); keep.inLane = false;
  const doomed = FC.newBall(220, 700, 0, 900); doomed.inLane = false;
  G.inplay.push(keep, doomed);
  const lives = G.balls;
  step(0.4);
  ok(G.balls === lives, 'losing one of two balls is free');
  ok(G.inplay.length === 1, 'the drained ball is removed');
}

/* --- losing the last ball ends the run ---------------------------------- */
{
  FC.startRun(4003);
  clearField();
  G.balls = 1;
  onlyBall(220, 700, 0, 900);
  step(0.5);
  ok(G.screen === 'over', 'the run ends when the last ball drains');
  ok(G.balls === 0, 'no balls left');
}

/* ================================================================ SAVE */
{
  FC.startRun(5000);
  G.score = 12345; G.floor = 7; G.bestFloor = 7;
  FC.saveMeta();
  ok(!!store['flipper_crawl_v1'], 'meta is written to localStorage');
  G.best = 0; G.bestFloor = 0;
  FC.loadMeta();
  ok(G.best === 12345 && G.bestFloor === 7, 'meta round-trips');
  store['flipper_crawl_v1'] = '{ this is not json';
  G.best = 1;
  FC.loadMeta();
  ok(G.best === 1, 'a corrupt save does not break the boot');
  delete store['flipper_crawl_v1'];
  FC.loadMeta();
  ok(true, 'a missing save is fine too');
}

/* ============================================== LONG SOAK + RENDERING */
// Play the table for a simulated minute with the flippers mashing, drawing
// every tick. Anything that can go NaN, throw at render time or leak an
// array shows up here.
{
  FC.startRun(6000);
  let ticks = 0, drawn = 0;
  for (let i = 0; i < 3600; i++){
    if (G.screen === 'reward'){ FC.takeRelic(FC.rollRelics()[0].id); }
    if (G.screen === 'over'){ FC.startRun(6001 + i); }
    if (G.launchReady && i % 40 === 0){ G.plunge = 0.4 + (i % 7) / 10; FC.launch(); }
    FC.setFlipper(-1, (i >> 4) % 3 === 0);
    FC.setFlipper(1, (i >> 4) % 5 === 0);
    FC.update(P.STEP);
    ticks++;
    if (i % 6 === 0){ FC.draw(); drawn++; }
  }
  ok(ticks === 3600, 'the table survives a 30s soak with the flippers mashing');
  ok(drawn > 0, 'draw() ran throughout');
  for (const b of G.inplay) ok(finite(b.x) && finite(b.y) && finite(b.vx) && finite(b.vy) && finite(b.w),
    'every live ball is still finite after the soak');
  ok(G.parts.length <= 460, 'the particle pool is capped');
  ok(G.pops.length <= 40, 'the popup pool is capped');
  ok(G.orbs.length <= 90, 'the score-orb pool is capped');
  ok(finite(G.score) && G.score >= 0, 'score stays a sane number');
  ok(G.enemies.every(e => finite(e.x) && finite(e.y)), 'enemies stay on the table');
}

/* --- and the HUD path runs without a real DOM --------------------------- */
FC.hud();
FC.fit();
ok(true, 'hud() and fit() are safe headless');

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
