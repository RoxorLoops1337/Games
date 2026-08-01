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

/* ================================ fight =================================== */
function freshFight(seed){
  BB.newRun(seed == null ? 2026 : seed);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  return BB.startFight();
}
{
  const F = freshFight();
  eq(F.hand.length, 5, 'you open on five cards');
  eq(F.draw.length, 1, 'the rest of the fight deck waits in the draw pile');
  eq(F.feed, BB.C.FEED, 'round 1 gives 3 feed');
  eq(F.foe.hp, BB.FOES[0].hp, 'foe starts at full health');
  eq(BB.feedFor(0), 3, 'feed starts at 3');
  eq(BB.feedFor(3), 4, 'feed grows every third round');
  eq(BB.feedFor(11), 6, 'feed reaches 6 by the last round');
  ok(typeof BB.nextMove().s === 'string', 'the foe telegraphs a named move');
}
{
  // playing a card: costs feed, deals damage, gains hide
  const F = freshFight();
  const i = F.hand.findIndex((c) => c.cost <= F.feed && c.might > 0);
  const c = F.hand[i];
  const hp0 = F.foe.hp, feed0 = F.feed;
  ok(BB.playCard(i), 'an affordable card plays');
  eq(F.feed, feed0 - c.cost, 'feed is spent');
  eq(F.foe.hp, hp0 - BB.cardDamage(c), 'the foe takes the damage');
  eq(F.block, BB.cardHide(c), 'you gain its hide as block');
  eq(F.hand.length, 4, 'the card leaves your hand');
  eq(F.disc.length, 1, 'and lands in the discard');
  ok(!BB.playCard(99), 'playing a card that is not there fails');
}
{
  // feed is a real limit
  const F = freshFight();
  F.feed = 0;
  ok(!BB.playCard(0), 'no feed, no play');
  eq(F.hand.length, 5, 'a rejected play changes nothing');
}
{
  // blocking, then the foe swings
  const F = freshFight();
  F.hand.push(BB.makeCard({ pre: 'W', suf: 'all', might: 0, hide: 30, trait: 'none', cost: 0 }));
  BB.playCard(F.hand.length - 1);
  eq(F.block, 30, 'block stacks up');
  const hp0 = BB.R.hp;
  BB.endTurn();
  eq(BB.R.hp, hp0, 'a big enough block eats the whole hit');
  eq(F.block, 0, 'block does not carry into the next turn');
  eq(F.hand.length, 5, 'you redraw a fresh hand');
  eq(F.feed, F.feedMax, 'feed refills');
  eq(F.turn, 2, 'the turn counter advances');
}
{
  // damage gets through when you do not block
  const F = freshFight();
  const hp0 = BB.R.hp;
  BB.endTurn();
  ok(BB.R.hp < hp0, 'an unblocked foe hurts');
  eq(BB.R.hp, hp0 - BB.FOES[0].moves[0].v, 'exactly its telegraphed damage');
}

/* ------------------------------- traits ----------------------------------- */
function traitFight(card){
  const F = freshFight();
  F.hand = [card];
  F.feed = 9;
  return F;
}
{
  const F = traitFight(BB.makeCard({ pre: 'F', suf: 'r', might: 6, hide: 4, trait: 'frenzy' }));
  const hp0 = F.foe.hp;
  BB.playCard(0);
  eq(F.foe.hp, hp0 - 12, 'Frenzy strikes twice');
}
{
  const F = traitFight(BB.makeCard({ pre: 'F', suf: 'l', might: 6, hide: 4, trait: 'feral' }));
  const hp0 = F.foe.hp;
  BB.playCard(0);
  eq(F.foe.hp, hp0 - 9, 'Feral hits for 150%');
  eq(F.block, 0, 'Feral gives no block');
}
{
  const F = traitFight(BB.makeCard({ pre: 'R', suf: 't', might: 9, hide: 2, trait: 'runt' }));
  const hp0 = F.foe.hp, feed0 = F.feed;
  BB.playCard(0);
  eq(F.foe.hp, hp0 - 5, 'Runt hits for half, rounded up');
  eq(F.feed, feed0, 'Runt is free');
}
{
  const F = traitFight(BB.makeCard({ pre: 'P', suf: 'p', might: 2, hide: 5, trait: 'plump' }));
  BB.playCard(0);
  eq(F.block, 9, 'Plump adds 4 hide');
}
{
  BB.newRun(11);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  BB.R.hp = 20;
  F.hand = [BB.makeCard({ pre: 'L', suf: 'ch', might: 10, hide: 0, trait: 'leech' })];
  F.feed = 9;
  BB.playCard(0);
  eq(BB.R.hp, 25, 'Leech heals half the damage dealt');
}
{
  const F = traitFight(BB.makeCard({ pre: 'V', suf: 'm', might: 9, hide: 0, trait: 'venom' }));
  BB.playCard(0);
  eq(F.foe.poison, 3, 'Venom applies might/3 poison');
  const hp0 = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, hp0 - 3, 'poison bites at end of turn');
  eq(F.foe.poison, 2, 'and then wears off by one');
}
{
  const F = freshFight();
  F.hand = [BB.makeCard({ pre: 'S', suf: 'w', might: 1, hide: 0, trait: 'swift', cost: 0 })];
  BB.playCard(0);
  eq(F.hand.length, 1, 'Swift draws a replacement');
}
{
  const F = traitFight(BB.makeCard({ pre: 'B', suf: 'd', might: 1, hide: 0, trait: 'brood' }));
  BB.playCard(0);
  eq(F.hand.length, 1, 'Brood leaves a Spawn behind');
  eq(F.hand[0].name, 'Spawn', 'and it is a Spawn');
  eq(F.hand[0].cost, 0, 'Spawn is free');
}
{
  const F = traitFight(BB.makeCard({ pre: 'C', suf: 'd', might: 5, hide: 0, trait: 'cursed' }));
  const hp0 = BB.R.hp;
  BB.playCard(0);
  eq(BB.R.hp, hp0 - 2, 'Cursed bites the hand that plays it');
}
{
  const F = traitFight(BB.makeCard({ pre: 'T', suf: 'h', might: 0, hide: 0, trait: 'thorns' }));
  BB.playCard(0);
  eq(F.thorns, 3, 'Thorns arms a counter');
  const fhp = F.foe.hp;
  BB.endTurn();
  eq(F.foe.hp, fhp - 3, 'the foe takes it on the way in');
  eq(F.thorns, 0, 'thorns lapse after the turn');
}
{
  const F = traitFight(BB.makeCard({ pre: 'G', suf: 'l', might: 1, hide: 0, trait: 'regal' }));
  BB.playCard(0);
  BB.endTurn();
  eq(F.feed, F.feedMax + 1, 'Regal pays out next turn');
  BB.endTurn();
  eq(F.feed, F.feedMax, 'and only next turn');
}
{
  const F = traitFight(BB.makeCard({ pre: 'H', suf: 'w', might: 9, hide: 3, trait: 'hollow' }));
  const hp0 = F.foe.hp;
  BB.playCard(0);
  eq(F.foe.hp, hp0 - 5, 'Hollow halves its might too');
  eq(F.block, 3, 'but it still blocks');
}

/* ----------------------------- foe behaviour ------------------------------ */
{
  // the foe blocks, so your hits get soaked
  BB.newRun(77);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  F.foe.block = 100;
  const hp0 = F.foe.hp;
  F.hand = [BB.makeCard({ pre: 'X', suf: 'x', might: 10, hide: 0, trait: 'none', cost: 0 })];
  BB.playCard(0);
  eq(F.foe.hp, hp0, 'foe block soaks the hit');
  eq(F.foe.block, 90, 'and is spent doing it');
}
{
  // The Inspector files paperwork into your discard, and it must not stick
  BB.newRun(88);
  BB.R.idx = 3;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  eq(F.foe.name, 'The Inspector', 'round 4 is the Inspector');
  const before = F.disc.length;
  BB.endTurn();
  const junkAnywhere = (f) => [].concat(f.disc, f.hand, f.draw).filter((c) => c.name === 'Paperwork').length;
  eq(junkAnywhere(F), 1, 'the Inspector shoves one piece of junk into your deck');
  ge(F.disc.length + F.hand.length + F.draw.length, before, 'the junk is really added');
  ok(!BB.R.deck.some((c) => c.name === 'Paperwork'), 'junk never follows you home');
}
{
  // multi-hit and buff moves
  const foe = BB.makeFoe(2);
  eq(foe.name, 'Cousin Merle', 'round 3 is Cousin Merle');
  BB.newRun(90);
  BB.R.idx = 2;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startFight();
  const hp0 = BB.R.hp;
  BB.endTurn();
  eq(BB.R.hp, hp0 - 12, 'a 4x3 volley lands all three hits');
  BB.endTurn();
  eq(F.foe.bonus, 3, 'a buff move raises the foe damage');
}
{
  // every foe move type resolves without throwing, for every foe
  for (let i = 0; i < BB.C.RUN_LEN; i++){
    BB.newRun(1000 + i);
    BB.R.idx = i;
    BB.R.hp = 9999; BB.R.maxHp = 9999;
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    BB.startFight();
    for (let t = 0; t < BB.FOES[i].moves.length + 1; t++) BB.endTurn();
  }
  ok(true, 'every foe cycles its whole move list cleanly');
}

/* ------------------------------ win / lose -------------------------------- */
{
  const F = freshFight();
  F.hand = [BB.makeCard({ pre: 'K', suf: 'o', might: 999, hide: 0, trait: 'none', cost: 0 })];
  BB.playCard(0);
  eq(F.over, 'win', 'dropping the foe wins the fight');
  eq(F.foe.hp, 0, 'health floors at zero');
  ok(!BB.playCard(0), 'you cannot play into a finished fight');
}
{
  const F = freshFight();
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
  const mx0 = BB.R.maxHp;
  const n0 = BB.R.deck.length;
  const res = BB.winFight();
  eq(BB.R.deck.length, n0 + 1, 'the chick joins the barn');
  eq(BB.R.maxHp, mx0 + 2, 'every win raises the ceiling a little');
  eq(BB.R.hp, 20 + Math.ceil(BB.R.maxHp * 0.22) + 2, 'winning heals a share of the ceiling');
  ok(BB.R.hp <= BB.R.maxHp, 'healing never overshoots the ceiling');
  eq(BB.R.nest.length, 0, 'the nest empties');
  eq(BB.R.idx, 1, 'the run advances a round');
  eq(BB.R.born, 1, 'the birth is counted');
  eq(BB.F, null, 'the fight is torn down');
  ok(BB.R.deck.some((c) => c.id === res.child.id), 'the chick is really in the deck');
  ok(BB.R.log.length > 0, 'the run log records the birth');
  ok(BB.R.wildOffer !== null, 'round 2 offers fresh bloodlines');
  eq(BB.R.wildOffer.length, 3, 'three wild beasts on offer');
  ok(BB.R.wildOffer.every((c) => !BB.shareBlood(c, BB.R.deck[0])), 'wild stock is unrelated');
  const w0 = BB.R.deck.length;
  ok(BB.takeWild(0), 'you can take one in');
  eq(BB.R.deck.length, w0 + 1, 'and it joins the barn');
  eq(BB.R.wildOffer, null, 'the offer closes');
  ok(!BB.takeWild(0), 'and cannot be taken twice');
}
{
  // bosses raise your ceiling
  BB.newRun(6060);
  BB.R.idx = 3;
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  BB.startFight();
  const mx = BB.R.maxHp;
  BB.winFight();
  eq(BB.R.maxHp, mx + 7, 'beating a boss raises max health more than a normal round');
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

/* ============================== full run ================================== */
/** A greedy autoplayer: dump the biggest affordable card, then end the turn. */
function autoFight(){
  const F = BB.F;
  for (let turn = 0; turn < 80 && !F.over; turn++){
    for (let guard = 0; guard < 20; guard++){
      let best = -1, bestScore = -1;
      F.hand.forEach((c, i) => {
        if (c.cost > F.feed) return;
        const s = BB.cardDamage(c) + BB.cardHide(c) * 0.6;
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
/** Play a whole run headlessly: nest the two weakest, fight, breed, cull. */
function autoRun(seed){
  BB.newRun(seed);
  let rounds = 0;
  while (!BB.R.over && rounds < 40){
    const sorted = BB.R.deck.slice().sort((a, b) => BB.power(a) - BB.power(b));
    // nest the two best — they are the ones worth breeding, and it hurts
    const nest = sorted.slice(-2).map((c) => c.id);
    if (!BB.setNest(nest)) break;
    BB.startFight();
    const out = autoFight();
    if (out !== 'win') return { round: BB.R.idx, won: false, deck: BB.R.deck.length };
    BB.winFight();
    if (BB.R.wildOffer) BB.takeWild(0);
    while (BB.mustCull() > 0){
      const worst = BB.R.deck.slice().sort((a, b) => BB.power(a) - BB.power(b))[0];
      BB.retire(worst.id);
    }
    rounds++;
  }
  return { round: BB.R.idx, won: BB.R.over === 'win', deck: BB.R.deck.length, hp: BB.R.hp };
}
{
  let deepest = 0, wins = 0, gens = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const s of seeds){
    const r = autoRun(s);
    deepest = Math.max(deepest, r.round);
    if (r.won) wins++;
    le(r.deck, BB.C.MAX_DECK, 'seed ' + s + ': the barn never exceeds the cap');
    gens = Math.max(gens, Math.max(...BB.R.deck.map((c) => c.gen)));
  }
  ge(deepest, 4, 'a greedy player gets at least four rounds deep');
  ge(gens, 4, 'bloodlines actually reach later generations');
  ok(deepest < BB.C.RUN_LEN || wins < seeds.length, 'the run is not a walkover for a greedy bot');
}
{
  // fight 1 is winnable with the plain starter deck, on every seed we try
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
  // stats really do inflate across a run, which is why feed grows
  BB.srand(5150);
  let a = BB.makeCard({ pre: 'A', suf: 'a', might: 6, hide: 3, trait: 'none' });
  let b = BB.makeCard({ pre: 'B', suf: 'b', might: 5, hide: 4, trait: 'none' });
  for (let i = 0; i < 12; i++){
    const kids = [];
    for (let k = 0; k < 3; k++) kids.push(BB.breed(a, b).child); // keep the best of a litter
    kids.sort((x, y) => BB.power(y) - BB.power(x));
    a = kids[0]; b = kids[1];
  }
  ge(BB.power(a), 14, 'twelve generations of selection produces a real beast');
  le(BB.power(a), 200, 'but not an infinite one');
  eq(a.gen, 13, 'generation counter tracks the lineage depth');
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

/* =============================== the UI =================================== */
// Drive every screen through the real render path. A typo in a template or a
// missing element blows up here rather than in front of a player.
{
  const G = loadGame({});
  G.ui.boot();
  eq(G.ui.cur, 'title', 'the game opens on the title screen');
  G.ui.startRun();
  eq(G.ui.cur, 'nest', 'starting a run lands on the nest screen');
  G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
  G.ui.renderNest();
  ok(true, 'the nest screen renders with a chosen pair');

  G.startFight();
  G.ui.renderFight();
  G.ui.doPlay(0);
  G.ui.doEnd();
  ok(true, 'the fight screen renders, plays and ends a turn');

  // every intent string formats
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

  // hatch, wild, cull, over
  G.newRun(24);
  G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
  G.startFight();
  G.F.foe.hp = 0; G.F.over = 'win';
  G.ui.resolveFight();
  eq(G.ui.cur, 'hatch', 'a win goes to the hatch screen');
  G.ui.revealChild(G.R.lastHatch.res);
  ok(true, 'the chick reveals');
  G.ui.afterHatch();
  eq(G.ui.cur, 'wild', 'round 2 offers wild stock');
  G.takeWild(1);
  G.ui.goCullOrNext();
  ok(G.ui.cur === 'cull' || G.ui.cur === 'nest', 'then culling or straight back to the nest');
  if (G.ui.cur === 'cull'){ G.ui.nextRound(); eq(G.ui.cur, 'nest', 'skipping the cull returns to the nest'); }

  // a forced cull loops until the barn fits
  while (G.R.deck.length < G.C.MAX_DECK + 2) G.R.deck.push(G.wildCard(2));
  G.ui.goCull();
  eq(G.ui.cur, 'cull', 'an overfull barn forces the cull screen');
  ge(G.mustCull(), 1, 'and reports what must go');

  G.ui.goOver(false);
  eq(G.ui.cur, 'over', 'a loss ends the run');
  G.ui.goOver(true);
  ok(true, 'the victory screen renders too');
  G.ui.renderTitle();
  ok(true, 'the title screen renders with a hall record');

  // the portrait painter survives every gene combination
  for (let i = 0; i < 60; i++){
    const c = G.wildCard(i % 8);
    c.vis.eyes = (i % 3) + 1; c.vis.horns = i % 4; c.vis.wings = i % 3; c.vis.tail = i % 2;
    c.vis.spots = (i % 7) / 6; c.vis.body = (i % 5) / 4;
    G.ui.cardEl(c, { big: i % 2 === 0 });
  }
  ok(true, 'every gene combination paints without throwing');
}

/* ================================= done =================================== */
if (fails.length){
  console.error('\nbirds_and_beasts: ' + fails.length + ' FAILED, ' + pass + ' passed');
  process.exit(1);
}
console.log('birds_and_beasts: ' + pass + ' checks passed');
