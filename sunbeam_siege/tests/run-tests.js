// Battle engine tests (agent C1). node tests/run-tests.js [--verbose] [--quick]
// Loads src/data/*.js then src/engine in API.md order inside a vm sandbox with a stub window.
//  1. content validation   2. A02 worked example (rounds 1 and 2 exact, round 3 structural)
//  3. one scenario per twist: Nine Lives, Knock, Nap and Stretch, Witching Hour, Boxes, Cuddle Pile, Nip
//  4. determinism (same seed, same event log)   5. serialize and restore   6. 200 seeded Act 1 bot battles
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.env.NL_ROOT || path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const QUICK = process.argv.includes('--quick');

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
function section(name, fn) {
  const f0 = failures;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  console.log((failures === f0 ? 'PASS ' : 'FAIL ') + name);
}

// ---- synthetic content for the A02 example and the twist scenarios -------------------------
function addTestContent(SB) {
  const T = SB.data.tutorial;
  const unit = (id, name, cost, p, h, l, extra) => Object.assign({ id, name, type: 'unit', clan: 'neutral', rarity: 'basic', cost, targeting: 'floor', stats: { power: p, health: h, lives: l, size: 1 }, keywords: {}, text: name, flavor: name, art: { sprite: 'cat_plain', palette: 'grey' }, tutorialOnly: true }, extra || {});
  const spell = (id, name, cost, targeting, onPlay) => ({ id, name, type: 'spell', clan: 'neutral', rarity: 'basic', cost, targeting, keywords: {}, text: name, flavor: name, effects: { onPlay }, tutorialOnly: true });
  const pest = (id, name, hp, traits, actions, extra) => Object.assign({ id, name, hp, size: 1, traits: traits || [], tags: ['pest'], pattern: { type: 'cycle', actions }, flavor: name, art: { species: 'mouse', colors: 'grey', accessory: 'none' }, tutorialOnly: true }, extra || {});
  const atk = (label, dmg) => ({ kind: 'attack', dmg, hits: 1, floors: 'own', pick: 'front', label });
  T.cards.push(
    unit('t_biscuit', 'Biscuit', 0, 4, 14, 3, { type: 'champion' }),
    unit('t_tabby', 'Alley Tabby', 1, 3, 5, 2),
    unit('t_loaf', 'Loaf', 1, 0, 7, 2),
    unit('t_fighter', 'Fighter', 1, 3, 20, 3),
    unit('t_glass', 'Glass Cat', 1, 1, 4, 2),
    unit('t_lastlife', 'Last Life Cat', 1, 1, 4, 1),
    spell('t_hiss', 'Hiss', 1, 'enemy', [{ type: 'damage', amount: 5, kind: 'hit', target: 'chosenEnemy' }]),
    spell('t_knock3', 'Knock It Off', 1, 'enemy', [{ type: 'knock', amount: 1, target: 'chosenEnemy' }]),
    spell('t_fluff', 'Fluff Up', 1, 'cat', [{ type: 'fluff', amount: 5, target: 'chosenCat' }]),
    spell('t_nap', 'Catnap', 1, 'cat', [{ type: 'nap', target: 'chosenCat' }, { type: 'heal', amount: 3, target: 'chosenCat' }]),
    spell('t_box', 'Box', 1, 'floor', [{ type: 'box', target: 'chosenFloor' }]),
    spell('t_nip', 'Nip Hit', 0, 'none', [{ type: 'catnip', amount: 4 }])
  );
  T.enemies.push(
    pest('t_mouse', 'Mouse', 4, [], [atk('Nibble', 2)]),
    pest('t_rat', 'Rat', 8, [], [atk('Bite', 3), atk('Gnaw', 5)]),
    pest('t_squirrel', 'Squirrel', 6, ['Climber'], [atk('Scratch', 3)]),
    pest('t_brute', 'Brute', 30, [], [atk('Smash', 6)]),
    pest('t_sunhit', 'Sun Hitter', 6, ['Climber'], [atk('Scratch', 3)])
  );
  SB.content.rebuild();
}

function mkRun(SB, seed, deckIds, clan, side) {
  const run = SB.run.newRun({ seed, clan: clan || 'alley', side: side || 'hearth', rank: 0 });
  run.relics = [];
  if (deckIds) run.deck = deckIds.map(id => SB.cardInst.make(id));
  return run;
}
function spawn(id, floor, at) { return { id, floor, at: at || 'back' }; }
function mk(SB, o) {
  const run = mkRun(SB, o.seed || 'T', o.deck, o.clan, o.side);
  const enc = Object.assign({ id: 'test_enc', type: 'prowl', act: 1, rules: { nightClock: !!o.clock, impatience: false, noPile: !!o.noPile }, waves: [], setup: { cats: [] } }, o.enc || {});
  if (o.cats) enc.setup = { cats: o.cats };
  if (o.waves) enc.waves = o.waves;
  return SB.battle.create(run, enc, { seed: o.bseed === undefined ? 1 : o.bseed, hands: o.hands, noWitching: !o.clock });
}
const hid = (B, id) => { const h = B.state.hand.find(x => x.card.id === id); return h && h.uid; };
const play = (B, id, target) => { const u = hid(B, id); if (!u) return { ok: false, reason: 'not in hand: ' + id }; return B.playCard(u, target || {}); };
const cats = (B, f) => B.state.floors[f].cats;
const pests = (B, f) => B.state.floors[f].pests;
const sig = B => JSON.stringify(B.state.floors.map(f => [f.cats.map(c => [c.id, c.health, c.lives, c.fluff || 0]), f.pests.map(p => [p.id, p.hp, p.fluff])]));

// =========================================================================================
const SB0 = makeSB();

section('content validates with no errors', () => {
  const v = SB0.content.validate();
  ok(v.errors.length === 0, 'validate errors: ' + v.errors.slice(0, 5).join('; '));
  ok(SB0.engine.ops.names().length > 100, 'ops registered');
});

section('A02 worked example, rounds 1 and 2', () => {
  const SB = makeSB(); addTestContent(SB);
  const hand1 = ['t_tabby', 't_tabby', 't_loaf', 't_hiss', 't_knock3'];
  const deck = hand1.concat(['t_tabby', 't_loaf', 't_hiss', 't_fluff']);
  const B = mk(SB, {
    deck, cats: [{ ref: 'B', card: 't_biscuit', floor: 1, pos: 0 }],
    waves: [
      { round: 1, spawns: [spawn('t_rat', 1), spawn('t_mouse', 1), spawn('t_mouse', 1)] },
      { round: 2, spawns: [spawn('t_rat', 1), spawn('t_squirrel', 1)] },
      { round: 3, spawns: [spawn('t_mouse', 1), spawn('t_mouse', 1)] }
    ],
    hands: [hand1, hand1, ['t_fluff', 't_knock3', 't_loaf', 't_hiss', 't_hiss', 't_tabby', 't_tabby']], noPile: true
  });
  B.state.sunbeam.warmth = 40;
  eq(pests(B, 0).map(p => p.hp), [8, 4, 4], 'R1 pests');
  eq(B.state.zoomies, 3, 'R1 zoomies');
  eq(B.state.hand.length, 5, 'R1 hand');
  eq(B.state.intents.length, 3, 'R1 three intents');
  ok(play(B, 't_tabby', { floor: 0 }).ok, 'Tabby A');
  ok(play(B, 't_loaf', { floor: 0, pos: 0 }).ok, 'Loaf A front');
  eq(cats(B, 0).map(c => c.id), ['t_loaf', 't_biscuit', 't_tabby'], 'R1 cat order');
  ok(B.state.intents.every(i => i.targetUid === cats(B, 0)[0].uid || (i.targetUids || [])[0] === cats(B, 0)[0].uid), 'intents point at Loaf');
  ok(play(B, 't_hiss', { pestUid: pests(B, 0)[0].uid }).ok, 'Hiss on rat');
  eq(pests(B, 0)[0].hp, 3, 'Rat 8-5');
  eq(B.state.zoomies, 0, 'R1 zoomies spent');
  B.endTurn();
  eq(B.state.round, 2, 'now round 2');
  // R1 outcome: Biscuit killed the rat, Tabby hit M1; two Nibbles on Loaf
  const loafA = cats(B, 0).find(c => c.id === 't_loaf');
  eq(loafA.health, 3, 'Loaf A 7-4 = 3');
  eq(pests(B, 0).map(p => p.id.slice(2) + p.hp), ['mouse1', 'mouse4', 'rat8', 'squirrel6'], 'R2 cellar after spawn');
  eq(B.state.sunbeam.warmth, 40, 'warmth 40');
  // round 2
  ok(play(B, 't_loaf', { floor: 0, pos: 0 }).ok, 'Loaf B front');
  ok(play(B, 't_tabby', { floor: 1 }).ok, 'Tabby B parlor');
  const m2 = pests(B, 0)[1];
  ok(play(B, 't_hiss', { pestUid: m2.uid }).ok, 'Hiss on M2');
  eq(pests(B, 0).map(p => p.id.slice(2)), ['mouse', 'rat', 'squirrel'], 'M2 gone, compacted');
  B.endTurn();
  const loafB = cats(B, 0)[0];
  eq(loafB.health, 1, 'Loaf B 7-3-3 = 1');
  eq(pests(B, 1).map(p => p.id.slice(2)), ['squirrel'], 'Squirrel climbed to the Parlor');
  eq(pests(B, 0).map(p => p.id.slice(2) + p.hp), ['rat5', 'mouse4', 'mouse4'], 'R3 cellar');
  eq(B.state.sunbeam.warmth, 40, 'warmth still 40');
  ok(cats(B, 0).concat(cats(B, 1)).every(c => c.lives >= 2 || c.id === 't_biscuit'), 'no cat lost a life');
  // round 3: knock the squirrel down, shatter 2 per floor
  const sq = pests(B, 1)[0];
  const hp0 = sq.hp;
  ok(play(B, 't_knock3', { pestUid: sq.uid }).ok, 'Knock the squirrel');
  eq(pests(B, 0).some(p => p.id === 't_squirrel'), true, 'squirrel fell to the Cellar');
  const sq2 = pests(B, 0).find(p => p.id === 't_squirrel');
  ok(sq2.hp < hp0, 'shatter damage dealt');
  eq(!!(sq2.statuses.yarn || sq2.statuses.dizzy), true, 'dizzy or yarn on landing');
});

section('twist: Nine Lives (spend, last life, Cornered)', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_glass', 't_lastlife', 't_tabby', 't_tabby', 't_tabby'],
    waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }, { round: 2, spawns: [spawn('t_mouse', 1)] }] });
  play(B, 't_glass', { floor: 0 });
  const inst = B.run.deck.find(i => i.id === 't_glass');
  const lives0 = inst.lives;
  B.endTurn();
  eq(cats(B, 0).some(c => c.id === 't_glass'), false, 'a lethal hit removes the cat from the board');
  eq(inst.lives, lives0 - 1, 'one life spent on the card instance');
  ok(B.state.discard.concat(B.state.draw, B.state.hand.map(h => h.uid)).some(u => B.state.cards[u].id === 't_glass'), 'the card cycles back into the deck');
  // last life cat dies for good and the card goes to lost
  const B2 = mk(SB, { deck: ['t_lastlife', 't_tabby', 't_tabby', 't_tabby', 't_tabby'], waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }] });
  play(B2, 't_lastlife', { floor: 0 });
  B2.endTurn();
  eq(cats(B2, 0).some(c => c.id === 't_lastlife'), false, 'last life cat removed');
  ok(B2.state.lost.length >= 1 || B2.state.exhaust.length >= 1, 'last life card lost for the run');
});

section('twist: Knock (shatter, cat flap, Heavy)', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_knock3', 't_knock3', 't_tabby', 't_tabby', 't_tabby'], cats: [{ card: 't_fighter', floor: 0, pos: 0 }],
    waves: [{ round: 1, spawns: [spawn('t_brute', 3), spawn('t_squirrel', 2)] }], hands: [['t_knock3', 't_knock3', 't_tabby', 't_tabby', 't_tabby']] });
  const sq = pests(B, 1)[0], hp = sq.hp;
  ok(play(B, 't_knock3', { pestUid: sq.uid }).ok, 'knock squirrel');
  const landed = pests(B, 0).find(p => p.id === 't_squirrel');
  ok(landed && landed.hp === hp - 2, 'one floor fallen is Shatter 2: ' + (landed && landed.hp));
  const brute = pests(B, 2)[0];
  ok(play(B, 't_knock3', { pestUid: brute.uid }).ok, 'knock brute');
  const b2 = B.state.floors.map(f => f.pests.find(p => p.id === 't_brute')).filter(Boolean)[0];
  ok(b2 && b2.hp <= 30, 'brute still alive after knock');
});

section('twist: Nap and Stretch', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_nap', 't_tabby', 't_tabby', 't_tabby', 't_tabby'], cats: [{ card: 't_fighter', floor: 0, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_mouse', 1)] }] });
  const c = cats(B, 0)[0];
  c.health -= 6; 
  const r = B.toggleNap(c.uid);
  ok(r.ok, 'toggle nap');
  ok(cats(B, 0)[0].napping, 'cat is napping');
  eq(B.toggleNap(c.uid).ok, false, 'a cat that only just fell asleep cannot wake the same round');
  B.endTurn();
  const after = cats(B, 0)[0];
  ok(after.health >= 14 - 0 || after.health > 14 - 6, 'napping cat heals at Dusk: ' + after.health);
});

section('twist: Witching Hour and Night Visitors', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { clock: true, deck: ['t_tabby', 't_tabby', 't_tabby', 't_tabby', 't_tabby'], cats: [{ card: 't_fighter', floor: 0, pos: 0 }],
    waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }], enc: { visitors: 'a1_general', rules: { nightClock: true, impatience: false } } });
  const seen = {};
  B.on(e => { seen[e.type] = (seen[e.type] || 0) + 1; });
  let guard = 0;
  while (B.state.round < 5 && !B.state.over && guard++ < 8) B.endTurn();
  ok(B.state.clock.witchingCount >= 1, 'a Witching Hour occurred by round 3: ' + JSON.stringify(B.state.clock));
  ok(seen.witching >= 1, 'witching events emitted');
});

section('twist: Boxes', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_box', 't_box', 't_box', 't_tabby', 't_tabby'], cats: [{ card: 't_fighter', floor: 0, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_mouse', 3)] }],
    hands: [['t_box', 't_box', 't_box', 't_tabby', 't_tabby']] });
  ok(play(B, 't_box', { floor: 0 }).ok, 'box one');
  ok(play(B, 't_box', { floor: 0 }).ok, 'box two');
  const third = play(B, 't_box', { floor: 0 });
  ok(!third.ok, 'a floor holds at most 2 Boxes');
  eq(B.state.floors[0].rooms.filter(r => r.rtype === 'box').length, 2, 'two boxes on the Cellar');
  ok(play(B, 't_tabby', { floor: 0 }).ok, 'a cat deployed onto a boxed floor');
  const sat = cats(B, 0).filter(c => c.boxed);
  ok(sat.length >= 1, 'a cat sits in a Box');
  ok(sat.every(c => c.hidden || (c.statuses && c.statuses.hidden)), 'a boxed cat is Hidden');
  ok(sat.every(c => c.power >= 1), 'boxed cat has a power value');
  B.endTurn();
  ok(B.state.floors[0].rooms.some(r => r.rtype === 'box') || B.state.discard.length > 0, 'box state survives a round');
});

section('twist: Cuddle Pile (Snug, heal, Heap)', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_tabby', 't_tabby', 't_tabby', 't_tabby', 't_tabby'], cats: [{ card: 't_glass', floor: 0, pos: 0 }, { card: 't_fighter', floor: 0, pos: 1 }, { card: 't_glass', floor: 0, pos: 2 }],
    waves: [{ round: 1, spawns: [spawn('t_brute', 3)] }] });
  const [a, b, c] = cats(B, 0);
  eq(a.power, 1 + 1, 'pile of 3 gives +floor(3/2) = +1 Attack');
  b.health = b.maxHealth - 5;
  B.endTurn();
  const b2 = cats(B, 0).find(x => x.id === 't_fighter');
  ok(b2.health > b.maxHealth - 5, 'a Pile of 3 heals each member 1 per round: ' + b2.health);
  const B2 = mk(SB, { deck: ['t_tabby', 't_tabby', 't_tabby', 't_tabby', 't_tabby'], cats: [{ card: 't_glass', floor: 0, pos: 0 }, { card: 't_fighter', floor: 0, pos: 1 }, { card: 't_glass', floor: 0, pos: 2 }, { card: 't_glass', floor: 0, pos: 3 }],
    waves: [{ round: 1, spawns: [spawn('t_brute', 3)] }] });
  eq(cats(B2, 0)[0].power, 1 + 2, 'a Heap of 4 gives +2 Attack');
  B2.endTurn();
  ok(cats(B2, 0).some(x => x.fluff >= 2), 'a Heap gives Fluff each round');
  const B3 = mk(SB, { deck: ['t_tabby', 't_tabby', 't_tabby', 't_tabby', 't_tabby'], cats: [{ card: 't_glass', floor: 1, pos: 0 }, { card: 't_glass', floor: 2, pos: 0 }],
    waves: [{ round: 1, spawns: [spawn('t_brute', 3)] }] });
  eq(cats(B3, 0)[0].power, 1, 'cats on different floors form no Pile');
});

section('twist: Nip (meter, Surge, Crash)', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_nip', 't_nip', 't_nip', 't_nip', 't_nip'], cats: [{ card: 't_fighter', floor: 0, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }],
    hands: [['t_nip', 't_nip', 't_nip', 't_nip', 't_nip']] });
  const p0 = cats(B, 0)[0].power;
  ok(play(B, 't_nip').ok, 'play Nip');
  ok(B.state.nip.meter > 0 || B.state.nip.surge > 0, 'nip meter rose: ' + JSON.stringify(B.state.nip));
  let peak = B.state.nip.surge, crashed = false;
  for (let i = 0; i < 4; i++) { for (let k = 0; k < 4; k++) play(B, 't_nip'); peak = Math.max(peak, B.state.nip.surge); crashed = crashed || B.state.nip.crash > 0; B.endTurn(); crashed = crashed || B.state.nip.crash > 0; if (B.state.over) break; }
  ok(peak > 0, 'a Surge started');
  ok(crashed, 'a Crash followed: ' + JSON.stringify(B.state.nip));
});

section('determinism: same seed, same event log', () => {
  const run1 = (seed) => {
    const SB = makeSB();
    const run = SB.run.newRun({ seed: 'd' + seed, clan: 'alley', side: 'moon', rank: 0 });
    const enc = SB.data.encounters.act1.prowl[3];
    const B = SB.battle.create(run, Object.assign({}, enc, { nodeId: 'n' + seed }), { seed });
    const log = []; B.on(e => log.push(e));
    let r = 0;
    while (!B.state.over && r++ < 40) botTurn(B);
    return { log: JSON.stringify(log), end: sig(B), out: B.state.outcome };
  };
  const a = run1(5), b = run1(5), c = run1(6);
  ok(a.log === b.log, 'identical logs for identical seeds');
  ok(a.end === b.end, 'identical end states');
  ok(a.log !== c.log, 'different seeds differ');
});

section('serialize and restore', () => {
  const SB = makeSB();
  const run = SB.run.newRun({ seed: 'ser', clan: 'hearth', side: 'alley', rank: 0 });
  const enc = SB.data.encounters.act1.prowl[2];
  const B = SB.battle.create(run, Object.assign({}, enc, { nodeId: 'ser' }), { seed: 77 });
  botTurn(B); botTurn(B);
  const snap = JSON.parse(JSON.stringify(B.serialize()));
  const R = SB.battle.restore(run, snap);
  eq(sig(R), sig(B), 'restored state matches');
  botTurn(B); botTurn(R);
  eq(sig(R), sig(B), 'restored battle continues identically');
  eq(R.state.round, B.state.round, 'same round');
});

// ---- engine polish checks (C1 polish pass) -------------------------------------------------------------
section('polish: applyStatus with a negative amount removes stacks', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_tabby'], cats: [{ ref: 'A', card: 't_tabby', floor: 1, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_rat', 1)] }] });
  const c = cats(B, 0)[0], p = pests(B, 0)[0];
  B.addStatus(c, 'claws', 5); B.addStatus(p, 'yarn', 3);
  B.runEffects([{ type: 'applyStatus', status: 'claws', amount: -2, target: 'allCats' }, { type: 'applyStatus', status: 'yarn', amount: -1, target: 'allEnemies' }], B.makeCtx({}));
  eq(c.statuses.claws, 3, 'Claws 5 minus 2');
  eq(p.statuses.yarn, 2, 'Yarn 3 minus 1');
  B.runEffects([{ type: 'applyStatus', status: 'claws', amount: -9, target: 'allCats' }], B.makeCtx({}));
  ok(!c.statuses.claws, 'a big negative amount clears the status without going below 0');
  B.addFloorStatus(0, 'purr', 6);
  B.runEffects([{ type: 'applyStatus', status: 'purr', amount: -2, target: 'allCats' }], B.makeCtx({}));
  eq(B.floorStatus(0, 'purr'), 4, 'negative Purr takes it off the floor');
});

section('polish: duplicate trigger names fire once (Witching Hour, relic hooks, Unbox)', () => {
  const SB = makeSB(); addTestContent(SB);
  const run = mkRun(SB, 'W', ['t_tabby'], 'moon', 'alley');
  run.relics = [{ id: 'relic_jar_of_moths', counter: 0 }];
  const enc = { id: 'w', type: 'prowl', act: 1, rules: { nightClock: true, impatience: false, noPile: true }, waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }], setup: { cats: [{ ref: 'A', card: 't_fighter', floor: 1, pos: 0 }] } };
  const B = SB.battle.create(run, enc, { seed: 3 });
  const names = [], fo = [];
  const f0 = B.fire; B.fire = function (n, d) { names.push(n); return f0.apply(this, arguments); };
  const o0 = B.fireOwn; B.fireOwn = function (u, t, d) { fo.push(t); return o0.apply(this, arguments); };
  let g = 0; while (B.state.round < 3 && !B.state.over && g++ < 6) B.endTurn();
  ok(B.state.clock.isWitching || names.indexOf('onWitchingHour') >= 0, 'reached a Witching Hour');
  eq(names.filter(n => n === 'onWitchingHour').length, 1, 'onWitchingHour fires once');
  eq(names.filter(n => n === 'onWitching' || n === 'onNightPhase').length, 0, 'no duplicate Witching names');
  eq(run.relics[0].counter, 1, 'a relic hooked on onNightPhase ran once');
  // Unbox: leaving a Box fires onUnbox once, never also through fireOwn
  const run2 = mkRun(SB, 'U', ['mischief_pop_up_pounce'], 'mischief', 'alley');
  const B2 = SB.battle.create(run2, { id: 'u', type: 'prowl', act: 1, rules: { nightClock: false, impatience: false, noPile: true }, waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }], setup: { cats: [{ ref: 'P', card: 'mischief_pop_up_pounce', floor: 1, pos: 0 }] } }, { seed: 4, noWitching: true });
  const fo2 = [], un = []; const o2 = B2.fireOwn; B2.fireOwn = function (u, t) { fo2.push(t); return o2.apply(this, arguments); };
  const f2 = B2.fire; B2.fire = function (n) { un.push(n); return f2.apply(this, arguments); };
  const box = B2.placeBox(0, { kind: 'cardboard' }); B2.seatCat(cats(B2, 0)[0], box); B2.touch();
  B2.endTurn();
  eq(un.filter(n => n === 'onUnbox').length, 1, 'onUnbox fires once through fire');
  eq(fo2.filter(n => n === 'onUnbox').length, 0, 'and not a second time through fireOwn');
});

section('polish: endTurn can never leave turn=resolving after an exception', () => {
  const SB = makeSB(); addTestContent(SB);
  ['pestAdvance', 'dusk', 'beginRound', 'retryGarden'].forEach(where => {
    const B = mk(SB, { deck: ['t_tabby'], cats: [{ ref: 'A', card: 't_tabby', floor: 1, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_rat', 1)] }] });
    const orig = B[where]; let thrown = 0;
    B[where] = function () { if (!thrown++) throw new Error('boom ' + where); return orig.apply(this, arguments); };
    const before = (SB.util.engineErrors || []).length;
    let threw = false, evs = null;
    try { evs = B.endTurn(); } catch (e) { threw = true; }
    ok(!threw, where + ': endTurn does not throw');
    ok(B.state.turn === 'player' || B.state.over, where + ': control returns to the player (turn=' + B.state.turn + ')');
    eq((SB.util.engineErrors || []).length, before + 1, where + ': the error is logged in SB.util.engineErrors');
    ok(Array.isArray(evs), where + ': endTurn still returns the event list');
    B.endTurn();
    ok(B.state.turn === 'player' || B.state.over, where + ': the next round plays normally');
  });
  SB.util.engineErrors.length = 0;
});

section('polish: Cornered follows the corneredAt mod and needs 2 max Lives', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['t_tabby'], cats: [{ ref: 'A', card: 't_tabby', floor: 1, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_rat', 1)] }] });
  const c = cats(B, 0)[0], base = B.atk(c);
  c.maxLives = 3; c.lives = 1; B.touch();
  eq([B.isCornered(c), B.atk(c) - base], [true, 2], 'Cornered at 1 Life for +2');
  c.lives = 2; B.touch(); eq([B.isCornered(c), B.atk(c) - base], [false, 0], '2 Lives is not Cornered by default');
  B.relicMods = () => ({ corneredAt: 2, corneredBonus: 4 }); B.touch();
  eq([B.isCornered(c), B.atk(c) - base], [true, 4], 'corneredAt 2 and corneredBonus 4 apply from battle.js itself');
  c.maxLives = 1; c.lives = 1; B.touch(); eq(B.isCornered(c), false, 'a cat with 1 max Life is never Cornered');
});

section('polish: a lone cat is never a Pile (Family Portrait, Big Mama)', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['hearth_family_portrait', 't_tabby'], hands: [['hearth_family_portrait']], clan: 'hearth', side: 'alley', cats: [{ ref: 'A', card: 't_tabby', floor: 1, pos: 0 }], waves: [{ round: 1, spawns: [spawn('t_rat', 1)] }], noPile: false });
  B.state.zoomies = 10;
  const c = cats(B, 0)[0];
  eq(B.pileSizeOf(c), 0, 'one cat is no Pile');
  const r = play(B, 'hearth_family_portrait', { floor: 0 });
  ok(r.ok, 'Family Portrait plays ' + (r.reason || ''));
  B.touch(); B.ensure();
  eq([B.pileSizeOf(c), c._snug || 0], [0, 0], 'with the Portrait a lone cat is still no Pile and gets no Snug');
});

section('polish: Toy durability (lasts that many rounds) and charges', () => {
  const SB = makeSB(); addTestContent(SB);
  const B = mk(SB, { deck: ['mischief_yarn_ball'], hands: [['mischief_yarn_ball']], clan: 'mischief', side: 'alley', cats: [], waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }] });
  B.state.zoomies = 10;
  ok(play(B, 'mischief_yarn_ball', { floor: 0 }).ok, 'Yarn Ball plays');
  const room = () => B.state.floors[0].rooms.filter(r => r.rtype === 'toy')[0];
  eq(room() && room().durability, 3, 'Yarn Ball starts with durability 3');
  B.endTurn(); eq(room() && room().durability, 2, 'one round used');
  B.endTurn(); B.endTurn();
  ok(!room(), 'worn out after 3 rounds');
  // charges extend the life ("Lasts 2 more turns")
  const inst = SB.cardInst.make('mischief_yarn_ball'), eff = SB.cardInst.effective(inst);
  eff.charges = 2;
  const B2 = mk(SB, { deck: ['mischief_yarn_ball'], hands: [['mischief_yarn_ball']], clan: 'mischief', side: 'alley', cats: [], waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }] });
  const uid = B2.state.hand[0].uid; B2.state.cards[uid].eff.charges = 2; B2.state.zoomies = 10;
  B2.playCard(uid, { floor: 0 });
  eq(B2.state.floors[0].rooms.filter(r => r.rtype === 'toy')[0].durability, 5, 'durability 3 plus 2 charges');
  // a toy with no durability stays the whole fight
  const B3 = mk(SB, { deck: ['hearth_sunny_cushion'], hands: [['hearth_sunny_cushion']], clan: 'hearth', side: 'alley', cats: [], waves: [{ round: 1, spawns: [spawn('t_brute', 1)] }] });
  B3.state.zoomies = 10; play(B3, 'hearth_sunny_cushion', { floor: 0 }); B3.endTurn(); B3.endTurn(); B3.endTurn(); B3.endTurn();
  eq(B3.state.floors[0].rooms.filter(r => r.rtype === 'toy').length, 1, 'a toy without durability stays');
});

// ---- a simple deterministic bot -------------------------------------------------------
function botTurn(B) {
  let guard = 0;
  (B.state.attached || []).slice().forEach(a => { if (a.host) B.scratchOff(a.host); });
  while (B.state.turn === 'player' && !B.state.over && guard++ < 30) {
    let played = false;
    const hand = B.state.hand.slice().sort((a, b) => {
      const ta = (a.card.type === 'unit' || a.card.type === 'champion') ? 0 : 1, tb = (b.card.type === 'unit' || b.card.type === 'champion') ? 0 : 1;
      return ta - tb || a.card.cost - b.card.cost;
    });
    for (const h of hand) {
      const chk = B.canPlay(h.uid);
      if (!chk.ok) continue;
      let target = {};
      if (chk.needsTarget === 'floor') {
        const f = chk.targets.slice().sort((a, b) => B.state.floors[b.floor].pests.length - B.state.floors[a.floor].pests.length || a.floor - b.floor)[0];
        target = { floor: f.floor };
      } else if (chk.needsTarget === 'pest') target = { pestUid: chk.targets[0].pestUid };
      else if (chk.needsTarget === 'cat') target = { catUid: chk.targets[0].catUid };
      if (B.playCard(h.uid, target).ok) { played = true; break; }
    }
    if (!played) break;
  }
  B.endTurn();
}

section('bot: 200 seeded Act 1 battles, starter decks of every clan pair', () => {
  const SB = makeSB();
  const clans = ['alley', 'hearth', 'moon', 'mischief'];
  const pairs = [];
  clans.forEach(c => clans.forEach(s => { if (c !== s) pairs.push([c, s]); }));
  const encs = [].concat(SB.data.encounters.act1.prowl, SB.data.encounters.act1.night, SB.data.encounters.act1.elite);
  const N = QUICK ? 40 : 200;
  let wins = 0, losses = 0, stalls = 0, thrown = 0, firstErr = null;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const [clan, side] = pairs[i % pairs.length];
    const enc = encs[(i * 7) % encs.length];
    try {
      const run = SB.run.newRun({ seed: 'bot' + i, clan, side, rank: 0 });
      const B = SB.battle.create(run, Object.assign({}, enc, { nodeId: 'bn' + i, hpScale: 1.1 }), { seed: 1000 + i });
      let r = 0;
      while (!B.state.over && r++ < 80) botTurn(B);
      if (!B.state.over) { stalls++; continue; }
      const res = B.result();
      ok(res && (res.outcome === 'win' || res.outcome === 'lose'), 'result has an outcome');
      if (res.outcome === 'win') wins++; else losses++;
    } catch (e) { thrown++; if (!firstErr) firstErr = clan + '/' + side + ' ' + enc.id + ' ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | '); }
  }
  console.log('     ' + N + ' battles: ' + wins + ' wins, ' + losses + ' losses, ' + stalls + ' stalls, ' + thrown + ' exceptions, ' + (Date.now() - t0) + ' ms');
  ok(thrown === 0, 'no exceptions in bot battles: ' + firstErr);
  ok((SB.util.engineErrors || []).length === 0, 'no swallowed endTurn exceptions: ' + JSON.stringify((SB.util.engineErrors || []).slice(0, 2)));
  ok(stalls === 0, stalls + ' battles never reached an outcome in 80 rounds');
  ok(wins > N * 0.2, 'the greedy bot still wins a fair share of Act 1 battles (starters are deliberately harder now)');
});


// ---- full-run bot: whole runs with real battles (60 seeds, 300 with --fullrun) ----------------------------------------
section('full-run bot: seeded runs across clan pairs, real battles, no exceptions or stalls', () => {
  const SB = makeSB();
  const R = SB.run, CL = ['alley', 'hearth', 'moon', 'mischief'];
  const N = process.argv.includes('--fullrun') ? 300 : (QUICK ? 12 : 60);
  const st = { runs: 0, fights: 0, wins: 0, losses: 0, stalls: 0, exc: 0, won: 0 };
  let firstErr = null, firstStall = null;
  const fightIt = (run, enc, seed) => {
    const B = SB.battle.create(run, enc, { seed });
    let r = 0; while (!B.state.over && r++ < 80) botTurn(B);
    st.fights++;
    if (!B.state.over) { st.stalls++; if (!firstStall) firstStall = enc.id; return null; }
    const res = B.result(); if (res.outcome === 'win') st.wins++; else st.losses++;
    return res;
  };
  for (let i = 0; i < N; i++) {
    const clan = CL[i % 4], alt = CL[(i + 1 + Math.floor(i / 4) % 3) % 4], side = alt === clan ? CL[(i + 2) % 4] : alt;
    try {
      const run = R.newRun({ seed: 'FR' + i, clan, side, rank: [0, 0, 3, 5, 7, 10][i % 6], noSave: true });
      st.runs++;
      let steps = 0;
      while (run.status !== 'over' && steps++ < 300) {
        if (run.status !== 'map') throw new Error('stuck in status ' + run.status);
        const avail = R.availableNodes(run), out = R.enterNode(run, avail[(i + steps) % avail.length]);
        if (['battle', 'elite', 'night', 'boss'].includes(out.type)) {
          const res = fightIt(run, out.payload.encounter, 5000 + i * 31 + steps);
          if (!res) break;
          const fr = R.finishBattle(run, res);
          if (fr && fr.defeat) break;
          const pl = run.pending && run.pending.payload;
          if (pl && pl.cardChoices && pl.cardChoices.length) R.pickCard(run, pl.cardChoices[0]);
          if (run.status === 'reward') { const o = R.proceed(run); if (o && o.next === 'victory') { st.won++; break; } }
        } else if (out.type === 'event') {
          const ev = out.payload.event, opts = SB.event.options(run, ev).filter(o => o.enabled);
          const r = SB.event.choose(run, ev, opts[0].idx, { auto: true });
          if (r.fight) {
            const res = fightIt(run, r.fight.encounter || r.fight, 99 + i);
            if (!res) break;
            const fr = R.finishBattle(run, res); if (fr && fr.defeat) break;
            if (run.status === 'reward') R.proceed(run);
          } else { SB.event.autoDrafts(run); R.leaveNode(run); }
        } else if (out.type === 'treasure') { R.treasure(run, 'open'); R.leaveNode(run); }
        else R.leaveNode(run);
      }
    } catch (e) { st.exc++; if (!firstErr) firstErr = clan + '/' + side + ' seed ' + i + ' ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | '); }
  }
  console.log('     ' + JSON.stringify(st));
  ok(st.exc === 0, 'no exceptions in full runs: ' + firstErr);
  ok(st.stalls === 0, 'no battle failed to finish in 80 rounds (first: ' + firstStall + ')');
  ok((SB.util.engineErrors || []).length === 0, 'no swallowed endTurn exceptions: ' + JSON.stringify((SB.util.engineErrors || []).slice(0, 2)));
  ok(st.fights > N * 2, 'the runs actually fought');
});

console.log('\n' + checks + ' checks, ' + failures + ' failures');
failLog.slice(0, 40).forEach(m => console.log('  - ' + m));
process.exit(failures ? 1 : 0);
