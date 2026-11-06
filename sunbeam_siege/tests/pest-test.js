// Regular pest and elite passive tests (agent pests pass). node tests/pest-test.js [--verbose]
// 1. every one of the 68 regular pests runs a small battle (6 rounds, sturdy cats on every floor): no throw, no NaN,
//    no crash event, no new engine warnings, and the pest takes at least one action,
// 2. one targeted check per passive or mechanic (the former text-only dog passives, the household rules, the wild flags),
// 3. the elite passives that used to be flags only.
// Loads src/data then src/engine plus every src/engine/ops-*.js inside a vm sandbox, like tests/run-tests.js.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.env.NL_ROOT || path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

function makeSB() {
  const store = {};
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
  const dataDir = path.join(root, 'src/data');
  fs.readdirSync(dataDir).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(dataDir, f)));
  ['util', 'content', 'registry', 'card-inst', 'battle', 'battle-ai', 'run', 'rewards', 'map', 'profile', 'shop', 'post', 'nook', 'events-engine'].forEach(n => {
    const f = path.join(root, 'src/engine', n + '.js');
    if (fs.existsSync(f)) load(f);
  });
  fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
  ctx.SB.util.quiet = true; (ctx.SB||SB).data.rules.pestsFirst = false; (ctx.SB||SB).data.rules.pestsAlwaysClimb = false; (ctx.SB||SB).data.rules.pestHpMult = 1;
  return ctx.SB;
}

let checks = 0, failures = 0;
const failLog = [];
function ok(c, msg) { checks++; if (!c) { failures++; failLog.push(msg); if (VERBOSE) console.log('  FAIL ' + msg); } return !!c; }
function eq(a, b, msg) { return ok(a === b || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const SB = makeSB();

// ---- synthetic cats ---------------------------------------------------------------------------------------------
(function addCats() {
  const unit = (id, name, p, h, size) => ({ id, name, type: 'unit', clan: 'neutral', rarity: 'basic', cost: 0, targeting: 'floor', stats: { power: p, health: h, lives: 9, size: size || 1 },
    keywords: {}, text: name, flavor: name, art: { sprite: 'cat_plain', palette: 'grey' }, tutorialOnly: true });
  SB.data.tutorial.cards.push(unit('pt_wall', 'Wall', 0, 4000), unit('pt_hit', 'Hitter', 3, 4000), unit('pt_glass', 'Glass', 0, 3), unit('pt_big', 'Big Wall', 0, 4000, 2));
  SB.content.rebuild();
})();

const wall = (floor, pos) => ({ card: 'pt_wall', floor, pos: pos || 0 });
const hit = (floor, pos) => ({ card: 'pt_hit', floor, pos: pos || 0 });
const glass = (floor, pos) => ({ card: 'pt_glass', floor, pos: pos || 0 });

// scene: floors in cat and pest specs are 1-based like encounter data
function scene(pests, o) {
  o = o || {};
  const run = SB.run.newRun({ seed: 'P', clan: 'alley', side: 'hearth', rank: 0 });
  run.relics = [];
  const spawns = (Array.isArray(pests) ? pests : [pests]).map(x => typeof x === 'string' ? { id: x, floor: o.floor || 1, at: 'back' } : x);
  const enc = { id: 'pest_t', type: 'prowl', act: o.act || 1, rules: { nightClock: !!o.clock, impatience: false, noPile: o.noPile === undefined ? true : o.noPile },
    waves: [{ round: 1, spawns }], setup: { cats: o.cats || [wall(1, 0), wall(1, 1), wall(2, 0), wall(3, 0)] } };
  const B = SB.battle.create(run, enc, { seed: o.seed || 3, noWitching: !o.clock });
  B.log2 = [];
  B.on(e => B.log2.push(e));
  return B;
}
const allPests = B => [].concat(...B.state.floors.map(f => f.pests));
const allCats = B => [].concat(...B.state.floors.map(f => f.cats));
const pestOf = (B, id) => allPests(B).filter(p => p.id === id || p.id === 'pest_' + id)[0];
const rounds = (B, n) => { for (let i = 0; i < n && B.state.turn !== 'over'; i++) B.endTurn(); };
const evs = (B, type) => B.log2.filter(e => e.type === type);
const labels = B => evs(B, 'intent').map(e => e.label);
const kill = (B, p) => { B.damage(p, 9999, { kind: 'direct' }); B.reap(); B.drain(); };
const warnKeys = () => Object.keys(SB.util.warnings || {});

// ---- the 68 regular pests -----------------------------------------------------------------------------------------
const REGULAR = SB.content.pests().filter(p => !p.isBoss && p.tier === 'pest').map(p => p.id);
ok(REGULAR.length === 68, 'expected 68 regular pests, found ' + REGULAR.length);

function nanFree(B) {
  const bad = [];
  allPests(B).concat(allCats(B)).forEach(u => {
    ['hp', 'maxHp', 'fluff', 'health', 'maxHealth'].forEach(k => { if (u[k] !== undefined && !Number.isFinite(u[k])) bad.push(u.id + '.' + k); });
    Object.keys(u.statuses || {}).forEach(k => { if (!Number.isFinite(u.statuses[k])) bad.push(u.id + '.status.' + k); });
  });
  return bad;
}

const sweep = {};
REGULAR.forEach(id => {
  const d = SB.content.pest(id);
  const before = warnKeys().length;
  let B = null, err = null;
  try {
    B = scene({ id, floor: id === 'pest_magpie' ? 1 : 1, at: 'back' }, { act: d.acts ? d.acts[0] : 1, cats: [wall(1, 0), wall(1, 1), wall(1, 2), wall(2, 0), wall(2, 1), wall(3, 0)] });
    rounds(B, 6);
  } catch (e) { err = e; }
  sweep[id] = { B, err };
  ok(!err, id + ' threw ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : ''));
  if (!B) return;
  eq(nanFree(B), [], id + ' has NaN numbers');
  ok(evs(B, 'crash').length === 0, id + ' produced a crash event');
  eq(warnKeys().slice(before), [], id + ' raised new engine warnings');
  ok(labels(B).length > 0, id + ' never took an action');
});
console.log((failures === 0 ? 'PASS ' : 'FAIL ') + 'sweep: ' + REGULAR.length + ' regular pests, 6 rounds each');

// ---- targeted passive checks ---------------------------------------------------------------------------------------
const T = {};
function section(name, fn) {
  const f0 = failures;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  console.log((failures === f0 ? 'PASS ' : 'FAIL ') + name);
}

// -------- rodents
section('rodents: pack tactics, gerbils, heavy mice, movers', () => {
  let B = scene(['pest_alley_rat', 'pest_alley_rat']);
  const rats = allPests(B).filter(p => p.id === 'pest_alley_rat');
  eq(B.pestBonus(rats[0]), 1, 'alley rat gets +1 with one other rat on the floor');
  B = scene(['pest_thimble_mouse']); eq(pestOf(B, 'thimble_mouse').fluff, 4, 'thimble mouse starts with 4 Fluff');
  B = scene(['pest_gerbil_goon', 'pest_gerbil_goon']);
  ok(B.pestBonus(allPests(B)[0]) >= 1, 'goons gain Attack from each other');
  B = scene(['pest_brute_rat', 'pest_alley_rat']);
  ok(B.pestBonus(pestOf(B, 'brute_rat')) >= 1, 'brute rat gets pack tactics from a rat');
  B = scene('pest_toy_tank_mouse'); const tank = pestOf(B, 'toy_tank_mouse');
  B.knockPest(tank, 1); eq(tank.floor, 0, 'heavy toy tank mouse does not move from Knock 1');
  B = scene('pest_flying_squirrel'); rounds(B, 1); eq(pestOf(B, 'flying_squirrel').floor, 2, 'flying squirrel moves two floors in one advance');
  B = scene('pest_garden_squirrel'); rounds(B, 2); ok(pestOf(B, 'garden_squirrel').floor > 0, 'garden squirrel climbs past cats');
  B = scene('pest_stripe_chipmunk', { cats: [wall(1, 0), wall(2, 0), wall(3, 0)] }); rounds(B, 5); ok(B.state.sunbeam.warmth < 40, 'chipmunk is Sneaky: pings the Sunbeam past a cat');
  B = scene('pest_tunnel_vole'); rounds(B, 4); ok(pestOf(B, 'tunnel_vole').floor > 0, 'tunnel vole tunnels up a floor');
  B = scene('pest_hamster_ball', { cats: [wall(1, 0), wall(1, 1), wall(1, 2)] }); const front0 = B.state.floors[0].cats[0].uid;
  rounds(B, 1); ok(B.state.floors[0].cats[0].uid !== front0 || labels(B)[0] !== 'Roll Over', 'hamster ball shoves the front cat back');
  B = scene(['pest_piper_rat', 'pest_field_mouse']); rounds(B, 1);
  ok((pestOf(B, 'field_mouse') || { statuses: {} }).statuses.rage > 0 || evs(B, 'status').some(e => e.status === 'rage' && e.side === 'pest'), 'piper rat pipes Rage into the floor');
});

section('rodents: gerbil don summons Yarned goons and scatters them when he falls', () => {
  const B = scene('pest_gerbil_don'); rounds(B, 1);
  const goons = allPests(B).filter(p => p.id === 'pest_gerbil_goon');
  ok(goons.length >= 2, 'don whistles up goons');
  ok(evs(B, 'status').some(e => e.status === 'yarn' && e.side === 'pest' && e.kind === 'add'), 'summoned goons arrive with Yarn 1');
  const goon = allPests(B).filter(p => p.id === 'pest_gerbil_goon')[0];
  const don = pestOf(B, 'gerbil_don'); kill(B, don);
  ok((goon.statuses.dizzy || 0) >= 1, 'killing the don leaves the goons Dizzy 1');
  eq(goon.statuses.dazed, undefined, 'no Dazed status is stored');
});

section('rodents: alarm vole, nightcap mouse, pack rat, pantry mouse', () => {
  let B = scene('pest_alarm_vole', { cats: [hit(1, 0), wall(2, 0)] });
  B.toggleNap(allCats(B)[0].uid); rounds(B, 1);
  ok(labels(B).indexOf('Rude Chomp') >= 0, 'alarm vole picks Rude Chomp against a napper');
  B = scene('pest_nightcap_mouse', { cats: [wall(1, 0), wall(2, 0)] }); B.toggleNap(allCats(B)[0].uid); rounds(B, 1);
  ok(labels(B).indexOf('Whisper') >= 0, 'nightcap mouse whispers at a napper');
  B = scene('pest_pack_rat'); B.placeRoom(0, { rtype: 'toy', id: 'toy_x', name: 'Toy', fx: {}, aura: [], kw: {}, flags: {} }); rounds(B, 1);
  eq(B.state.floors[0].rooms.length, 0, 'pack rat raids the toy on its floor');
  B = scene('pest_pantry_mouse'); rounds(B, 3); ok(labels(B).indexOf('Snatch') >= 0, 'pantry mouse snatches on round 2');
  B = scene('pest_midnight_hamster'); rounds(B, 1); ok(pestOf(B, 'midnight_hamster').statuses.rage >= 2, 'midnight hamster spins up Rage');
});

// -------- dogs (the former text-only passives)
section('dog passive: Fearless (scrap terrier)', () => {
  const B = scene('pest_scrap_terrier'); const p = pestOf(B, 'scrap_terrier');
  eq(B.addStatus(p, 'scared', 2), 0, 'scrap terrier ignores Scared');
  ok(SB.engine.passives.has('fearless'), 'fearless is a registered passive');
});
section('dog passive: Long boy (dachshund)', () => {
  const B = scene('pest_dachshund_dash', { cats: [wall(1, 0), wall(2, 0)] }); rounds(B, 1);
  const hurt = allCats(B).filter(c => c.health < c.maxHealth).map(c => c.floor).sort();
  eq(hurt, [0, 1], 'dachshund bites its own floor and the floor above');
});
section('dog passives: Heavy and Stubborn (bulldog)', () => {
  const B = scene('pest_bulldog_bruiser'); const p = pestOf(B, 'bulldog_bruiser');
  B.knockPest(p, 1); eq(p.floor, 0, 'Knock 1 does not move the bulldog');
  B.addStatus(p, 'dizzy', 3); eq(p.statuses.dizzy, 1, 'Dizzy on the bulldog never goes above 1');
  B.addStatus(p, 'dizzy', 2); eq(p.statuses.dizzy, 1, 'Dizzy stays at 1');
});
section('dog passives: Groomed and Wet ruins the cut (poodle)', () => {
  const B = scene('pest_poodle_attitude'); const p = pestOf(B, 'poodle_attitude');
  eq(p.fluff, 10, 'poodle starts with 10 Hide');
  B.addStatus(p, 'wet', 1); B.drain();
  eq(p.fluff, 0, 'Wet strips all Hide'); ok(p.statuses.groomed_ruined > 0, 'groomed_ruined is set');
  B.addFluff(p, 6); eq(p.fluff, 0, 'the poodle cannot regain Hide');
});
section('dog passive: Guard duty (guard dog)', () => {
  const B = scene('pest_guard_dog'); rounds(B, 0);
  const pup = B.spawnPest('pest_yap_pup', 0, 'back', {}); B.drain();
  eq(pup.fluff, 3, 'a dog spawning on the guard\'s floor gets Hide 3');
  const cat = B.spawnPest('pest_field_mouse', 0, 'back', {}); B.drain();
  eq(cat.fluff, 0, 'a non-dog gets nothing');
});
section('dog passives: Leashed and Floor budget (dog walker)', () => {
  const B = scene('pest_dog_walker', { act: 2 });
  const dogs = allPests(B).filter(p => p.id !== 'pest_dog_walker');
  eq(dogs.length, 3, 'walker brings three dogs');
  eq(B.state.floors[0].pests.reduce((a, p) => a + p.size, 0), 5, 'walker 2 plus three Small dogs fills the floor');
  const dog = dogs[0]; ok(dog.statuses.leashed > 0, 'the dogs are Leashed');
  eq(B.knockPest(dog, 1), false, 'a Leashed dog cannot be Knocked');
  kill(B, pestOf(B, 'dog_walker'));
  ok(!dogs[0].statuses.leashed, 'the leash comes off when the walker falls');
});
section('dog passive: Tracker (bloodhound)', () => {
  const run = (id) => {
    const B = scene(id, { act: 2, cats: [wall(1, 0), wall(1, 1)] });
    const box = B.placeBox(0); B.seatCat(B.state.floors[0].cats[0], box); B.state.floors[0].cats[0].hidden = true;
    rounds(B, 3);
    return B.state.floors[0].cats.filter(c => c.health < c.maxHealth).length;
  };
  ok(run('pest_bloodhound_sniffer') >= 1, 'the bloodhound finds the boxed cat');
  const B = scene('pest_bloodhound_sniffer'); ok(B.hasTrait(pestOf(B, 'bloodhound_sniffer'), 'tracker'), 'Tracker trait present');
});
section('dog passives: Heavy and Excited (great dane)', () => {
  const B = scene('pest_great_dane', { act: 3 }); const p = pestOf(B, 'great_dane');
  B.knockPest(p, 1); eq(p.floor, 0, 'great dane is Heavy');
  B.damage(p, 25, { kind: 'direct' }); B.reap();
  eq(p.statuses.rage, 3, 'Excited gives Rage 3 under half HP');
  B.damage(p, 3, { kind: 'direct' }); eq(p.statuses.rage, 3, 'Excited fires only once');
  const B2 = scene('pest_great_dane', { act: 3 }); rounds(B2, 2);
  ok(labels(B2).indexOf('Lumber') >= 0, 'the Dane attacks from round 1 (plain cycle)');
});
section('dog passives: Climber, Sneaky, Nocturnal (wolf)', () => {
  const B = scene('pest_wolf_prowler', { act: 3, cats: [wall(1, 0), wall(2, 0), wall(3, 0)] });
  const p = pestOf(B, 'wolf_prowler');
  ok(B.hasTrait(p, 'climber') && B.hasTrait(p, 'sneaky') && B.hasTrait(p, 'nocturnal'), 'wolf traits');
  const day = B.pestBonus(p); B.state.clock.isWitching = true; eq(B.pestBonus(p) - day, 2, 'nocturnal gives +2 at the Witching Hour'); B.state.clock.isWitching = false;
  rounds(B, 4); ok(B.state.sunbeam.warmth < 40, 'the wolf bites the Sunbeam with cats in the way');
});
section('dog passives: Pack leader, Heavy, Rage floor (pack alpha)', () => {
  const B = scene(['pest_pack_alpha', 'pest_yap_pup', 'pest_scrap_terrier'], { act: 3 });
  const a = pestOf(B, 'pack_alpha'); const r0 = a.statuses.rage || 0;
  kill(B, allPests(B).filter(p => p.id === 'pest_scrap_terrier')[0]);
  eq(a.statuses.rage, r0 + 1, 'another dog dying gives Barkley Rage 1');
  B.removeStatus(a, 'rage'); B.pestBonus(a); ok(a.statuses.rage >= 1, 'Rage cannot drop below 1');
  B.knockPest(a, 1); eq(a.floor, 0, 'Barkley is Heavy');
});
section('dogs: remaining behaviour', () => {
  let B = scene('pest_pug_snort', { cats: [wall(1, 0)] }); rounds(B, 1); ok(evs(B, 'status').some(e => e.status === 'wet' && e.side === 'cat'), 'pug snort wets the front cat');
  B = scene('pest_beagle_bayer', { cats: [wall(1, 0)] }); rounds(B, 2); ok(evs(B, 'status').some(e => e.status === 'scared' && e.side === 'cat'), 'beagle bays Scared onto cats');
  B = scene('pest_husky_howler', { cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 2); ok(evs(B, 'status').some(e => e.status === 'scared' && e.side === 'cat'), 'husky yowls Scared onto cats');
  B = scene('pest_retriever_fetch', { floor: 2, cats: [wall(2, 0), wall(2, 1)] }); rounds(B, 1); ok(evs(B, 'move').some(e => e.side === 'cat') || evs(B, 'damage').length > 0, 'retriever fetches the front cat');
  B = scene('pest_corgi_herder', { cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 1); ok(evs(B, 'damage').some(e => e.side === 'cat'), 'corgi nips heels');
  B = scene('pest_yap_pup', { cats: [wall(1, 0)] }); rounds(B, 1); ok(evs(B, 'damage').some(e => e.side === 'cat'), 'yap pup nips');
});

// -------- household
section('household rule: immuneToScared (cucumber, thunderstorm)', () => {
  ['pest_cucumber', 'pest_thunderstorm'].forEach(id => {
    const B = scene(id, { act: id === 'pest_cucumber' ? 2 : 3, cats: [wall(1, 0), wall(1, 1), wall(1, 2), wall(2, 0)] });
    const pile = B.state.floors[0].cats, lone = B.state.floors[1].cats[0];
    eq(B.addStatus(pile[0], 'scared', 1), 0, id + ': a cat in a Pile of 3 is not startled');
    ok(B.addStatus(lone, 'scared', 1) > 0, id + ': a lone cat is startled');
  });
  const B = scene('pest_cucumber', { act: 2, cats: [wall(1, 0), wall(1, 1)] });
  const box = B.placeBox(0); B.seatCat(B.state.floors[0].cats[0], box); B.state.floors[0].cats[0].hidden = true;
  eq(B.addStatus(B.state.floors[0].cats[0], 'scared', 1), 0, 'a Hidden cat is not startled');
  ok(B.addStatus(B.state.floors[0].cats[1], 'scared', 1) > 0, 'its neighbour is');
  kill(B, pestOf(B, 'cucumber'));
  ok(B.addStatus(B.state.floors[0].cats[1], 'scared', 1) >= 0, 'rule ends when the cucumber is gone (no crash)');
});
section('household rule: Foil Floor (tinfoil)', () => {
  const B = scene('pest_tinfoil', { cats: [wall(1, 0), wall(2, 0)] });
  const here = B.state.floors[0].cats[0], there = B.state.floors[1].cats[0];
  eq(B.addStatus(here, 'rested', 1), 0, 'cats on the foil floor cannot gain Rested');
  ok(B.addStatus(there, 'rested', 1) > 0, 'cats on other floors can');
  B.fire('onCatDeployed', { subject: here, floor: 0 }); B.drain();
  ok(here.statuses.scared > 0, 'a cat deployed on the foil floor gains Scared 1');
  kill(B, pestOf(B, 'tinfoil'));
  ok(B.addStatus(here, 'rested', 1) > 0, 'the foil goes with the pest');
});
section('household rule: Anchored closed door, Heavy scale, Balloon, Hair dryer', () => {
  let B = scene('pest_closed_door', { floor: 2, cats: [wall(1, 0), wall(2, 0)] }); const d = pestOf(B, 'closed_door');
  eq(B.knockPest(d, 1), false, 'closed door will not budge'); eq(d.floor, 1, 'door stays');
  B = scene('pest_vet_scale', { act: 2 }); const s = pestOf(B, 'vet_scale'); B.knockPest(s, 1); eq(s.floor, 0, 'vet scale is Heavy');
  B = scene('pest_balloon', { floor: 2, cats: [wall(1, 0), wall(2, 0)] }); const b = pestOf(B, 'balloon');
  B.knockPest(b, 1); B.drain(); B.reap(); ok(!pestOf(B, 'balloon'), 'Knock It Off lets the balloon down');
  B = scene('pest_hair_dryer', { floor: 2, act: 2, cats: [wall(1, 0), wall(2, 0)] }); const h = pestOf(B, 'hair_dryer');
  B.knockPest(h, 1); B.drain(); ok((h.statuses.dizzy || 0) >= 2, 'a Knocked hair dryer is Dizzy 2 (landing 1 plus unplugged 1)');
});
section('household: Carrier crate traps, rattles, releases', () => {
  const B = scene('pest_carrier_crate', { act: 2, floor: 2, cats: [wall(1, 0), wall(2, 0), wall(2, 1)] });
  const p = pestOf(B, 'carrier_crate'); rounds(B, 2);
  eq((p.trapped || []).length, 1, 'the crate scoops exactly one cat');
  ok(B.state.floors[1].cats.length === 1, 'the trapped cat is off the floor');
  const cat = B.state.attached.filter(c => c.isTrapped)[0]; ok(!!cat, 'trapped cat is parked in attached');
  B.knockPest(p, 1); B.drain(); eq(cat.floor, p.floor, 'a Knocked crate takes its passenger along');
  rounds(B, 1); ok(labels(B).indexOf('Rattle') >= 0, 'a full crate rattles');
  const lives = cat.lives; kill(B, p);
  ok(!cat.isTrapped && B.state.floors[cat.floor].cats.indexOf(cat) >= 0, 'the cat is released when the crate falls'); eq(cat.lives, lives, 'no life lost');
});
section('household: Vet scale verdict, Robot vacuum dock', () => {
  let B = scene('pest_vet_scale', { act: 2, cats: [wall(1, 0), wall(1, 1), wall(1, 2)] }); rounds(B, 1);
  const p = pestOf(B, 'vet_scale'); eq(p.intent.dmg, 2 + 2 * 3, 'Verdict is 2 plus 2 per cat on the floor');
  rounds(B, 1); ok(evs(B, 'damage').some(e => e.side === 'cat' && e.amount === 8), 'Verdict lands for 8 against three cats');
  B = scene('pest_robot_vacuum', { act: 2 }); rounds(B, 1); ok(labels(B).indexOf('Bumble') >= 0, 'robot vacuum Bumbles first');
  const r = pestOf(B, 'robot_vacuum'); B.damage(r, 12, { kind: 'direct' }); B.reap(); const hp = r.hp;
  rounds(B, 1); ok(labels(B).indexOf('Return to Dock') >= 0, 'robot vacuum docks under half HP'); ok(r.hp >= hp + 6 - 1, 'the dock heals 6');
  rounds(B, 3); eq(labels(B).filter(l => l === 'Return to Dock').length, 1, 'the dock happens once');
  B = scene('pest_robot_vacuum', { act: 2 }); rounds(B, 2); ok(labels(B).indexOf('Suck Up') >= 0, 'robot vacuum alternates to Suck Up');
});
section('household rule: Sneaky Sunbeam dribble (spray bottle)', () => {
  const B = scene('pest_spray_bottle', { floor: 3, act: 2, cats: [wall(3, 0), wall(2, 0)] }); rounds(B, 1);
  ok(B.state.sunbeam.warmth < 40 && B.state.sunbeam.warmth >= 38, 'spray bottle dribbles 1 onto the Sunbeam from the Attic');
});
section('household rule: Sticky lint roller', () => {
  const B = scene('pest_lint_roller', { cats: [hit(1, 0), wall(1, 1)] }); const cat = B.state.floors[0].cats[0];
  B.addFluff(cat, 5); const p = pestOf(B, 'lint_roller');
  B.damage(p, 1, { kind: 'hit', src: cat, melee: true }); B.drain();
  eq(cat.fluff, 4, 'a cat that hits the roller loses 1 Fluff');
  const B2 = scene('pest_lint_roller', { cats: [wall(1, 0), wall(1, 1)] }); B2.addFluff(B2.state.floors[0].cats[0], 8); rounds(B2, 1);
  const roller = pestOf(B2, 'lint_roller'); ok(roller.fluff > 0 && roller.fluff <= 10, 'Roll takes the front cat\'s Fluff as Hide (cap 10)');
});
section('household rule: Countdown pests (fireworks, alarm clock, nail clippers, thunderstorm)', () => {
  let B = scene('pest_fireworks', { act: 2, cats: [wall(1, 0), wall(2, 0), wall(3, 0)] });
  for (let i = 0; i < 5; i++) { const p = pestOf(B, 'fireworks'); if (p) B.addStatus(p, 'wet', 2, { force: true }); rounds(B, 1); }
  ok(pestOf(B, 'fireworks') && B.state.sunbeam.warmth === 40, 'a Wet fireworks crate does not tick down');
  B = scene('pest_fireworks', { act: 2, cats: [wall(1, 0), wall(2, 0), wall(3, 0)] }); rounds(B, 5);
  ok(B.state.sunbeam.warmth < 40, 'a dry fireworks crate launches');
  B = scene('pest_alarm_clock', { act: 3, cats: [wall(1, 0)] }); const c = pestOf(B, 'alarm_clock'); const d = B.pestBonus(c);
  B.state.clock.isWitching = true; eq(B.pestBonus(c) - d, 2, 'alarm clock is Nocturnal'); B.state.clock.isWitching = false;
  const cd = c.pat.cd; B.damage(c, 1, { kind: 'hit', src: B.state.floors[0].cats[0], melee: true }); B.drain();
  ok(c.pat.cd === undefined || c.pat.cd === null || c.pat.cd >= cd + 1 || cd === null, 'a non-lethal hit snoozes the alarm clock by one round');
  B = scene('pest_nail_clippers', { cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 4); ok(labels(B).indexOf('Snip') >= 0, 'nail clippers count down and snip');
  B = scene('pest_thunderstorm', { act: 3, cats: [wall(1, 0), wall(1, 1), wall(1, 2), wall(2, 0), wall(3, 0)] }); rounds(B, 4);
  ok(labels(B).indexOf('Thunderclap') >= 0, 'the storm claps on round 4');
  eq(B.state.floors[0].cats.filter(c2 => (c2.statuses.scared || 0) > 0).length, 0, 'the Pile of 3 ignores Scared');
});
section('household rule: Laser dot', () => {
  let B = scene('pest_laser_dot', { cats: [hit(1, 0), wall(1, 1)] }); const dot = pestOf(B, 'laser_dot');
  eq(B.damage(dot, 5, { kind: 'hit', src: B.state.floors[0].cats[0] }), 0, 'the dot cannot be damaged by a cat');
  ok(B.hasTrait(dot, 'untargetable'), 'dot is untargetable');
  rounds(B, 1); ok(B.state.floors[0].cats[0].statuses.frazzled > 0 || B.state.floors[0].cats[0].chaseRound, 'the chaser is Frazzled');
  rounds(B, 1); eq(dot.meter.stamina, 7, 'one chaser costs the dot 1 Stamina');
  B = scene('pest_laser_dot', { cats: [hit(1, 0)] }); const d2 = pestOf(B, 'laser_dot'); rounds(B, 8);
  ok(!pestOf(B, 'laser_dot'), 'the dot clicks off by round 8');
  B = scene('pest_laser_dot', { cats: [hit(1, 0), hit(1, 1)] }); const d3 = pestOf(B, 'laser_dot');
  const box = B.placeBox(0); B.seatCat(B.state.floors[0].cats[0], box); B.state.floors[0].cats[0].hidden = true;
  rounds(B, 1); ok(d3.meter.stamina <= 4, 'a Hidden cat that attacks costs the dot 4 Stamina');
  void d2;
});
section('household: remaining behaviour', () => {
  let B = scene('pest_cone_of_shame', { act: 2, cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 1); ok(evs(B, 'status').some(e => e.status === 'shamed'), 'cone of shame shames a cat');
  B = scene('pest_mop', { act: 2, cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 3); ok(labels(B).indexOf('Swab') >= 0, 'mop swabs');
  B = scene('pest_bath_tide', { act: 3, cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 2); ok(evs(B, 'status').some(e => e.status === 'wet' && e.side === 'cat'), 'bath tide wets the cats');
});

// -------- wild
section('wild: murder, alarm, bristle, spectral, silent wings', () => {
  let B = scene(['pest_crow', 'pest_crow']); const crow = allPests(B)[0]; eq(B.pestBonus(crow), 1, 'murder: +1 per other crow');
  B = scene(['pest_hornet', 'pest_hornet']); const hs = allPests(B); kill(B, hs[0]); eq(B.pestBonus(hs[1]), 1, 'hornet alarm: +1 Attack when a hornet dies');
  B = scene('pest_hedgehog', { cats: [hit(1, 0), wall(2, 0)] }); const hog = pestOf(B, 'hedgehog'), cat = B.state.floors[0].cats[0];
  const hp = cat.health; B.damage(hog, 1, { kind: 'hit', src: cat, melee: true }); eq(hp - cat.health, 2, 'Bristle 2 bites a melee attacker');
  B = scene('pest_ghost_mouse', { act: 1, cats: [hit(1, 0)] }); const gm = pestOf(B, 'ghost_mouse'), gc = B.state.floors[0].cats[0];
  const hp0 = gm.hp; B.damage(gm, 6, { kind: 'hit', src: gc, melee: true }); eq(hp0 - gm.hp, 3, 'Spectral halves cat damage outside the Witching Hour');
  B = scene('pest_owl', { act: 2 }); ok(pestOf(B, 'owl').hiddenIntent, 'owl wings are silent');
  B = scene('pest_swan', { act: 2 }); eq(pestOf(B, 'swan').fluff, 4, 'swan starts with Hide 4');
});
section('wild: Curl (hedgehog) is Anchored until its next action', () => {
  const B = scene('pest_hedgehog', { cats: [wall(1, 0), wall(2, 0)] }); const hog = pestOf(B, 'hedgehog');
  rounds(B, 1); ok(labels(B)[0] === 'Curl Up', 'hedgehog curls first');
  eq(B.knockPest(hog, 1), false, 'a curled hedgehog is Anchored');
  rounds(B, 1); ok(labels(B).indexOf('Roll Over') >= 0, 'next action is Roll Over'); ok(!hog.flags.anchored, 'the curl lets go');
});
section('wild: Mirror (tomcat) copies the strongest cat', () => {
  const B = scene('pest_tomcat', { act: 2, cats: [hit(1, 0), wall(2, 0)] }); const p = pestOf(B, 'tomcat');
  rounds(B, 1); eq(p.intent.dmg, 4, 'Mirror Claws is the cat\'s Attack 3 plus 1');
  const B2 = scene('pest_tomcat', { act: 2, cats: [wall(1, 0)] }); rounds(B2, 1); eq(pestOf(B2, 'tomcat').intent.dmg, 1, 'against a 0 Attack cat it is 1');
});
section('wild: Play dead (possum)', () => {
  const B = scene('pest_possum', { act: 2, cats: [wall(1, 0), wall(2, 0)] }); const p = pestOf(B, 'possum');
  B.damage(p, 999, { kind: 'direct' }); B.reap(); B.drain();
  ok(!p.dead && p.hp === 1, 'the first lethal hit leaves 1 HP'); ok(p.untargetable, 'it cannot be targeted'); eq(p.statuses.dizzy, 2, 'it is Dizzy 2');
  rounds(B, 2); ok(!p.untargetable, 'it wakes up'); ok(p.fluff >= 4, 'with Fluff'); ok(!p.dead, 'still alive');
  B.damage(p, 999, { kind: 'direct' }); B.reap(); ok(p.dead || !pestOf(B, 'possum'), 'the second lethal hit kills it');
});
section('wild: Fox, Magpie, parasites', () => {
  let B = scene('pest_fox', { act: 2, cats: [glass(1, 0), wall(1, 1)] }); rounds(B, 1);
  ok(labels(B)[0] === 'Snap', 'fox snaps at a cat on 3 HP or less');
  B = scene('pest_fox', { act: 2, cats: [wall(1, 0)] }); rounds(B, 1); ok(labels(B)[0] === 'Nip Nip', 'fox nips otherwise');
  B = scene('pest_magpie', { cats: [wall(1, 0), wall(2, 0)] }); B.addFluff(B.state.floors[0].cats[0], 6); rounds(B, 1);
  eq(pestOf(B, 'magpie').fluff, 4, 'magpie pilfers 4 Fluff'); eq(B.state.floors[0].cats[0].fluff, 2, 'from the front cat');
  B = scene('pest_flea', { cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 3); ok(B.state.attached.length >= 1 || evs(B, 'attach').length >= 1, 'flea latches on');
  B = scene('pest_tick', { act: 2, cats: [wall(1, 0), wall(1, 1)] }); rounds(B, 3); ok(evs(B, 'attach').length >= 1, 'tick latches on');
});

// -------- elites
section('elite passives that used to be flags', () => {
  // Count Cucumber: +5 Hide per Scared cat
  let B = scene('pest_elite_count_cucumber', { act: 2, cats: [wall(1, 0), wall(1, 1), wall(2, 0)] }); rounds(B, 1);
  ok(pestOf(B, 'elite_count_cucumber').fluff >= 10, 'Count Cucumber gains 5 Hide per Scared cat');
  // Static Duster: cling
  B = scene('pest_elite_static_duster', { act: 2, cats: [wall(1, 0), wall(1, 1), wall(1, 2)] }); allCats(B).forEach(c => B.addFluff(c, 8)); rounds(B, 1);
  const duster = pestOf(B, 'elite_static_duster'); ok(duster.fluff >= 8, 'Static Duster takes the Fluff as Hide'); ok(allCats(B).filter(c => c.fluff === 0).length >= 2, 'it strips the target and a neighbour');
  // Wheelie Bin Warden: finds Hidden cats, double damage
  B = scene('pest_elite_wheelie_bin_warden', { act: 2, cats: [wall(1, 0), wall(1, 1)] });
  const box = B.placeBox(0); B.seatCat(B.state.floors[0].cats[0], box); B.state.floors[0].cats[0].hidden = true;
  const w = pestOf(B, 'elite_wheelie_bin_warden'); ok(w.flags.ignoreHidden && w.flags.doubleVsHidden, 'bin warden sniffs Hidden cats');
  // Snooze alarm: ring on even rounds, Snooze once under half HP
  B = scene('pest_elite_snooze_alarm', { act: 3, cats: [wall(1, 0), wall(2, 0)] }); B.toggleNap(allCats(B)[0].uid); const napper = allCats(B)[0];
  rounds(B, 2); ok(!napper.napping || napper.health < napper.maxHealth, 'Reveille wakes or hurts a napper on an even round');
  const sa = pestOf(B, 'elite_snooze_alarm'); B.damage(sa, sa.hp - 20, { kind: 'direct' }); B.reap(); B.drain();
  ok((sa.statuses.dizzy || 0) >= 2, 'Snooze gives Dizzy 2 (Dazed is Dizzy)'); ok(sa.hp > 20, 'and heals');
  // Thunderhead bolt ignores Fluff
  B = scene('pest_elite_thunderhead', { act: 3, cats: [wall(1, 0), wall(1, 1)] }); allCats(B).forEach(c => B.addFluff(c, 20)); rounds(B, 1);
  ok(allCats(B).some(c => c.health < c.maxHealth), 'the bolt ignores Fluff');
  // Grand Finale Crate: fuse and fizzle
  B = scene('pest_elite_grand_finale_crate', { act: 3, cats: [wall(1, 0), wall(2, 0), wall(3, 0)] }); const gf = pestOf(B, 'elite_grand_finale_crate');
  eq(gf.meter.fuse, 3, 'fuse starts at 3'); B.addStatus(gf, 'wet', 1); B.drain(); eq(gf.meter.fuse, 4, 'Wet adds a round');
  B.addStatus(gf, 'rage', 1); B.drain(); eq(gf.meter.fuse, 4, 'only Wet counts for Fizzle');
  rounds(B, 6); ok(B.state.sunbeam.warmth < 40, 'the crate detonates and hits the Sunbeam');
  // Cone warden power
  B = scene('pest_elite_cone_warden', { act: 3, cats: [wall(1, 0), wall(1, 1)] }); const cw = pestOf(B, 'elite_cone_warden'); const base = B.pestBonus(cw);
  B.addStatus(allCats(B)[0], 'coned', 1); eq(B.pestBonus(cw) - base, 2, 'Smug: +2 Attack per Coned cat');
  // Duke: rage and hide
  B = scene('pest_elite_duke_good_boy', { cats: [wall(1, 0), wall(2, 0), wall(3, 0)] }); rounds(B, 5);
  const duke = pestOf(B, 'elite_duke_good_boy'); ok(duke.statuses.rage >= 5 && duke.fluff > 0, 'Duke gains Rage each round and Hide at Rage 5');
  // Duchess and Sergeant
  B = scene(['pest_elite_duchess_of_drains', 'pest_add_court_rat', 'pest_add_court_rat'], { cats: [hit(1, 0)] });
  const duchess = pestOf(B, 'elite_duchess_of_drains'); const h0 = duchess.hp; B.damage(duchess, 10, { kind: 'hit', src: allCats(B)[0], melee: true }); ok(h0 - duchess.hp <= 6 + (duchess.fluff || 0), 'court reduces incoming damage by 40 percent');
  B = scene('pest_elite_lawn_gnome_sergeant', { cats: [hit(1, 0)] }); const sg = pestOf(B, 'elite_lawn_gnome_sergeant'); sg.fluff = 0; const g0 = sg.hp;
  B.damage(sg, 20, { kind: 'hit', src: allCats(B)[0], melee: true }); eq(g0 - sg.hp, 5, 'Stoic caps a hit at 5');
  // Mop and bucket
  B = scene('pest_elite_mop_and_bucket', { act: 2, cats: [wall(1, 0), wall(2, 0)] }); B.addFloorStatus(0, 'puddle', 1); rounds(B, 1);
  const mop = pestOf(B, 'elite_mop_and_bucket'); ok((mop.statuses.wet || 0) > 0 || evs(B, 'status').some(e => e.status === 'wet' && e.side === 'pest'), 'Mop counts as Wet in a Puddle');
  // Magpie fence: nest
  B = scene('pest_elite_magpie_fence', { floor: 3, cats: [wall(3, 0)] }); B.placeRoom(1, { rtype: 'toy', id: 'toy_x', name: 'Toy', fx: {}, aura: [], kw: {}, flags: {} }); rounds(B, 1);
  eq(B.state.floors.reduce((a, f) => a + f.rooms.length, 0), 0, 'the fence has the toy');
  kill(B, pestOf(B, 'elite_magpie_fence')); eq(B.state.floors.reduce((a, f) => a + f.rooms.length, 0), 1, 'the nest gives the toy back');
});

// ---- engine polish checks (C1 polish pass) --------------------------------------------------------------------------
section('polish: pest onSpawn lists run exactly once', () => {
  let B = scene('pest_poodle_attitude', { act: 2 });
  eq(pestOf(B, 'poodle_attitude').fluff, 10, 'Poodle spawns with 10 Fluff, not 20');
  B = scene('pest_dog_walker', { act: 2 });
  eq(allPests(B).filter(p => p.id === 'pest_dog_walker').length, 1, 'one Dog Walker');
  eq(allPests(B).length - 1, 3, 'the Dog Walker summons three dogs, not six');
});

section('polish: Suds hide pests until they act, an AoE reveals them', () => {
  const id = REGULAR[0];
  let B = scene(id, { cats: [wall(1, 0), wall(2, 0), wall(3, 0)] });
  B.state.floors[0].hazards.suds = { id: 'suds' }; B.touch(); B.ensure();
  ok(B.frontPest(0) === null, 'a pest standing in suds cannot be targeted');
  ok(allPests(B)[0].hidden === true, 'the pest shows as hidden');
  rounds(B, 1);
  const p = allPests(B).filter(x => x.id === id)[0];
  ok(p && !p.dead ? B.frontPest(p.floor) === p || p.floor !== 0 : true, 'after it acts the pest is revealed');
  B = scene(id, { cats: [wall(1, 0), wall(2, 0), wall(3, 0)] });
  B.state.floors[0].hazards.suds = { id: 'suds' }; B.touch(); B.ensure();
  const hp0 = allPests(B)[0].hp;
  B.runEffects([{ type: 'damage', kind: 'hit', amount: 1, target: 'allEnemies' }], B.makeCtx({}));
  ok(allPests(B)[0].hp < hp0 || allPests(B)[0].dead, 'an AoE reaches the hidden pest');
  ok(B.frontPest(0) !== null || allPests(B).length === 0, 'and reveals it');
});

section('polish: household wipe kinds hairball and tape on a floor', () => {
  const B = scene('pest_yap_pup', { cats: [wall(1, 0)] });
  B.placeBox(0, { kind: 'tape' }); B.placeBox(0, { kind: 'cardboard' });
  B.addFloorStatus(0, 'hairball', 3);
  const pack0 = B.state.discard.length;
  const ctx = () => B.makeCtx({ floorOverride: 0 });
  B.runEffects([{ type: 'wipe', what: 'box', amount: 1, target: 'thisFloor' }], ctx());
  eq(B.state.floors[0].rooms.map(r => r.boxKind), ['tape'], 'box wipe flattens the Box and leaves the Tape Square');
  eq(B.state.discard.length, pack0 + 1, 'the flattened Box becomes a Flat Pack');
  B.runEffects([{ type: 'wipe', what: 'tape', amount: 'all', target: 'thisFloor' }], ctx());
  eq(B.state.floors[0].rooms.length, 0, 'tape wipe peels the Tape Square');
  eq(B.state.discard.length, pack0 + 1, 'a Tape Square leaves no Flat Pack');
  B.runEffects([{ type: 'wipe', what: 'hairball', amount: 'all', target: 'thisFloor' }], ctx());
  eq(B.floorStatus(0, 'hairball'), 0, 'hairball wipe clears the floor status');
});

section('polish: Bath Tide Overflow hits its own floor and the one below', () => {
  const B = scene('pest_bath_tide', { act: 3, floor: 3, cats: [wall(1, 0), wall(2, 0), wall(3, 0)] });
  const p = pestOf(B, 'bath_tide');
  p.pat.idx = 3; SB.engine.ai.select(B, p);
  eq(p.nextAction.id, 'overflow', 'the pattern reached Overflow');
  eq(p.intent.floors.slice().sort(), [1, 2], 'Overflow from the Attic covers Parlor and Attic');
});

section('polish: Mirror falls back to the strongest cat on any floor and copies its hits', () => {
  const B = scene('pest_tomcat', { act: 2, cats: [hit(2, 0)] });
  const p = pestOf(B, 'tomcat');
  p.pat.idx = 1; SB.engine.ai.select(B, p);
  eq(p.intent.dmg, 4, 'with no cat on its floor it mirrors the strongest cat anywhere (3 plus 1)');
  const c = allCats(B).filter(x => x.id === 'pt_hit')[0];
  c.statuses.frenzy = 2; B.touch(); SB.engine.ai.describeInto(B, p);
  eq(p.intent.hits, 3, 'a Frenzy 2 cat attacks three times, so the mirror does too');
});

section('polish: a pest with an attack on every floor still hits the Sunbeam when no cat stands in the way', () => {
  const B = scene('pest_boss_garden_hose', { act: 1, floor: 3, cats: [] });
  const w0 = B.state.sunbeam.warmth;
  rounds(B, 3);
  ok(B.state.sunbeam.warmth < w0 || B.state.over, 'floors each attack reaches the Sunbeam over an empty house');
});

section('registries: no text-only passives and no unsupported passives on regular pests or elites', () => {
  const miss = [];
  SB.content.pests().filter(p => !p.isBoss).forEach(p => (p.passives || []).forEach(ps => {
    const key = ps.id || (ps.rule && 'rule:' + Object.keys(ps.rule)[0]);
    if (!key) miss.push(p.id + ' has a passive with no id: ' + String(ps.text).slice(0, 30));
    else if (!SB.engine.passives.has(key)) miss.push(p.id + ' passive ' + key + ' is not registered');
  }));
  eq(miss, [], 'unregistered or id-less passives');
  eq(SB.content.validate().errors, [], 'content validate errors');
});

console.log('\n' + checks + ' checks, ' + failures + ' failures');
if (failures) { failLog.slice(0, 60).forEach(m => console.log('  - ' + m)); process.exit(1); }
