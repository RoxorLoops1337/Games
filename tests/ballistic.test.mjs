// Ballistic — headless smoke + logic suite.
//
// The game lives in one self-contained file (ballistic/index.html) drawing to
// a canvas. This harness stubs a no-op DOM + 2d context, extracts the inline
// <script>, injects a test-only expose hook (never shipped), and evals it —
// then drives waves, volleys, perks, gems, meta upgrades, streaks and game
// over through the real code. Run: node tests/ballistic.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'ballistic', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }

const BOOT_TAIL = 'fit();\nloadMeta();\ntoMenu();\nrequestAnimationFrame(loop);';
const EXPOSE = `__out.api = { getG:()=>G, getMeta:()=>meta, getScreen:()=>screen, setScreen:(s)=>{screen=s;},
 newRun, spawnWave, descend, checkOver, gameOver, revive, fireVolley, stepPhysics, endVolley,
 offerPerks, applyPerk, PERKS, UPGRADES, buyUpgrade, saveMeta, loadMeta, dailyBonus,
 collectItem, damageBrick, killBrick, explode, addGems, reseed, draw, update, uiClick,
 startGame, fmt, SKINS, skinUnlocked, brickHp, toughChance, doubleWave,
 castAbility, ABILITIES, abilityCost, addEnergy, SPECIES, brickColor, animalSprite,
 C:{ROWS,COLS,CELL,GY,LAUNCH_Y,PERK_EVERY,REVIVE_COST,BALL_R,ENERGY_MAX} };\n`;

function boot(seedSave){
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, { get(t, p){
    if (p === 'measureText') return () => ({ width: 40 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
    if (p === 'canvas') return { width: 420, height: 780 };
    return () => {};
  } });
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 780 }),
    addEventListener(){},
  };
  const store = {};
  if (seedSave) store['ballistic_meta_v1'] = seedSave;
  const sandbox = {
    document: {
      getElementById: id => id === 'c' ? canvas : {},
      // offscreen sprite-cache canvases share the same no-op 2d context
      createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
    },
    window: { innerWidth: 420, innerHeight: 780, devicePixelRatio: 1, addEventListener(){} },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    requestAnimationFrame: () => {},
    __out: {},
  };

  const html = fs.readFileSync(HTML, 'utf8');
  const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert(src.includes(BOOT_TAIL), 'boot tail anchor missing from game script');
  const patched = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  // `navigator` param stays undefined so the game's typeof-guards take the no-op path
  new Function('window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame', '__out', patched)(
    sandbox.window, sandbox.document, sandbox.localStorage, undefined, sandbox.requestAnimationFrame, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store;
  return api;
}

// ---- boot & menu -----------------------------------------------------------
test('boots into menu and draws without error', () => {
  const a = boot();
  assert(a.getScreen() === 'menu', 'starts on menu');
  a.draw(); a.update(0.016);
});

test('every spawned brick is a valid cute-animal species', () => {
  const a = boot();
  a.reseed(2024); a.startGame();
  const G = a.getG();
  assert(a.SPECIES.length >= 6, 'a roster of critters');
  for (const b of G.bricks){
    assert(b.species >= 0 && b.species < a.SPECIES.length, 'species index in range');
  }
  // colors/sprites resolve even for a hand-made brick with no species field
  assert(typeof a.brickColor({ hp: 3 }) === 'string', 'brickColor tolerates missing species');
  const bombCol = a.brickColor({ bomb: true });
  assert(bombCol && bombCol !== a.brickColor({ species: 0 }), 'bombs look distinct');
  a.animalSprite(0, false); a.animalSprite(3, false); a.animalSprite(0, true);   // no throw
});

test('startGame spawns wave 1 with bricks and a +1-ball orb', () => {
  const a = boot();
  a.reseed(42);
  a.startGame();
  const G = a.getG();
  assert(a.getScreen() === 'game', 'in game');
  assert(G.wave === 1, 'wave 1');
  assert(G.bricks.length >= 3 && G.bricks.length <= 6, '3-6 bricks');
  assert(G.bricks.every(b => b.row === 0 && b.col >= 0 && b.col < 7), 'bricks on top row');
  assert(G.bricks.every(b => b.hp >= 1), 'live bricks');
  assert(G.items.some(it => it.type === 'orb'), 'orb guaranteed');
  assert(G.ballCount === 1 && G.power === 1, 'base stats');
});

// ---- daily streak ----------------------------------------------------------
test('daily streak increments on consecutive days and resets after a gap', () => {
  const a = boot();
  const m = a.getMeta();
  m.lastDay = 0; m.streak = 0; m.gems = 0;
  assert(a.dailyBonus(100) === 10, 'day 1 pays 10');
  assert(m.streak === 1, 'streak 1');
  assert(a.dailyBonus(100) === 0, 'same day pays nothing');
  assert(a.dailyBonus(101) === 20, 'day 2 pays 20');
  assert(m.streak === 2, 'streak 2');
  assert(a.dailyBonus(105) === 10, 'gap resets to day 1 pay');
  assert(m.streak === 1, 'streak reset');
  assert(m.gems === 40, 'gems banked');
});

// ---- volley firing + physics -----------------------------------------------
test('fireVolley rejects downward aim, accepts upward, clamps near-horizontal', () => {
  const a = boot();
  a.reseed(7); a.startGame();
  const G = a.getG();
  assert(a.fireVolley(0, 1) === false, 'cannot fire down');
  assert(a.fireVolley(1000, -1) === false, 'too flat rejected');
  assert(G.phase === 'aim', 'still aiming');
  assert(a.fireVolley(10, -1) === true, 'near-horizontal accepted');
  assert(Math.abs(G.dir.x) <= 0.985 && G.dir.y < 0, 'angle clamped upward');
  assert(G.phase === 'fly' && G.queue === G.ballCount, 'volley queued');
});

test('a full volley resolves: balls land, rows descend, next wave spawns', () => {
  const a = boot();
  a.reseed(1234); a.startGame();
  const G = a.getG();
  for (const b of G.bricks){ b.hp = 50; b.max = 50; }   // survive the volley
  a.fireVolley(0.2, -1);
  let n = 0;
  while (G.phase === 'fly' && n++ < 20000) a.stepPhysics(1 / 60);
  assert(n < 20000, 'volley terminated');
  assert(G.balls.length === 0 && G.queue === 0, 'all balls returned');
  assert(G.wave === 2, 'wave advanced');
  assert(G.bricks.some(b => b.row === 1), 'old row descended');
  assert(G.bricks.some(b => b.row === 0), 'new row spawned');
  assert(G.launchX >= 0 && G.launchX <= 420, 'launch point sane');
});

// ---- combat ----------------------------------------------------------------
test('killing a brick scores its max hp, bumps combo, banks stats', () => {
  const a = boot();
  a.reseed(9); a.startGame();
  const G = a.getG();
  const m = a.getMeta();
  const bricksBefore = m.bricks;
  G.bricks.length = 0;
  G.bricks.push({ id: 900, col: 3, row: 4, hp: 1, max: 5, bomb: false });
  const b = G.bricks[0];
  const killed = a.damageBrick(b, 1);
  assert(killed === true, 'brick died');
  assert(G.bricks.length === 0, 'brick removed');
  assert(G.score === 5, 'scored max hp');
  assert(G.combo === 1 && G.bestCombo === 1, 'combo counted');
  assert(m.bricks === bricksBefore + 1, 'lifetime bricks tracked');
});

test('crit at 100% triples damage', () => {
  const a = boot();
  a.reseed(5); a.startGame();
  const G = a.getG();
  G.crit = 1;
  G.bricks.length = 0;
  G.bricks.push({ id: 901, col: 2, row: 2, hp: 3, max: 3, bomb: false });
  const killed = a.damageBrick(G.bricks[0], 1);
  assert(killed === true, '3hp brick dies to one crit hit at power 1');
});

test('explosion damages the 8 neighbors but not distant bricks', () => {
  const a = boot();
  a.reseed(5); a.startGame();
  const G = a.getG();
  G.wave = 4; G.power = 1;                     // dmg = ceil(4/2)+2 = 4
  G.bricks.length = 0; G.items.length = 0;
  G.bricks.push({ id: 1, col: 3, row: 3, hp: 100, max: 100, bomb: false });   // neighbor
  G.bricks.push({ id: 2, col: 4, row: 4, hp: 100, max: 100, bomb: false });   // diagonal neighbor
  G.bricks.push({ id: 3, col: 6, row: 3, hp: 100, max: 100, bomb: false });   // far away
  a.explode(3, 4);
  assert(G.bricks[0].hp === 96, 'orthogonal neighbor damaged');
  assert(G.bricks[1].hp === 96, 'diagonal neighbor damaged');
  assert(G.bricks[2].hp === 100, 'distant brick untouched');
});

test('laser item wipes damage across its whole row', () => {
  const a = boot();
  a.reseed(5); a.startGame();
  const G = a.getG();
  G.power = 2;                                  // laser dmg = power*2 = 4
  G.bricks.length = 0; G.items.length = 0;
  G.bricks.push({ id: 1, col: 0, row: 5, hp: 10, max: 10, bomb: false });
  G.bricks.push({ id: 2, col: 6, row: 5, hp: 3, max: 3, bomb: false });
  G.bricks.push({ id: 3, col: 3, row: 2, hp: 10, max: 10, bomb: false });
  const it = { col: 3, row: 5, type: 'laserH' };
  G.items.push(it);
  a.collectItem(it);
  assert(G.items.length === 0, 'laser consumed');
  assert(G.bricks.find(b => b.id === 1).hp === 6, 'row brick damaged');
  assert(!G.bricks.find(b => b.id === 2), 'weak row brick died');
  assert(G.bricks.find(b => b.id === 3).hp === 10, 'other row untouched');
});

test('orb adds a ball; gem pays out through gem multipliers', () => {
  const a = boot();
  a.reseed(5); a.startGame();
  const G = a.getG();
  const m = a.getMeta();
  G.items.length = 0;
  const orb = { col: 1, row: 1, type: 'orb' };
  G.items.push(orb);
  const balls = G.ballCount;
  a.collectItem(orb);
  assert(G.ballCount === balls + 1, 'orb grants ball');
  m.gems = 0; m.up.gemx = 4;                    // +100% from meta
  G.gemMul = 2;                                 // perk doubler
  const gem = { col: 2, row: 1, type: 'gem' };
  G.items.push(gem);
  const runGems = G.runGems;
  a.collectItem(gem);
  assert(m.gems === 4, '1 gem ×2 perk ×2 meta = 4');
  assert(G.runGems === runGems + 4, 'run tally matches');
});

// ---- perks -----------------------------------------------------------------
test('every perk applies its effect; offers are 3 distinct picks', () => {
  const a = boot();
  a.reseed(31); a.startGame();
  const G = a.getG();
  const grab = id => a.PERKS.find(p => p.id === id);
  const balls = G.ballCount; a.applyPerk(grab('balls'));
  assert(G.ballCount === balls + 3, '+3 balls');
  const pow = G.power; a.applyPerk(grab('power'));
  assert(G.power === pow + 1, 'power +1');
  a.applyPerk(grab('pierce'));
  assert(G.pierce === true, 'pierce set');
  const crit = G.crit; a.applyPerk(grab('crit'));
  assert(Math.abs(G.crit - crit - 0.15) < 1e-9, 'crit +15%');
  const boom = G.boom; a.applyPerk(grab('boom'));
  assert(Math.abs(G.boom - boom - 0.15) < 1e-9, 'boom +15%');
  const gm = G.gemMul; a.applyPerk(grab('gemx'));
  assert(G.gemMul === gm * 2, 'gems ×2');
  G.bricks.length = 0;
  G.bricks.push({ id: 1, col: 0, row: 0, hp: 10, max: 10, bomb: false });
  a.applyPerk(grab('shrink'));
  assert(G.bricks[0].hp === 7, 'shrink ray trims 30%');
  const luck = G.luck; a.applyPerk(grab('lucky'));
  assert(G.luck === luck * 1.5, 'lucky ×1.5');
  // offers: 3 distinct, pierce excluded once taken
  for (let i = 0; i < 20; i++){
    const offer = a.offerPerks();
    assert(offer.length === 3, '3 perks offered');
    assert(new Set(offer.map(p => p.id)).size === 3, 'distinct perks');
    assert(!offer.some(p => p.id === 'pierce'), 'once-only perk not re-offered');
  }
});

test('perk screen triggers every 5th wave and picking one resumes aiming', () => {
  const a = boot();
  a.reseed(77); a.startGame();
  const G = a.getG();
  G.wave = 4;
  G.bricks.length = 0; G.items.length = 0; G.balls.length = 0; G.queue = 0;
  a.endVolley();
  assert(G.wave === 5 && G.phase === 'perk', 'perk offer on wave 5');
  assert(G.perkOffer && G.perkOffer.length === 3, '3 cards');
  a.uiClick('perk0');
  assert(G.phase === 'aim' && G.perkOffer === null, 'back to aiming');
  assert(G.perksTaken.length === 1, 'perk recorded');
});

// ---- difficulty curve --------------------------------------------------------
test('brick hp grows superlinearly while early waves stay gentle', () => {
  const a = boot();
  assert(a.brickHp(1) === 1 && a.brickHp(2) === 2, 'gentle start');
  assert(a.brickHp(30) >= 30 * 1.5, 'quadratic term bites by wave 30');
  assert(a.brickHp(60) >= 60 * 2, 'late game doubles+');
  assert(a.toughChance(50) <= 0.35, 'tough chance capped');
  assert(a.toughChance(40) > a.toughChance(5), 'tough chance scales');
});

test('surge waves double-descend and never skip the perk cadence', () => {
  const a = boot();
  a.reseed(21); a.startGame();
  const G = a.getG();
  assert(a.doubleWave(18) && !a.doubleWave(19) && a.doubleWave(24), 'surge rule');
  G.wave = 17; G.nextPerkAt = 20;
  G.bricks.length = 0; G.items.length = 0; G.balls.length = 0; G.queue = 0;
  a.endVolley();                                  // 17 → 18 triggers surge → 19
  assert(G.wave === 19, 'surge spawned two waves');
  assert(G.bricks.some(b => b.row === 0) && G.bricks.some(b => b.row === 1), 'both rows on board');
  assert(G.phase === 'aim', 'no perk yet');
  a.endVolley();                                  // 19 → 20 crosses nextPerkAt
  assert(G.wave === 20 && G.phase === 'perk', 'perk not skipped by wave jumps');
});

// ---- active abilities --------------------------------------------------------
test('kills charge the energy meter and it caps at max', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  G.energy = 0; G.combo = 0;
  G.bricks.length = 0;
  G.bricks.push({ id: 1, col: 0, row: 3, hp: 1, max: 1, bomb: false });
  a.killBrick(G.bricks[0]);
  assert(G.energy > 0, 'kill gave energy');
  a.addEnergy(9999);
  assert(G.energy === a.C.ENERGY_MAX, 'energy capped at max');
});

test('abilities are gated by energy and by the aim phase', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  G.energy = 0;
  assert(a.castAbility('over') === false, 'no energy → refused');
  G.energy = a.C.ENERGY_MAX;
  G.phase = 'fly';
  assert(a.castAbility('over') === false, 'wrong phase → refused');
  G.phase = 'aim';
  assert(a.castAbility('nope') === false, 'unknown ability → refused');
  assert(a.castAbility('over') === true, 'affordable in aim → cast');
  assert(G.overcharge === true, 'overcharge armed');
});

test('Overcharge doubles volley damage and grants pierce for one shot', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  G.power = 3; G.pierce = false;
  G.energy = a.C.ENERGY_MAX;
  a.castAbility('over');
  a.fireVolley(0.2, -1);
  assert(G.volleyDmg === 6, 'damage doubled for the volley');
  assert(G.volleyPierce === true, 'volley pierces');
  assert(G.overcharge === false, 'overcharge consumed');
  // next volley is back to normal
  G.phase = 'aim';
  a.fireVolley(0.2, -1);
  assert(G.volleyDmg === 3 && G.volleyPierce === false, 'buff was one-shot only');
});

test('Blast obliterates the front row and heavily damages the row behind', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  G.energy = a.C.ENERGY_MAX;
  G.wave = 10; G.power = 1;
  G.bricks.length = 0; G.items.length = 0;
  G.bricks.push({ id: 1, col: 2, row: 6, hp: 5, max: 5, bomb: false });   // front row
  G.bricks.push({ id: 2, col: 3, row: 6, hp: 9, max: 9, bomb: false });   // front row
  G.bricks.push({ id: 3, col: 4, row: 5, hp: 9999, max: 9999, bomb: false }); // row behind (survives, dented)
  G.bricks.push({ id: 4, col: 5, row: 2, hp: 50, max: 50, bomb: false });  // untouched
  a.castAbility('blast');
  assert(!G.bricks.find(b => b.id === 1) && !G.bricks.find(b => b.id === 2), 'front row wiped');
  assert(G.bricks.find(b => b.id === 3).hp < 9999, 'row behind damaged');
  assert(G.bricks.find(b => b.id === 4).hp === 50, 'distant row untouched');
});

test('Freeze skips exactly one descent, then normal descent resumes', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  G.energy = a.C.ENERGY_MAX;
  a.castAbility('freeze');
  assert(G.freeze === true, 'freeze armed');
  G.bricks.length = 0; G.items.length = 0; G.balls.length = 0; G.queue = 0;
  G.bricks.push({ id: 1, col: 0, row: 2, hp: 5, max: 5, bomb: false });
  a.endVolley();
  assert(G.bricks.find(b => b.id === 1).row === 2, 'row did NOT descend while frozen');
  assert(G.freeze === false, 'freeze consumed');
  const rowNow = G.bricks.find(b => b.id === 1).row;
  a.endVolley();
  assert(G.bricks.find(b => b.id === 1).row === rowNow + 1, 'descent resumes next turn');
});

test('Perfect clear (empty board in one volley) pays a bonus', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  const m = a.getMeta();
  G.bricks.length = 0; G.items.length = 0; G.balls.length = 0; G.queue = 0;
  G.energy = 10; m.gems = 0; const score0 = G.score;
  a.endVolley();
  assert(G.perfects === 1, 'perfect counted');
  assert(m.gems > 0, 'gems paid');
  assert(G.energy > 10, 'energy refunded');
  assert(G.score > score0, 'score bonus');
});

test('efficient perk discounts ability cost; power-cell refills energy', () => {
  const a = boot();
  a.reseed(4); a.startGame();
  const G = a.getG();
  const grab = id => a.PERKS.find(p => p.id === id);
  const blast = a.ABILITIES.find(x => x.id === 'blast');
  const base = a.abilityCost(blast);
  a.applyPerk(grab('effic'));
  assert(a.abilityCost(blast) < base, 'cost reduced');
  G.energy = 0;
  a.applyPerk(grab('charge'));
  assert(G.energy === a.C.ENERGY_MAX, 'power cell refilled energy');
});

// ---- game over / revive ----------------------------------------------------
test('brick reaching the line ends the run and banks best/topRuns', () => {
  const a = boot();
  a.reseed(3); a.startGame();
  const G = a.getG();
  const m = a.getMeta();
  G.score = 999; G.wave = 7;
  G.bricks.length = 0; G.items.length = 0;
  G.bricks.push({ id: 1, col: 3, row: 8, hp: 5, max: 5, bomb: false });
  a.endVolley();                                  // descend pushes it past the line
  assert(G.phase === 'over', 'game over');
  assert(m.best === 999, 'best updated');
  assert(m.topRuns.length >= 1 && m.topRuns[0].score === 999, 'top runs recorded');
  assert(G.runGems > 0, 'end-of-run gems paid');
});

test('revive costs gems, clears the bottom rows, and only works once', () => {
  const a = boot();
  a.reseed(3); a.startGame();
  const G = a.getG();
  const m = a.getMeta();
  m.gems = 200;
  G.bricks.length = 0;
  G.bricks.push({ id: 1, col: 0, row: 8, hp: 5, max: 5, bomb: false });
  G.bricks.push({ id: 2, col: 1, row: 1, hp: 5, max: 5, bomb: false });
  a.gameOver();
  assert(a.revive() === true, 'revive accepted');
  assert(m.gems === 200 - a.C.REVIVE_COST + G.runGems, 'gems spent (minus run payout)');
  assert(G.phase === 'aim', 'back in the run');
  assert(!G.bricks.some(b => b.row >= a.C.ROWS - 4), 'bottom rows cleared');
  assert(G.bricks.some(b => b.id === 2), 'top bricks survive');
  a.gameOver();
  assert(a.revive() === false, 'second revive refused');
});

// ---- meta shop + persistence -----------------------------------------------
test('upgrades cost gems, cap at max, and shape the next run', () => {
  const a = boot();
  const m = a.getMeta();
  m.gems = 100000;
  const u = a.UPGRADES.find(x => x.id === 'balls');
  for (let i = 0; i < u.max; i++) assert(a.buyUpgrade('balls') === true, 'buy lvl ' + i);
  assert(a.buyUpgrade('balls') === false, 'maxed refuses');
  assert(m.up.balls === u.max, 'level stored');
  m.gems = 0;
  assert(a.buyUpgrade('power') === false, 'broke refuses');
  m.gems = 100000;
  assert(a.buyUpgrade('power') === true, 'power buys');
  a.newRun();
  const G = a.getG();
  assert(G.ballCount === 1 + u.max, 'starting balls from meta');
  assert(G.power === 2, 'starting power from meta');
});

test('head start prefills aged rows without instantly losing', () => {
  const a = boot();
  const m = a.getMeta();
  m.up.head = 2;                                  // deepest head start
  a.reseed(11); a.newRun();
  const G = a.getG();
  assert(G.wave === 10 + 1, 'wave counter jumped');
  assert(G.score > 0, 'score credited');
  assert(a.checkOver() === false, 'not dead on arrival');
  assert(G.bricks.every(b => b.row <= 3), 'prefill stays near the top');
});

test('meta survives a save/load round trip across boots', () => {
  const a = boot();
  const m = a.getMeta();
  m.gems = 321; m.best = 4567; m.streak = 6; m.skin = 1; m.up.gemx = 2;
  a.saveMeta();
  const b = boot(a._store['ballistic_meta_v1']);
  const m2 = b.getMeta();
  assert(m2.gems === 321 && m2.best === 4567 && m2.streak === 6, 'scalars persist');
  assert(m2.skin === 1 && m2.up.gemx === 2, 'skin + upgrades persist');
});

test('corrupt save falls back to defaults instead of crashing', () => {
  const a = boot('{not json');
  assert(a.getMeta().gems === 0 && a.getMeta().best === 0, 'clean defaults');
});

// ---- skins / ui / misc -----------------------------------------------------
test('skins unlock by best score and equip via ui', () => {
  const a = boot();
  const m = a.getMeta();
  m.best = 0;
  assert(a.skinUnlocked(0) === true && a.skinUnlocked(1) === false, 'gates by best');
  a.uiClick('skin:1');
  assert(m.skin === 0, 'locked skin refuses');
  m.best = a.SKINS[1].need;
  a.uiClick('skin:1');
  assert(m.skin === 1, 'unlocked skin equips');
});

test('ui navigation: shop, back, sound toggle, retry', () => {
  const a = boot();
  a.uiClick('shop');
  assert(a.getScreen() === 'shop', 'shop opens'); a.draw();
  a.uiClick('back');
  assert(a.getScreen() === 'menu', 'back to menu');
  const snd = a.getMeta().sound;
  a.uiClick('sound');
  assert(a.getMeta().sound !== snd, 'sound toggles');
  a.uiClick('play');
  assert(a.getScreen() === 'game', 'play starts');
  a.getG().phase = 'over';
  a.uiClick('retry');
  assert(a.getG().phase === 'aim' && a.getG().wave >= 1, 'instant restart');
});

test('draw + update run clean through every phase (render smoke)', () => {
  const a = boot();
  a.reseed(99);
  a.draw();                                       // menu
  a.uiClick('shop'); a.draw();                    // shop
  a.uiClick('back'); a.startGame();
  const G = a.getG();
  G.energy = a.C.ENERGY_MAX; a.draw();            // ability bar, powers "ready"
  G.aim = { x: 300, y: 200 }; a.draw();           // aim + guide
  G.aim = null;
  a.fireVolley(0.3, -1);
  for (let i = 0; i < 30; i++){ a.update(1 / 60); a.draw(); }   // fly w/ balls+trails
  G.phase = 'perk'; G.perkOffer = a.offerPerks(); a.draw();     // perk cards
  a.uiClick('perk1');
  G.bricks.push({ id: 5000, col: 0, row: 8, hp: 1, max: 1, bomb: false });
  a.gameOver(); a.draw();                          // game over screen
  a.update(0.016);
});

test('fmt shortens big numbers', () => {
  const a = boot();
  assert(a.fmt(999) === '999', '999');
  assert(a.fmt(9999) === '9999', 'sub-10k stays exact');
  assert(a.fmt(25000) === '25k', 'k suffix');
  assert(a.fmt(2500000) === '2.5m', 'm suffix');
});

console.log(`ballistic: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
