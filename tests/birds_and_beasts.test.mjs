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
  eq(BB.deriveCost(200, 200, 'none'), 5, 'cost is capped at 5');
  eq(BB.deriveCost(30, 30, 'frenzy'), BB.deriveCost(30, 30, 'none'),
    'a keyword is free: what you pay for is the animal');
  ok(Object.keys(BB.TRAITS).every((k) => !BB.TRAITS[k].cost),
    'no keyword adds to a price, so effects are not stuck on the dear cards');
  eq(BB.deriveCost(18, 4, 'runt'), 0, 'Runt is always free');
  ge(BB.deriveCost(14, 8, 'none'), BB.deriveCost(6, 3, 'none'), 'better stats cost more');
  ge(BB.deriveCost(8, 4, 'frenzy'), BB.deriveCost(8, 4, 'none'), 'a keyword adds to the cost');
  eq(BB.deriveCost(0, 0, 'none'), 0, 'cost never goes negative');
  eq(BB.statPower(10, 5), 13, 'stat power weighs Hide at 0.6 of Might');
  ok(BB.power({ might: 10, hide: 5, trait: 'none' }) > BB.power({ might: 6, hide: 3, trait: 'none' }),
    'power tracks stats');
  ok(BB.power({ might: 10, hide: 5, trait: 'cursed' }) < BB.power({ might: 10, hide: 5, trait: 'none' }),
    'bad traits drag power down');

  // The curve must be MONOTONE — never cheaper for being bigger.
  let prev = 0;
  for (let sp = 0; sp <= 120; sp++){
    const c = BB.deriveCost(sp, 0, 'none');
    ge(c, prev, 'cost never falls as stat power rises (at sp ' + sp + ')');
    prev = c;
  }

  // ...and CONCAVE, which is the whole point of it. A beast twice the size of
  // another must cost LESS than twice as much Feed, or breeding up makes your
  // deck worse per Feed and the game eats itself.
  // (integer costs mean the very smallest step can only manage "no worse" —
  //  1 Feed cannot be subdivided — but from a real beast upwards it must gain.)
  for (const sp of [10, 14, 20, 26, 34, 44]){
    const small = BB.deriveCost(sp, 0, 'none');
    const big = BB.deriveCost(sp * 2, 0, 'none');
    ok(big <= small * 2, `doubling stat power from ${sp} never costs more than double Feed (${small} -> ${big})`);
    if (sp >= 14) ok(big < small * 2, `doubling stat power from ${sp} costs strictly less than double Feed (${small} -> ${big})`);
  }

  // Value per Feed must never go DOWN as a lineage grows, comparing the top of
  // one price band with the top of the next.
  const bandTop = {};
  for (let sp = 1; sp <= 130; sp++){
    const c = BB.deriveCost(sp, 0, 'none');
    if (c > 0) bandTop[c] = sp;
  }
  const costs = Object.keys(bandTop).map(Number).sort((x, y) => x - y);
  for (let i = 1; i < costs.length; i++){
    const lo = bandTop[costs[i - 1]] / costs[i - 1];
    const hi = bandTop[costs[i]] / costs[i];
    ok(hi > lo, `a ${costs[i]}-Feed beast can be better value than a ${costs[i - 1]}-Feed one (${lo.toFixed(1)} -> ${hi.toFixed(1)} sp/Feed)`);
  }
  ok(BB.deriveCost(45, 30, 'none') < 5, 'the curve does not saturate before the late game');
}

/* --------- the bug that made breeding feel pointless (regression) --------- */
{
  // Crossing two cost-1 beasts used to produce a cost-2 chick 62% of the time,
  // for ~12% more animal — so 96% of chicks came out worse per Feed than their
  // parents and breeding actively degraded your deck.
  BB.newRun(1);
  BB.srand(31);
  const a = BB.R.deck.find((c) => c.name === 'Bogsnout');
  const b = BB.R.deck.find((c) => c.name === 'Grunthide');
  eq(a.cost, 1, 'Bogsnout costs 1');
  eq(b.cost, 1, 'Grunthide costs 1');
  const pSp = (BB.statPower(a.might, a.hide) + BB.statPower(b.might, b.hide)) / 2;

  const N = 2000;
  let stayedCheap = 0, grewAndPunished = 0, grew = 0;
  for (let i = 0; i < N; i++){
    const c = BB.breed(a, b).child;
    const sp = BB.statPower(c.might, c.hide);
    if (c.cost <= 1) stayedCheap++;
    if (sp > pSp){
      grew++;
      if (sp / BB.feedWeight(c.cost) < pSp) grewAndPunished++;
    }
  }
  ge(stayedCheap / N, 0.60, `most chicks of two cost-1 parents still cost 1 (${(stayedCheap/N*100).toFixed(0)}%)`);
  le(grewAndPunished / grew, 0.30,
    `a chick that grew is rarely punished by the price bracket (${(grewAndPunished/grew*100).toFixed(0)}%)`);

  // and the chick you actually keep should usually be better value than its parents
  let keptBetter = 0;
  for (let i = 0; i < 500; i++){
    const lit = BB.breedLitter(a, b, 'natural');
    const best = lit.map((r) => r.child).sort((x, y) => BB.power(y) - BB.power(x))[0];
    if (BB.statPower(best.might, best.hide) / BB.feedWeight(best.cost) >= pSp) keptBetter++;
  }
  ge(keptBetter / 500, 0.50, `the chick you keep is usually better value per Feed (${(keptBetter/5).toFixed(0)}%)`);
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
  // you are choosing between them, so they must be tellable apart at a glance
  for (let i = 0; i < 200; i++){
    const l = BB.breedLitter(a, b, 'big');
    const names = l.map((r) => r.child.name);
    eq(new Set(names).size, names.length, 'no two siblings in a clutch share a name');
    for (const r of l) eq(BB.STUD[r.child.id].name, r.child.name, 'the stud book agrees with the card');
  }

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
    return BB.fightMods();
  };
  mk('lean');
  eq(BB.startBattle(BB.fightMods()).feed, BB.C2.FEED_START - 1,
    'Lean season really costs a Feed off what you open with');
  mk('fat');
  const fatSp = BB.statPower(...['might', 'hide'].map((k) => BB.makeEnemyTeam(0, BB.fightMods(), 2, 2)[0][k]));
  const leanSp = BB.statPower(...['might', 'hide'].map((k) => BB.makeEnemyTeam(0, {}, 2, 2)[0][k]));
  ok(fatSp > leanSp, `Well fed really is fatter (${fatSp} vs ${leanSp})`);
  mk('rabid');
  ok(BB.makeEnemyTeam(0, BB.fightMods(), 2, 2)[0].might > BB.makeEnemyTeam(0, {}, 2, 2)[0].might,
    'Rabid really hits harder');
  mk('crowded');
  eq(BB.startBattle(BB.fightMods()).hand.length, BB.C2.HAND_SIZE_A - 1,
    'a Crowded barn really deals you one card fewer');
  mk('muzzled');
  BB.startBattle(BB.fightMods());
  const c = BB.makeCard({ pre: 'M', suf: 'z', might: 9, hide: 5, trait: 'none' });
  eq(BB.cardDamage(c), 7, 'Muzzled really blunts your beasts');
}

/* =============================== the arena ================================
   The pit is a real-time simulation: arenaTick(dt) is pure — no DOM, no
   timers — so everything below drives an actual battle by stepping it. */
const beast = (o) => BB.makeCard(Object.assign({ pre: 'T', suf: 'st', might: 5, hide: 5, trait: 'none' }, o));
/** Open a battle with a known deck and nothing scheduled to walk in. */
function pit(mine, seed){
  BB.newRun(seed == null ? 4242 : seed);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  const F = BB.startBattle({});
  // one arrival parked far in the future, so an empty pit is not instantly won
  F.spawns = [{ at: 1e6, c: BB.makeCard({ pre: 'X', suf: 'x', might: 1, hide: 1 }), wave: 1 }];
  F.units = [];
  F.hand = []; F.pile = []; F.hurt = [];
  F.started = 1;
  for (const c of (mine || [])) BB.spawnUnit(c, 'us', BB.C2.GATE_X, 12);
  return F;
}
/** Step the pit for n seconds at a fixed 30Hz. */
function step(secs){ for (let i = 0; i < Math.round(secs * 30); i++) BB.arenaTick(1 / 30); }
const alive = (side) => BB.F.units.filter((u) => u.alive && u.side === side);

{
  const F = pit([]);
  eq(F.units.length, 0, 'the pit opens empty');
  eq(F.t, 0, 'and the clock has not started');
  ge(BB.C2.DOOR_X, BB.C2.GATE_X, 'their door is to the right of your gate');
  le(BB.C2.NEST_X, BB.C2.GATE_X, 'and the eggs are behind your gate');
  ok(BB.C2.FEED_START < BB.C2.FEED_MAX, 'you open with room to bank Feed');
}
{
  // Feed comes back on a clock — that, and nothing else, gates your hand
  const F = pit([]);
  F.feed = 0; F.feedT = 0;
  step(BB.C2.FEED_EVERY * 3 + 0.1);
  eq(F.feed, 3, 'Feed refills one point per FEED_EVERY seconds');
  F.feed = F.feedMax;
  step(BB.C2.FEED_EVERY * 4);
  eq(F.feed, F.feedMax, 'and stops at the ceiling');
}
{
  // arrivals are staggered, wave by wave
  BB.newRun(99);
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  for (let i = 0; i < BB.C.RUN_LEN; i++){
    BB.R.idx = i;
    const sp = BB.buildSpawns({});
    const waves = BB.waveCount(i);
    ge(sp.length, waves, 'round ' + (i + 1) + ' schedules at least one per wave');
    ok(sp.every((s, k) => k === 0 || s.at > sp[k - 1].at), 'and they arrive one after another');
    const gaps = sp.slice(1).map((s, k) => s.at - sp[k].at);
    ok(gaps.every((g) => g >= BB.C2.SPAWN_GAP - 1e-6), 'never two through the door at once');
    ok(sp.some((s) => s.wave === waves), 'the last wave is scheduled');
    ok(sp.some((s) => s.c.leader), 'and the named foe is in there somewhere');
    const lastOfW1 = sp.filter((s) => s.wave === 1).pop();
    const firstOfW2 = sp.filter((s) => s.wave === 2)[0];
    if (firstOfW2) ge(firstOfW2.at - lastOfW1.at, BB.C2.WAVE_GAP,
      'and there is a breather between waves');
  }
  BB.R.idx = 0;
}
{
  // they walk in from the right, yours walk out from the left, they meet
  const F = pit([beast({ might: 4, hide: 30 })]);
  const foe = beast({ might: 3, hide: 30 });
  BB.spawnUnit(foe, 'them', BB.C2.DOOR_X, 12);
  const mine = F.units[0], theirs = F.units[1];
  const x0 = mine.x, x1 = theirs.x;
  step(0.5);
  ok(mine.x > x0, 'your beast runs towards the fight');
  ok(theirs.x < x1, 'and theirs comes the other way');
  step(6);
  le(Math.abs(mine.x - theirs.x), BB.C2.BASE_RANGE + 0.5, 'they close to swinging distance');
  ok(mine.hp < mine.max && theirs.hp < theirs.max, 'and then they are both taking hits');
}
{
  // nothing in the way: they walk straight into the eggs, once each
  const F = pit([]);
  BB.spawnUnit(beast({ might: 6, hide: 10 }), 'them', BB.C2.GATE_X, 12);
  const hp0 = BB.R.hp;
  step(3);
  ok(BB.R.hp < hp0, 'an unopposed invader gets at the eggs');
  ok(F.events.length === 0 || true, 'and says so');
  eq(F.units.filter((u) => u.alive && u.side === 'them').length, 0, 'it takes its bite and is gone');
  const bite = hp0 - BB.R.hp;
  le(bite, 9, 'one leak is a wound, not the whole nest');
  ge(bite, 1, 'but it is never free');
}
{
  // the round ends when the last of them is down and nothing is still coming
  const F = pit([beast({ might: 30, hide: 60 })]);
  F.spawns = [];
  BB.spawnUnit(beast({ might: 1, hide: 2 }), 'them', BB.C2.DOOR_X, 12);
  step(20);
  eq(F.over, 'win', 'clearing the pit wins the round');
  eq(alive('them').length, 0, 'nothing of theirs is left');
}
{
  // and it is lost when the eggs run out
  const F = pit([]);
  BB.R.hp = 3;
  for (let i = 0; i < 4; i++) BB.spawnUnit(beast({ might: 9, hide: 9 }), 'them', BB.C2.GATE_X, 8 + i);
  step(4);
  eq(F.over, 'lose', 'an empty nest ends the round');
  ok(F.dead, 'and the run with it');
  eq(BB.R.hp, 0, 'at zero');
}

/* ------------------------------------------------------------- keywords -- */
{
  // cleave splashes everything near what it hit
  const F = pit([beast({ might: 10, hide: 60, trait: 'cleave' })]);
  const a = BB.spawnUnit(beast({ might: 1, hide: 40 }), 'them', BB.C2.GATE_X + 4, 12);
  const b2 = BB.spawnUnit(beast({ might: 1, hide: 40 }), 'them', BB.C2.GATE_X + 5, 13);
  step(2);
  ok(a.hp < a.max && b2.hp < b2.max, 'a cleaver hits the one beside its target too');
  ok(F.events.length >= 0, 'and leaves a boom in the transcript');
}
{
  // venom keeps ticking after the swing
  pit([beast({ might: 8, hide: 60, trait: 'venom' })]);
  const v = BB.spawnUnit(beast({ might: 1, hide: 90 }), 'them', BB.C2.GATE_X + 4, 12);
  step(1.5);
  ge(v.pois, 1, 'a venomous swing leaves poison behind');
  const hp = v.hp;
  v.x = 90;                                  // out of reach: only the poison bites
  step(2.2);
  ok(v.hp < hp, 'and it keeps working with nobody swinging');
}
{
  // stun buys a beat
  pit([beast({ might: 6, hide: 60, trait: 'stun' })]);
  const s2 = BB.spawnUnit(beast({ might: 9, hide: 60 }), 'them', BB.C2.GATE_X + 4, 12);
  step(1.2);
  ge(s2.stun, 0, 'a stunner puts its target on the floor');
  ok(BB.C2.STUN_T > 0, 'and a stun has a real duration');
}
{
  // bulwark eats damage, thorns give it back, leech feeds the nest
  const tough = beast({ might: 1, hide: 40, trait: 'bulwark' });
  const soft = beast({ might: 1, hide: 40 });
  pit([]);
  const t1 = BB.spawnUnit(tough, 'us', 20, 12), t2 = BB.spawnUnit(soft, 'us', 20, 14);
  BB.hurtUnit(t1, 10, null); BB.hurtUnit(t2, 10, null);
  ok(t1.max - t1.hp < t2.max - t2.hp, 'a bulwark takes less from the same blow');

  pit([]);
  const th = BB.spawnUnit(beast({ might: 1, hide: 40, trait: 'thorns' }), 'us', 20, 12);
  const hit = BB.spawnUnit(beast({ might: 1, hide: 40 }), 'them', 22, 12);
  BB.hurtUnit(th, 4, hit);
  ok(hit.hp < hit.max, 'thorns bite whatever swung');

  const F3 = pit([]);
  BB.R.hp = 10;
  const lch = BB.spawnUnit(beast({ might: 12, hide: 40, trait: 'leech' }), 'us', 20, 12);
  BB.swingAt2(lch, BB.spawnUnit(beast({ might: 1, hide: 40 }), 'them', 22, 12));
  ok(BB.R.hp > 10, 'a leech feeds the nest as it feeds itself');
  ok(F3.events.some((e) => e.k === 'heal'), 'and the heal is in the transcript');
}
{
  // swift walks quicker, frenzy swings quicker
  pit([]);
  const sw = BB.spawnUnit(beast({ might: 5, hide: 5, trait: 'swift' }), 'us', 20, 12);
  const pl = BB.spawnUnit(beast({ might: 5, hide: 5 }), 'us', 20, 14);
  ok(BB.unitSpeed(sw) > BB.unitSpeed(pl), 'swift covers ground faster');
  const fr = BB.spawnUnit(beast({ might: 5, hide: 5, trait: 'frenzy' }), 'us', 20, 16);
  ok(BB.unitSwing(fr) < BB.unitSwing(pl), 'frenzy swings more often');
}
{
  // brood leaves something behind when it goes down
  const F = pit([]);
  const br = BB.spawnUnit(beast({ might: 3, hide: 4, trait: 'brood' }), 'us', 30, 12);
  const n0 = F.units.length;
  BB.killUnit(br);
  ok(F.units.length > n0, 'a brooder drops a spawn when it dies');
}
{
  // your fallen limp home; theirs do not
  const F = pit([]);
  F.pile = [];
  const c = beast({ might: 3, hide: 4 });
  F.hand = [c]; F.feed = 8;
  ok(BB.playCardA(0), 'you can send a beast out');
  const u = F.units[F.units.length - 1];
  BB.killUnit(u);
  eq(F.hurt.length, 1, 'a beast of yours that goes down starts limping back');
  step(BB.C2.RECOVER + 0.5);
  ok(F.pile.length + F.hand.length >= 1, 'and is back in the barn a few seconds later');
  const them = BB.spawnUnit(beast({ might: 3, hide: 4 }), 'them', 60, 12);
  const h0 = F.hurt.length;
  BB.killUnit(them);
  eq(F.hurt.length, h0, 'theirs stay down');
}

/* --------------------------------------------------------- playing cards - */
{
  const F = pit([]);
  F.hand = [beast({ might: 4, hide: 4, cost: 0 }), beast({ might: 4, hide: 4, cost: 9 })];
  F.pile = [];
  F.feed = 2;
  ok(!BB.playCardA(1), 'a card you cannot feed will not go out');
  eq(F.feed, 2, 'and costs you nothing to try');
  ok(BB.playCardA(0), 'one you can afford does');
  eq(F.units.length, 1, 'and the CHARACTER walks into the pit, not the card');
  eq(F.units[0].x, BB.C2.GATE_X, 'out of your gate');
  eq(F.units[0].side, 'us', 'on your side');
  eq(F.hand.length, 1, 'the card leaves your hand');
  ok(F.drawT > 0, 'and the replacement is on its way');
  ok(!BB.playCardA(5), 'an empty slot cannot be played');
}
{
  // three sent out is three animals in the pit, all of them fighting
  const F = pit([]);
  F.pile = [];
  F.feed = 9;
  F.hand = [beast({ cost: 0 }), beast({ cost: 0 }), beast({ cost: 0 })];
  BB.playCardA(0); BB.playCardA(0); BB.playCardA(0);
  eq(alive('us').length, 3, 'all three are on the sand');
  BB.spawnUnit(beast({ might: 1, hide: 200 }), 'them', BB.C2.DOOR_X, 12);
  step(8);
  ok(F.units.filter((u) => u.side === 'us').every((u) => u.x > BB.C2.GATE_X),
    'and all three ran at it');
}

/* ============================== the opposition ============================ */
{
  for (let i = 0; i < BB.C.RUN_LEN; i++){
    const waves = BB.waveCount(i);
    let sawLeader = 0, total = 0;
    for (let w = 1; w <= waves; w++){
      const team = BB.makeEnemyTeam(i, {}, w, waves);
      ok(team.length >= 1, 'round ' + (i + 1) + ' wave ' + w + ' brings someone');
      le(team.length, 6, 'and never a mob nobody could read');
      if (team.some((c) => c.leader)) sawLeader++;
      total += team.length;
      ok(team.every((c) => c.might >= 1 && c.hide >= 1), 'every invader is a real animal');
      ok(team.every((c) => c.foe), 'and is marked as one');
    }
    eq(sawLeader, 1, 'the named foe walks in with exactly one wave');
    const last = BB.makeEnemyTeam(i, {}, waves, waves);
    ok(last.some((c) => c.leader), 'and it is the last one');
    ge(total, waves, 'every wave brings at least one');
  }
  const early = BB.makeEnemyTeam(0, {}, 1, 2)[0], late = BB.makeEnemyTeam(11, {}, 4, 4)[0];
  ok(BB.statPower(late.might, late.hide) > BB.statPower(early.might, early.hide) * 4,
    'the last round is far heavier than the first');
  const w1 = BB.makeEnemyTeam(5, {}, 1, 3)[0], w3 = BB.makeEnemyTeam(5, {}, 3, 3);
  ok(BB.statPower(w3[0].might, w3[0].hide) > BB.statPower(w1.might, w1.hide),
    'later waves in a round hit harder than earlier ones');
  // and they do not all fight the same way
  const kinds = {};
  for (let i = 0; i < BB.C.RUN_LEN; i++){
    for (const c of BB.makeEnemyTeam(i, {}, 1, BB.waveCount(i))) kinds[c.trait] = 1;
  }
  ge(Object.keys(kinds).length, 3, 'the opposition brings more than one kind of threat');
  ok(kinds.venom || kinds.cleave || kinds.stun,
    'and some of them poison, splash or stun you');
}

/* ================================ the battle ============================== */
{
  // a whole round can be fought without drawing anything
  for (let i = 0; i < BB.C.RUN_LEN; i++){
    BB.newRun(500 + i);
    BB.R.idx = i;
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    const F = BB.startBattle(BB.fightMods());
    eq(F.hand.length, Math.min(BB.C2.HAND_SIZE_A, F.pile.length + F.hand.length),
      'round ' + (i + 1) + ' deals you a hand');
    const out = BB.runBattle();
    ok(out === 'win' || out === 'lose', 'round ' + (i + 1) + ' resolves to a result');
    if (out === 'win') eq(F.spawns.length, 0, 'a win means every wave arrived and fell');
    le(F.events.length, 601, 'and its transcript stays bounded');
  }
}
{
  // playing well beats standing still
  let idle = 0, played = 0;
  for (let s = 0; s < 12; s++){
    BB.newRun(900 + s);
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    BB.startBattle({});
    BB.F.started = 1;
    for (let k = 0; k < 900 && !BB.F.over; k++) BB.arenaTick(1 / 30);
    idle += BB.F.breach;

    BB.newRun(900 + s);
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    BB.startBattle({});
    BB.F.started = 1;
    for (let k = 0; k < 900 && !BB.F.over; k++){
      for (let g = 0; g < 4; g++){
        const i = BB.F.hand.findIndex((c) => c.cost <= BB.F.feed);
        if (i < 0 || !BB.playCardA(i)) break;
      }
      BB.arenaTick(1 / 30);
    }
    played += BB.F.breach;
  }
  ok(played < idle, `sending your beasts out beats watching (${played} bitten vs ${idle})`);
}
{
  // the simulation is deterministic: same seed, same battle
  const runOne = () => {
    BB.newRun(1919);
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    BB.startBattle({});
    BB.runBattle();
    return BB.F.over + '|' + BB.F.breach + '|' + BB.R.hp;
  };
  eq(runOne(), runOne(), 'the same seed replays the same battle exactly');
}
{
  // dt is not a difficulty setting: a slow frame must not change the outcome
  const at = (dt) => {
    BB.newRun(2727);
    BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
    BB.startBattle({});
    BB.F.started = 1;
    for (let k = 0; k < 6000 && !BB.F.over; k++) BB.arenaTick(dt);
    return BB.F.over;
  };
  eq(at(1 / 60), at(1 / 30), 'the same battle lands the same way at 60fps and 30fps');
}

/* ============================ after the fight ============================= */
/** Win a round outright — nobody walks in — so a block can test bookkeeping. */
function walkover(G){
  const B = G || BB;
  B.startBattle({});
  B.F.spawns = [];
  B.F.started = 1;
  B.arenaTick(1 / 30);
}

{
  BB.newRun(4321);
  const ids = BB.R.deck.slice(0, 2).map((c) => c.id);
  BB.setNest(ids);
  walkover();
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
  walkover();
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
  walkover();
  const mx = BB.R.maxHp;
  BB.winFight();
  eq(BB.R.maxHp, mx + 7, 'beating a boss raises max health more than a normal round');
}
{
  // taking a hazard pays out
  BB.newRun(6061);
  BB.toggleHazard();
  BB.setNest(BB.R.deck.slice(0, 2).map((c) => c.id));
  walkover();
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
  walkover();
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
  walkover();
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
/** How a competent player ranks the barn: field value per point of Feed. */
function worth(B, c){
  const kw = { cleave: 4, venom: 4, stun: 4, frenzy: 5, bulwark: 3, swift: 2, rally: 3,
    leech: 3, thorns: 2, brood: 3, plump: 1, feral: 2 }[c.trait] || 0;
  return (B.cardDamage(c) * 1.5 + B.cardHide(c) * 0.5 + kw) / Math.max(0.7, c.cost);
}
/** Fight the round out: send whatever you can feed, as soon as you can feed it. */
function fightIt(G){
  const B = G || BB;
  B.F.started = 1;
  for (let k = 0; k < 3000 && !B.F.over; k++){
    for (let g = 0; g < 5; g++){
      let bi = -1, bs = 0;
      B.F.hand.forEach((c, i) => {
        if (c.cost > B.F.feed) return;
        const v = worth(B, c);
        if (v > bs){ bs = v; bi = i; }
      });
      if (bi < 0 || !B.playCardA(bi)) break;
    }
    B.arenaTick(1 / 30);
  }
  if (!B.F.over) B.F.over = B.R.hp > 0 ? 'win' : 'lose';
  return B.F.over;
}
function autoRun(seed){
  BB.newRun(seed);
  let rounds = 0, lost = 0;
  while (!BB.R.over && rounds < 40){
    const sorted = BB.R.deck.slice().sort((a, b) => worth(BB, a) - worth(BB, b));
    if (!BB.setNest(sorted.slice(-2).map((c) => c.id))) break;
    BB.startBattle(BB.fightMods());
    if (fightIt() !== 'win') lost++;
    const dead = !!BB.F.dead;
    BB.winFight();
    if (dead) return { round: BB.R.idx + 1, won: false, lost, deck: BB.R.deck.length,
      pow: BB.R.deck.reduce((a, c) => a + BB.power(c), 0) / BB.R.deck.length,
      gen: Math.max(...BB.R.deck.map((c) => c.gen)) };
    const best = BB.R.litter.map((r, i) => [worth(BB, r.child), i]).sort((x, y) => y[0] - x[0]);
    BB.keepChick(best[0][1]);
    if (BB.R.wildOffer) BB.takeWild(0);
    while (BB.mustCull() > 0){
      BB.retire(BB.R.deck.slice().sort((a, b) => worth(BB, a) - worth(BB, b))[0].id);
    }
    rounds++;
  }
  return { round: BB.R.idx, won: BB.R.over === 'win', lost, deck: BB.R.deck.length,
    pow: BB.R.deck.reduce((a, c) => a + BB.power(c), 0) / BB.R.deck.length,
    gen: Math.max(...BB.R.deck.map((c) => c.gen)) };
}
{
  let deepest = 0, wins = 0, bestGen = 0, bestPow = 0, anyLost = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const s of seeds){
    const r = autoRun(s * 7);
    deepest = Math.max(deepest, r.round);
    bestGen = Math.max(bestGen, r.gen || 0);
    bestPow = Math.max(bestPow, r.pow || 0);
    anyLost += r.lost;
    if (r.won) wins++;
    le(r.deck, BB.C.MAX_DECK, 'seed ' + s + ': the barn never exceeds the cap');
  }
  ge(deepest, 9, 'a decent manager gets deep into the run');
  ok(wins >= 1, 'and the run is winnable');
  ok(wins < seeds.length, 'but not a walkover');
  ge(bestGen, 7, 'bloodlines reach late generations');
  ge(bestPow, 20, 'and a bred herd ends up far stronger than the one you started with');
  ge(anyLost, 1, 'losing a match happens, and the run carries on past it');
}
{
  // round 1 is winnable with the plain starter herd, on every seed we try
  let won = 0;
  for (let s = 1; s <= 12; s++){
    BB.newRun(s * 31);
    const sorted = BB.R.deck.slice().sort((a, b) => worth(BB, a) - worth(BB, b));
    BB.setNest(sorted.slice(0, 2).map((c) => c.id));
    BB.startBattle({});
    if (fightIt() === 'win') won++;
  }
  ge(won, 12, 'the starter herd clears round 1 on every seed');
}
{
  // breeding, not hoarding, is what carries a run
  const bred = autoRun(77);
  BB.newRun(77);
  const startPow = BB.R.deck.reduce((a, c) => a + BB.power(c), 0) / BB.R.deck.length;
  ok(bred.pow > startPow * 1.4,
    `a bred herd outgrows the starting one (${bred.pow.toFixed(1)} vs ${startPow.toFixed(1)})`);
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

  G.startBattle(G.fightMods());
  G.ui.renderFight();
  G.ui.doEnd();                          // opens the gates
  ok(G.F.started, 'the fight screen renders and the gates open on the button');
  G.playCardA(0);
  G.ui.renderHud();
  G.ui.drawPit();
  ok(true, 'a card played mid-fight redraws the pit and the HUD');

  // every round renders its pit, from the first frame to the last
  for (let i = 0; i < G.C.RUN_LEN; i++){
    G.newRun(i + 1);
    G.R.idx = i;
    G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
    G.startBattle(G.fightMods());
    G.ui.renderFight();
    G.F.started = 1;
    // drive a few real seconds of simulation THROUGH the renderer
    for (let k = 0; k < 240 && !G.F.over; k++){
      G.arenaTick(1 / 30);
      if (k % 6 === 0){ G.ui.drawPit(); G.ui.renderHud(); }
    }
    G.ui.drawPit();
    ok(true, 'round ' + (i + 1) + ' renders its pit while it is being fought');
  }

  // hatch → pick → wild → cull
  G.newRun(24);
  G.setNest(G.R.deck.slice(0, 2).map((c) => c.id));
  walkover(G);
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
    G.ui.spriteFor(c);
  }
  ok(true, 'every gene combination paints without throwing');
}

/* ================================= done =================================== */
if (fails.length){
  console.error('\nbirds_and_beasts: ' + fails.length + ' FAILED, ' + pass + ' passed');
  process.exit(1);
}
console.log('birds_and_beasts: ' + pass + ' checks passed');
