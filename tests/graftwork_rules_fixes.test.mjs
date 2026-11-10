// Rules fixes (graftwork/design/CLEANUP_PLAN.md, "Rules fixes"): every card, graft, passive and relic does what its text says,
// and saves keep loading when they name content that no longer exists. Each block failed on the code before the fix.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { newCombat, playCard, endTurn, specOf } from '../graftwork/engine/combat.js';
import { newInst, cardSpec } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, RELICS, ENEMIES, STATUSES, POTIONS, EVENTS, HEROES, ROOMS, BUILD_CARDS } from '../graftwork/data/index.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const ta = async (name, fn) => { await fn(); n++; console.log('ok', name); };

// ---------------------------------------------------------------- junk cards nothing can add are gone
const REMOVED_JUNK = ['j_bruise', 'j_gauze', 'j_splinter', 'j_fever', 'j_scab', 'j_slag', 'j_fog', 'j_lint', 'j_invoice', 'j_shard', 'j_tourniquet', 'j_slip'];
// every junk id that content can create: ops, graft junk prices, enemy moves, hooks and statuses (function bodies are read as text)
function junkSources() {
  const junk = Object.values(CARDS).filter((c) => c.type === 'junk').map((c) => c.id);
  const all = new Set([...junk, ...REMOVED_JUNK]), hit = new Set();
  const walk = (v, seen) => {
    if (typeof v === 'string') { if (all.has(v)) hit.add(v); return; }
    if (typeof v === 'function') { const src = v.toString(); for (const id of all) if (new RegExp(`['"\`]${id}['"\`]`).test(src)) hit.add(id); return; }
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    for (const k of Object.keys(v)) walk(v[k], seen);
  };
  for (const reg of [CARDS, GRAFTS, ENEMIES, STATUSES, RELICS, POTIONS, EVENTS, ROOMS, BUILD_CARDS]) for (const def of Object.values(reg)) {
    if (def.type === 'junk') { const { id, ...rest } = def; walk(rest, new Set()); } else walk(def, new Set()); // a junk card's own id is not a source
  }
  for (const h of Object.values(HEROES)) { walk(h.deck, new Set()); walk(h.on, new Set()); }
  if (/newInst\('j_clot'/.test(RUN.newRun.toString())) hit.add('j_clot'); // Ascension 3 starts with a Clot
  return { junk, hit };
}
t('every junk card left in the game can be created by something, and the 12 unreachable ones are gone', () => {
  const { junk, hit } = junkSources();
  for (const id of REMOVED_JUNK) { assert.ok(!CARDS[id], id + ' is still registered'); assert.ok(!hit.has(id), id + ' was removed but something still creates it'); }
  for (const id of junk) assert.ok(hit.has(id), id + ' is in the Codex but nothing can add it');
  assert.equal(junk.length, 7);
});

// ---------------------------------------------------------------- saves that name unknown content keep loading
const GONE = ['j_bruise', 'zz_not_a_card']; // one of the removed ids and one that never existed
t('a run save with unknown card and graft ids loads, fights and saves again', () => {
  const run = RUN.newRun({ hero: 'marrow', seed: 'oldsave' });
  const keep = run.deck.length;
  const good = Object.keys(GRAFTS)[0];
  const raw = JSON.parse(RUN.serializeRun(run));
  raw.deck.push({ uid: 9001, id: GONE[0], grafts: [], up: 0 }, { uid: 9002, id: GONE[1], grafts: ['g_not_a_graft'], up: 1 });
  raw.deck[0].grafts = [good, 'g_not_a_graft']; raw.deck[0].waived = ['g_not_a_graft']; raw.deck[1].fused = ['g_gone_too'];
  raw.relics.push('r_not_a_relic'); raw.potions = ['p_not_a_potion'];
  const back = RUN.deserializeRun(JSON.stringify(raw));
  assert.equal(back.deck.length, keep, 'the two unknown cards are dropped, the rest stay');
  assert.ok(back.deck.every((i) => CARDS[i.id]));
  assert.deepEqual(back.deck[0].grafts, [good]); assert.deepEqual(back.deck[0].waived, []); assert.deepEqual(back.deck[1].fused, []);
  assert.ok(back.relics.every((r) => RELICS[r])); assert.deepEqual(back.potions, []);
  for (const i of back.deck) cardSpec(i);
  RUN.strainInfo(back); RUN.graftableCards(back); RUN.makeGraftOffer(back);
  const c = newCombat(back, ['bedpan_slime']);
  for (let k = 0; k < 4 && !c.over; k++) { for (let h = c.hand.length - 1; h >= 0; h--) playCard(c, h, 0); endTurn(c); }
  const again = RUN.serializeRun(back);
  assert.equal(RUN.serializeRun(RUN.deserializeRun(again)), again, 'a repaired save is stable');
});
t('a save without unknown ids is returned byte for byte', () => {
  for (const mode of [undefined, 'ward']) {
    const run = RUN.newRun({ hero: 'odile', seed: 'clean', mode });
    const a = RUN.serializeRun(run);
    assert.equal(RUN.serializeRun(RUN.deserializeRun(a)), a);
  }
});
t('pending screens drop unknown ids: shop stock, graft offer, reward', () => {
  const mk = () => JSON.parse(RUN.serializeRun(RUN.newRun({ hero: 'wick', seed: 'pend' })));
  const shop = mk(); shop.phase = 'shop';
  shop.pending = { kind: 'shop', cards: [{ id: GONE[0], price: 40, sold: false }, { id: 'x_thread_snip', price: 40, sold: false }, { id: GONE[1], price: 40, sold: false }], grafts: [{ id: 'g_not_a_graft', price: 70, sold: false }], relics: [{ id: 'r_not_a_relic', price: 100, sold: false }], potions: [{ id: 'p_not_a_potion', price: 50, sold: false }], removeUses: 0 };
  const s = RUN.deserializeRun(JSON.stringify(shop));
  assert.deepEqual(s.pending.cards.map((x) => x.id), ['x_thread_snip']); assert.equal(s.pending.grafts.length + s.pending.relics.length + s.pending.potions.length, 0);
  assert.ok(RUN.shopBuy(s, 'card', 0).ok || s.gold < 40);
  const offer = mk(); offer.phase = 'graft'; offer.deck.push({ uid: 9001, id: GONE[1], grafts: [], up: 0 });
  offer.pending = { kind: 'graft', offer: { cards: [9001, offer.deck[0].uid], grafts: ['g_not_a_graft', Object.keys(GRAFTS)[0]], rerolled: 0 } };
  const o = RUN.deserializeRun(JSON.stringify(offer));
  assert.ok(o.pending.offer.cards.length > 0 && o.pending.offer.cards.every((u) => o.deck.some((i) => i.uid === u)));
  assert.ok(o.pending.offer.grafts.length > 0 && o.pending.offer.grafts.every((g) => GRAFTS[g]));
  const rw = mk(); rw.phase = 'reward'; rw.pending = { kind: 'elite', gold: 10, graft: true, relic: 'r_not_a_relic', relicChoices: ['r_not_a_relic'], potion: 'p_not_a_potion' };
  const r = RUN.deserializeRun(JSON.stringify(rw));
  assert.equal(r.pending.relic, null); assert.deepEqual(r.pending.relicChoices, []); assert.equal(r.pending.potion, null);
});
await ta('meta with unknown ids in seen lists, history and a practice deck loads, and the Codex, Archive and deck view draw', async () => {
  const store = {}; META.setStorage({ getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } });
  const m0 = META.defaultMeta();
  for (const id of GONE) m0.seen.cards[id] = 1;
  m0.seen.grafts.g_not_a_graft = 1; m0.seen.enemies.the_resident = 1;
  m0.history.push({ hero: 'marrow', asc: 0, outcome: 'dead', floors: 3, grafts: 1, date: 1, seed: 's', loop: 0, daily: false, deck: GONE.slice(), killer: GONE[1] });
  m0.practice.the_resident = { boss: 'the_resident', kind: 'boss', enemies: ['the_resident'], act: 1, hero: 'marrow', asc: 0, deck: [{ id: 'm_cut', grafts: [], up: 0 }, { id: GONE[0], grafts: [], up: 0 }, { id: GONE[1], grafts: ['g_not_a_graft'], up: 0 }, { id: 'm_dress', grafts: ['g_not_a_graft'], up: 0 }], relics: ['r_not_a_relic'], maxHp: 80, win: true, ts: 1 };
  store[META.KEY] = JSON.stringify(m0);
  const m = META.loadMeta();
  assert.equal(m.history.length, 1); assert.ok(META.isSeen(m, 'cards', GONE[1]), 'the save is not rewritten');
  assert.ok(META.codexCount(m) >= 0); META.saveMeta(m);
  const list = META.practiceList(m); assert.equal(list.length, 1);
  const pr = META.newPracticeRun(list[0], m);
  assert.deepEqual(pr.deck.map((i) => i.id), ['m_cut', 'm_dress']); assert.deepEqual(pr.deck[1].grafts, []);
  assert.ok(pr.relics.every((r) => RELICS[r]));
  newCombat(pr, pr.pending.enemies, { kind: 'boss' });
  // run save next to it, with the unknown ids in the deck: the screens that list cards must draw
  const run = RUN.newRun({ hero: 'marrow', seed: 'ui' });
  const raw = JSON.parse(RUN.serializeRun(run)); raw.deck.push({ uid: 9001, id: GONE[0], grafts: [], up: 0 }, { uid: 9002, id: GONE[1], grafts: [], up: 0 });
  const back = RUN.deserializeRun(JSON.stringify(raw));
  const app = await makeApp({ run: back, meta: m });
  app.shared.flow = { app, RUN, META, route() {}, toTitle() {}, openCodex() {}, openArchive() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, start() {}, openDeck() {} };
  for (const s of ['deckview', 'codex', 'archive']) app.register(s, (await import(`../graftwork/ui/${s}.js`)).default);
  app.register('base', { draw() {} }); app.go('base');
  for (const s of ['deckview', 'codex', 'archive']) { app.push(s, {}); frames(app, 12); app.pop(); }
  META.recordRunEnd(m, back, 'dead'); // seenFromRun, case file, history
  assert.equal(m.history.length, 2);
  META.setStorage(null);
});

console.log(`${n} rules-fix checks done`);
