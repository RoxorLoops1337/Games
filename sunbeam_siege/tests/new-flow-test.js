// New turn flow: pests strike first, every pest climbs one floor per round, cats can be placed Front / Middle / Back,
// and the one-fight tutorial plays out as scripted. node tests/new-flow-test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
function makeSB() {
  const store = {};
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
  fs.readdirSync(path.join(root, 'src/data')).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(root, 'src/data', f)));
  ['util', 'content', 'registry', 'card-inst', 'battle', 'battle-ai', 'run', 'rewards', 'map', 'profile', 'shop', 'post', 'nook', 'events-engine'].forEach(n => {
    const f = path.join(root, 'src/engine', n + '.js'); if (fs.existsSync(f)) load(f);
  });
  fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
  ctx.SB.util.quiet = true;
  return ctx.SB;
}
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log('  FAIL ' + msg); } }

// a tutorial-style battle: scripted hands, plain cards, no Piles
function tutBattle(SB) {
  const run = SB.run.newRun({ seed: 't', clan: 'alley', side: 'hearth', rank: 0, tutorial: true });
  const e0 = SB.content.encounter('tut_1_cellar');
  const enc = Object.assign({}, e0, { nodeId: 't', rules: Object.assign({}, e0.rules, { noPile: true }) });
  run.relics = []; run.deck = [];
  ['neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_swat'].forEach(id => run.deck.push(SB.cardInst.make(id)));
  return SB.battle.create(run, enc, { seed: 5 });
}
const inHand = (B, name) => B.state.hand.find(h => h.card.name === name);

{ // rules defaults
  const SB = makeSB();
  ok(SB.data.rules.pestsFirst === true && SB.data.rules.pestsAlwaysClimb === true, 'new flow is on by default');
}
{ // pests strike before cats, and the survivor climbs past the cats
  const SB = makeSB(), B = tutBattle(SB);
  const phases = [];
  B.on(e => { if (e.type === 'phase') phases.push(e.phase); });
  ok(B.playCard(inHand(B, 'Hall Tabby').uid, { floor: 0, pos: 0 }).ok, 'tabby placed on the Cellar');
  B.endTurn();
  const order = phases.filter(p => p === 'pest_attacks' || p === 'cat_attacks');
  ok(order[0] === 'pest_attacks' && order[1] === 'cat_attacks', 'pest_attacks comes before cat_attacks: ' + order.join(','));
  ok(B.state.floors[1].pests.length === 1 && B.state.floors[1].pests[0].hp === 1, 'rat (1 hp left) climbed to the Parlor although two cats stand on the Cellar');
  ok(B.state.floors[0].cats.length === 2 && B.state.sunbeam.warmth === 40, 'both cats still on the Cellar, Sunbeam untouched');
  // the climbed rat hits the front cat on its new floor before anyone can strike it, and the scripted lesson wins in round 2
  ok(B.playCard(inHand(B, 'Hall Tabby').uid, { floor: 1 }).ok, 'second tabby on the Parlor');
  ok(B.playCard(inHand(B, 'Swat').uid, { pestUid: B.state.floors[0].pests[0].uid }).ok, 'swat the new mouse');
  B.endTurn();
  ok(B.state.over && B.result().outcome === 'win', 'the scripted lesson is won in round 2');
}
{ // Front / Middle / Back
  const SB = makeSB(), B = tutBattle(SB);
  const place = (pos) => { const h = inHand(B, 'Hall Tabby'); return B.playCard(h.uid, { floor: 0, pos }); };
  ok(place(0).ok, 'front'); // Cellar: Tabby, Biscuit
  B.state.zoomies = 3;
  ok(place(1).ok, 'middle'); // Tabby, Tabby, Biscuit
  B.state.zoomies = 3;
  ok(place(99).ok, 'back'); // Tabby, Tabby, Biscuit, Tabby
  const names = B.state.floors[0].cats.map(c => c.name);
  ok(names.length === 4 && names[2] === 'Biscuit' && names[3] === 'Hall Tabby' && names[0] === 'Hall Tabby', 'cats sit where they were put: ' + names.join(','));
}
console.log(fails ? 'FAIL new-flow: ' + fails + ' of ' + checks : 'PASS new-flow: ' + checks + ' checks');
process.exit(fails ? 1 : 0);
