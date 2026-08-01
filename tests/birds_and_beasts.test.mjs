// THE BIRDS & THE BEASTS — headless logic + render suite.
//
// birds_and_beasts/index.html is one self-contained file: markup, CSS and a
// single inline <script>. This harness stubs enough of a browser (including a
// no-op 2d context so the portrait painter runs) and evals that script with
// __BB_HEADLESS__ set, so every check below drives the real game functions
// through window.BB rather than a re-implementation. The UI half is driven too,
// so a render-time error fails here instead of in the browser.
//
// Run: node tests/birds_and_beasts.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', 'birds_and_beasts', 'index.html');

/* ---------------------------------------------------------- assert kit --- */
let pass = 0;
const fails = [];
function ok(cond, label){ if (cond){ pass++; return; } fails.push(label); console.error('  ✗ ' + label); }
const eq = (a, b, l) => ok(a === b, `${l} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const ge = (a, b, l) => ok(a >= b, `${l} (got ${a}, want >= ${b})`);
const le = (a, b, l) => ok(a <= b, `${l} (got ${a}, want <= ${b})`);
const between = (a, lo, hi, l) => ok(a >= lo && a <= hi, `${l} (got ${a}, want ${lo}..${hi})`);

/* ------------------------------------------------------------- harness --- */
const noop = () => {};
function mkCtx(){
  return new Proxy({}, {
    get(_t, k){
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'canvas') return { width: 236, height: 164 };
      return noop;
    },
    set(){ return true; },
  });
}
function loadGame(store = {}){
  const html = readFileSync(GAME, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no inline <script> found in birds_and_beasts/index.html');

  const ctx = mkCtx();
  const mkEl = () => {
    const el = {
      style: {}, dataset: {}, children: [], className: '', innerHTML: '', textContent: '',
      title: '', width: 236, height: 164, disabled: false, onclick: null,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      addEventListener: noop, removeEventListener: noop,
      appendChild(c){ this.children.push(c); return c; },
      remove: noop, setAttribute: noop, removeAttribute: noop,
      getContext: () => ctx,
      querySelector: () => mkEl(), querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 200 }),
    };
    return el;
  };
  const els = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: (k) => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.setTimeout = (fn) => 0;          // no deferred UI work in tests
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 900; global.innerHeight = 700;
  global.document = {
    getElementById: (id) => (els[id] || (els[id] = mkEl())),
    createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [],
    addEventListener: noop, body: mkEl(),
  };
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; },
    set(t, k, v){ t[k] = v; return true; },
  });
  global.__BB_HEADLESS__ = true;
  eval('(function(){' + m[1] + '\n})()');
  return globalThis.BB;
}

const BB = loadGame();

/* ============================== rng / setup =============================== */
{
  BB.srand(7);
  const a = [BB.rng(), BB.rng(), BB.rng()];
  BB.srand(7);
  const b = [BB.rng(), BB.rng(), BB.rng()];
  ok(a.every((v, i) => v === b[i]), 'rng is seeded and replayable');
  ok(a.every((v) => v >= 0 && v < 1), 'rng stays in [0,1)');

  const d1 = BB.newRun(1234).deck.map((c) => c.name + c.might + c.hide);
  const d2 = BB.newRun(1234).deck.map((c) => c.name + c.might + c.hide);
  ok(d1.join() === d2.join(), 'same seed rebuilds the same starter deck');
  eq(BB.newRun(1).deck.length, 8, 'starter herd is 8 head');
  eq(BB.R.hp, BB.C.START_HP, 'starts at full health');
  ok(BB.R.deck.every((c) => c.cost >= 0 && c.cost <= 5), 'starter costs are in range');
  ok(BB.R.deck.every((c) => c.blood[0] === c.id), 'every beast is its own first ancestor');
}

/* ================================= cost =================================== */
{
  eq(BB.deriveCost(6, 3, 'none'), 1, 'a modest beast costs 1');
  eq(BB.deriveCost(20, 12, 'none'), 6 > 5 ? 5 : 6, 'cost is capped at 5');
  eq(BB.deriveCost(30, 30, 'frenzy'), 5, 'huge stats + keyword still cap at 5');
  eq(BB.deriveCost(18, 4, 'runt'), 0, 'Runt is always free');
  ge(BB.deriveCost(14, 8, 'none'), BB.deriveCost(6, 3, 'none'), 'better stats cost more');
  ge(BB.deriveCost(8, 4, 'frenzy'), BB.deriveCost(8, 4, 'none'), 'a keyword adds to the cost');
  eq(BB.deriveCost(0, 0, 'none'), 0, 'cost never goes negative');
  ok(BB.power({ might: 10, hide: 5, trait: 'none' }) > BB.power({ might: 6, hide: 3, trait: 'none' }),
    'power tracks stats');
  ok(BB.power({ might: 10, hide: 5, trait: 'cursed' }) < BB.power({ might: 10, hide: 5, trait: 'none' }),
    'bad traits drag power down');
}

/* ================================ breeding ================================ */
{
  BB.srand(99);
  const a = BB.makeCard({ pre: 'Bog', suf: 'snout', might: 8, hide: 4, trait: 'swift', gen: 2 });
  const b = BB.makeCard({ pre: 'Cinder', suf: 'fang', might: 6, hide: 6, trait: 'venom', gen: 3 });
  const r = BB.breed(a, b);
  const c = r.child;
  eq(c.gen, 4, 'chick is one generation past the older parent');
  ok(c.blood.indexOf(a.id) >= 0 && c.blood.indexOf(b.id) >= 0, 'chick carries both parents in its blood');
  le(c.blood.length, 10, 'bloodline is trimmed, not unbounded');
  ok([a.pre, b.pre].indexOf(c.pre) >= 0, 'first name half comes from a parent');
  ok([a.suf, b.suf].indexOf(c.suf) >= 0, 'second name half comes from a parent');
  ok(c.name.indexOf(c.pre) >= 0 && c.name.indexOf(c.suf) >= 0, 'display name contains both halves');
  eq(c.parents.length, 2, 'chick remembers who its parents were');
  ok(c.pre + c.suf !== a.pre + a.suf && c.pre + c.suf !== b.pre + b.suf,
    'a chick is never a name-for-name copy of a parent');
  ge(c.might, 1, 'no zero-might chicks');
  eq(c.cost, BB.deriveCost(c.might, c.hide, c.trait), 'chick cost is derived from its own genes');
  ok(typeof r.dM === 'number' && typeof r.dH === 'number', 'breed reports stat deltas');

  // visual genes blend, so the chick resembles its parents
  ok(c.vis.body >= Math.min(a.vis.body, b.vis.body) - 0.001 &&
     c.vis.body <= Math.max(a.vis.body, b.vis.body) + 0.001, 'body build lands between the parents');
  ok([a.vis.eyes, b.vis.eyes, 1, 2, 3].indexOf(c.vis.eyes) >= 0, 'eye count is a parent gene or a mutation');
  between(c.vis.hue, 0, 359, 'hue stays on the wheel');
  between(BB.blendHue(350, 10, 0.5), 0, 359, 'hue blends the short way round');
  eq(Math.round(BB.blendHue(350, 10, 0.5)), 0, 'hue midpoint of 350 and 10 is 0, not 180');
}

/* --------------------- the distribution is the game ----------------------- */
{
  BB.srand(4242);
  const p1 = BB.makeCard({ pre: 'A', suf: 'a', might: 10, hide: 6, trait: 'none' });
  const p2 = BB.makeCard({ pre: 'B', suf: 'b', might: 10, hide: 6, trait: 'none' });
  let sum = 0, prodigy = 0, runt = 0, worse = 0, better = 0, maxM = 0, minM = 99;
  const N = 800;
  for (let i = 0; i < N; i++){
    const r = BB.breed(p1, p2);
    sum += r.child.might;
    maxM = Math.max(maxM, r.child.might);
    minM = Math.min(minM, r.child.might);
    if (r.tags.indexOf('prodigy') >= 0) prodigy++;
    if (r.tags.indexOf('runt') >= 0) runt++;
    if (r.child.might + r.child.hide < 16) worse++;
    if (r.child.might + r.child.hide > 16) better++;
  }
  const mean = sum / N;
  between(mean, 10.0, 13.0, 'mean chick drifts a little above the parents, not wildly');
  ge(prodigy / N, 0.05, 'prodigies actually happen');
  ge(runt / N, 0.05, 'runts actually happen');
  ge(worse, 100, 'plenty of chicks come out worse than the parents');
  ge(better, 100, 'plenty of chicks come out better');
  ge(maxM, 15, 'the top tail reaches well above the parents');
  le(minM, 7, 'the bottom tail drops well below the parents');
  le(maxM, 30, 'no runaway chick triples its parents');
}

/* ------------------------------ inbreeding -------------------------------- */
{
  BB.srand(31337);
  const a = BB.makeCard({ pre: 'Bog', suf: 'snout', might: 9, hide: 5, trait: 'none' });
  const b = BB.makeCard({ pre: 'Fen', suf: 'wart', might: 9, hide: 5, trait: 'none' });
  ok(!BB.shareBlood(a, b), 'two unrelated beasts share no blood');
  const kid = BB.breed(a, b).child;
  ok(BB.shareBlood(a, kid), 'a parent and its chick are related');
  ok(BB.shareBlood(kid, kid), 'a beast is related to itself');

  let cursed = 0, flagged = 0, spread = 0;
  const N = 400;
  for (let i = 0; i < N; i++){
    const r = BB.breed(a, kid);
    if (BB.BAD_TRAITS.indexOf(r.child.trait) >= 0) cursed++;
    if (r.tags.indexOf('inbred') >= 0) flagged++;
    spread += Math.abs(r.child.might - 9);
  }
  eq(flagged, N, 'every inbred pairing is flagged');
  ge(cursed / N, 0.15, 'inbreeding regularly throws bad blood');

  let cleanSpread = 0, cleanCursed = 0;
  for (let i = 0; i < N; i++){
    const x = BB.makeCard({ pre: 'X', suf: 'x', might: 9, hide: 5, trait: 'none' });
    const y = BB.makeCard({ pre: 'Y', suf: 'y', might: 9, hide: 5, trait: 'none' });
    const r = BB.breed(x, y);
    if (BB.BAD_TRAITS.indexOf(r.child.trait) >= 0) cleanCursed++;
    cleanSpread += Math.abs(r.child.might - 9);
  }
  ge(spread, cleanSpread * 1.05, 'inbred litters swing wider than clean ones');
  ok(cursed > cleanCursed, 'clean pairings throw fewer bad traits than inbred ones');
}

/* ------------------------------- fertile ---------------------------------- */
{
  BB.srand(808);
  const norm = BB.makeCard({ pre: 'N', suf: 'n', might: 9, hide: 5, trait: 'none' });
  const fert = BB.makeCard({ pre: 'F', suf: 'f', might: 9, hide: 5, trait: 'fertile' });
  let mutF = 0, mutN = 0;
  for (let i = 0; i < 400; i++){
    if (BB.breed(fert, BB.makeCard({ pre: 'Q', suf: 'q', might: 9, hide: 5, trait: 'none' }))
      .tags.indexOf('mutation') >= 0) mutF++;
    if (BB.breed(norm, BB.makeCard({ pre: 'Q', suf: 'q', might: 9, hide: 5, trait: 'none' }))
      .tags.indexOf('mutation') >= 0) mutN++;
  }
  ge(mutF, mutN, 'Fertile parents mutate their young more often');
}

{
  // no chick out of 500 may come out wearing a parent's exact name
  BB.srand(6161);
  let copies = 0, titled = 0;
  const a = BB.makeCard({ pre: 'Bog', suf: 'snout', might: 7, hide: 4, trait: 'none' });
  const b = BB.makeCard({ pre: 'Cinder', suf: 'fang', might: 7, hide: 4, trait: 'none' });
  for (let i = 0; i < 500; i++){
    const c = BB.breed(a, b).child;
    if (c.pre + c.suf === 'Bogsnout' || c.pre + c.suf === 'Cinderfang') copies++;
    if (c.name !== c.pre + c.suf) titled++;
  }
  eq(copies, 0, 'no chick copies a parent name outright');
  ge(titled, 20, 'some chicks pick up a title');

  // identical-named parents still produce a distinguishable chick
  const t1 = BB.makeCard({ pre: 'Twin', suf: 'ling', might: 6, hide: 3, trait: 'none' });
  const t2 = BB.makeCard({ pre: 'Twin', suf: 'ling', might: 6, hide: 3, trait: 'none' });
  for (let i = 0; i < 40; i++){
    const c = BB.breed(t1, t2).child;
    ok(c.name !== 'Twinling', 'identical parents still yield a titled chick');
  }
}
{
  // the barn numbers its duplicates
  BB.newRun(4747);
  const deck = [BB.makeCard({ pre: 'Bog', suf: 'fang', might: 5, hide: 5, trait: 'none' })];
  const dup = BB.makeCard({ pre: 'Bog', suf: 'fang', might: 6, hide: 2, trait: 'none' });
  deck.push(dup);
  eq(BB.uniquifyName(dup, deck), 'Bogfang II', 'a second Bogfang becomes Bogfang II');
  dup.name = 'Bogfang II';
  const dup3 = BB.makeCard({ pre: 'Bog', suf: 'fang', might: 4, hide: 4, trait: 'none' });
  deck.push(dup3);
  eq(BB.uniquifyName(dup3, deck), 'Bogfang III', 'and a third becomes Bogfang III');
  const solo = BB.makeCard({ pre: 'Solo', suf: 'gob', might: 4, hide: 4, trait: 'none' });
  deck.push(solo);
  eq(BB.uniquifyName(solo, deck), 'Sologob', 'a unique name is left alone');
}


/* ============================== the litter ================================ */
{
  BB.srand(1717);
  const a = BB.makeCard({ pre: 'Bog', suf: 'snout', might: 8, hide: 6, trait: 'none' });
  const b = BB.makeCard({ pre: 'Cinder', suf: 'fang', might: 7, hide: 7, trait: 'none' });
  eq(BB.breedLitter(a, b, 'natural').length, 2, 'an ordinary pairing throws two chicks');
  eq(BB.breedLitter(a, b, 'big').length, 3, 'a big clutch throws three');
  const f = BB.makeCard({ pre: 'F', suf: 'ert', might: 7, hide: 7, trait: 'fertile' });
  eq(BB.breedLitter(f, b, 'natural').length, 3, 'a Fertile parent throws an extra chick');
  eq(BB.breedLitter(f, b, 'big').length, 4, 'and stacks with a big clutch');
  const lit = BB.breedLitter(a, b, 'natural');
  ok(lit[0].child.id !== lit[1].child.id, 'chicks in one clutch are distinct animals');

  // line-breeding really does tilt the favoured stat
  let plain = 0, tilted = 0;
  for (let i = 0; i < 400; i++){
    plain += BB.breed(a, b).child.might;
    tilted += BB.breed(a, b, { focus: 'might' }).child.might;
  }
  ok(tilted > plain * 1.04, `line-breeding for Might raises it (${(tilted/plain).toFixed(3)}x)`);
  let hidePlain = 0, hideTilt = 0;
  for (let i = 0; i < 400; i++){
    hidePlain += BB.breed(a, b).child.hide;
    hideTilt += BB.breed(a, b, { focus: 'hide' }).child.hide;
  }
  ok(hideTilt > hidePlain * 1.04, 'line-breeding for Hide raises it');

  // strange feed guarantees a keyword
  for (let i = 0; i < 60; i++){
    const c = BB.breed(a, b, { strange: true }).child;
    ok(BB.MUT_TRAITS.indexOf(c.trait) >= 0, 'strange feed always yields a mutated trait');
  }

  // selection is the engine: best-of-litter must beat a blind single roll
  BB.srand(24680);
  let blind = 0, chosen = 0;
  for (let i = 0; i < 300; i++){
    blind += BB.power(BB.breed(a, b).child);
    const l = BB.breedLitter(a, b, 'natural');
    chosen += Math.max(...l.map((r) => BB.power(r.child)));
  }
  ok(chosen > blind * 1.08, `picking the better of a clutch compounds (${(chosen/blind).toFixed(3)}x)`);
}

/* ============================== the nest ================================== */
{
  BB.newRun(555);
  const ids = BB.R.deck.slice(0, 2).map((c) => c.id);
  ok(!BB.setNest([ids[0]]), 'the nest takes exactly two');
  ok(!BB.setNest([ids[0], ids[0]]), 'a beast cannot breed with itself via the nest');
  ok(!BB.setNest([ids[0], 99999]), 'the nest rejects beasts not in the barn');
  ok(BB.setNest(ids), 'two valid beasts go to the nest');
  eq(BB.deckForFight().length, 6, 'nested beasts sit the fight out');
  ok(BB.deckForFight().every((c) => ids.indexOf(c.id) < 0), 'neither nested beast is in the fight deck');
}

/* =========================== rituals and slop ============================= */
{
  BB.newRun(31);
  eq(BB.R.slop, 2, 'you start with a little Slop');
  eq(BB.R.ritual, 'natural', 'and on the free ritual');
  ok(BB.setRitual('big'), 'a 2-Slop ritual is affordable at the start');
  eq(BB.R.slop, 0, 'and is charged for');
  ok(!BB.setRitual('strange'), 'a 3-Slop ritual is not affordable on 0');
  eq(BB.R.ritual, 'big', 'a refused ritual leaves the choice alone');
  ok(BB.setRitual('natural'), 'switching back is allowed');
  eq(BB.R.slop, 2, 'and refunds what the old one cost');
  ok(!BB.setRitual('nonsense'), 'an unknown ritual is refused');
  for (const id of BB.RITUAL_IDS) ok(BB.RITUALS[id].name.length > 0, 'ritual ' + id + ' is named');

  // the vet
  BB.newRun(32);
  BB.R.slop = 5; BB.R.hp = 10;
  ok(BB.vetVisit(), 'the vet will see you');
  eq(BB.R.hp, 10 + BB.C.VET_HEAL, 'and heals you');
  eq(BB.R.slop, 5 - BB.C.VET_COST, 'for a fee');
  BB.R.hp = BB.R.maxHp;
  ok(!BB.vetVisit(), 'no point paying the vet at full health');
  BB.R.hp = 5; BB.R.slop = 0;
  ok(!BB.vetVisit(), 'and no Slop, no vet');
  BB.R.hp = 5; BB.R.slop = 5; BB.R.maxHp = 10;
  BB.vetVisit();
  eq(BB.R.hp, 10, 'healing never overshoots the ceiling');
}
{
  // hazards
  BB.newRun(44);
  ok(BB.R.hazardOffer && BB.R.hazardOffer.name, 'a hazard is on the table each round');
  eq(BB.R.hazard, null, 'but not taken by default');
  eq(Object.keys(BB.fightMods()).length, 0, 'so the fight is unmodified');
  ok(BB.toggleHazard(), 'you can take it on');
  ok(BB.fightMods().label, 'and the fight is labelled with it');
  ok(!BB.toggleHazard(), 'and call it off again');
  for (const h of BB.HAZARDS) ok(h.name && h.desc && h.mods, 'hazard ' + h.id + ' is complete');
}
{
  // each hazard actually bites
  const mk = (id) => {
    BB.newRun(50);
    BB.R.hazardOffer = BB.HAZARDS.find((h) => h.id === id);
    BB.toggleHazard();
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    return BB.startFight(BB.fightMods());
  };
  eq(mk('lean').feed, BB.feedFor(0) - 1, 'Lean season really costs a Feed');
  eq(mk('crowded').hand.length, BB.C.HAND_SIZE - 1, 'Crowded barn really costs a card');
  ok(mk('fat').foe.hp > BB.FOES[0].hp, 'Well fed really is fatter');
  eq(mk('rabid').foe.bonus, 4, 'Rabid really hits harder');
  const F = mk('muzzled');
  const c = BB.makeCard({ pre: 'M', suf: 'z', might: 9, hide: 5, trait: 'none' });
  eq(BB.cardDamage(c), 7, 'Muzzled really blunts your beasts');
}

/* ================================ the pen ================================= */
function freshFight(seed){
  BB.newRun(seed == null ? 2026 : seed);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  return BB.startFight();
}
const beast = (o) => BB.makeCard(Object.assign({ pre: 'T', suf: 'st', might: 5, hide: 5, trait: 'none' }, o));
function penFight(cards, seed){
  const F = freshFight(seed);
  F.hand = cards;
  F.feed = 20;
  return F;
}
{
  const F = freshFight();
  eq(F.hand.length, 5, 'you open on five cards');
  eq(F.pen.length, 0, 'the pen starts empty');
  eq(F.feed, BB.C.FEED, 'round 1 gives 3 feed');
  eq(BB.feedFor(0), 3, 'feed starts at 3');
  eq(BB.feedFor(11), 6, 'and reaches 6 by the last round');
  ok(typeof BB.nextMove().s === 'string', 'the foe telegraphs a named move');
}
{
  // a played beast stays on the field
  const F = penFight([beast({ might: 6, hide: 7 })]);
  ok(BB.playCard(0), 'a beast is fielded');
  eq(F.pen.length, 1, 'and stands in the pen');
  eq(F.pen[0].hp, 7, 'with its Hide as health');
  eq(F.pen[0].max, 7, 'and that is its ceiling');
  eq(F.hand.length, 0, 'it left your hand');
  eq(F.disc.length, 0, 'and it is NOT in the discard — it is alive');
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 6 - (F.foe.poison || 0), 'it strikes at the end of the turn');
  ok(F.pen.length === 1 || F.pen.length === 0, 'and is still there unless it was killed');
}
{
  // it keeps striking, turn after turn — that is why Hide matters
  BB.newRun(9001);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  F.hand = [beast({ might: 4, hide: 500 })];
  F.feed = 20;
  BB.playCard(0);
  const hp0 = F.foe.hp;
  BB.endTurn(); BB.endTurn(); BB.endTurn();
  eq(F.foe.hp, hp0 - 12, 'three turns alive is three attacks');
}
{
  // the pen is finite
  const F = penFight([beast({}), beast({}), beast({}), beast({}), beast({})]);
  for (let i = 0; i < 4; i++) ok(BB.playCard(0), 'beast ' + (i + 1) + ' fits in the pen');
  ok(BB.penFull(), 'four fills the pen');
  ok(!BB.playCard(0), 'a fifth has nowhere to stand');
  eq(F.hand.length, 1, 'and stays in your hand');
}
{
  // feed is a real limit
  const F = freshFight();
  F.feed = 0;
  ok(!BB.playCard(0), 'no feed, no play');
  eq(F.hand.length, 5, 'a rejected play changes nothing');
}
{
  // the pen is what the foe has to get through
  const F = penFight([beast({ might: 1, hide: 40 })]);
  BB.playCard(0);
  const hp0 = BB.R.hp;
  BB.endTurn();
  eq(BB.R.hp, hp0, 'a beast in the way means you take nothing');
  ok(F.pen[0].hp < 40, 'the beast took it instead');
}
{
  // with an empty pen, it comes for you
  const F = freshFight();
  F.hand = [];
  const hp0 = BB.R.hp;
  BB.endTurn();
  eq(BB.R.hp, hp0 - BB.FOES[0].moves[0].v, 'an empty pen means you eat the hit');
}
{
  // overkill only half-carries
  const F = penFight([beast({ might: 0, hide: 2 })]);
  BB.playCard(0);
  const hp0 = BB.R.hp;
  BB.swingAt(20);
  eq(F.pen.length, 0, 'the chump dies');
  eq(BB.R.hp, hp0 - Math.floor((20 - 2) * BB.SPILL), 'and blunts the blow on the way through');
  eq(BB.SPILL, 0.5, 'overkill carries at half');
}
{
  // a body in the way is worth putting there
  const F = penFight([beast({ might: 0, hide: 1 }), beast({ might: 0, hide: 1 })]);
  BB.playCard(0); BB.playCard(0);
  const hp0 = BB.R.hp;
  BB.swingAt(40);
  eq(F.pen.length, 0, 'both go down to one big swing');
  ok(BB.R.hp > hp0 - 40, 'but you take far less than the full blow');
}

/* ------------------------------- targeting -------------------------------- */
{
  const F = penFight([beast({ trait: 'none', pre: 'Front', suf: 'er' }),
                      beast({ trait: 'bulwark', pre: 'Wall', suf: 'y' })]);
  BB.playCard(0); BB.playCard(0);
  eq(BB.foeTarget().c.trait, 'bulwark', 'a Bulwark steps in front even from the back');
}
{
  const F = penFight([beast({ trait: 'elusive', pre: 'Slip', suf: 'py' }),
                      beast({ trait: 'none', pre: 'Plain', suf: 'ly' })]);
  BB.playCard(0); BB.playCard(0);
  eq(BB.foeTarget().c.trait, 'none', 'an Elusive beast is skipped while anything else stands');
  F.pen = F.pen.filter((b) => b.c.trait === 'elusive');
  eq(BB.foeTarget().c.trait, 'elusive', 'but is hit when it is all that is left');
}
{
  const F = penFight([beast({ pre: 'A', suf: 'a' }), beast({ pre: 'B', suf: 'b' })]);
  BB.playCard(0); BB.playCard(0);
  eq(BB.foeTarget().c.name, 'Aa', 'otherwise blows land on the front of the pen');
}

/* -------------------------------- traits ---------------------------------- */
function traitTurn(card, seed){
  const F = penFight([card], seed);
  BB.playCard(0);
  return F;
}
{
  const F = traitTurn(beast({ might: 6, trait: 'frenzy' }));
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 12, 'Frenzy strikes twice a turn');
}
{
  const F = traitTurn(beast({ might: 6, hide: 60, trait: 'feral' }));
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 9, 'Feral hits for 150%');
  const b = F.pen[0];
  const h0 = b.hp;
  BB.hurtBeast(b, 4);
  eq(b.hp, h0 - 6, 'and takes 150% back');
}
{
  const F = traitTurn(beast({ might: 9, trait: 'runt' }));
  eq(F.pen[0].c.cost, 0, 'Runt is free to field');
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 5, 'and hits for half, rounded up');
}
{
  const F = traitTurn(beast({ hide: 5, trait: 'plump' }));
  eq(F.pen[0].max, 10, 'Plump adds 5 Hide');
}
{
  BB.newRun(11);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  F.hand = [beast({ might: 10, hide: 30, trait: 'leech' })];
  F.feed = 20;
  BB.R.hp = 20;
  BB.playCard(0);
  BB.endTurn();
  eq(BB.R.hp, 25, 'Leech heals half of what it deals');
}
{
  const F = traitTurn(beast({ might: 9, hide: 60, trait: 'venom' }));
  BB.endTurn();
  eq(F.foe.poison, 3, 'Venom applies might/3 poison');
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 3 - 9, 'which bites the next turn, on top of its attack');
  eq(F.foe.poison, 3 - 1 + 3, 'it wears off by one a turn, and restacks while the beast lives');
}
{
  const F = penFight([beast({ might: 4, trait: 'swift' })]);
  const hp0 = F.foe.hp;
  BB.playCard(0);
  eq(F.foe.hp, hp0 - 4, 'Swift strikes the moment it lands');
  BB.endTurn();
  eq(F.foe.hp, hp0 - 8, 'and again at the end of the turn');
}
{
  const F = traitTurn(beast({ trait: 'brood' }));
  eq(F.hand.length, 1, 'Brood leaves a Spawn behind');
  eq(F.hand[0].name, 'Spawn', 'and it is a Spawn');
  eq(F.hand[0].cost, 0, 'Spawn is free');
}
{
  const F = penFight([beast({ trait: 'cursed' })]);
  const hp0 = BB.R.hp;
  BB.playCard(0);
  eq(BB.R.hp, hp0 - 2, 'Cursed bites the hand that fields it');
}
{
  const F = traitTurn(beast({ hide: 30, trait: 'thorns' }));
  const fhp = F.foe.hp;
  BB.hurtBeast(F.pen[0], 5);
  eq(F.foe.hp, fhp - 3, 'Thorns bites back every time it is hit');
}
{
  const F = penFight([beast({ hide: 40, trait: 'regal' })]);
  const feed0 = F.feed;
  BB.playCard(0);
  eq(F.feed, feed0 - F.pen[0].c.cost + 1, 'Regal pays out the turn it lands');
  BB.endTurn();
  eq(F.feed, F.feedMax + 1, 'and every turn it survives');
}
{
  const F = penFight([beast({ might: 5, hide: 40, trait: 'rally' }), beast({ might: 5, hide: 40 })]);
  BB.playCard(0); BB.playCard(0);
  eq(BB.beastMight(F.pen[1]), 7, 'Rally lifts the beasts around it');
  eq(BB.beastMight(F.pen[0]), 5, 'but not itself');
}
{
  const F = traitTurn(beast({ might: 9, hide: 4, trait: 'hollow' }));
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 5, 'Hollow halves its might');
  ok(BB.TRAITS.hollow.cost < 0, 'and is priced as the liability it is');
}

/* ----------------------------- foe behaviour ------------------------------ */
{
  const F = penFight([beast({ might: 10, hide: 40 })]);
  BB.playCard(0);
  F.foe.block = 100;
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0, 'foe block soaks your pen');
  ok(F.foe.block < 100, 'and is spent doing it');
}
{
  // a sweep hits the whole pen, and does not spill
  BB.newRun(88);
  BB.R.idx = 3;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  eq(F.foe.name, 'The Inspector', 'round 4 is the Inspector');
  F.hand = [beast({ hide: 30 }), beast({ hide: 30 })];
  F.feed = 20;
  BB.playCard(0); BB.playCard(0);
  F.foe.mi = 2;                       // its sweep
  const before = F.pen.map((b) => b.hp);
  BB.endTurn();
  ok(F.pen[0].hp < before[0] && F.pen[1].hp < before[1], 'a sweep catches every beast in the pen');
}
{
  // a direct hit goes straight past the pen
  BB.newRun(89);
  BB.R.idx = 2;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  F.hand = [beast({ hide: 90 })];
  F.feed = 20;
  BB.playCard(0);
  F.foe.mi = 2;                       // 'Spit at you'
  const hp0 = BB.R.hp, pen0 = F.pen[0].hp;
  BB.endTurn();
  ok(BB.R.hp < hp0, 'a direct hit reaches you through a full pen');
  eq(F.pen[0].hp, pen0, 'and leaves the pen untouched');
}
{
  // paperwork is a dud: it costs a Feed to file and never takes a pen slot
  BB.newRun(90);
  BB.R.idx = 3;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  BB.endTurn();
  const junk = [].concat(F.disc, F.hand, F.draw).filter((c) => c.name === 'Paperwork');
  eq(junk.length, 1, 'the Inspector files one piece of junk into your deck');
  ok(junk[0].dud, 'and it is a dud');
  F.hand = [junk[0]];
  F.feed = 5;
  const pen0 = F.pen.length;
  ok(BB.playCard(0), 'you can pay to file it away');
  eq(F.pen.length, pen0, 'it never takes a pen slot');
  ok(!BB.R.deck.some((c) => c.name === 'Paperwork'), 'and junk never follows you home');
}
{
  // every foe cycles its whole move list without throwing
  for (let i = 0; i < BB.C.RUN_LEN; i++){
    BB.newRun(1000 + i);
    BB.R.idx = i;
    BB.R.hp = 9999; BB.R.maxHp = 9999;
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    BB.startFight();
    for (let t = 0; t < BB.FOES[i].moves.length + 1; t++) BB.endTurn();
  }
  ok(true, 'every foe cycles its whole move list cleanly');
  // and the roster is a sane curve
  for (let i = 1; i < BB.C.RUN_LEN; i++){
    ok(BB.FOES[i].hp > BB.FOES[i - 1].hp * 1.05, 'foe ' + i + ' is meaningfully tougher than the last');
  }
  ok(BB.FOES[BB.C.RUN_LEN - 1].hp > BB.FOES[0].hp * 8, 'the last foe is an order of magnitude past the first');
}

/* ------------------------------ win / lose -------------------------------- */
{
  const F = penFight([beast({ might: 999 })]);
  BB.playCard(0);
  BB.endTurn();
  eq(F.over, 'win', 'dropping the foe wins the fight');
  eq(F.foe.hp, 0, 'health floors at zero');
  ok(!BB.playCard(0), 'you cannot play into a finished fight');
}
{
  const F = freshFight();
  F.hand = [];
  BB.R.hp = 1;
  BB.endTurn();
  eq(F.over, 'lose', 'running out of health loses');
  eq(BB.R.hp, 0, 'your health floors at zero too');
}

/* ============================ after the fight ============================= */
{
  BB.newRun(4321);
  const ids = BB.R.deck.slice(0, 2).map((c) => c.id);
  BB.setNest(ids);
  BB.startFight();
  BB.R.hp = 20;
  const mx0 = BB.R.maxHp, n0 = BB.R.deck.length, slop0 = BB.R.slop;
  const litter = BB.winFight();
  eq(litter.length, 2, 'winning hatches the clutch');
  eq(BB.R.deck.length, n0, 'but nothing joins the barn until you choose');
  eq(BB.R.maxHp, mx0 + 2, 'every win raises the ceiling a little');
  eq(BB.R.hp, 20 + Math.ceil(BB.R.maxHp * 0.30) + 4, 'winning heals a share of the ceiling');
  ok(BB.R.hp <= BB.R.maxHp, 'healing never overshoots');
  eq(BB.F, null, 'the fight is torn down');

  ok(BB.keepChick(0), 'you keep one chick');
  eq(BB.R.deck.length, n0 + 1, 'and it joins the barn');
  eq(BB.R.slop, slop0 + BB.C.SLOP_PER_WIN + BB.C.SLOP_PER_CHICK, 'the rejected chick is sold on');
  eq(BB.R.sold, 1, 'and the sale is counted');
  eq(BB.R.born, 1, 'the keeper is counted too');
  eq(BB.R.nest.length, 0, 'the nest empties');
  eq(BB.R.idx, 1, 'the run advances a round');
  eq(BB.R.litter, null, 'the clutch is done');
  ok(!BB.keepChick(0), 'and cannot be picked from twice');
  ok(BB.R.log.length > 0, 'the run log records the birth');
  ok(BB.R.hazardOffer, 'a fresh hazard is on the table');
}
{
  BB.newRun(4322);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  BB.startFight();
  BB.winFight();
  BB.keepChick(0);
  ok(BB.R.wildOffer !== null, 'round 2 offers fresh bloodlines');
  eq(BB.R.wildOffer.length, 3, 'three wild beasts on offer');
  ok(BB.R.wildOffer.every((c) => !BB.shareBlood(c, BB.R.deck[0])), 'wild stock is unrelated');
  // and it is deliberately behind the curve — an outcross, not a shortcut
  BB.srand(5);
  let wild = 0;
  for (let i = 0; i < 200; i++) wild += BB.power(BB.wildCard(9));
  ok(wild / 200 < 30, `late wild stock stays modest (avg power ${(wild/200).toFixed(1)})`);
  const w0 = BB.R.deck.length;
  ok(BB.takeWild(0), 'you can take one in');
  eq(BB.R.deck.length, w0 + 1, 'and it joins the barn');
  eq(BB.R.wildOffer, null, 'the offer closes');
  ok(!BB.takeWild(0), 'and cannot be taken twice');
}
{
  BB.newRun(6060);
  BB.R.idx = 3;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  BB.startFight();
  const mx = BB.R.maxHp;
  BB.winFight();
  eq(BB.R.maxHp, mx + 7, 'beating a boss raises max health more than a normal round');
}
{
  // taking a hazard pays out
  BB.newRun(6061);
  BB.toggleHazard();
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  BB.startFight(BB.fightMods());
  const slop0 = BB.R.slop;
  BB.winFight();
  BB.keepChick(0);
  eq(BB.R.slop, slop0 + BB.C.SLOP_PER_WIN + BB.C.SLOP_PER_CHICK + BB.C.HAZARD_PAY,
    'a hazard pays extra on the way out');
  eq(BB.R.hazard, null, 'and does not follow you to the next round');
}
{
  // culling
  BB.newRun(2468);
  eq(BB.mustCull(), 0, 'a starting barn is under the cap');
  while (BB.R.deck.length < BB.C.MAX_DECK + 2) BB.R.deck.push(BB.wildCard(1));
  eq(BB.mustCull(), 2, 'over the cap, the surplus is reported');
  const id = BB.R.deck[0].id;
  ok(BB.retire(id), 'a beast can be retired');
  ok(!BB.R.deck.some((c) => c.id === id), 'and is gone from the barn');
  eq(BB.mustCull(), 1, 'the surplus shrinks');
  eq(BB.R.retired, 1, 'retirements are counted');
  ok(!BB.retire(99999), 'retiring an unknown beast fails');
  BB.R.deck = BB.R.deck.slice(0, 3);
  ok(!BB.retire(BB.R.deck[0].id), 'you cannot cull below a fightable herd');
}
{
  BB.newRun(1357);
  BB.R.deck[3].might = 99;
  eq(BB.bestBeast().id, BB.R.deck[3].id, 'best in show is the strongest beast');
}

/* ============================== the stud book ============================= */
{
  BB.newRun(700);
  eq(Object.keys(BB.STUD).length, 8, 'the book opens with the starting herd');
  const a = BB.R.deck[0], b = BB.R.deck[1];
  BB.setNest([a.id, b.id]);
  BB.startFight();
  BB.winFight();
  BB.keepChick(0);
  const kid = BB.R.deck[BB.R.deck.length - 1];
  const ped = BB.pedigree(kid.id, 2);
  ok(ped, 'a kept chick has papers');
  eq(ped.name, kid.name, 'under its final name');
  eq(ped.up.length, 2, 'with both parents recorded');
  const names = ped.up.map((x) => x.name).sort();
  eq(names.join('|'), [a.name, b.name].sort().join('|'), 'and they are the right two');
  eq(BB.pedigree(a.id, 2).up.length, 0, 'founder stock has no papers above it');
  eq(BB.pedigree(999999, 2), null, 'an unknown beast has no pedigree');

  // three generations deep
  const c2 = BB.R.deck[0];
  BB.setNest([kid.id, c2.id]);
  BB.startFight();
  BB.winFight();
  BB.keepChick(0);
  const g3 = BB.R.deck[BB.R.deck.length - 1];
  const t3 = BB.pedigree(g3.id, 2);
  const grand = t3.up.reduce((acc, p) => acc.concat(p.up), []);
  ge(grand.length, 2, 'grandparents are reachable two levels up');
  ok(BB.STUD[a.id], 'and a beast stays in the book after it leaves the barn');
  BB.retire(a.id);
  ok(BB.STUD[a.id], 'even once it has gone to the farm upstate');
}

/* ============================== full run ================================== */
/** A reasonable player: put the wall in first, then the damage. */
function autoFight(){
  const F = BB.F;
  for (let turn = 0; turn < 60 && !F.over; turn++){
    for (let guard = 0; guard < 20; guard++){
      let best = -1, bestScore = -1e9;
      F.hand.forEach((c, i) => {
        if (c.cost > F.feed || c.dud) return;
        if (BB.penFull()) return;
        const wall = F.pen.length === 0 ? 1.6 : 0.7;
        const s = BB.cardDamage(c) * 1.4 + BB.cardHide(c) * wall +
          (c.trait === 'bulwark' ? 6 : 0) + (c.trait === 'rally' ? 5 : 0) - c.cost * 1.5;
        if (s > bestScore){ bestScore = s; best = i; }
      });
      if (best < 0) break;
      if (!BB.playCard(best)) break;
      if (F.over) break;
    }
    if (F.over) break;
    BB.endTurn();
  }
  return F.over;
}
function autoRun(seed){
  BB.newRun(seed);
  let rounds = 0;
  while (!BB.R.over && rounds < 40){
    const sorted = BB.R.deck.slice().sort((a, b) => BB.power(a) - BB.power(b));
    if (!BB.setNest(sorted.slice(-2).map((c) => c.id))) break;
    BB.startFight(BB.fightMods());
    if (autoFight() !== 'win') return { round: BB.R.idx + 1, won: false, deck: BB.R.deck.length,
      pow: BB.R.deck.reduce((a, c) => a + BB.power(c), 0) / BB.R.deck.length,
      gen: Math.max(...BB.R.deck.map((c) => c.gen)) };
    BB.winFight();
    const best = BB.R.litter.map((r, i) => [BB.power(r.child), i]).sort((x, y) => y[0] - x[0]);
    BB.keepChick(best[0][1]);
    if (BB.R.wildOffer) BB.takeWild(0);
    while (BB.mustCull() > 0){
      BB.retire(BB.R.deck.slice().sort((a, b) => BB.power(a) - BB.power(b))[0].id);
    }
    rounds++;
  }
  return { round: BB.R.idx, won: BB.R.over === 'win', deck: BB.R.deck.length,
           pow: BB.R.deck.reduce((a, c) => a + BB.power(c), 0) / BB.R.deck.length,
           gen: Math.max(...BB.R.deck.map((c) => c.gen)) };
}
{
  let deepest = 0, wins = 0, bestGen = 0, bestPow = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const s of seeds){
    const r = autoRun(s * 7);
    deepest = Math.max(deepest, r.round);
    bestGen = Math.max(bestGen, r.gen || 0);
    bestPow = Math.max(bestPow, r.pow || 0);
    if (r.won) wins++;
    le(r.deck, BB.C.MAX_DECK, 'seed ' + s + ': the barn never exceeds the cap');
  }
  ge(deepest, 8, 'a decent player gets deep into the run');
  ok(wins >= 1, 'and the run is winnable');
  ok(wins < seeds.length, 'but not a walkover');
  ge(bestGen, 7, 'bloodlines reach late generations');
  ge(bestPow, 20, 'and a bred herd ends up far stronger than the one you started with');
}
{
  // round 1 is winnable with the plain starter herd, on every seed we try
  let won = 0;
  for (let s = 1; s <= 12; s++){
    BB.newRun(s * 31);
    const sorted = BB.R.deck.slice().sort((a, b) => BB.power(a) - BB.power(b));
    BB.setNest(sorted.slice(0, 2).map((c) => c.id));
    BB.startFight();
    if (autoFight() === 'win') won++;
  }
  ge(won, 12, 'the starter herd clears round 1 on every seed');
}
{
  // breeding, not hoarding, is what carries a run: a deck that never breeds up
  // should be visibly weaker than one that does
  const bred = autoRun(77);
  BB.newRun(77);
  const startPow = BB.R.deck.reduce((a, c) => a + BB.power(c), 0) / BB.R.deck.length;
  ok(bred.pow > startPow * 1.5, `a bred herd outgrows the starting one (${bred.pow.toFixed(1)} vs ${startPow.toFixed(1)})`);
}

/* ============================= save / hall ================================ */
{
  const store = {};
  const G = loadGame(store);
  G.newRun(99);
  G.R.deck[0].might = 40;
  G.ui.saveHall(G.bestBeast(), 5);
  ok(store.bb_hall, 'the hall of fame persists');
  const h = JSON.parse(store.bb_hall);
  eq(h.round, 5, 'it records the round');
  ge(h.pow, 30, 'it records the power');
  const weak = G.makeCard({ pre: 'w', suf: 'k', might: 1, hide: 0, trait: 'none' });
  G.ui.saveHall(weak, 1);
  eq(JSON.parse(store.bb_hall).pow, h.pow, 'a weaker beast does not overwrite the record');
  ok(G.ui.loadHall().name === h.name, 'the record reads back');
  const G2 = loadGame({ bb_hall: '{{{not json' });
  eq(G2.ui.loadHall(), null, 'a corrupt save degrades to no record');
}

/* ============================ founder stock =============================== */
{
  const store = {};
  const G = loadGame(store);
  G.newRun(500);
  eq(G.R.deck.length, 8, 'a first-ever run starts on plain stock');
  ok(!G.R.deck.some((c) => c.founder), 'with no founder in it');
  const pristine = G.R.deck.map((c) => ({ name: c.name, pow: G.power(c) }));
  G.R.deck[2].might = 40; G.R.deck[2].hide = 40;
  const champ = G.bestBeast();
  G.ui.goOver(false);
  ok(store.bb_founder, 'the best beast of a finished run retires to stud');
  const f = JSON.parse(store.bb_founder);
  eq(f.name, champ.name, 'under its own name');
  le(f.might, 9, 'its Might is capped on the way in');
  le(f.hide, 13, 'and so is its Hide — a keepsake, not a snowball');

  const G2 = loadGame(store);
  G2.newRun(500);
  eq(G2.R.deck.length, 8, 'the next run is still eight head');
  const kept = G2.R.deck.filter((c) => c.founder);
  eq(kept.length, 1, 'exactly one of them is the founder');
  eq(kept[0].name, f.name, 'and it is last run\'s champion');
  eq(kept[0].gen, 1, 'it starts the new line at generation 1');
  const plain = G2.R.deck.filter((c) => !c.founder).map((c) => c.name);
  eq(plain.length, 7, 'it took a starter\'s place rather than joining them');
  const dropped = pristine.filter((n) => plain.indexOf(n.name) < 0);
  eq(dropped.length, 1, 'exactly one starter made way');
  ok(pristine.every((x) => x.pow >= dropped[0].pow), 'and it was the weakest one');

  // a cursed champion does not hand its curse down
  const store2 = {};
  const G3 = loadGame(store2);
  G3.newRun(501);
  G3.R.deck[0].trait = 'cursed'; G3.R.deck[0].might = 60;
  G3.ui.goOver(false);
  eq(JSON.parse(store2.bb_founder).trait, 'none', 'a cursed champion loses the curse at stud');
  const G4 = loadGame({ bb_founder: 'not json at all' });
  eq(G4.loadFounder(), null, 'a corrupt founder save degrades to none');
  G4.newRun(1);
  eq(G4.R.deck.length, 8, 'and the run starts normally anyway');
}

/* =============================== the UI =================================== */
// Drive every screen through the real render path. A typo in a template or a
// missing element blows up here rather than in front of a player.
{
  const G = loadGame({});
  G.ui.boot();
  eq(G.ui.cur, 'title', 'the game opens on the title screen');
  G.ui.startRun();
  eq(G.ui.cur, 'nest', 'starting a run lands on the nest screen');
  G.ui.renderRituals();
  G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
  G.ui.renderNest();
  G.toggleHazard();
  G.ui.renderNest();
  ok(true, 'the nest screen renders with a pair, a ritual row and a hazard');

  G.startFight(G.fightMods());
  G.ui.renderFight();
  G.ui.doPlay(0);
  G.ui.renderPen();
  G.ui.doEnd();
  ok(true, 'the fight screen renders, fields a beast and ends a turn');

  // every intent string formats, for every foe and every move
  for (let i = 0; i < G.C.RUN_LEN; i++){
    G.newRun(i + 1);
    G.R.idx = i;
    G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
    G.startFight();
    for (let k = 0; k < G.FOES[i].moves.length; k++){
      ok(typeof G.ui.intentText() === 'string' && G.ui.intentText().length > 0,
        'foe ' + i + ' move ' + k + ' has an intent line');
      G.F.foe.mi++;
    }
  }

  // hatch → pick → wild → cull
  G.newRun(24);
  G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
  G.startFight();
  G.F.foe.hp = 0; G.F.over = 'win';
  G.ui.resolveFight();
  eq(G.ui.cur, 'hatch', 'a win goes to the hatch screen');
  G.ui.revealLitter();
  ok(G.ui.picked < 0, 'nothing is chosen for you');
  G.ui.setPicked(0);
  G.ui.showChickDetail(G.R.lastHatch.litter[0]);
  ok(G.ui.chickBanners(G.R.lastHatch.litter[0]).length >= 0, 'a chick renders its banners');
  const n0 = G.R.deck.length;
  G.ui.afterHatch();
  eq(G.R.deck.length, n0 + 1, 'choosing a chick takes it home');
  eq(G.ui.cur, 'wild', 'round 2 offers wild stock');
  G.takeWild(1);
  G.ui.goCullOrNext();
  ok(G.ui.cur === 'cull' || G.ui.cur === 'nest', 'then culling or straight back to the nest');

  // the stud book
  G.ui.goBook(G.R.deck[G.R.deck.length - 1].id, 'nest');
  eq(G.ui.cur, 'book', 'the stud book opens');
  G.ui.renderBook();
  for (const c of G.R.deck){ G.ui.goBook(c.id, 'nest'); }
  ok(true, 'every beast in the barn renders a pedigree');

  // a forced cull loops until the barn fits
  while (G.R.deck.length < G.C.MAX_DECK + 2) G.R.deck.push(G.wildCard(2));
  G.ui.goCull();
  eq(G.ui.cur, 'cull', 'an overfull barn forces the cull screen');
  ge(G.mustCull(), 1, 'and reports what must go');

  G.ui.goOver(false);
  eq(G.ui.cur, 'over', 'a loss ends the run');
  G.ui.goOver(true);
  G.ui.renderTitle();
  ok(true, 'the victory and title screens render');

  // the portrait painter survives every gene combination
  for (let i = 0; i < 60; i++){
    const c = G.wildCard(i % 8);
    c.vis.eyes = (i % 3) + 1; c.vis.horns = i % 4; c.vis.wings = i % 3; c.vis.tail = i % 2;
    c.vis.spots = (i % 7) / 6; c.vis.body = (i % 5) / 4;
    G.ui.cardEl(c, { big: i % 2 === 0 });
    G.ui.penEl({ c, hp: 3, max: 5, uid: i });
  }
  ok(true, 'every gene combination paints without throwing');
}

/* ================================= done =================================== */
if (fails.length){
  console.error('\nbirds_and_beasts: ' + fails.length + ' FAILED, ' + pass + ' passed');
  process.exit(1);
}
console.log('birds_and_beasts: ' + pass + ' checks passed');
