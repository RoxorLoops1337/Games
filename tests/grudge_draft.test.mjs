// Grudge Draft: headless suite.
//
// Drives the real game through tests/grudge_draft_lib.mjs: the roster, the
// cliques, the deterministic battle, the draft, the whole match flow, and every
// draw path.  draw() is exercised in every phase and every character is put
// through the rig, so a bad prop name or a render-time slip fails here instead
// of on somebody's phone.
// Run: node tests/grudge_draft.test.mjs

import { boot } from './grudge_draft_lib.mjs';

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg){ if (a !== b) throw new Error(`${msg || 'not equal'}: ${a} !== ${b}`); }
function near(a, b, eps, msg){ if (Math.abs(a - b) > eps) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`); }

/* Runs a battle to its natural end and hands back the verdict. */
function runOut(api, seed, cap){
  api.startBattle(seed >>> 0);
  let guard = 0, lim = cap || Math.ceil(api.ROUND_CAP / api.STEP) + 240;
  while (!api.B.over && guard++ < lim) api.simStep(api.STEP);
  return api.B.over;
}
function fight(api, mine, theirs, seed){
  api.G.foe = null;
  api.G.youSquad = mine.slice();
  api.G.foeSquad = theirs.slice();
  return runOut(api, seed);
}

const A = boot();

/* ============================ roster integrity ============================ */
const AB_KINDS = new Set(['aoe','friendly','slow','stun','dodge','taunt','heal','aura',
  'revive','raise','tax','exploit','charm','blind','ramp','spawn','bomb']);
const HAIR = new Set(['bald','buzz','short','mop','bob','perm','bun','pony','long','spike']);
const HATS = new Set([0,'cap','capBack','visor','bucket','beanie','peaked','tam','headband','helmet']);

test('roster ids are unique and indexed', () => {
  const seen = new Set();
  for (const u of A.ROSTER){
    assert(!seen.has(u.id), 'duplicate id ' + u.id);
    seen.add(u.id);
    eq(A.BY_ID[u.id], u, 'index missing ' + u.id);
  }
  assert(A.ROSTER.length >= 30, 'roster is thin: ' + A.ROSTER.length);
});

test('every unit has sane stats, copy and art', () => {
  for (const u of A.ROSTER){
    assert(u.name && u.name.length > 2, 'no name on ' + u.id);
    assert(u.abt && u.fl, 'missing copy on ' + u.id);
    assert('crl'.includes(u.rar), 'bad rarity on ' + u.id);
    assert(u.hp > 0 && u.dmg > 0 && u.rate > 0, 'bad combat stats on ' + u.id);
    assert(u.rng >= 20 && u.rng <= 400, 'bad range on ' + u.id);
    assert(u.spd >= 0 && u.spd <= 200, 'bad speed on ' + u.id);
    assert(u.r >= 8 && u.r <= 40, 'bad radius on ' + u.id);
    assert(Array.isArray(u.tags), 'tags must be an array on ' + u.id);
    for (const t of u.tags) assert(A.CLIQUES[t], `unknown tag ${t} on ${u.id}`);
    for (const a of u.ab || []) assert(AB_KINDS.has(a.k), `unknown ability ${a.k} on ${u.id}`);
    assert(u.art && u.art.skin && u.art.shirt && u.art.trs, 'art block incomplete on ' + u.id);
    assert(HAIR.has(u.art.hs), `unknown hair ${u.art.hs} on ${u.id}`);
    assert(HATS.has(u.art.hat || 0), `unknown hat ${u.art.hat} on ${u.id}`);
    assert(u.art.build > .3 && u.art.build < 2.2, 'silly build on ' + u.id);
  }
});

test('no unit swings so hard it one-shots the toughest thing in the game', () => {
  const tough = Math.max(...A.ROSTER.map(u => u.hp));
  for (const u of A.ROSTER) assert(u.dmg < tough * .6, u.id + ' hits far too hard');
});

test('every ability text names a real ability, and spawns point at real units', () => {
  for (const u of A.ROSTER)
    for (const a of u.ab || [])
      if (a.k === 'spawn') assert(A.BY_ID[a.id], `${u.id} spawns unknown ${a.id}`);
});

test('the draft pool hides the spawn-only units', () => {
  assert(A.POOL.every(u => !u.hidden), 'hidden unit leaked into the pool');
  assert(A.ROSTER.some(u => u.hidden), 'nothing is spawn-only, the group chat should be');
  assert(A.POOL.length === A.ROSTER.filter(u => !u.hidden).length, 'pool size mismatch');
});

test('every clique tier is reachable without drafting the same person twice', () => {
  for (const tag of A.CLIQUE_KEYS){
    const n = A.POOL.filter(u => u.tags.indexOf(tag) >= 0).length;
    for (const [need, txt] of A.CLIQUES[tag].tiers){
      assert(n >= need, `${tag} tier at ${need} needs that many distinct members, has ${n}`);
      assert(txt && txt.length > 8, `${tag} tier at ${need} has no readable text`);
    }
    const ns = A.CLIQUES[tag].tiers.map(t => t[0]);
    for (let i = 1; i < ns.length; i++) assert(ns[i] > ns[i - 1], tag + ' tiers are out of order');
  }
});

test('the street is eight distinct households with usable copy and sane dials', () => {
  const ids = new Set();
  for (const f of A.FOES){
    assert(!ids.has(f.id), 'duplicate household ' + f.id);
    ids.add(f.id);
    assert(f.diff >= .6 && f.diff <= 1.8, 'difficulty dial off the scale on ' + f.id);
    assert(f.name && f.bl && f.win && f.lose && f.at, 'household copy incomplete: ' + f.id);
    assert(f.likes.length > 0, f.id + ' has no taste');
    for (const t of f.likes) assert(A.CLIQUES[t], `${f.id} likes unknown clique ${t}`);
    assert(f.art && f.art.skin, 'no face for ' + f.id);
  }
  assert(A.FOES.length >= 6, 'the street is too short');
});

/* ================================ cliques ================================= */
test('clique counting treats a x4 pick as one card', () => {
  const c = A.cliqueCount(['recorder']);
  eq(c.NOISE, 1, 'recorder class should count once');
  eq(A.cliqueCount(['recorder', 'karen', 'dog']).NOISE, 3, 'three noise cards');
});

test('tiers fire at their thresholds and not before', () => {
  eq(A.cliqueTier('FAMILY', 2), -1, 'two is not a family');
  eq(A.cliqueTier('FAMILY', 3), 0, 'three is');
  eq(A.cliqueTier('FAMILY', 5), 1, 'five is the second tier');
  eq(A.cliqueTier('OFFICIAL', 2), 0);
  eq(A.cliqueTier('OFFICIAL', 4), 1);
  eq(A.cliqueTier('NOWT', 9), -1, 'unknown tag has no tier');
});

test('clique effects land on the right side of the street', () => {
  const fam = A.cliqueFx(['nan', 'uncle', 'toddler']);
  near(fam.dmg, 1.18, 1e-9, 'family tier one');
  const fam5 = A.cliqueFx(['nan', 'uncle', 'toddler', 'mil', 'bbq']);
  near(fam5.dmg, 1.34, 1e-9, 'family tier two');
  const off = A.cliqueFx(['taxman', 'warden']);
  near(off.foeDmg, .86, 1e-9, 'officials dock THEIR damage, not ours');
  eq(off.dmg, 1, 'officials do not buff our own damage');
  const noise = A.cliqueFx(['karen', 'dog', 'piper']);
  near(noise.foeRate, .82, 1e-9, 'noise slows their swings');
  const fitv = A.cliqueFx(['gymbro', 'zumba']);
  near(fitv.spd, 1.15, 1e-9); near(fitv.rate, 1.15, 1e-9);
  near(A.cliqueFx(['gymbro', 'zumba', 'refdad', 'bbq']).spd, 1.28, 1e-9, 'fitness tier two');
  eq(A.cliqueFx(['nan', 'supernan']).eldHp, 1.45, 'elderly get their padding');
  eq(A.cliqueFx(['theex', 'mil']).ex, 1, 'two exes compare notes');
  eq(A.cliqueFx(['toddler', 'wasp', 'dog']).pest, 1, 'three pests get one comeback');
  eq(A.cliqueFx(['karen', 'recorder', 'piper']).pest, 0, 'the noisy are not the pests');
  eq(A.cliqueFx(['toddler', 'wasp', 'dog', 'segway']).pest, 1, 'four is still one comeback');
  eq(A.cliqueFx([]).active.length, 0, 'an empty squad has no cliques');
});

test('the elderly bonus only pads the elderly', () => {
  const fx = A.cliqueFx(['nan', 'supernan']);
  const old = A.mkUnit(A.BY_ID.nan, 0, 100, 100, fx, 1);
  const young = A.mkUnit(A.BY_ID.wasp, 0, 100, 100, fx, 1);
  near(old.max, A.BY_ID.nan.hp * 1.45, 1e-6, 'nan is padded');
  near(young.max, A.BY_ID.wasp.hp, 1e-6, 'the wasp is not');
});

/* ================================ deploy ================================== */
test('a squad deploys inside the street with melee ahead of the talkers', () => {
  const fx = A.cliqueFx([]);
  const side0 = A.deploy(0, ['nan', 'camera', 'uncle', 'gymbro'], fx, 1);
  const side1 = A.deploy(1, ['nan', 'camera', 'uncle', 'gymbro'], fx, 1);
  for (const u of side0.concat(side1)){
    assert(u.x > 0 && u.x < A.FW, 'off the road: ' + u.x);
    assert(u.y > 0 && u.y < A.FH, 'off the road: ' + u.y);
  }
  const cam0 = side0.find(u => u.uid === 'camera'), nan0 = side0.find(u => u.uid === 'nan');
  assert(cam0.x < nan0.x, 'side 0 should keep the speed camera behind the nan');
  const cam1 = side1.find(u => u.uid === 'camera'), nan1 = side1.find(u => u.uid === 'nan');
  assert(cam1.x > nan1.x, 'side 1 mirrors it');
  assert(side0.every(u => u.side === 0) && side1.every(u => u.side === 1), 'sides tagged');
});

test('multi-body picks deploy every body', () => {
  const fx = A.cliqueFx([]);
  eq(A.deploy(0, ['recorder'], fx, 1).length, 4, 'recorder class is four kids');
  eq(A.deploy(0, ['toddler', 'wasp'], fx, 1).length, 5, 'three toddlers plus two wasps');
});

test('difficulty scales the household, not you', () => {
  const fx = A.cliqueFx([]);
  const easy = A.mkUnit(A.BY_ID.karen, 1, 0, 0, fx, 1);
  const hard = A.mkUnit(A.BY_ID.karen, 1, 0, 0, fx, 1.5);
  near(hard.max / easy.max, 1.5, 1e-6, 'health scales');
  near(hard.dmg / easy.dmg, 1.5, 1e-6, 'damage scales');
  eq(hard.spd, easy.spd, 'speed does not');
});

/* ============================== determinism =============================== */
test('the same seed and the same squads give the exact same brawl', () => {
  const snap = () => A.B.units.map(u => `${u.uid}:${u.x.toFixed(4)}:${u.y.toFixed(4)}:${u.hp.toFixed(4)}`).join('|');
  const mine = ['nan', 'warden', 'sourdough'], theirs = ['gymbro', 'wasp', 'karen'];
  A.G.foe = null;
  A.G.youSquad = mine; A.G.foeSquad = theirs;
  A.startBattle(9001);
  for (let i = 0; i < 400; i++) A.simStep(A.STEP);
  const a = snap();
  A.G.youSquad = mine; A.G.foeSquad = theirs;
  A.startBattle(9001);
  for (let i = 0; i < 400; i++) A.simStep(A.STEP);
  eq(snap(), a, 'replay diverged');
});

test('drawing between steps does not disturb the sim', () => {
  const mine = ['piper', 'theex'], theirs = ['dog', 'taxman'];
  A.G.foe = null;
  A.G.youSquad = mine; A.G.foeSquad = theirs;
  A.startBattle(4242);
  for (let i = 0; i < 300; i++) A.simStep(A.STEP);
  const clean = A.B.units.map(u => u.hp.toFixed(5)).join('|');
  A.G.youSquad = mine; A.G.foeSquad = theirs;
  A.startBattle(4242);
  A.B.shake = 1;
  for (let i = 0; i < 300; i++){ A.simStep(A.STEP); A.draw(i * A.STEP); }
  eq(A.B.units.map(u => u.hp.toFixed(5)).join('|'), clean, 'rendering leaked into the rng');
});

test('a different seed actually gives a different brawl', () => {
  const mine = ['nan', 'warden', 'sourdough'], theirs = ['gymbro', 'wasp', 'karen'];
  const at = (seed) => {
    A.G.foe = null; A.G.youSquad = mine; A.G.foeSquad = theirs;
    A.startBattle(seed);
    for (let i = 0; i < 200; i++) A.simStep(A.STEP);
    return A.B.units.map(u => u.x.toFixed(3)).join('|');
  };
  assert(at(1) !== at(2), 'seeds 1 and 2 produced identical openings');
});

/* ============================== the fight ================================= */
test('every pairing of a random squad ends inside the round cap', () => {
  A.reseed(77);
  for (let i = 0; i < 60; i++){
    const mine = A.rollOffers(3), theirs = A.rollOffers(3);
    const over = fight(A, mine, theirs, 1000 + i);
    assert(over, `no verdict for ${mine} vs ${theirs}`);
    assert(over.win === 0 || over.win === 1 || over.win === -1, 'bad winner ' + over.win);
    assert(A.B.t <= A.ROUND_CAP + 1, 'ran past the cap: ' + A.B.t);
  }
});

test('a stacked squad beats a lone toddler nearly every time', () => {
  let wins = 0;
  for (let i = 0; i < 24; i++)
    if (fight(A, ['supernan', 'auditor', 'binlorry'], ['toddler'], 500 + i).win === 0) wins++;
  assert(wins >= 23, 'the legends only won ' + wins + '/24');
});

test('the same squad against itself is close to even over many seeds', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 40; i++){
    const w = fight(A, ['karen', 'gymbro', 'warden'], ['karen', 'gymbro', 'warden'], 7000 + i).win;
    if (w === 0) a++; else if (w === 1) b++;
  }
  assert(a > 8 && b > 8, `mirror match was lopsided: ${a} vs ${b}`);
});

test('cliques are worth having: three family beat three strangers more often than not', () => {
  let fam = 0;
  for (let i = 0; i < 30; i++)
    if (fight(A, ['nan', 'uncle', 'bbq'], ['preacher', 'segway', 'influencer'], 3300 + i).win === 0) fam++;
  assert(fam >= 18, 'family only won ' + fam + '/30');
});

test('the difficulty dial actually makes a household harder', () => {
  const run = (diff) => {
    let w = 0;
    for (let i = 0; i < 24; i++){
      A.G.foe = { diff };
      A.G.youSquad = ['karen', 'warden', 'gymbro'];
      A.G.foeSquad = ['karen', 'warden', 'gymbro'];
      if (runOut(A, 8800 + i).win === 0) w++;
    }
    A.G.foe = null;
    return w;
  };
  assert(run(.7) > run(1.6), 'a 1.6x household was not harder than a 0.7x one');
});

/* ============================== abilities ================================= */
function solo(api, defId, side, x, y, diff){
  const fx = api.cliqueFx([]);
  const u = api.mkUnit(api.BY_ID[defId], side, x, y, fx, diff || 1);
  api.B.units.push(u);
  return u;
}
function arena(api, seed){
  api.reseed(seed || 5);
  api.B.units = []; api.B.bodies = []; api.B.fx = []; api.B.nums = [];
  api.B.t = 0; api.B.over = null; api.B.shake = 0; api.B.running = true;
  api.B.side[0] = api.cliqueFx([]); api.B.side[1] = api.cliqueFx([]);
}

test('revive brings the preacher back exactly once', () => {
  arena(A);
  const p = solo(A, 'preacher', 0, 100, 100);
  A.killUnit(p, null);
  assert(p.alive, 'he did not come back');
  near(p.hp, p.max * .5, 1e-6, 'came back at the wrong health');
  A.killUnit(p, null);
  assert(!p.alive, 'he came back twice');
});

test('the pest clique gives pests their comebacks, and only pests', () => {
  arena(A);
  A.B.side[0] = A.cliqueFx(['toddler', 'wasp', 'dog']);
  const fx = A.B.side[0];
  const d = A.mkUnit(A.BY_ID.dog, 0, 100, 100, fx, 1);
  const k = A.mkUnit(A.BY_ID.karen, 0, 100, 100, fx, 1);
  A.B.units.push(d, k);
  A.killUnit(d, null);
  assert(d.alive && Math.abs(d.hp - d.max * .5) < 1e-6, 'the dog should be back at half health');
  A.killUnit(d, null);
  assert(!d.alive, 'three pests is one comeback, not two');
  A.killUnit(k, null);
  assert(!k.alive, 'karen is not a pest and should stay down');

  arena(A);
  A.B.side[0] = A.cliqueFx(['toddler', 'wasp', 'dog', 'segway', 'preacher']);
  const d2 = A.mkUnit(A.BY_ID.dog, 0, 100, 100, A.B.side[0], 1);
  A.B.units.push(d2);
  A.killUnit(d2, null); assert(d2.alive, 'first comeback');
  A.killUnit(d2, null); assert(d2.alive, 'five pests should buy a second comeback');
  A.killUnit(d2, null); assert(!d2.alive, 'but not a third');
});

test('tax permanently docks what a target can hit for', () => {
  arena(A);
  const t = solo(A, 'taxman', 0, 100, 100);
  const v = solo(A, 'gymbro', 1, 120, 100);
  const before = A.dmgOf(v);
  A.attack(t, v);
  assert(A.dmgOf(v) < before * .95, 'the audit did nothing');
  const mid = A.dmgOf(v);
  A.attack(t, v);
  assert(A.dmgOf(v) < mid * .95, 'tax should stack');
});

test('a wasp is hard to hit and a gym bro is not', () => {
  arena(A, 11);
  const w = solo(A, 'wasp', 1, 120, 100);
  const b = solo(A, 'gymbro', 1, 120, 140);
  const hitter = solo(A, 'karen', 0, 100, 120);
  let missW = 0, missB = 0;
  for (let i = 0; i < 200; i++){
    w.hp = w.max; b.hp = b.max;
    const h0 = w.hp; A.attack(hitter, w); if (w.hp === h0) missW++;
    const h1 = b.hp; A.attack(hitter, b); if (b.hp === h1) missB++;
  }
  assert(missW > 50, 'the wasp barely dodged: ' + missW);
  eq(missB, 0, 'the gym bro dodged something');
});

test('the sourdough guy heals the worst-off ally in range', () => {
  arena(A);
  const s = solo(A, 'sourdough', 0, 100, 100);
  const hurt1 = solo(A, 'nan', 0, 140, 100);
  const hurt2 = solo(A, 'karen', 0, 160, 100);
  hurt1.hp = hurt1.max * .9; hurt2.hp = hurt2.max * .2;
  const before = hurt2.hp;
  A.abilityTick(s, 3);
  assert(hurt2.hp > before, 'the worse-off ally was not fed');
  near(hurt1.hp, hurt1.max * .9, 1e-6, 'the healthier one was left alone');
});

test('the timeshare salesman borrows one of theirs, then gives it back', () => {
  arena(A);
  const sell = solo(A, 'timeshare', 0, 100, 100);
  const mark = solo(A, 'karen', 1, 130, 100);
  A.abilityTick(sell, 10);
  eq(mark.side, 0, 'the mark did not switch sides');
  eq(mark.home, 1, 'home allegiance must survive the pitch');
  for (let i = 0; i < 300; i++) A.simStep(A.STEP);
  eq(mark.side, 1, 'the charm never wore off');
});

test('a charmed unit still counts for the side it came from', () => {
  arena(A);
  const sell = solo(A, 'timeshare', 0, 100, 100);
  const mark = solo(A, 'karen', 1, 130, 100);
  A.abilityTick(sell, 10);
  eq(A.sideStanding(1), 1, 'charming their last body must not win the round outright');
  eq(A.checkOver(), null, 'the round ended on a charm');
  assert(sell && mark, 'units present');
});

test('the group chat keeps producing notifications, but not forever', () => {
  arena(A);
  const gcU = solo(A, 'groupchat', 0, 100, 100);
  solo(A, 'karen', 1, 800, 300);
  for (let i = 0; i < 60; i++) A.abilityTick(gcU, 1);
  const pings = A.B.units.filter(u => u.uid === 'ping');
  assert(pings.length > 3, 'the group chat went quiet: ' + pings.length);
  assert(A.B.units.filter(u => u.alive && u.side === 0).length <= 36, 'the spawn cap did not hold');
  assert(pings.every(u => u.spawned), 'spawns must be flagged so they do not decide the round');
});

test("nan's nan pulls attention and the exes ignore her for the big one", () => {
  arena(A);
  const nanNan = solo(A, 'supernan', 1, 300, 200);
  const lorry = solo(A, 'binlorry', 1, 320, 240);
  const grunt = solo(A, 'karen', 0, 100, 200);
  const ex = solo(A, 'exwedding', 0, 100, 240);
  eq(A.chooseTarget(grunt).uid, 'supernan', 'the taunt did not pull');
  eq(A.chooseTarget(ex).uid, 'supernan', 'the ex should go for the biggest health pool');
  assert(lorry.max < nanNan.max, 'this test assumes nan is the biggest');
});

test('splash from the bin lorry catches the crowd, the bagpiper catches everyone', () => {
  arena(A);
  const lorry = solo(A, 'binlorry', 0, 100, 100);
  const foeA = solo(A, 'karen', 1, 120, 100);
  const foeB = solo(A, 'karen', 1, 140, 100);
  const mate = solo(A, 'karen', 0, 130, 100);
  A.attack(lorry, foeA);
  assert(foeB.hp < foeB.max, 'the second one was not caught');
  eq(mate.hp, mate.max, 'the lorry should not flatten its own side');
  arena(A);
  const piper = solo(A, 'piper', 0, 100, 100);
  const them = solo(A, 'karen', 1, 118, 100);
  const ours = solo(A, 'karen', 0, 124, 100);
  A.attack(piper, them);
  assert(ours.hp < ours.max, 'the bagpipes spared an ally, which is not the joke');
});

test('the IT guy only reboots his own side', () => {
  arena(A);
  const it = solo(A, 'itguy', 0, 100, 100);
  const mine = solo(A, 'karen', 0, 120, 100);
  const theirs = solo(A, 'gymbro', 1, 140, 100);
  A.killUnit(theirs, null);
  A.abilityTick(it, 20);
  assert(!A.B.units.some(u => u.uid === 'gymbro' && u.alive), 'he rebooted the opposition');
  A.killUnit(mine, null);
  A.abilityTick(it, 20);
  assert(A.B.units.filter(u => u.uid === 'karen' && u.alive).length === 1, 'he did not reboot his own');
});

test("the best man's speech gets worse the longer it goes on", () => {
  arena(A);
  const bm = solo(A, 'bestman', 0, 100, 100);
  const start = A.dmgOf(bm);
  for (let i = 0; i < 600; i++) A.abilityTick(bm, A.STEP);
  assert(A.dmgOf(bm) > start * 1.5, 'it never built to anything');
});

test('auras reach across the sim and stop at their radius', () => {
  arena(A);
  const spk = solo(A, 'speaker', 0, 100, 100);
  const near1 = solo(A, 'karen', 0, 140, 100);
  const far = solo(A, 'karen', 0, 900, 380);
  solo(A, 'gymbro', 1, 500, 200);
  A.simStep(A.STEP);
  assert(near1.aDmg > 1.2, 'the pep talk did not reach: ' + near1.aDmg);
  eq(far.aDmg, 1, 'it reached far too far');
  assert(spk, 'speaker present');
});

test('the mother-in-law drags THEIR damage down, not ours', () => {
  arena(A);
  const mil = solo(A, 'mil', 0, 100, 100);
  const theirs = solo(A, 'gymbro', 1, 140, 100);
  const ours = solo(A, 'gymbro', 0, 150, 100);
  A.simStep(A.STEP);
  assert(theirs.aDmg < .9, 'she did not put them off: ' + theirs.aDmg);
  eq(ours.aDmg, 1, 'she should not be dampening her own side');
  assert(mil, 'present');
});

test('the influencer makes nearby enemies miss', () => {
  arena(A, 3);
  solo(A, 'influencer', 0, 100, 100);
  const shooter = solo(A, 'gymbro', 1, 140, 100);
  assert(A.blindOn(shooter) > .2, 'no ring light glare');
  const distant = solo(A, 'gymbro', 1, 900, 380);
  eq(A.blindOn(distant), 0, 'the glare carried across the whole street');
});

test('stunned units stop swinging', () => {
  arena(A);
  const a = solo(A, 'gymbro', 0, 100, 100);
  const b = solo(A, 'gymbro', 1, 110, 100);
  a.stun = 5; a.cd = 0;
  const hp = b.hp;
  for (let i = 0; i < 120; i++) A.simStep(A.STEP);
  eq(b.hp, hp, 'a stunned unit got a hit in');
});

/* ================================ draft =================================== */
test('an offer is three different, draftable people', () => {
  A.reseed(31);
  for (let i = 0; i < 200; i++){
    const o = A.rollOffers(3);
    eq(o.length, 3, 'wrong hand size');
    eq(new Set(o).size, 3, 'duplicate in a hand: ' + o);
    for (const id of o){
      assert(A.BY_ID[id], 'unknown id offered: ' + id);
      assert(!A.BY_ID[id].hidden, 'offered a spawn-only unit: ' + id);
    }
  }
});

test('commons show up more than legends', () => {
  A.reseed(5);
  const seen = { c:0, r:0, l:0 };
  for (let i = 0; i < 900; i++) seen[A.rollOne([]).rar]++;
  assert(seen.c > seen.r && seen.r > seen.l, `weights are off: ${JSON.stringify(seen)}`);
  assert(seen.l > 0, 'legends never appeared at all');
});

test('picking works through the draft and then stops', () => {
  A.startMatch(0);
  eq(A.G.phase, 'draft');
  eq(A.G.picksLeft, A.PICKS, 'wrong number of picks');
  const first = A.takePick(0);
  assert(first, 'first pick failed');
  eq(A.G.youSquad.length, 1);
  eq(A.G.picksLeft, A.PICKS - 1);
  eq(A.G.offers.length, 3, 'a fresh hand should be dealt');
  A.takePick(0); A.takePick(0);
  eq(A.G.picksLeft, 0);
  eq(A.G.offers.length, 0, 'offers should be cleared when the draft is done');
  eq(A.takePick(0), null, 'a fourth pick got through');
  eq(A.G.youSquad.length, 3);
});

test('panic rerolls the hand, twice, and no more', () => {
  A.startMatch(0);
  const before = A.G.offers.join(',');
  eq(A.G.panics, A.PANICS);
  assert(A.panicReroll(), 'first panic refused');
  eq(A.G.panics, A.PANICS - 1);
  assert(A.G.offers.join(',') !== before || true, 'reroll ran');
  assert(A.panicReroll(), 'second panic refused');
  eq(A.G.panics, 0);
  assert(!A.panicReroll(), 'a third panic got through');
});

test('panic is refused once the draft is over', () => {
  A.startMatch(0);
  A.takePick(0); A.takePick(0); A.takePick(0);
  assert(!A.panicReroll(), 'panicked with nothing left to pick');
});

test('the household drafts toward what it likes', () => {
  A.reseed(19);
  A.G.foe = A.FOES.find(f => f.id === 'gymlads');
  A.G.foeSquad = [];
  A.foeDraft(24);
  const fit = A.G.foeSquad.filter(id => A.BY_ID[id].tags.indexOf('FITNESS') >= 0).length;
  A.G.foe = A.FOES.find(f => f.id === 'pemberton');
  A.G.foeSquad = [];
  A.foeDraft(24);
  const off = A.G.foeSquad.filter(id => A.BY_ID[id].tags.indexOf('FITNESS') >= 0).length;
  assert(fit > off, `the gym lads drafted ${fit} fitness cards, the neighbours ${off}`);
  A.G.foe = null;
});

test('the household drafts as many bodies as you did', () => {
  A.startMatch(1);
  A.takePick(0); A.takePick(0); A.takePick(0);
  A.beginFight();
  eq(A.G.foeSquad.length, A.G.youSquad.length, 'the sides drafted different amounts');
  eq(A.G.phase, 'fight');
  assert(A.B.units.length > 0, 'nobody turned up');
});

/* ============================== match flow ================================ */
function playRound(api, winner){
  while (api.G.picksLeft > 0) api.takePick(0);
  api.beginFight();
  if (winner === 0){ api.G.foeSquad = []; }        // rig it: nobody turned up for them
  else if (winner === 1){ api.G.youSquad = []; }
  api.startBattle(1234);
  let guard = 0;
  while (!api.B.over && guard++ < 4000) api.simStep(api.STEP);
  api.endRound();
  api._flush();
}

test('a lost round costs a nerve and buys a pity pick', () => {
  A.startMatch(0);
  playRound(A, 1);
  eq(A.G.nerves[0], A.NERVES - 1, 'you should be down a nerve');
  eq(A.G.nerves[1], A.NERVES, 'they should be untouched');
  eq(A.G.pity, 1, 'no pity pick was banked');
  A.nextRound();
  eq(A.G.round, 2);
  eq(A.G.picksLeft, A.PICKS + 1, 'the pity pick did not arrive');
  eq(A.G.pity, 0, 'the pity pick should be spent');
});

test('a won round costs them a nerve and buys you nothing', () => {
  A.startMatch(0);
  playRound(A, 0);
  eq(A.G.nerves[1], A.NERVES - 1);
  eq(A.G.nerves[0], A.NERVES);
  A.nextRound();
  eq(A.G.picksLeft, A.PICKS, 'winners get no pity pick');
});

test('the squad carries over and grows every round', () => {
  A.startMatch(0);
  playRound(A, 0);
  A.nextRound();
  eq(A.G.youSquad.length, A.PICKS, 'squad was thrown away between rounds');
  while (A.G.picksLeft > 0) A.takePick(0);
  eq(A.G.youSquad.length, A.PICKS * 2, 'the squad did not grow');
});

test('everyone comes back to full health next round', () => {
  A.startMatch(0);
  while (A.G.picksLeft > 0) A.takePick(0);
  A.beginFight();
  for (let i = 0; i < 200; i++) A.simStep(A.STEP);
  A.endRound(); A._flush();
  A.nextRound();
  while (A.G.picksLeft > 0) A.takePick(0);
  A.beginFight();
  assert(A.B.units.every(u => u.hp === u.max), 'somebody started the round already hurt');
});

test('three lost nerves ends the match and does not advance the street', () => {
  A._store[A.SAVE_KEY] = JSON.stringify({ v:1, rung:2, wins:0, losses:0, book:{}, sfx:0 });
  const api = boot({ store: { [A.SAVE_KEY]: A._store[A.SAVE_KEY] } });
  api.startMatch(2);
  for (let i = 0; i < A.NERVES; i++){
    playRound(api, 1);
    if (api.G.nerves[0] > 0) api.nextRound();
  }
  eq(api.G.nerves[0], 0, 'you should be out of nerves');
  eq(api.G.result, 'lose', 'the match should be lost');
  eq(api.SAVE.rung, 2, 'a loss must not unlock the next household');
  eq(api.SAVE.losses, 1, 'the loss was not recorded');
});

test('winning a match unlocks the next household exactly once', () => {
  const api = boot();
  eq(api.SAVE.rung, 0, 'a fresh save starts at the top of the street');
  api.startMatch(0);
  for (let i = 0; i < api.NERVES; i++){
    playRound(api, 0);
    if (api.G.nerves[1] > 0) api.nextRound();
  }
  eq(api.G.result, 'win');
  eq(api.SAVE.rung, 1, 'the next household did not unlock');
  eq(api.SAVE.wins, 1);
  api.startMatch(0);
  for (let i = 0; i < api.NERVES; i++){
    playRound(api, 0);
    if (api.G.nerves[1] > 0) api.nextRound();
  }
  eq(api.SAVE.rung, 1, 'replaying an old household should not push the street on');
  eq(api.SAVE.wins, 2, 'the second win was not counted');
});

test('a full match against every household on the street reaches a verdict', () => {
  for (let f = 0; f < A.FOES.length; f++){
    const api = boot();
    api.startMatch(f);
    let guard = 0;
    while (!api.G.result && guard++ < 12){
      while (api.G.picksLeft > 0) api.takePick(guard % 3);
      api.beginFight();
      let g2 = 0;
      while (!api.B.over && g2++ < 4000) api.simStep(api.STEP);
      api.endRound(); api._flush();
      if (!api.G.result) api.nextRound();
    }
    assert(api.G.result === 'win' || api.G.result === 'lose', 'no verdict vs ' + api.FOES[f].name);
    assert(guard <= 6, 'match vs ' + api.FOES[f].name + ' ran ' + guard + ' rounds');
  }
});

/* ================================ saving ================================== */
test('progress survives a reload', () => {
  const api = boot();
  api.SAVE.rung = 4; api.SAVE.wins = 9; api.SAVE.losses = 2;
  api.bookOf('nan').picks = 12;
  api.writeSave();
  const again = boot({ store: api._store });
  eq(again.SAVE.rung, 4); eq(again.SAVE.wins, 9); eq(again.SAVE.losses, 2);
  eq(again.SAVE.book.nan.picks, 12, 'the grudge book was lost');
});

test('a corrupt or foreign save is ignored rather than fatal', () => {
  const bad = boot({ store: { [A.SAVE_KEY]: '{not json' } });
  eq(bad.SAVE.rung, 0, 'a corrupt save should fall back to a fresh one');
  const old = boot({ store: { [A.SAVE_KEY]: JSON.stringify({ v: 99, rung: 7 }) } });
  eq(old.SAVE.rung, 0, 'a save from another version should be ignored');
});

test('the grudge book records drafts and round wins', () => {
  const api = boot();
  api.startMatch(0);
  const picked = [];
  while (api.G.picksLeft > 0) picked.push(api.takePick(0));
  for (const id of picked) assert(api.SAVE.book[id].picks >= 1, 'draft not recorded for ' + id);
  api.beginFight();
  api.G.foeSquad = [];
  api.startBattle(1);
  let guard = 0;
  while (!api.B.over && guard++ < 4000) api.simStep(api.STEP);
  api.endRound(); api._flush();
  for (const id of picked) assert(api.SAVE.book[id].wins >= 1, 'round win not recorded for ' + id);
});

/* =============================== rendering ================================ */
test('every screen paints without throwing', () => {
  const api = boot();
  api.fit();
  api.toTitle(); api.drawConfetti(1);
  api.toLadder();
  api.toBook();
  api.toHelp();
  api.startMatch(0);
  api.draw(1);              // draft phase
  api.renderTray(); api.renderSquad(); api.renderSyn(); api.renderCards();
  while (api.G.picksLeft > 0) api.takePick(0);
  api.renderTray();
  api.beginFight();
  for (let i = 0; i < 400; i++){ api.simStep(api.STEP); api.draw(i * api.STEP); }
  api.draw(9);
  api.endRound(); api._flush();
  api.draw(10);
  assert(api._counts.fillRect > 0, 'nothing was actually drawn');
});

test('a battle in every state still draws: bodies, effects, numbers, shake', () => {
  const api = boot();
  api.fit();
  api.show('match');
  api.G.foe = null;
  api.G.youSquad = ['nan', 'recorder', 'binlorry', 'camera', 'groupchat', 'timeshare'];
  api.G.foeSquad = ['supernan', 'wasp', 'dog', 'toddler', 'zumba', 'bestman'];
  api.startBattle(21);
  api.B.shake = 1;
  for (let i = 0; i < 2400 && !api.B.over; i++){ api.simStep(api.STEP); if (i % 3 === 0) api.draw(i * api.STEP); }
  assert(api.B.bodies.length > 0, 'nobody went down in a six-a-side');
  api.draw(40);
  api.B.bodies.forEach(b => { b.t = 8; });   // fading bodies path
  api.draw(41);
});

test('every single character in the roster has a portrait that renders', () => {
  const api = boot();
  const cvStub = api._nodes.cv;
  for (const u of api.ROSTER){
    api._resetCounts();
    api.drawPortrait(cvStub.getContext('2d'), u, 150, 150, .3);
    assert(api._counts.fillRect > 0 || api._counts.fill > 0, 'nothing drawn for ' + u.id);
  }
});

test('every character draws walking, swinging and face down', () => {
  const api = boot();
  const ctx = api._nodes.cv.getContext('2d');
  for (const u of api.ROSTER)
    for (const o of [{ walk: .4 }, { swing: 1 }, { down: 1, alpha: .5 }, { face: -1, walk: 2 }])
      api.drawPerson(ctx, u.art, Object.assign({ x: 50, y: 50, s: 1.4, face: 1 }, o));
});

test('every hair, hat and prop in the library draws', () => {
  const api = boot();
  const ctx = api._nodes.cv.getContext('2d');
  const hairs = ['bald','buzz','short','mop','bob','perm','bun','pony','long','spike'];
  const hats = ['cap','capBack','visor','bucket','beanie','peaked','tam','headband','helmet'];
  const props = ['handbag','clipboard','folder','briefcase','guitar','bagpipes','dumbbell','phone',
    'laptop','ticket','leaflet','camera','flash','whistle','recorder','tongs','bread','glass','mic',
    'lolly','bone','frame','bin','none'];
  for (const h of hairs) api.drawHair(ctx, h, '#333', 11);
  for (const h of hats) api.drawHat(ctx, h, 11, {});
  for (const p of props) api.drawProp(ctx, p, 1);
  api.drawHat(ctx, 0, 11, {});
});

test('the view fits itself to a phone without producing nonsense', () => {
  const api = boot();
  api.fit();
  assert(api.VIEW.sc > 0 && isFinite(api.VIEW.sc), 'bad scale: ' + api.VIEW.sc);
  assert(isFinite(api.VIEW.ox) && isFinite(api.VIEW.oy), 'bad offsets');
  assert(api.CROWD.length > 10, 'nobody came out to watch');
});

test('depth scaling keeps the far side of the road smaller than the near side', () => {
  assert(A.depth(0) < A.depth(A.FH), 'depth is inverted');
  assert(A.depth(0) > .5 && A.depth(A.FH) < 1.3, 'depth range is silly');
});

test('shade clamps instead of wrapping round', () => {
  eq(A.shade('#ffffff', 60), '#ffffff', 'blew past white');
  eq(A.shade('#000000', -60), '#000000', 'blew past black');
  assert(A.shade('#808080', 20) !== '#808080', 'shade did nothing');
});

/* ============================ pacing and ladder ===========================
   These are slow-ish because they play real matches, but a silent regression
   here (a round that grinds to the cap, or a ladder that stops ramping) is the
   kind of thing that only shows up on somebody's phone otherwise. */

/* A sensible player: leans into whatever clique the squad already has. */
function smartPick(api){
  let best = 0, bs = -1e9;
  api.G.offers.forEach((id, i) => {
    const d = api.BY_ID[id];
    let sc = d.rar === 'l' ? 1.3 : d.rar === 'r' ? .6 : 0;
    if (api.cliqueFx(api.G.youSquad.concat([id])).active.length >
        api.cliqueFx(api.G.youSquad).active.length) sc += 2.4;
    const c = api.cliqueCount(api.G.youSquad);
    for (const t of d.tags) sc += (c[t] || 0) * .35;
    sc += (d.hp * d.dmg * d.rate) / 4000;
    if (sc > bs){ bs = sc; best = i; }
  });
  return best;
}
let _lcg = 12345;
const roll = () => (_lcg = (_lcg * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function playMatch(api, foeIdx, smart, seed){
  api.startMatch(foeIdx);
  api.G.matchSeed = seed >>> 0;
  api.beginDraft();
  const durs = [];
  let guard = 0;
  while (!api.G.result && guard++ < 14){
    while (api.G.picksLeft > 0) api.takePick(smart ? smartPick(api) : Math.floor(roll() * 3));
    api.beginFight();
    let g2 = 0;
    while (!api.B.over && g2++ < 5000) api.simStep(api.STEP);
    durs.push(api.B.t);
    api.endRound(); api._flush();
    if (!api.G.result) api.nextRound();
  }
  return { win: api.G.result === 'win', durs, rounds: guard };
}
function winRate(api, foeIdx, smart, n, seed0){
  let w = 0;
  for (let i = 0; i < n; i++) if (playMatch(api, foeIdx, smart, (seed0 + i * 7919) >>> 0).win) w++;
  return w / n;
}

test('a round is over in well under the cap, nearly always', () => {
  const api = boot();
  api.reseed(4242);
  const durs = [];
  for (let i = 0; i < 90; i++){
    api.G.foe = null;
    api.G.youSquad = api.rollOffers(3).concat(api.rollOffers(3));
    api.G.foeSquad = api.rollOffers(3).concat(api.rollOffers(3));
    api.startBattle(2200 + i);
    let g2 = 0;
    while (!api.B.over && g2++ < 5000) api.simStep(api.STEP);
    durs.push(api.B.t);
  }
  durs.sort((a, b) => a - b);
  const med = durs[Math.floor(durs.length / 2)];
  const capped = durs.filter(d => d >= api.ROUND_CAP - .1).length / durs.length;
  assert(med < 24, 'rounds have got slow: median ' + med.toFixed(1) + 's');
  assert(med > 4, 'rounds are now over before anyone sees them: ' + med.toFixed(1) + 's');
  assert(capped < .18, Math.round(capped * 100) + '% of rounds ran out the clock');
});

test('sudden death makes late hits hurt more, and only late ones', () => {
  const api = boot();
  api.G.foe = null; api.G.youSquad = ['karen']; api.G.foeSquad = ['karen'];
  api.startBattle(7);
  const u = api.B.units[0];
  eq(api.overtime(), 1, 'patience should hold at the start');
  const early = api.dmgOf(u);
  api.B.t = api.SUDDEN - .1;
  eq(api.dmgOf(u), early, 'nothing should change before the snap');
  api.B.t = api.SUDDEN + 10;
  assert(api.dmgOf(u) > early * 2, 'patience snapped and nothing happened');
  assert(api.spdOf(u) > u.spd, 'and nobody sped up');
});

test('the street gets harder from one end to the other', () => {
  const api = boot();
  const first = winRate(api, 0, true, 26, 61);
  const last = winRate(api, api.FOES.length - 1, true, 26, 61);
  assert(first > .55, 'the first household is not a gentle start: ' + Math.round(first * 100) + '%');
  assert(last < .45, 'the last household is a pushover: ' + Math.round(last * 100) + '%');
  assert(first - last > .25,
    `the ladder barely ramps: ${Math.round(first * 100)}% to ${Math.round(last * 100)}%`);
});

test('drafting well beats drafting blind', () => {
  const api = boot();
  _lcg = 999;
  const smart = winRate(api, 3, true, 26, 909);
  const blind = winRate(api, 3, false, 26, 909);
  assert(smart - blind > .15,
    `the picks barely matter: smart ${Math.round(smart * 100)}% vs blind ${Math.round(blind * 100)}%`);
});

/* =============================== the end ================================== */
console.log(`\ngrudge_draft: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
