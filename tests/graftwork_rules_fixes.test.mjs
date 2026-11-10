// Rules fixes (graftwork/design/CLEANUP_PLAN.md, "Rules fixes"): every card, graft, passive and relic does what its text says,
// and saves keep loading when they name content that no longer exists. Each block failed on the code before the fix.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { newCombat, playCard, endTurn, specOf } from '../graftwork/engine/combat.js';
import { newInst, cardSpec, canGraft } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, RELICS, ENEMIES, STATUSES, POTIONS, EVENTS, HEROES, ROOMS, BUILD_CARDS } from '../graftwork/data/index.js';

let n = 0, bad = 0;
const ALL = process.env.RF_ALL === '1'; // RF_ALL=1 runs every block and lists the failures (to watch a block fail on old code)
const fail = (name, e) => { if (!ALL) throw e; bad++; console.log('FAIL', name, '\n   ', String(e && e.message).split('\n')[0]); };
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { fail(name, e); } };
const ta = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { fail(name, e); } };

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
  const run = RUN.newRun({ hero: 'odile', seed: 'clean' }); // a Ward run: the floor, the building deck and the dice are in the save
  const a = RUN.serializeRun(run);
  assert.equal(RUN.serializeRun(RUN.deserializeRun(a)), a);
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

// ---------------------------------------------------------------- Thread fixtures (as in graftwork_seam.test.mjs)
const { seamPreview, seamWorth, SEAM_CUTS_TURN } = await import('../graftwork/engine/seam.js');
const SEAM = await import('../graftwork/engine/seam.js');
const SCH = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
for (const s of SCH) {
  CARDS['t_' + s] = { id: 't_' + s, name: 'T ' + s, type: 'skill', cost: 0, rarity: 'common', school: s, target: 'none', fx: [], flavor: 'x', flags: {} };
  CARDS['ta_' + s] = { id: 'ta_' + s, name: 'TA ' + s, type: 'attack', cost: 0, rarity: 'common', school: s, target: 'enemy', fx: [{ op: 'dmg', n: 1 }], flavor: 'x', flags: {} };
}
CARDS.t_plain = { id: 't_plain', name: 'plain', type: 'skill', cost: 0, rarity: 'common', target: 'none', fx: [], flavor: 'x', flags: {} };
const GOF = { ember: 'g_ember_pin', echo: 'g_held_breath', hoard: 'g_quick_hands', blood: 'g_sutured_seam', rust: 'g_oxide_patch', static: 'g_ground_wire', gilded: 'g_leaf_gilt' };
for (const s of SCH) assert.equal(GRAFTS[GOF[s]].school, s, 'fixture graft ' + s);
const OVL_EMBER = ['g_ember_pin', 'g_cinder_wrap', 'g_scorch_thread']; // three ember grafts: an Overload card, 2 knots
let uidn = 0;
function fight(o = {}) {
  const run = RUN.newRun({ hero: o.hero || 'marrow', seed: o.seed || 'rules' });
  run.relics = (o.relics || []).slice();
  const c = newCombat(run, o.enemies || ['bedpan_slime']);
  if (!o.passive) c.run.hero = ''; // no hero passives unless asked: exact numbers
  for (const e of c.enemies) { e.hp = e.maxHp = 99999; }
  c.hand = []; c.energy = 99; c.maxEnergy = 99; c.player.hp = c.player.maxHp = 500; c.rng.chance = () => false; // no jams, no shatters
  return c;
}
function mk(c, id, o = {}) {
  const inst = newInst(id, () => 'rf' + (uidn++));
  inst.grafts = (o.grafts || []).slice(); inst.fused = (o.fused || []).slice(); inst.up = o.up ? 1 : 0;
  const card = { inst, uid: inst.uid, tithed: false, jam: !!o.jam, costMod: 0, plays: 0, rolled: true, temp: true };
  c.hand.push(card);
  return card;
}
const play = (c, card) => { const hi = c.hand.indexOf(card); assert.ok(hi >= 0); const r = playCard(c, hi, 0); assert.ok(r.ok, JSON.stringify(r)); return r; };
const P = (c, sch, o) => play(c, mk(c, 't_' + sch, o));
const mark = (c) => c.ev.length;
const since = (c, m, tt) => c.ev.slice(m).filter((e) => e.t === tt);
const pays = (c, m) => since(c, m, 'seamPay').map((p) => [p.school, p.stitches]);
const pvPays = (pv) => pv.payout.map((p) => [p.school, p.stitches]);
const lineOf = (c, sch, len) => { for (let i = 0; i < len; i++) P(c, sch); };
const cutText = (spec) => { const walk = (fx) => (fx || []).some((o) => /Cut the Line/.test(o.text || '') || walk(o.then) || walk(o.else)); return walk(spec.fx); };

// ---------------------------------------------------------------- 1. "Cut the Line." cuts the Line
const CUT_CARDS = ['x_thread_snip', 'x_thread_shears', 'm_hemostatic_snip'];
t('every card that says "Cut the Line." is one of the three, and the engine knows it (no forceCut shim)', () => {
  const ids = Object.values(CARDS).filter((d) => cutText({ fx: d.fx }) || (d.up && cutText({ fx: d.up.fx }))).map((d) => d.id).sort();
  assert.deepEqual(ids, CUT_CARDS.slice().sort());
  for (const id of CUT_CARDS) for (const up of [0, 1]) assert.ok(SEAM.cutsLine(cardSpec({ uid: 1, id, grafts: [], up })), id + ' is marked as a cutting card');
  assert.ok(!SEAM.cutsLine(cardSpec({ uid: 1, id: 'x_thread_cross', grafts: [], up: 0 })));
  const c = fight(); lineOf(c, 'ember', 3); play(c, mk(c, 'x_thread_snip'));
  assert.ok(!('forceCut' in c.seam), 'the shim flag is gone'); assert.equal(typeof c.A.cutLine, 'function');
});
t('Snip (no school): cashes the Line as a cut and leaves the rail empty; preview equals payout', () => {
  for (const up of [false, true]) {
    const c = fight(); lineOf(c, 'ember', 4);
    const card = mk(c, 'x_thread_snip', { up }), pv = seamPreview(c, card), m = mark(c);
    assert.equal(pv.kind, 'cut'); assert.deepEqual(pvPays(pv), [['ember', 3]]); assert.deepEqual(pvPays({ payout: seamWorth(c) }), [['ember', 3]]);
    play(c, card);
    const cut = since(c, m, 'seamCut'); assert.equal(cut.length, 1); assert.equal(cut[0].kind, 'cut'); assert.equal(cut[0].paid, 3); assert.equal(cut[0].card, card.uid); assert.equal(cut[0].len, 4);
    assert.deepEqual(pays(c, m), pvPays(pv)); assert.equal(c.enemies[0].st.burn, 9, 'ember pays 3 Burn per stitch');
    assert.equal(c.seam.len, 0); assert.equal(pv.len, 0); assert.equal(c.seam.cuts, 1);
    assert.equal(since(c, m, 'seamExtend').length, 0, 'a card with no school starts no Line');
  }
});
t("Tailor's Shears and Hemostatic Snip: the card joins the Line, reads it, cuts it, and starts the next one", () => {
  for (const [id, up] of [['x_thread_shears', false], ['x_thread_shears', true], ['m_hemostatic_snip', false], ['m_hemostatic_snip', true]]) {
    const c = fight(); c.player.hp = 400; lineOf(c, 'blood', 3);
    const card = mk(c, id, { up }), pv = seamPreview(c, card), m = mark(c), hp = c.player.hp;
    assert.equal(pv.kind, 'cut'); assert.deepEqual(pvPays(pv), [['blood', 3]], id + ' pays the Line with itself in it (4 knots)');
    play(c, card);
    const kinds = c.ev.slice(m).filter((e) => /^seam(Extend|Cut)$/.test(e.t) && e.card === card.uid).map((e) => e.t + (e.start ? ':start' : '') + ':' + e.len);
    assert.deepEqual(kinds, ['seamExtend:4', 'seamCut:4', 'seamExtend:start:1'], id);
    assert.deepEqual(pays(c, m), pvPays(pv)); assert.equal(c.seam.len, 1); assert.equal(pv.len, 1); assert.deepEqual(c.seam.set, ['blood']); assert.equal(c.seam.cuts, 1);
    const heal = c.player.hp - hp; assert.equal(heal, id === 'm_hemostatic_snip' ? 6 + (up ? 5 : 4) : 6, 'blood heals 2 per stitch' + (id === 'm_hemostatic_snip' ? ' plus its own heal at 4 knots' : ''));
    // on a Line of another school it is an ordinary cut (the old Line pays, the card starts the next one)
    const d = fight(); lineOf(d, 'ember', 3);
    const c2 = mk(d, id, { up }), pv2 = seamPreview(d, c2), m2 = mark(d);
    play(d, c2);
    assert.deepEqual(pays(d, m2), [['ember', 2]]); assert.deepEqual(pvPays(pv2), [['ember', 2]]); assert.equal(d.seam.len, 1); assert.equal(pv2.len, 1); assert.deepEqual(d.seam.set, ['blood']); assert.equal(d.seam.cuts, 1);
  }
});
t('a cut by effect fires the same hooks as any cut, respects the 3 cuts a turn and enemy cancels', () => {
  const seen = [];
  RELICS.r_test_hook = { id: 'r_test_hook', name: 'x', rarity: 'common', text: 'x', on: { seamCut: (A, i) => seen.push('c' + i.len + ':' + i.stitches), seamPay: (A, i) => seen.push('p' + i.school + i.stitches) } };
  const def = ENEMIES.bedpan_slime, old = def.on, eseen = [];
  try {
    const c = fight({ relics: ['r_test_hook'] });
    def.on = { ...(old || {}), seamCut: (A, e, i) => { eseen.push('c' + i.len); if (c.cancelNext) i.cancel = true; }, seamPay: () => eseen.push('p') };
    lineOf(c, 'blood', 3); play(c, mk(c, 'x_thread_snip'));
    assert.deepEqual(seen, ['c3:2', 'pblood2']); assert.deepEqual(eseen, ['c3', 'p']);
    // enemy cancel: the Line is cut, nothing is paid
    c.cancelNext = true; lineOf(c, 'ember', 3); let m = mark(c); play(c, mk(c, 'x_thread_snip'));
    assert.equal(since(c, m, 'seamPay').length, 0); assert.equal(since(c, m, 'seamCut')[0].paid, 0); assert.equal(c.seam.len, 0);
    c.cancelNext = false;
    // the turn's third paying cut, then a fourth: it still cuts, it pays nothing, and the preview says so
    lineOf(c, 'rust', 2); play(c, mk(c, 'x_thread_snip')); assert.equal(c.seam.cuts, SEAM_CUTS_TURN);
    lineOf(c, 'gilded', 4); const card = mk(c, 'x_thread_snip'), pv = seamPreview(c, card); m = mark(c);
    assert.deepEqual(pv.payout, []); assert.deepEqual(seamWorth(c), []);
    play(c, card); assert.equal(since(c, m, 'seamPay').length, 0); assert.equal(c.seam.len, 0); assert.equal(c.seam.cuts, SEAM_CUTS_TURN);
  } finally { def.on = old; delete RELICS.r_test_hook; }
});
t("Marrow's passive counts a Blood cut made by Hemostatic Snip; replays cut once", () => {
  const c = fight({ hero: 'marrow', passive: true }); c.player.hp = 300; lineOf(c, 'blood', 3);
  const hp = c.player.hp; play(c, mk(c, 'm_hemostatic_snip'));
  assert.equal(c.player.hp - hp, 6 + 4 + 3, 'payout 6, the card heals 4 at 4 knots, the passive 1 per stitch');
  const d = fight(); d.player.st.echo = 1; lineOf(d, 'ember', 4); // the Echo is spent by the first card: give it back for Snip
  d.player.st.echo = 1; const m = mark(d); play(d, mk(d, 'x_thread_snip'));
  assert.equal(since(d, m, 'seamCut').length, 1, 'the replay finds no Line to cut'); assert.deepEqual(pays(d, m), [['ember', 3]]);
  const e = fight(); e.player.st.echo = 1; P(e, 'blood'); e.player.st.echo = 1; const m2 = mark(e);
  play(e, mk(e, 'x_thread_shears', { grafts: OVL_EMBER })); // an Overload card restarts the Line at 2 knots: the replay must not cash that too
  assert.equal(since(e, m2, 'seamCut').filter((x) => x.kind === 'cut').length, 1); assert.equal(e.seam.len, 2);
});
t('a Frayed or Tempered cutting card stays out of the Line, and its effect still cuts', () => {
  for (const o of [{ jam: true }, { fused: [GOF.blood] }]) {
    const c = fight(); lineOf(c, 'blood', 3);
    const card = mk(c, 'x_thread_shears', o), pv = seamPreview(c, card), m = mark(c);
    play(c, card);
    assert.equal(pv.kind, 'cut'); assert.deepEqual(pays(c, m), [['blood', 2]], 'the Line of 3 is cashed, the card is not a knot'); assert.deepEqual(pvPays(pv), [['blood', 2]]);
    assert.equal(c.seam.len, 0); assert.equal(pv.len, 0);
  }
});

// ---------------------------------------------------------------- 1b. grafts that say "when it cuts the Line" fire on a cut, the extend ones do not
t('Thread grafts: "when it cuts" fires on a cut (it never did), "when it extends" no longer fires on a cut', () => {
  const run1 = (gid, base = 'ta_rust') => { const c = fight(); lineOf(c, 'blood', 3); const m = mark(c), gold = c.run.gold, hp = c.enemies[0].hp; play(c, mk(c, base, { grafts: [gid] })); return { c, m, gold: c.run.gold - gold, dmg: hp - c.enemies[0].hp }; };
  let r = run1('g_scissor_loop'); assert.equal(r.dmg, 1 + 9, 'Scissor Loop: 3 damage per knot of the Line it cut (3 knots)');
  r = run1('g_surgeons_knot'); assert.equal(r.gold, 8 - 1, "Surgeon's Knot: 4 gold per stitch (2), minus its 1 gold cost");
  r = run1('g_surge_loop'); assert.equal(r.c.player.st.charge, 2, 'Surge Loop: 1 Charge per stitch');
  r = run1('g_spent_thread'); assert.equal(r.c.seam.len, 2, 'Spent Thread: the new Line starts at 2 knots');
  r = run1('g_reef_knot'); assert.equal(r.c.player.st.echo, 1, 'Reef Knot: 1 Echo on the cut');
  // a second cut the same turn still gives Echo (the once per turn limit is on extends only)
  lineOf(r.c, 'blood', 2); r.c.player.st.echo = 0; play(r.c, mk(r.c, 'ta_rust', { grafts: ['g_reef_knot'] })); assert.equal(r.c.player.st.echo, 1);
  // extend grafts on a card that CUTS: nothing (they used to fire as if it had extended a Line of 1)
  r = run1('g_running_stitch', 'ta_ember'); assert.equal(r.c.player.st.charge || 0, 0, 'Running Stitch gives Charge when it extends, not when it cuts');
  r = run1('g_fine_gilt', 'ta_ember'); assert.equal(r.gold, 0, 'Fine Gilt Thread pays on an extend only');
  // and they still fire on a real extend and on the card that starts a Line
  const c = fight(); play(c, mk(c, 'ta_blood', { grafts: ['g_fine_gilt'] })); const g0 = c.run.gold; play(c, mk(c, 'ta_blood', { grafts: ['g_fine_gilt'] })); assert.equal(c.run.gold - g0, 2);
  // a cut by the card's own effect counts as that card cutting the Line
  const d = fight(); lineOf(d, 'blood', 3); const hp = d.enemies[0].hp; play(d, mk(d, 'x_thread_snip', { grafts: ['g_scissor_loop'] }));
  assert.equal(hp - d.enemies[0].hp, 4 + 9, 'Snip 4, Scissor Loop 3 per knot of the Line it cut');
});

// ---------------------------------------------------------------- 2. Slip Knot and Granny Knot
t('Slip Knot: a card that would cut goes Slack instead; it still starts and extends Lines', () => {
  const c = fight(); lineOf(c, 'ember', 3);
  const card = mk(c, 't_blood', { grafts: ['g_slip_knot'] }), pv = seamPreview(c, card), m = mark(c);
  assert.equal(pv.kind, 'slack'); assert.deepEqual(pv.payout, []);
  play(c, card);
  assert.equal(since(c, m, 'seamCut').length, 0); assert.equal(since(c, m, 'seamSlack').length, 1); assert.equal(c.seam.len, 3); assert.deepEqual(c.seam.counts, { ember: 3 });
  assert.equal(c.player.st.charge, 2, 'its other boon');
  P(c, 'ember'); assert.equal(c.seam.len, 4, 'the Line goes on');
  const d = fight(); play(d, mk(d, 't_blood', { grafts: ['g_slip_knot'] })); assert.equal(d.seam.len, 1, 'starts a Line');
  play(d, mk(d, 't_static', { grafts: ['g_slip_knot'] })); assert.equal(d.seam.len, 2, 'extends through its own school');
});
t('Granny Knot: extends any Line as every school in it, and adds no count', () => {
  const c = fight(); P(c, 'ember'); P(c, 'ember', { grafts: [GOF.blood] }); P(c, 'blood'); // counts ember 2, blood 2, last card blood
  const before = JSON.stringify(c.seam.counts);
  const card = mk(c, 't_gilded', { grafts: ['g_granny_knot'] }), pv = seamPreview(c, card), m = mark(c);
  assert.equal(pv.kind, 'extend'); assert.equal(pv.len, 4);
  play(c, card);
  assert.equal(since(c, m, 'seamCut').length, 0); assert.equal(c.seam.len, 4); assert.equal(JSON.stringify(c.seam.counts), before, 'no count for gilded, rust or anything else');
  assert.deepEqual(c.seam.set.slice().sort(), ['blood', 'ember'], 'it stands for every school in the Line');
  // so the next card may be any school of the Line, even one the previous card did not carry
  const next = mk(c, 't_ember'); assert.equal(seamPreview(c, next).kind, 'extend'); play(c, next); assert.equal(c.seam.len, 5);
  // the payout it promised when it extended is the payout a cut then pays
  const d = fight(); lineOf(d, 'ember', 2); const g = mk(d, 't_gilded', { grafts: ['g_granny_knot'] }), pv2 = seamPreview(d, g); play(d, g);
  const m2 = mark(d); P(d, 'blood'); assert.deepEqual(pays(d, m2), pvPays(pv2)); assert.deepEqual(pays(d, m2), [['ember', 2]]);
  // on an empty rail it starts a Line as its own schools, like any card
  const e = fight(); play(e, mk(e, 't_gilded', { grafts: ['g_granny_knot'] })); assert.equal(e.seam.len, 1); assert.deepEqual(e.seam.counts, { gilded: 1, rust: 1 });
});

// ---------------------------------------------------------------- 3. Odile: once per turn, a card may be declared Gilded
t("Odile's declaration: the next card also counts as Gilded, once per turn, and only Odile has it", () => {
  assert.equal(HEROES.odile.declare, 'gilded'); assert.ok(!(HEROES.odile.on && HEROES.odile.on.seamDeclare), 'the hook nothing fired is gone');
  const m0 = fight({ hero: 'marrow', passive: true }); assert.equal(SEAM.canDeclare(m0), false); assert.equal(SEAM.setDeclare(m0, true), false);
  const c = fight({ hero: 'odile', passive: true }); lineOf(c, 'gilded', 2);
  const card = mk(c, 't_ember');
  assert.equal(seamPreview(c, card).kind, 'cut', 'undeclared, an Ember card cuts a Gilded Line');
  assert.equal(SEAM.canDeclare(c), true); assert.equal(SEAM.setDeclare(c, true), true); assert.equal(c.seam.declare, 'gilded');
  const pv = seamPreview(c, card); assert.equal(pv.kind, 'extend'); assert.equal(pv.len, 3);
  assert.equal(SEAM.setDeclare(c, false), true); assert.equal(seamPreview(c, card).kind, 'cut', 'the declaration can be taken back before a card is played');
  SEAM.setDeclare(c, true);
  const m = mark(c); play(c, card);
  assert.equal(since(c, m, 'seamCut').length, 0); assert.equal(c.seam.len, 3); assert.deepEqual(c.seam.counts, { gilded: 3, ember: 1 }); assert.deepEqual(c.seam.set, ['ember', 'gilded']);
  assert.equal(c.seam.declare, null); assert.equal(c.seam.declared, true); assert.equal(SEAM.canDeclare(c), false); assert.equal(SEAM.setDeclare(c, true), false, 'once per turn');
  P(c, 'ember'); assert.equal(c.seam.len, 4, 'the declared card bridges to its own school');
  endTurn(c);
  assert.equal(SEAM.canDeclare(c), true, 'a new turn, a new declaration');
  // a card that is already Gilded, Frayed or Tempered does not spend it
  c.hand = []; SEAM.setDeclare(c, true);
  P(c, 'gilded'); assert.equal(c.seam.declare, 'gilded'); P(c, 'blood', { jam: true }); assert.equal(c.seam.declare, 'gilded'); P(c, 'blood', { fused: [GOF.blood] }); assert.equal(c.seam.declare, 'gilded');
  play(c, mk(c, 't_plain')); assert.equal(c.seam.declared, true, 'a card with no school becomes a Gilded knot'); assert.equal(c.seam.len, 2);
});
t('preview equals payout for cutting cards, Slip Knot, Granny Knot and declared cards (400 random plays)', () => {
  const c = fight({ hero: 'odile', passive: true, seed: 'parity' });
  c.run.hero = 'odile'; const heroOn = HEROES.odile.on; // keep the declaration, no other passive
  const rnd = (() => { let a = 4242; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const ids = ['t_ember', 't_blood', 't_gilded', 't_rust', 't_plain', ...CUT_CARDS];
  for (let step = 0; step < 400; step++) {
    if (step % 13 === 12) { endTurn(c); c.hand = []; c.energy = 99; }
    const o = {}; const r = rnd();
    if (r < 0.15) o.grafts = ['g_slip_knot']; else if (r < 0.3) o.grafts = ['g_granny_knot']; else if (r < 0.4) o.grafts = [GOF[SCH[Math.floor(rnd() * 7)]]]; else if (r < 0.45) o.grafts = OVL_EMBER;
    if (rnd() < 0.08) o.fused = [GOF.ember]; if (rnd() < 0.08) o.jam = true; if (rnd() < 0.3) o.up = true;
    const card = mk(c, ids[Math.floor(rnd() * ids.length)], o);
    if (rnd() < 0.35) SEAM.setDeclare(c, true);
    const snap = JSON.stringify(c.seam), pv = seamPreview(c, card);
    assert.equal(JSON.stringify(c.seam), snap, 'the preview is pure');
    const m = mark(c), len0 = c.seam.len;
    play(c, card);
    const tag = `step ${step} ${card.inst.id} ${JSON.stringify(o)} pv ${pv.kind}`;
    if (pv.kind === 'cut') { assert.deepEqual(pays(c, m), pvPays(pv), tag); assert.equal(c.seam.len, pv.len, tag); assert.ok(since(c, m, 'seamCut').length >= (len0 > 0 ? 1 : 0), tag); }
    else if (pv.kind === 'extend') { assert.equal(c.seam.len, pv.len, tag); assert.equal(since(c, m, 'seamPay').length, 0, tag); assert.equal(since(c, m, 'seamCut').filter((e) => e.kind === 'cut').length, 0, tag); }
    else { assert.equal(c.seam.len, len0, tag); assert.equal(since(c, m, 'seamPay').length, 0, tag); assert.deepEqual(pv.payout, [], tag); }
    assert.ok(c.seam.len === 0 || Object.keys(c.seam.counts).length > 0 || c.seam.set.length > 0, 'no Line without a school: ' + tag);
    c.player.hp = c.player.maxHp; for (const e of c.enemies) e.hp = e.maxHp;
    void heroOn;
  }
});

// ---------------------------------------------------------------- 3b. the declaration tab on the Thread rail (the real combat screen)
await ta('Odile gets a declaration tab on the rail: click, G, gamepad and touch arm it; Marrow has none; it overlaps nothing', async () => {
  const audio = await import('../graftwork/ui/audio.js');
  const combat = (await import('../graftwork/ui/combat.js')).default;
  const LR = await import('../graftwork/ui/layout_registry.js');
  const A11Y = await import('../graftwork/ui/a11y.js');
  const { click, key } = await import('./graftwork_lib.mjs');
  const normals = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal').map((e) => e.id);
  async function scene(hero, nEnemies, pscale = 0) {
    const run = RUN.newRun({ hero, seed: 'declare' + nEnemies });
    run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: normals.slice(0, nEnemies) };
    const app = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} }, meta: { settings: {}, tips: {} } });
    if (pscale) { app.scale = pscale; app.minPx = 11; app.mouse.touch = true; }
    const tips = []; const ot = app.tooltip; app.tooltip = (title, text, o) => { tips.push({ title, text }); return ot(title, text, o); };
    app.register('combat', combat); app.go('combat', { run });
    frames(app, 220);
    return { app, c: combat.api().state().c, tips, reg: () => LR.getAll().find((r) => r.id === 'seamDeclare') };
  }
  { const { reg, c } = await scene('marrow', 2); assert.equal(reg(), undefined, 'no tab for a hero who cannot declare'); assert.equal(c.seam.declare, null); }
  for (const n of [1, 3, 6]) {
    const { app, c, tips, reg } = await scene('odile', n);
    const r = reg(); assert.ok(r, 'the tab is in the layout registry'); assert.equal(r.layer, 'hud');
    assert.deepEqual(LR.findOverlaps().filter((o) => o.a === 'seamDeclare' || o.b === 'seamDeclare'), [], `the tab overlaps no HUD widget with ${n} enemies`);
    assert.ok(!LR.findOutOfBounds().includes('seamDeclare'));
    if (n !== 3) continue;
    assert.ok(combat.api().canAct, 'the fight is idle');
    click(app, r.x + r.w / 2, r.y + r.h / 2); frames(app, 4);
    assert.equal(c.seam.declare, 'gilded', 'a click arms it');
    assert.ok(tips.some((t) => /Declare Gilded/.test(t.title) && /Once per turn/.test(t.text) && /Key: G/.test(t.text)), 'hovering it explains it');
    key(app, 'g'); frames(app, 2); assert.equal(c.seam.declare, null, 'G takes it back');
    key(app, 'G'); frames(app, 2); assert.equal(c.seam.declare, 'gilded');
    // gamepad: the left trigger is G
    assert.equal(A11Y.PAD_MAP[6], 'g'); key(app, 'g'); assert.equal(c.seam.declare, null);
    const pad = { buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), axes: [0, 0] }; pad.buttons[6].pressed = true;
    assert.deepEqual(A11Y.padKeys(pad, {}), ['g']);
    // armed, the hand badges follow the engine: a card that is not Gilded now reads as Gilded for the Line
    key(app, 'g'); frames(app, 2);
    const hi = c.hand.findIndex((k) => !specOf(c, k).unplayable && SEAM.seamPreview(c, k).kind !== 'slack' && c.energy >= (specOf(c, k).cost | 0));
    assert.ok(hi >= 0); const uid = c.hand[hi].uid;
    playCard(c, hi, 0); frames(app, 60);
    assert.ok(c.seam.set.includes('gilded') && c.seam.declared && c.seam.declare === null, 'the played card spent it: ' + uid);
    key(app, 'g'); frames(app, 2); assert.equal(c.seam.declare, null, 'spent for the turn: G does nothing');
  }
  { // phone stage: the tap target is at least 40 css px, and a tap arms it without dropping the selected card
    const { app, c, reg } = await scene('odile', 2, 0.5417);
    const r = reg(), g = app.hitRect(r.x, r.y, r.w, r.h);
    assert.ok(g.w * app.scale >= 39.5 && g.h * app.scale >= 39.5, `tap target ${Math.round(g.w * app.scale)}x${Math.round(g.h * app.scale)} css px`);
    click(app, r.x + r.w / 2, r.y + r.h / 2); frames(app, 4);
    assert.equal(c.seam.declare, 'gilded', 'a tap arms it');
  }
});

// ---------------------------------------------------------------- 4. enemies that read your deck see every card and graft
await ta('The Grafter, the Locksmith and the card jammers read the real registries (Thread cards, Thread and school grafts)', async () => {
  const E3 = await import('../graftwork/data/enemies_3.js');
  const { CARDS_THREAD } = await import('../graftwork/data/cards_thread.js');
  const { GRAFTS_THREAD } = await import('../graftwork/data/grafts_thread.js');
  const { GRAFTS_EXTRA } = await import('../graftwork/data/grafts_extra.js');
  // no card or graft of the game is unknown to them
  for (const d of Object.values(CARDS)) if (d.type !== 'junk' && !/^t[a]?_/.test(d.id)) assert.ok(E3.costOf({ inst: { id: d.id, up: 0 } }) >= 0, 'costOf knows ' + d.id);
  assert.ok(CARDS_THREAD.length >= 20 && GRAFTS_THREAD.length + GRAFTS_EXTRA.length >= 51);
  const deckOf = (run, ids, grafts) => { run.deck = ids.map((id, i) => ({ uid: 100 + i, id, grafts: (grafts[i] || []).slice(), up: 0 })); run.uidNext = 200; };
  // The Grafter: four Blood grafts from the Thread set, on Thread cards
  const run = RUN.newRun({ hero: 'marrow', seed: 'grafter' });
  const blood = GRAFTS_THREAD.filter((g) => g.school === 'blood').map((g) => g.id); assert.ok(blood.length >= 3);
  deckOf(run, ['x_thread_shears', 'm_thread_bloodline', 'm_thread_stitchup', 'm_cut', 'm_dress'], [[blood[0]], [blood[1]], [blood[2]], [], []]);
  const c = newCombat(run, ['the_grafter'], { kind: 'final' }), g = c.enemies[0];
  assert.equal(g.data.count, 3); assert.equal(g.data.school, 'blood', 'it used to see no school in these grafts and splice the default'); assert.deepEqual(g.data.schools, { blood: 3 });
  assert.equal(g.data.weight, blood.slice(0, 3).reduce((a, id) => a + GRAFTS[id].weight, 0));
  assert.equal(g.data.bestName, "Tailor's Shears", 'your best attack may be a Thread card'); assert.equal(g.def.moves.mirror.name, "Your Tailor's Shears");
  // Locksmith: the biggest school of a deck built from Thread cards and school grafts
  const run2 = RUN.newRun({ hero: 'wick', seed: 'lock' });
  const stat = GRAFTS_EXTRA.filter((x) => x.school === 'static').map((x) => x.id); assert.ok(stat.length >= 2);
  deckOf(run2, ['w_thread_trail', 'w_thread_fusewire', 'w_thread_conflagration', 'w_spark', 'w_snuff'], [[], [], [], [stat[0]], [stat[1]]]);
  const c2 = newCombat(run2, ['locksmith']);
  assert.equal(c2.enemies[0].data.seal, 'ember', 'three Ember Thread cards outnumber two Static grafts');
  run2.deck[0].id = 'w_spark'; run2.deck[1].id = 'w_spark';
  const c3 = newCombat(run2, ['locksmith']);
  assert.equal(c3.enemies[0].data.seal, 'static', 'school grafts count');
});

// ---------------------------------------------------------------- 5. school resonance texts say what engine/resonance.js does
// Every number in the 14 texts is MEASURED here by driving the engine's hooks, and the text is rebuilt from the measurement.
// Change a number in resonance.js and this fails until data/schools.js says the same; change a text and it fails too.
await ta('the 14 resonance texts equal what the engine does (numbers measured, wording pinned)', async () => {
  const { RES_HOOKS, resonanceOf } = await import('../graftwork/engine/resonance.js');
  const { SCHOOLS } = await import('../graftwork/data/index.js');
  const at = (school, tier) => { const c = fight({ enemies: ['bedpan_slime', 'slime_bit'] }); c.res = { [school]: tier }; c.player.hp = 300; return c; };
  const st = (ent, s) => ent.st[s] || 0;
  const s1 = (n) => (n === 1 ? '' : 's');
  const M = {}; // measured: M[school][tier]
  const attack = (c, e) => RES_HOOKS.cardPlayed(c.A, { spec: { type: 'attack' }, target: e });
  M.ember = {}; for (const tier of [3, 6]) {
    const c = at('ember', tier), e = c.enemies[0]; RES_HOOKS.turnStart(c.A);
    attack(c, e); const first = st(e, 'burn'); attack(c, e); const second = st(e, 'burn') - first;
    RES_HOOKS.cardPlayed(c.A, { spec: { type: 'skill' }, target: e }); assert.equal(st(e, 'burn'), first + second, 'skills light nothing');
    RES_HOOKS.turnStart(c.A); attack(c, e); assert.equal(st(e, 'burn') - first - second, first, 'a new turn, the first Attack again');
    M.ember[tier] = { burn: first, every: second === first, firstOnly: second === 0 };
  }
  M.echo = {}; M.static = {}; M.gilded = {}; M.hoard = {}; M.blood = {}; M.rust = {};
  for (const tier of [3, 6]) {
    let c = at('echo', tier); const e0 = st(c.player, 'echo'); RES_HOOKS.combatStart(c.A); M.echo[tier] = { echo: st(c.player, 'echo') - e0 };
    c = at('static', tier); const c0 = st(c.player, 'charge'); RES_HOOKS.turnStart(c.A); M.static[tier] = { charge: st(c.player, 'charge') - c0 };
    c = at('gilded', tier); const g0 = c.run.gold; RES_HOOKS.combatEnd(c.A); M.gilded[tier] = { gold: c.run.gold - g0, gilt: st(c.player, 'gilt') };
    // hoard: cards drawn by the turn start hook on turn 1 and on turn 2, and the hand size (cards drawn every turn)
    c = at('hoard', tier); for (let i = 0; i < 12; i++) c.drawPile.push({ inst: newInst('t_plain', () => 'hd' + i + tier), uid: 'hd' + i + tier, tithed: false, jam: false, costMod: 0, plays: 0, rolled: true, temp: true });
    const hs = c.handSize; RES_HOOKS.combatStart(c.A); const size = c.handSize - hs;
    c.turn = 1; let h = c.hand.length; RES_HOOKS.turnStart(c.A); const t1 = c.hand.length - h;
    c.turn = 2; h = c.hand.length; RES_HOOKS.turnStart(c.A); const t2 = c.hand.length - h;
    M.hoard[tier] = { size, t1, t2 };
    // blood: four self hurts in one turn, then one more the next turn
    c = at('blood', tier); c.player.hp = 100; RES_HOOKS.turnStart(c.A);
    for (let i = 0; i < 5; i++) RES_HOOKS.selfHurt(c.A, { n: 1 });
    const heal = c.player.hp - 100, str = st(c.player, 'strength');
    RES_HOOKS.turnStart(c.A); RES_HOOKS.selfHurt(c.A, { n: 1 });
    M.blood[tier] = { heal, str, healAgain: c.player.hp - 100 - heal, strAgain: st(c.player, 'strength') - str };
    // rust: a junk card drawn, and two junk cards in hand at turn end
    c = at('rust', tier); const b0 = c.player.block; RES_HOOKS.junkDrawn(c.A, {}); const block = c.player.block - b0;
    mk(c, 'j_clot'); mk(c, 'j_clot'); mk(c, 't_plain'); const hp = c.enemies.map((e) => e.hp); RES_HOOKS.turnEnd(c.A);
    const lost = c.enemies.map((e, i) => hp[i] - e.hp); assert.equal(lost[0], lost[1], 'all enemies alike');
    M.rust[tier] = { block, perJunk: lost[0] / 2 };
  }
  const want = {
    ember: { 3: `Your first Attack each turn applies ${M.ember[3].burn} Burn.`, 6: `Every Attack applies ${M.ember[6].burn} Burn.` },
    echo: { 3: `Start each combat with ${M.echo[3].echo} Echo.`, 6: `Start each combat with ${M.echo[6].echo} Echo.` },
    hoard: { 3: `Draw ${M.hoard[3].t1} extra card${s1(M.hoard[3].t1)} on turn 1.`, 6: `Draw ${M.hoard[6].size} extra card${s1(M.hoard[6].size)} every turn.` },
    blood: { 3: `Heal ${M.blood[3].heal} when you lose HP to your own cards (once per turn).`, 6: `Gain 1 Strength when you lose HP to your own cards (max ${M.blood[6].str} per turn).` },
    rust: { 3: `Gain ${M.rust[3].block} Block whenever a junk card is drawn.`, 6: `Junk cards in hand deal ${M.rust[6].perJunk} damage to all enemies at turn end.` },
    static: { 3: `Gain ${M.static[3].charge} Charge at turn start.`, 6: `Gain ${M.static[6].charge} Charge at turn start.` },
    gilded: { 3: `Gain ${M.gilded[3].gold} gold after each combat.`, 6: `Gain ${M.gilded[6].gold} gold after each combat.` },
  };
  // the wording's shape is true too: first Attack only at 3, every Attack at 6; turn 1 only at 3; once and max per turn; no Gilt
  assert.ok(M.ember[3].firstOnly && M.ember[6].every); assert.ok(M.ember[3].burn > 0);
  assert.deepEqual([M.hoard[3].size, M.hoard[3].t2], [0, 0]); assert.equal(M.hoard[6].t2, 0, 'the extra card at 6 is hand size, not a second draw');
  assert.deepEqual([M.blood[3].str, M.blood[3].healAgain], [0, M.blood[3].heal]); assert.equal(M.blood[6].strAgain, 1);
  assert.deepEqual([M.rust[3].perJunk, M.gilded[3].gilt, M.gilded[6].gilt], [0, 0, 0]);
  const bad = [];
  for (const sch of SCH) for (const tier of [3, 6]) if (SCHOOLS[sch].resonance[tier] !== want[sch][tier]) bad.push(`${sch} ${tier}: text "${SCHOOLS[sch].resonance[tier]}" but the engine does "${want[sch][tier]}"`);
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(SCHOOLS).sort(), SCH.slice().sort()); for (const sch of SCH) assert.deepEqual(Object.keys(SCHOOLS[sch].resonance), ['3', '6']);
  // wired end to end: a real deck with six Gilded grafts is at tier 6 and is paid when the fight ends; six Hoard grafts draw one more card
  const deckWith = (school) => { const run = RUN.newRun({ hero: 'odile', seed: 'res-' + school }); const gs = Object.values(GRAFTS).filter((g) => g.school === school && g.tier === 'safe' && !g.mods.some((m) => m.k === 'junk' || m.k === 'maxHp')); let k = 0; for (const inst of run.deck) { if (k >= 6) break; const g = gs.find((x) => RUN.canGraft ? RUN.canGraft(inst, x.id) : true); if (g && cardSpec({ ...inst, grafts: [g.id] })) { inst.grafts = [g.id]; k++; } } assert.equal(resonanceOf(run).tiers[school], 6, school + ' deck reaches tier 6'); return run; };
  const { finishCombat } = await import('../graftwork/engine/combat.js');
  const rg = deckWith('gilded'), cg = newCombat(rg, ['bedpan_slime']); cg.over = 'win'; const gold = rg.gold; finishCombat(cg); assert.equal(rg.gold - gold - (cg.player.st.gilt || 0), M.gilded[6].gold);
  const plain = newCombat(RUN.newRun({ hero: 'odile', seed: 'res-hoard' }), ['bedpan_slime']), rh = deckWith('hoard'), ch = newCombat(rh, ['bedpan_slime']);
  assert.equal(ch.handSize - plain.handSize, M.hoard[6].size);
});

// ---------------------------------------------------------------- 6. Free Sample waives the whole Price, whatever kind it is
await ta('Free Sample: "The first graft Price you accept each act is waived" holds for every graft and every price kind', async () => {
  const CARDSJS = await import('../graftwork/engine/cards.js');
  const { afflStartTurn } = await import('../graftwork/engine/afflictions.js');
  assert.equal(typeof CARDSJS.isPriceMod, 'function', 'one exported definition of a Price');
  // every graft charges something the table knows: nothing hides its price where the waiver cannot reach
  for (const g of Object.values(GRAFTS)) assert.ok(g.mods.some(CARDSJS.isPriceMod), `${g.id} ("${g.price}") has no price mod the waiver can see`);
  for (const g of Object.values(GRAFTS)) assert.ok(g.mods.some((m) => !CARDSJS.isPriceMod(m)), g.id + ' keeps a boon');
  // a waived graft never leaves a price on the card: cost, Exhaust, Ethereal, lower numbers, play conditions, and the classic kinds
  CARDS.t_big = { id: 't_big', name: 'big', type: 'attack', cost: 2, rarity: 'common', school: 'blood', target: 'enemy', fx: [{ op: 'dmg', n: 10 }, { op: 'block', n: 5 }], flavor: 'x', flags: {} };
  const bare = cardSpec({ uid: 1, id: 't_big', grafts: [], up: 0 });
  for (const g of Object.values(GRAFTS)) {
    const paid = cardSpec({ uid: 1, id: 't_big', grafts: [g.id], up: 0 }), free = cardSpec({ uid: 1, id: 't_big', grafts: [g.id], up: 0, waived: [g.id] });
    const P = free.price;
    assert.deepEqual([P.selfHurt, P.jam, P.junk.length, P.selfStatus.length, P.drawdown, P.gold, P.maxHp], [0, 0, 0, 0, 0, 0, 0], g.id + ' price left: ' + JSON.stringify(P));
    assert.ok(free.cost <= bare.cost, g.id + ' still costs more'); assert.ok(free.pct >= 0, g.id + ' still lowers the numbers');
    for (const f of ['exhaust', 'ethereal', 'needsAttackPlayed']) assert.ok(!free.flags[f], `${g.id} still has ${f}`);
    assert.ok(free.custom.length <= paid.custom.length);
  }
  // prices that live in a hook: played once waived and once not
  const once = (gid, waived, prep) => {
    const c = fight({ seed: 'fs' + gid }); c.player.hp = 200; c.run.gold = 60; c.strain = { ...c.strain, strain: 3 };
    const card = mk(c, 't_big', { grafts: [gid] }); if (waived) card.inst.waived = [gid];
    c.hand.pop(); c.drawPile.push(card); c.A.draw(1); // drawn for real: Slow Tumor and Debt Note act on the draw
    if (prep) prep(c);
    const cost = c.hand.includes(card) ? (() => { const hi = c.hand.indexOf(card); return hi; })() : -1; assert.ok(cost >= 0);
    const en = c.energy; play(c, card);
    return { hp: 200 - c.player.hp, gold: 60 - c.run.gold, burn: c.player.st.burn || 0, spent: en - c.energy };
  };
  assert.deepEqual([once('g_ash_pact', false).burn, once('g_ash_pact', true).burn], [2, 0], 'Ash Pact: "Also gain 2 Burn yourself"');
  assert.deepEqual([once('g_vampire_teeth', false).hp, once('g_vampire_teeth', true).hp], [2, 0], 'Vampire Teeth: "Otherwise lose 2 HP"');
  assert.deepEqual([once('g_gold_lever', false).gold, once('g_gold_lever', true).gold], [5, 0], 'Gold Lever: "Spends 5 gold on play"');
  assert.deepEqual([once('g_slow_tumor', false).spent, once('g_slow_tumor', true).spent], [3, 2], 'Slow Tumor: "costs 1 more" each draw');
  assert.deepEqual([once('g_debt_note', false).hp, once('g_debt_note', true).hp], [2, 0], 'Debt Note: lose 1 HP per energy it would have cost');
  assert.deepEqual([once('g_fever_wick', false).hp, once('g_fever_wick', true).hp], [3, 0], 'Fever Wick: lose 1 HP per Strain (max 3)');
  assert.deepEqual([once('g_feverish_vein', false).hp, once('g_feverish_vein', true).hp], [3, 0], 'Feverish Vein: lose HP equal to your Strain');
  { const c = fight(); const card = mk(c, 't_big', { grafts: ['g_fuse_wire'] }); assert.equal(playCard(c, c.hand.indexOf(card), 0).why, 'needsAttack');
    card.inst.waived = ['g_fuse_wire']; assert.ok(playCard(c, c.hand.indexOf(card), 0).ok, 'Fuse Wire: the play condition is its Price'); }
  // the waived boons are all still there (Gold Lever: 60 gold is +10; Slow Tumor +8)
  { const dmgOf = (gid, waived) => { const c = fight({ seed: 'fsb' }); c.run.gold = 60; const card = mk(c, 't_big', { grafts: [gid] }); if (waived) card.inst.waived = [gid]; c.hand.pop(); c.drawPile.push(card); c.A.draw(1); const hp = c.enemies[0].hp; play(c, card); return hp - c.enemies[0].hp; };
    assert.equal(dmgOf('g_gold_lever', true), dmgOf('g_gold_lever', false)); assert.equal(dmgOf('g_gold_lever', true), 20); assert.equal(dmgOf('g_slow_tumor', true), 18); }
  // the run: the first graft of each act is free, max HP included; the second one pays
  const run = RUN.newRun({ hero: 'marrow', seed: 'sample' }); RUN.addRelic(run, 'r_free_sample');
  const atk = run.deck.filter((i) => CARDS[i.id].type === 'attack');
  const hp0 = run.maxHp, pv = RUN.previewPick(run, atk[0].uid, 'g_hoard_cache');
  assert.ok(pv.waived, 'the offer screen knows the Price will be waived'); assert.equal(pv.spec.cost, CARDS[atk[0].id].cost, 'and previews the card without it');
  assert.ok(RUN.applyGraft(run, atk[0].uid, 'g_hoard_cache', { keepPhase: true }).ok);
  assert.equal(run.maxHp, hp0, '"Lose 4 max HP when grafted" is waived (it was charged before the waiver was recorded)');
  assert.equal(cardSpec(atk[0]).cost, CARDS[atk[0].id].cost, '"Costs 1 more" is waived');
  assert.ok(!RUN.previewPick(run, atk[1].uid, 'g_hoard_cache').waived);
  RUN.applyGraft(run, atk[1].uid, 'g_hoard_cache', { keepPhase: true });
  assert.equal(run.maxHp, hp0 - 4); assert.equal(cardSpec(atk[1]).cost, CARDS[atk[1].id].cost + 1, 'the second graft of the act pays in full');
  run.act = 2; RUN.applyGraft(run, atk[2].uid, 'g_hoard_cache', { keepPhase: true }); assert.equal(run.maxHp, hp0 - 4, 'a new act, a new sample');
  // Numb is the mirror image and uses the same table: the boon goes, the whole Price stays (a hook price too)
  { const c = fight(); const card = mk(c, 't_big', { grafts: ['g_ash_pact'] }); c.player.st.numb = 1; afflStartTurn(c); play(c, card);
    assert.equal(c.player.st.burn, 2, 'Numb: "Their prices still bite"'); assert.equal(c.enemies[0].st.burn || 0, 0, 'and the boon is silent'); }
  delete CARDS.t_big;
});

// ---------------------------------------------------------------- 7. smaller drifts between a text and the rule
await ta('Ascension 8 says that graft offers cannot be rerolled; a locked hero shows one unlock rule, the real one', async () => {
  const { HERO_GATES } = await import('../graftwork/data/unlocks.js');
  // the engine closes rerolls from Ascension 8 (and the graft screen says "Locked (Ascension 8)"): the ascension list must say so too
  const firstLocked = [...Array(11).keys()].find((asc) => { const run = RUN.newRun({ hero: 'marrow', seed: 'asc' + asc, ascension: asc }); run.gold = 999; RUN.startGraftPick(run); return !RUN.rerollGraftOffer(run); });
  assert.equal(firstLocked, 8);
  for (let a = 0; a < RUN.ASCENSION_TEXT.length; a++) assert.equal(/reroll/i.test(RUN.ASCENSION_TEXT[a]), a === firstLocked, `ASCENSION_TEXT[${a}]: "${RUN.ASCENSION_TEXT[a]}"`);
  assert.ok(/Shatter chance is 10% higher/.test(RUN.ASCENSION_TEXT[8]), 'and it still names its Shatter rule');
  // heroes: the unlock rule lives in HERO_GATES only (the hero file carried an older, different sentence)
  const m = META.defaultMeta();
  for (const h of Object.values(HEROES)) {
    if (!h.unlock) { assert.ok(!HERO_GATES[h.id]); continue; }
    assert.ok(HERO_GATES[h.id], h.id + ' has a gate'); assert.notEqual(typeof h.unlock, 'object', h.id + ' carries no second copy of the rule');
    assert.ok(META.heroHint(m, h.id).startsWith(HERO_GATES[h.id].text));
  }
});

// ---------------------------------------------------------------- 8. the balance bot plays the fixed rules
await ta('the strong bot declares Gilded with Odile and cuts with Snip (the sims measure the real rules)', async () => {
  const { POLICIES } = await import('../tools/graftwork_sim.mjs');
  const { strongFight } = await import('../tools/graftwork_strong.mjs');
  const seen = { declared: 0, turns: 0, snipCuts: [] };
  RELICS.r_test_spy = { id: 'r_test_spy', name: 'x', rarity: 'common', text: 'x', on: {
    turnEnd: (A) => { seen.turns++; if (A.c.seam.declared) seen.declared++; },
    seamCut: (A, i) => { const k = A.c.currentCard; if (k && k.inst.id === 'x_thread_snip') seen.snipCuts.push(i.len); },
  } };
  try {
    for (const seed of ['bot-a', 'bot-b', 'bot-c']) {
      const run = RUN.newRun({ hero: 'odile', seed }); run.relics.push('r_test_spy');
      run.deck.push({ uid: run.uidNext++, id: 'x_thread_snip', grafts: [], up: 0 }, { uid: run.uidNext++, id: 'x_thread_snip', grafts: [], up: 0 });
      run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime', 'orderly'] };
      const r = strongFight(run, POLICIES.strong); assert.ok(r.res.turns > 0);
    }
    assert.ok(seen.turns >= 6); assert.ok(seen.declared >= 3, `the bot declared on ${seen.declared} of ${seen.turns} turns`);
    assert.ok(seen.snipCuts.length >= 1, 'Snip cut a paying Line at least once'); assert.ok(seen.snipCuts.every((len) => len >= 2));
  } finally { delete RELICS.r_test_spy; }
});

// ================================================================ Rules leftovers (CLEANUP_PLAN.md, "Rules leftovers")
// ---------------------------------------------------------------- 9. a cut past the turn's 3 paying cuts pays nothing, and says so to the hooks
t('the seamCut payload carries paid: false for a cut past the 3 paying cuts of a turn, and for nothing else', () => {
  const seen = [];
  RELICS.r_test_paid = { id: 'r_test_paid', name: 'x', rarity: 'common', text: 'x', on: { seamCut: (A, i) => seen.push([i.kind, i.paid, i.stitches]) } };
  const def = ENEMIES.bedpan_slime, old = def.on;
  try {
    const c = fight({ relics: ['r_test_paid'] }), m = mark(c);
    for (let k = 0; k < SEAM_CUTS_TURN + 3; k++) lineOf(c, k % 2 ? 'ember' : 'blood', 2); // six Lines, each cuts the one before it: 5 cuts
    assert.equal(c.seam.cuts, SEAM_CUTS_TURN, 'only the paying cuts are counted');
    P(c, 'ember'); const mEnd = mark(c); endTurn(c); // a Line of 3 is left standing: the turn end cashes it, and that is not a cut
    assert.equal(since(c, mEnd, 'seamPay').length, 1, 'the turn end paid it'); assert.equal(since(c, mEnd, 'seamCut')[0].kind, 'end');
    assert.deepEqual(seen, [['cut', true, 1], ['cut', true, 1], ['cut', true, 1], ['cut', false, 0], ['cut', false, 0]], 'a cut hook hears the cuts, not the turn end');
    const cuts = since(c, m, 'seamCut').filter((e) => e.kind === 'cut');
    assert.deepEqual(cuts.map((e) => [e.paid, !!e.capped]), [[1, false], [1, false], [1, false], [0, true], [0, true]], 'the event log marks the same cuts');
    assert.ok(cuts.slice(0, 3).every((e) => !('capped' in e)), 'a paying cut logs the event it always did');
    // an enemy that voids a payout is not the cap: the cut was a paying cut, the hook decided otherwise afterwards
    seen.length = 0; c.hand = []; def.on = { ...(old || {}), seamCut: (A, e, i) => { i.cancel = true; } };
    lineOf(c, 'rust', 3); const m2 = mark(c); P(c, 'gilded');
    assert.deepEqual(seen, [['cut', true, 2]]); assert.equal(since(c, m2, 'seamPay').length, 0);
  } finally { def.on = old; delete RELICS.r_test_paid; }
});
// One cut of a Blood Line of 4 knots that also holds Rust (3 stitches, Blood heals 6), as a paying cut and as a cut past the cap.
// The cutting card has no effect of its own, so everything measured comes from the cut. The cap is set by hand at the start of
// the turn: in play a capped cut is never the first cut of a turn, and the "first cut" relics must not fire on one either.
function oneCut(o, capped) {
  const c = fight(o); c.player.hp = 300;
  P(c, 'blood'); P(c, 'blood', { grafts: [GOF.rust] }); P(c, 'blood'); P(c, 'blood');
  if (capped) c.seam.cuts = SEAM_CUTS_TURN;
  const card = mk(c, 't_ember'), e = c.enemies[0], b = { hp: c.player.hp, block: c.player.block, ehp: e.hp, hand: c.hand.length - 1 }, m = mark(c);
  play(c, card);
  return { heal: c.player.hp - b.hp, block: c.player.block - b.block, dmg: b.ehp - e.hp, vuln: e.st.vulnerable || 0, drawn: c.hand.length - b.hand, stitches: pays(c, m).reduce((a, p) => a + p[1], 0), c };
}
const NOTHING = { heal: 0, block: 0, dmg: 0, vuln: 0, drawn: 0, stitches: 0 };
const PAID_ONLY = { // what each "paid only" hook adds to a paying cut of that Line (the Line itself heals 6)
  marrow: { heal: 9 }, r_spool: { drawn: 1 }, r_bobbin: { drawn: 1 }, r_seam_ripper: { dmg: 6 }, r_pin_cushion: { vuln: 2 },
  r_blunt_shears: { dmg: 6 }, r_tapestry_frame: { block: 12 }, r_second_colour: { block: 6 },
};
t('relic and hero cut hooks: a paying cut triggers every one of them, a cut past the cap triggers none', () => {
  const pick = (r) => { const { c, ...rest } = r; void c; return rest; };
  assert.deepEqual(pick(oneCut({}, false)), { ...NOTHING, heal: 6, stitches: 3 }, 'the bare cut: 3 Blood stitches');
  assert.deepEqual(pick(oneCut({}, true)), NOTHING, 'past the cap the Line pays nothing');
  // every relic and hero that listens to seamCut is in the table (the test relics of this file aside)
  const listeners = [...Object.values(RELICS).filter((r) => r.on && r.on.seamCut).map((r) => r.id), ...Object.values(HEROES).filter((h) => h.on && h.on.seamCut).map((h) => h.id)];
  assert.deepEqual(listeners.filter((id) => !/^r_test_/.test(id)).sort(), Object.keys(PAID_ONLY).sort());
  for (const [id, gain] of Object.entries(PAID_ONLY)) {
    const o = id === 'marrow' ? { hero: 'marrow', passive: true } : { relics: [id] };
    assert.deepEqual(pick(oneCut(o, false)), { ...NOTHING, heal: 6, stitches: 3, ...gain }, id + ' on a paying cut');
    const cap = oneCut(o, true);
    assert.deepEqual(pick(cap), NOTHING, id + ' on a cut past the cap');
    if (id === 'r_blunt_shears') assert.ok(!cap.c.rx || !cap.c.rx.bluntShears, 'an unpaid cut does not use up the first cut of the combat');
  }
  // a real turn: three small paying cuts, then the Line of 4 as the fourth cut, with the hooks that could still fire on it
  const c = fight({ hero: 'marrow', passive: true, relics: ['r_spool', 'r_seam_ripper', 'r_pin_cushion', 'r_second_colour'] }); c.player.hp = 300;
  for (let k = 0; k < SEAM_CUTS_TURN + 1; k++) lineOf(c, k % 2 ? 'ember' : 'gilded', 2);
  assert.equal(c.seam.cuts, SEAM_CUTS_TURN); c.hand = [];
  P(c, 'blood'); P(c, 'blood', { grafts: [GOF.rust] }); P(c, 'blood'); P(c, 'blood'); // the first Blood card made the 4th cut, this Line is the 5th
  const e = c.enemies[0], b = { hp: c.player.hp, block: c.player.block, ehp: e.hp, vuln: e.st.vulnerable || 0 }, m = mark(c);
  P(c, 'ember');
  assert.equal(since(c, m, 'seamCut')[0].capped, true); assert.equal(c.hand.length, 0, 'Spool draws nothing');
  assert.deepEqual([c.player.hp - b.hp, c.player.block - b.block, b.ehp - e.hp, (e.st.vulnerable || 0) - b.vuln], [0, 0, 0, 0]);
});
t('grafts that react to their own cut: "per stitch" needs a paying cut, "when it cuts the Line" does not', () => {
  const run1 = (gid, capped) => { const c = fight(); lineOf(c, 'blood', 3); if (capped) c.seam.cuts = SEAM_CUTS_TURN; const gold = c.run.gold, hp = c.enemies[0].hp; play(c, mk(c, 'ta_rust', { grafts: [gid] })); return { c, gold: c.run.gold - gold, dmg: hp - c.enemies[0].hp }; };
  assert.deepEqual([run1('g_surgeons_knot', false).gold, run1('g_surgeons_knot', true).gold], [8 - 1, -1], "Surgeon's Knot: 4 gold per stitch, and no stitch past the cap (its 1 gold cost stays)");
  assert.deepEqual([run1('g_surge_loop', false).c.player.st.charge, run1('g_surge_loop', true).c.player.st.charge || 0], [2, 0], 'Surge Loop: 1 Charge per stitch');
  // the card still cut the Line: the grafts that count knots, or only ask for the cut, fire as before
  assert.equal(run1('g_scissor_loop', true).dmg, 1 + 9, 'Scissor Loop: 3 damage per knot of the Line it cut');
  assert.equal(run1('g_reef_knot', true).c.player.st.echo, 1, 'Reef Knot: 1 Echo when it cuts');
  assert.equal(run1('g_spent_thread', true).c.seam.len, 2, 'Spent Thread: the new Line starts at 2 knots');
});

// ---------------------------------------------------------------- 10. Resonance Lens: a school at 3 fights at the top tier in Elite and Boss fights
// k grafts of one school, one per card, on a fresh deck (safe grafts without a junk or max HP price: nothing else changes)
function schoolDeck(school, k, relics = []) {
  const run = RUN.newRun({ hero: 'marrow', seed: 'lens-' + school + k }); run.relics = relics.slice();
  const gs = Object.values(GRAFTS).filter((g) => g.school === school && !g.mods.some((m) => m.k === 'junk' || m.k === 'maxHp'));
  let done = 0;
  for (const inst of run.deck) { if (done >= k) break; const g = gs.find((x) => canGraft(inst, x.id)); if (g) { inst.grafts = [g.id]; done++; } }
  assert.equal(done, k, `${k} ${school} grafts placed`);
  return run;
}
await ta('Resonance Lens: in Elite and Boss fights a school at 3 grafts counts as 6; no effect in a normal fight, outside a fight, or below 3', async () => {
  const { resonanceOf, RES_HOOKS } = await import('../graftwork/engine/resonance.js');
  const { finishCombat } = await import('../graftwork/engine/combat.js');
  const LENS = RELICS.r_resonance_lens, BIG = ['elite', 'boss', 'final'];
  assert.equal(LENS.text, 'In Elite and Boss fights, each school at Resonance 3 counts as Resonance 6.');
  assert.ok(LENS.mod && LENS.mod.resLens > 0 && !LENS.on, 'the relic only switches the rule on: the tier is decided in resonanceOf, nowhere else');
  // the tier table, as the rule decides it and as a fight gets it
  for (const lens of [false, true]) for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const run = schoolDeck('echo', k, lens ? ['r_resonance_lens'] : []);
    for (const kind of [undefined, 'normal', ...BIG]) {
      const want = k >= 6 ? 6 : k < 3 ? 0 : lens && BIG.includes(kind) ? 6 : 3, tag = `echo ${k} grafts, ${kind || 'no fight'}, ${lens ? 'Lens' : 'no Lens'}`;
      const got = resonanceOf(run, kind); assert.equal(got.tiers.echo || 0, want, tag); assert.equal(got.counts.echo || 0, k, 'the count is never changed: ' + tag);
      if (kind) assert.equal(newCombat(schoolDeck('echo', k, lens ? ['r_resonance_lens'] : []), ['bedpan_slime'], { kind }).res.echo || 0, want, 'in the fight: ' + tag);
    }
  }
  // the tier 6 effects themselves, at 3 grafts: with the Lens in a big fight, against the same deck without it and in a normal fight
  const start = (school, kind, lens, k = 3) => newCombat(schoolDeck(school, k, lens ? ['r_resonance_lens'] : []), ['bedpan_slime'], { kind });
  const cutEmber = (c) => { c.hand = []; c.energy = 99; lineOf(c, 'ember', 3); const m = mark(c); P(c, 'blood'); return pays(c, m); };
  for (const kind of ['normal', ...BIG]) for (const lens of [false, true]) {
    const top = lens && kind !== 'normal', tag = `${kind}, ${lens ? 'Lens' : 'no Lens'}`;
    assert.equal(start('echo', kind, lens).player.st.echo, top ? 2 : 1, 'Echo at combat start: ' + tag);
    assert.equal(start('static', kind, lens).player.st.charge, top ? 2 : 1, 'Charge at turn start: ' + tag);
    assert.equal(start('hoard', kind, lens).handSize - start('hoard', kind, lens, 0).handSize, top ? 1 : 0, 'Hoard hand size: ' + tag);
    const g = start('gilded', kind, lens); g.over = 'win'; const gold = g.run.gold; finishCombat(g);
    assert.equal(g.run.gold - gold - (g.player.st.gilt || 0), top ? 20 : 10, 'Gilded gold after the fight: ' + tag);
    const e = start('ember', kind, lens), foe = e.enemies[0]; foe.hp = foe.maxHp = 9999; foe.st.burn = 0;
    RES_HOOKS.turnStart(e.A); for (let i = 0; i < 2; i++) RES_HOOKS.cardPlayed(e.A, { spec: { type: 'attack' }, target: foe });
    assert.equal(foe.st.burn, top ? 4 : 2, 'Ember: every Attack lights Burn at the top tier, only the first one at 3: ' + tag);
    assert.deepEqual(cutEmber(start('ember', kind, lens)), [['ember', top ? 6 : 3]], 'the Thread: a Line of 3 pays (2 + 1) stitches, twice at the top tier: ' + tag);
  }
  // a school below 3 gets nothing from the Lens, a school at 6 nothing more
  const low = start('echo', 'boss', true, 2); assert.equal(low.player.st.echo || 0, 0); assert.deepEqual(cutEmber(start('ember', 'boss', true, 2)), [['ember', 2]]);
  assert.equal(start('echo', 'boss', true, 6).player.st.echo, 2); assert.deepEqual(cutEmber(start('ember', 'boss', true, 6)), [['ember', 6]]);
  // the deck view, opened in the fight, shows the tier the fight uses (and the plain one on the map)
  const deckview = (await import('../graftwork/ui/deckview.js')).default;
  const { SCHOOLS } = await import('../graftwork/data/index.js');
  const shown = async (phase, fightKind) => {
    const run = schoolDeck('echo', 3, ['r_resonance_lens']); run.phase = phase; if (fightKind) run.pending = { kind: 'combat', fightKind, enemies: ['bedpan_slime'] };
    const app = await makeApp({ run, meta: { settings: {} }, audio: { sfx() {}, music() {} } });
    const said = []; const raw = app.text; app.text = (str, x, y, o) => { said.push(String(str)); return raw(str, x, y, o); };
    app.shared.flow = { route() {}, openDeck() {} }; app.register('deckview', deckview); app.register('base', { draw() {} }); app.go('base');
    app.push('deckview', { run }); frames(app, 20);
    let tip = ''; // the tooltip of the Echo column
    for (let x = 40; x < 1260 && !tip; x += 30) { app.mouse.x = x; app.mouse.y = 680; frames(app, 30); if (app.tip && String(app.tip.title).startsWith('Echo:')) tip = app.tip.text; }
    return { said, tip };
  };
  const [r3, r6] = [SCHOOLS.echo.resonance[3], SCHOOLS.echo.resonance[6]], LIFT = 'Counts as 6 grafts in this fight.';
  let v = await shown('combat', 'boss'); assert.ok(v.said.includes(r6) && !v.said.includes(r3), 'in a Boss fight the strip reads the tier 6 text'); assert.ok(v.tip.startsWith(LIFT), 'and its tooltip says why: ' + v.tip);
  v = await shown('combat', 'normal'); assert.ok(v.said.includes(r3) && !v.said.includes(r6), 'in a normal fight the tier 3 text'); assert.ok(v.tip && !v.tip.includes(LIFT));
  v = await shown('ward'); assert.ok(v.said.includes(r3) && !v.said.includes(r6), 'outside a fight the tier 3 text'); assert.ok(v.tip && !v.tip.includes(LIFT));
});

// ---------------------------------------------------------------- 11. the Thread half of resonance is written where the rest of it is
// Measured like the 14 school texts: the stitches a Line pays at tier 0, 3 and 6, for every school, as the top school and as the
// second one, on a cut and at the turn end. The texts are rebuilt from the measurement, then looked for on every surface.
await ta('the Thread half of resonance (tier 3 adds a stitch, tier 6 doubles the cut) equals the engine and is on every resonance surface', async () => {
  const { RESONANCE_THREAD, resonanceText } = await import('../graftwork/data/schools.js');
  const { SCHOOLS } = await import('../graftwork/data/index.js');
  const { KEYWORDS, glossaryFor, tipSections } = await import('../graftwork/ui/tooltips.js');
  const other = (sch) => SCH[(SCH.indexOf(sch) + 1) % SCH.length], third = (sch) => SCH[(SCH.indexOf(sch) + 2) % SCH.length];
  const stitchesOf = (sch, tier, how) => { // a Line of 4 knots (3 stitches): four of `sch`, two of them also `other`
    const c = fight(); c.res = { [sch]: tier };
    const o = other(sch), top = how === 'second' ? o : sch, sec = how === 'second' ? sch : o;
    P(c, top); P(c, top, { grafts: [GOF[sec]] }); P(c, top, { grafts: [GOF[sec]] }); P(c, top);
    const m = mark(c);
    if (how === 'end') endTurn(c); else P(c, third(sch));
    return Object.fromEntries(pays(c, m))[sch] || 0;
  };
  const extra = new Set(), mul = new Set();
  for (const sch of SCH) {
    const top = [0, 3, 6].map((tier) => stitchesOf(sch, tier, 'top')), sec = [0, 3, 6].map((tier) => stitchesOf(sch, tier, 'second')), end = [0, 3, 6].map((tier) => stitchesOf(sch, tier, 'end'));
    assert.deepEqual([top[0], sec[0], end[0]], [3, 1, 2], sch + ': a Line of 4 pays 3 stitches, half to a second school, one less at the turn end');
    extra.add(top[1] - top[0]); extra.add(sec[1] - sec[0]); extra.add(end[1] - end[0]); // tier 3: on a cut, as the second school, at the turn end
    mul.add(top[2] / top[1]); // tier 6: the cut of a Line whose top school it is
    assert.equal(end[2], end[1], sch + ': the turn end is not a cut, tier 6 doubles nothing there');
    assert.equal(sec[2], sec[1], sch + ': a cut is doubled by its top school only');
  }
  assert.deepEqual([[...extra], [...mul]], [[1], [2]], 'one rule for all seven schools');
  const [k] = [...extra], times = { 2: 'double' }[[...mul][0]];
  assert.deepEqual(RESONANCE_THREAD, {
    3: `Its Thread payout gains ${k} Stitch${k === 1 ? '' : 'es'}.`, 6: `Its cuts pay ${times}.`,
    rule: `Thread: at 3 the school's payout gains ${k} Stitch${k === 1 ? '' : 'es'}, at 6 its cuts pay ${times}.`,
  });
  for (const sch of SCH) for (const tier of [3, 6]) assert.equal(resonanceText(SCHOOLS[sch], tier), `${SCHOOLS[sch].resonance[tier]} ${RESONANCE_THREAD[tier]}`);
  // 1. the keyword (the hover tip and the glossary of every text that says Resonance, the Resonance Lens among them)
  assert.ok(KEYWORDS.Resonance.text.endsWith(RESONANCE_THREAD.rule)); assert.ok(KEYWORDS.Resonance.text.length <= 120, 'still one short definition');
  assert.ok(glossaryFor(RELICS.r_resonance_lens.text, { max: 9 }).some((g) => g.term === 'Resonance' && g.definition.includes(RESONANCE_THREAD.rule)));
  // 2. the Codex: the rule sheet and the Schools tab
  const codex = (await import('../graftwork/ui/codex.js')).default, { CODEX_RULES } = await import('../graftwork/ui/codex.js');
  assert.ok(CODEX_RULES.find((r) => r[0] === 'Schools and Resonance')[1].endsWith(RESONANCE_THREAD.rule));
  const deckview = (await import('../graftwork/ui/deckview.js')).default, graft = (await import('../graftwork/ui/graft.js')).default;
  const LR = await import('../graftwork/ui/layout_registry.js');
  const { resonanceInfo } = await import('../graftwork/ui/graft_parts.js');
  const boot = async (run, name, mod, params = {}) => {
    const app = await makeApp({ run, meta: META.defaultMeta(), audio: { sfx() {}, music() {} } });
    const said = []; const raw = app.text; app.text = (str, x, y, o) => { said.push(String(str)); return raw(str, x, y, o); };
    app.shared.flow = { app, RUN, META, route() {}, toTitle() {}, openDeck() {}, openCodex() {}, openArchive() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, start() {} };
    app.register(name, mod); app.register('deckview', deckview); app.register('base', { draw() {} }); app.go('base');
    if (params.go) app.go(name, { run }); else app.push(name, { run, ...params });
    frames(app, 40);
    return { app, said };
  };
  const tipText = (app) => (app.tip ? [app.tip.title, app.tip.text, ...(app.tip.lines || []), ...tipSections(app.tip).flat().map((x) => `${x.title} ${x.text}`)].join('\n') : '');
  { const { app, said } = await boot(schoolDeck('ember', 3), 'codex', codex);
    codex.setTab(5); said.length = 0; frames(app, 10);
    assert.ok(said.some((x) => x.endsWith(RESONANCE_THREAD.rule) && /every school/i.test(x)), 'the Schools tab says it once, for every school'); }
  // 3. the school panels: the deck view strip (its tooltip holds the full text of both tiers) and the graft screen
  { const { app } = await boot(schoolDeck('ember', 3), 'deckview', deckview);
    let seen = 0;
    for (let x = 40; x < 1260; x += 30) {
      app.mouse.x = x; app.mouse.y = 680; frames(app, 30);
      const tt = tipText(app), sch = SCH.find((id) => tt.startsWith(SCHOOLS[id].name + ':')); if (!sch) continue;
      assert.ok(tt.includes('3 grafts: ' + resonanceText(SCHOOLS[sch], 3)) && tt.includes('6 grafts: ' + resonanceText(SCHOOLS[sch], 6)), sch + ' strip tip:\n' + tt); seen++;
    }
    assert.ok(seen >= 7, 'every school column of the strip was hovered: ' + seen); }
  // the patch tip a phone shows instead of that panel keeps the school's own line: with four patches there is no room for more
  for (const [n, next] of [[0, 3], [2, 3], [3, 6], [5, 6]]) assert.ok(resonanceInfo(null, 'rust', { rust: n }).lines.includes(`At ${next}: ${SCHOOLS.rust.resonance[next]}`));
  { const run = schoolDeck('gilded', 2); RUN.startGraftPick(run); run.pending.offer.grafts[0] = GOF.gilded;
    const { app, said } = await boot(run, 'graft', graft, { go: true }); frames(app, 80);
    const r = LR.getAll().find((q) => q.id === 'graft-patch0'); app.mouse.x = r.x + r.w / 2; app.mouse.y = r.y + r.h / 2; said.length = 0; frames(app, 30);
    const panel = said.join(' ').replace(/\s+/g, ' ');
    assert.ok(panel.includes(RESONANCE_THREAD[3]), 'the school panel of the graft screen names the Thread half of the next step:\n' + panel); }
});

// ---------------------------------------------------------------- 12. a waived Price reads as waived wherever a card lists its grafts
// Free Sample leaves the Price off the card's own text (section 6). The graft's Boon / Price block, which every screen prints
// from the graft itself, went on saying "Price: ...". Checked at desktop size and on the phone stage, with the longest Price.
await ta('a waived Price is labelled Waived on the card that carries the graft (combat tip, deck view, strip and reforge), and it fits a phone', async () => {
  const { priceOnCard, priceLines } = await import('../graftwork/engine/text.js');
  const SHOP = await import('../graftwork/ui/shop.js');
  const audio = await import('../graftwork/ui/audio.js');
  const combat = (await import('../graftwork/ui/combat.js')).default, deckview = (await import('../graftwork/ui/deckview.js')).default;
  const LR = await import('../graftwork/ui/layout_registry.js');
  const GID = Object.values(GRAFTS).reduce((a, g) => (g.price.length > a.price.length ? g : a)).id, G = GRAFTS[GID]; // the longest Price in the game
  // the spec knows, and the card's own Price block is gone
  const one = (waived) => { const run = RUN.newRun({ hero: 'marrow', seed: 'waive' }); const inst = run.deck.find((i) => canGraft(i, GID)); inst.grafts = [GID]; if (waived) inst.waived = [GID]; return { run, inst }; };
  const sw = cardSpec(one(true).inst), sp = cardSpec(one(false).inst);
  assert.deepEqual([sw.waived, sp.waived], [[GID], []]); assert.ok(priceLines(sp).length > 0 && priceLines(sw).length === 0);
  assert.deepEqual(priceOnCard(sw, GID), { waived: true, label: 'Waived', text: G.price }); assert.deepEqual(priceOnCard(sp, GID), { waived: false, label: 'Price', text: G.price });
  // the real path: Free Sample waives the first graft of the act and only that one
  { const run = RUN.newRun({ hero: 'marrow', seed: 'waive2' }); RUN.addRelic(run, 'r_free_sample');
    const [a, b] = run.deck.filter((i) => canGraft(i, GID));
    RUN.applyGraft(run, a.uid, GID, { keepPhase: true }); RUN.applyGraft(run, b.uid, GID, { keepPhase: true });
    assert.deepEqual([priceOnCard(cardSpec(a), GID).label, priceOnCard(cardSpec(b), GID).label], ['Waived', 'Price']); }
  assert.equal(SHOP.stripFrees(one(true).inst, GID, 'Frees you of'), 'Its Price was waived.'); assert.equal(SHOP.stripFrees(one(false).inst, GID, 'Frees you of'), 'Frees you of: ' + G.price);
  const boot = async (run, scale) => {
    const app = await makeApp({ run, audio, meta: { settings: { tips: false }, tips: {} } });
    if (scale < 1) { app.scale = scale; app.minPx = 11; }
    app.ctx.measureText = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(String(app.ctx.font || '')); const sz = m ? +m[1] : 16; return { width: String(t).length * sz * (/bold/.test(String(app.ctx.font || '')) ? 0.56 : 0.52) }; }; // proportional, as in the layout suite
    const said = []; const raw = app.text; app.text = (str, x, y, o = {}) => { said.push({ s: String(str), cut: !!o.fit && app.layoutText(String(str), o).trunc }); return raw(str, x, y, o); };
    app.shared.flow = { RUN, route() {}, openDeck() {}, openSettings() {} };
    return { app, said };
  };
  const strs = (said) => said.map((x) => x.s);
  for (const scale of [1, 0.54]) for (const waived of [true, false]) {
    const want = `${waived ? 'Waived' : 'Price'}: ${G.price}`, not = `${waived ? 'Price' : 'Waived'}: ${G.price}`, tag = `${waived ? 'waived' : 'due'} @${scale}`;
    { // combat: the tip of the hand card
      const { run, inst } = one(waived); run.deck = run.deck.filter((i) => i === inst || run.deck.indexOf(i) < 2); // three cards (and the junk of an unwaived Price): the card is in the opening hand
      run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime'] };
      const { app } = await boot(run, scale); app.register('combat', combat); app.go('combat', { run }); frames(app, 220);
      let tip = '';
      for (const r of LR.getAll().filter((q) => /^hand_/.test(q.id))) {
        app.mouse.x = r.x + r.w / 2; app.mouse.y = r.y + Math.min(r.h / 2, 60); frames(app, 40);
        const L = app.tipLayout; if (!L || L.frame !== app.frame) continue;
        const txt = L.panels.flatMap((p) => p.secs).map((x) => `${x.title}\n${x.text}`).join('\n'); if (!txt.includes(G.name)) continue;
        tip = txt; assert.ok(L.rect.x >= 5.5 && L.rect.y >= 5.5 && L.rect.x + L.rect.w <= 1274.5 && L.rect.y + L.rect.h <= 714.5, 'the tip stays on the stage: ' + tag);
      }
      assert.ok(tip.includes(want) && !tip.includes(not) && tip.includes('Boon: ' + G.boon), `combat tip, ${tag}:\n${tip}`);
    }
    { // deck view: the side panel of the hovered card
      const { run, inst } = one(waived); run.deck = [inst];
      const { app, said } = await boot(run, scale); app.register('deckview', deckview); app.register('base', { draw() {} }); app.go('base'); app.push('deckview', { run }); frames(app, 40);
      let panel = null;
      for (let gy = 180; gy < 520 && !panel; gy += 40) for (let gx = 40; gx < 500 && !panel; gx += 40) { app.mouse.x = gx; app.mouse.y = gy; said.length = 0; frames(app, 3); if (strs(said).includes(G.price)) panel = said.slice(); }
      assert.ok(panel, 'the card was hovered: ' + tag);
      assert.ok(strs(panel).includes(waived ? 'Waived' : 'Price') && !strs(panel).includes(waived ? 'Price' : 'Waived'), `deck view label, ${tag}`);
      // Tempered for good: the fused graft keeps its waiver and says so in its one line
      inst.fused = [GID]; inst.grafts = []; said.length = 0; frames(app, 3);
      assert.ok(strs(said).includes(`${G.boon} ${want}`), `deck view, tempered, ${tag}`);
    }
    { // the graft choice of Strip and Reforge (Forge and Dispensary share it)
      const { run, inst } = one(waived), st = {};
      SHOP.openGraftChoice(st, { title: 'Strip which graft?', inst, info: (gid) => SHOP.infoFromDeck(run, SHOP.stripDeck(run, inst.uid, gid), [{ t: SHOP.stripFrees(inst, gid, 'Frees you of'), c: '#8fd18f' }]) });
      const { app, said } = await boot(run, scale); app.register('m', { draw(a) { SHOP.drawModal(a, st, run); } }); app.go('m');
      app.mouse.x = 700; app.mouse.y = 180; frames(app, 30);
      const line = said.filter((x) => x.s === want);
      assert.ok(line.length > 0 && !strs(said).includes(not), `strip modal, ${tag}: ` + strs(said).filter((x) => /Price|Waived/.test(x)).join(' | '));
      assert.ok(line.every((x) => !x.cut), `the line is not cut short, ${tag}`);
      assert.ok(strs(said).join(' ').replace(/\s+/g, ' ').includes(waived ? 'Its Price was waived.' : 'Frees you of: ' + G.price), `strip note (the info panel wraps it), ${tag}`);
    }
  }
});

// ================================================================ Rules follow-ups (CLEANUP_PLAN.md, "Rules follow-ups")
// ---------------------------------------------------------------- 13. a waived Price stays waived under Numb
await ta('Numb keeps every Price except the one Free Sample waived (the muted copy of a graft is looked up under its own id)', async () => {
  const { afflStartTurn } = await import('../graftwork/engine/afflictions.js');
  const { priceOnCard } = await import('../graftwork/engine/text.js');
  CARDS.t_big = { id: 't_big', name: 'big', type: 'attack', cost: 2, rarity: 'common', school: 'blood', target: 'enemy', fx: [{ op: 'dmg', n: 10 }], flavor: 'x', flags: {} };
  try {
    const numbed = (gid, waived) => { const c = fight(); const card = mk(c, 't_big', { grafts: [gid] }); if (waived) card.inst.waived = [gid]; c.player.st.numb = 1; afflStartTurn(c); return { c, card, spec: specOf(c, card) }; };
    // "Costs 1 more": due under Numb, waived stays waived (Hoard Cache is also muted: no Retain)
    const due = numbed('g_hoard_cache', false), free = numbed('g_hoard_cache', true);
    assert.deepEqual([due.spec.cost, free.spec.cost], [3, 2], 'Numb: "Their prices still bite", unless the Price was waived');
    assert.ok(!due.spec.flags.retain && !free.spec.flags.retain, 'and the boon is silent either way');
    assert.deepEqual([priceOnCard(due.spec, due.spec.grafts[0]).waived, priceOnCard(free.spec, free.spec.grafts[0]).waived], [false, true], 'the card says which');
    // a price that lives in a hook, played for real
    const burn = (waived) => { const n = numbed('g_ash_pact', waived); play(n.c, n.card); return n.c.player.st.burn || 0; };
    assert.deepEqual([burn(false), burn(true)], [2, 0], 'Ash Pact under Numb: "Also gain 2 Burn yourself" unless waived');
    // every graft: with Numb on, a waived graft leaves exactly what a waived graft leaves without it
    const bare = cardSpec(newInst('t_big', () => 1));
    for (const g of Object.values(GRAFTS)) {
      const w = numbed(g.id, true).spec, P = w.price;
      assert.deepEqual([P.selfHurt, P.jam, P.junk.length, P.selfStatus.length, P.drawdown, P.gold, P.maxHp], [0, 0, 0, 0, 0, 0, 0], g.id + ' price under Numb: ' + JSON.stringify(P));
      assert.ok(w.cost <= bare.cost && w.pct >= 0, g.id + ' still costs more or lowers the numbers under Numb');
      for (const f of ['exhaust', 'ethereal', 'needsAttackPlayed']) assert.ok(!w.flags[f], `${g.id} still has ${f} under Numb`);
    }
  } finally { delete CARDS.t_big; }
});

// ---------------------------------------------------------------- 14. a waiver belongs to one sewing of one graft
// Free Sample waives the Price of the graft you accept. The waiver goes with that graft when Reforge (or an event) moves it
// and ends when the graft is stripped: sewing it on again is a new graft and pays its Price.
await ta('Free Sample: the waiver moves with the graft on Reforge and ends with a Strip', async () => {
  const CARDSJS = await import('../graftwork/engine/cards.js');
  const GID = 'g_hoard_cache'; // "Costs 1 more. Lose 4 max HP when grafted."
  const start = () => {
    const run = RUN.newRun({ hero: 'marrow', seed: 'sew' }); RUN.addRelic(run, 'r_free_sample');
    const [a, b, d] = run.deck.filter((i) => canGraft(i, GID)); a.grafts = []; b.grafts = []; d.grafts = [];
    run.pending = { kind: 'forge', used: 0 };
    return { run, a, b, d, hp0: run.maxHp };
  };
  const cost = (inst) => cardSpec(inst).cost - CARDS[inst.id].cost;
  // Reforge: the Price is waived on the card that gets the graft, and the old card keeps no entry
  { const { run, a, b, hp0 } = start();
    assert.ok(RUN.applyGraft(run, a.uid, GID, { keepPhase: true }).ok); assert.equal(run.maxHp, hp0, 'the sample waived "Lose 4 max HP"');
    assert.ok(RUN.forgeAct(run, 'reforge', a.uid, GID, b.uid).ok);
    assert.deepEqual([a.grafts, b.grafts], [[], [GID]]);
    assert.deepEqual([a.waived || [], b.waived], [[], [GID]], 'no stale entry behind, the waiver arrived');
    assert.equal(cost(b), 0, 'Reforge: a waived "Costs 1 more" is still waived on the new card'); assert.equal(run.maxHp, hp0, 'and nothing was charged');
    // a Price that was due is still due after Reforge
    const c2 = start(); c2.run.flags['pf' + c2.run.act] = 1; // this act's sample is spent
    RUN.applyGraft(c2.run, c2.a.uid, GID, { keepPhase: true }); assert.equal(c2.run.maxHp, c2.hp0 - 4);
    RUN.forgeAct(c2.run, 'reforge', c2.a.uid, GID, c2.b.uid); assert.equal(cost(c2.b), 1, 'a Price that was due moves with the graft and stays due'); assert.deepEqual(c2.b.waived || [], []);
    // Strip, then sew the same graft on the same card: a new graft, its Price is due (the old entry is gone)
    const { run: r3, a: a3, hp0: h3 } = start();
    RUN.applyGraft(r3, a3.uid, GID, { keepPhase: true }); assert.equal(cost(a3), 0);
    assert.ok(RUN.forgeAct(r3, 'strip', a3.uid, GID).ok); assert.deepEqual(a3.waived || [], [], 'a stripped graft takes its waiver with it');
    RUN.applyGraft(r3, a3.uid, GID, { keepPhase: true });
    assert.equal(cost(a3), 1, 'sewn on again: "Costs 1 more" is due'); assert.equal(r3.maxHp, h3 - 4, 'and so is "Lose 4 max HP"');
    // the shop's Strip and an event's strip do the same
    const { run: r4, a: a4 } = start(); RUN.applyGraft(r4, a4.uid, GID, { keepPhase: true });
    r4.gold = 999; r4.pending = { kind: 'shop', cards: [], grafts: [], relics: [], potions: [], removeUses: 0 }; assert.ok(RUN.shopBuy(r4, 'strip', 0, { uid: a4.uid, gid: GID }).ok); assert.deepEqual(a4.waived || [], []);
    const { run: r5, a: a5 } = start(); RUN.applyGraft(r5, a5.uid, GID, { keepPhase: true }); RUN.R.stripGraft(r5, a5.uid, GID); assert.deepEqual(a5.waived || [], []);
    // an event that moves a graft (R.moveGraft) is Reforge too
    const { run: r6, a: a6, b: b6 } = start(); RUN.applyGraft(r6, a6.uid, GID, { keepPhase: true });
    assert.ok(RUN.R.moveGraft(r6, a6.uid, b6.uid, GID)); assert.deepEqual([a6.waived || [], b6.waived], [[], [GID]]); assert.equal(cost(b6), 0);
    // Temper keeps the waiver: the fused graft is the same graft
    const { run: r7, a: a7 } = start(); RUN.applyGraft(r7, a7.uid, GID, { keepPhase: true }); assert.ok(CARDSJS.temper(a7));
    assert.deepEqual(a7.waived, [GID]); assert.equal(cost(a7), 0);
  }
  // the Forge previews the same deck the Forge then makes
  { const { run, a, b } = start(); RUN.applyGraft(run, a.uid, GID, { keepPhase: true });
    const pv = CARDSJS.deckMoved(run.deck, a.uid, GID, b.uid).find((i) => i.uid === b.uid), sv = CARDSJS.deckStripped(run.deck, a.uid, GID).find((i) => i.uid === a.uid);
    assert.deepEqual([cardSpec(pv).cost - CARDS[pv.id].cost, cardSpec(pv).waived], [0, [GID]], 'the Reforge preview shows the Price still waived');
    assert.deepEqual([sv.grafts, sv.waived], [[], []]); assert.deepEqual([a.grafts, a.waived, b.grafts], [[GID], [GID], []], 'and touches nothing real'); }
});
t('a save with stale waiver entries (left behind by Reforge and Strip) loads cleanly, and the entries are gone', () => {
  const GID = 'g_hoard_cache', run = RUN.newRun({ hero: 'marrow', seed: 'stale' });
  const [a, b] = run.deck.filter((i) => canGraft(i, GID));
  const raw = JSON.parse(RUN.serializeRun(run)); const ra = raw.deck.find((i) => i.uid === a.uid), rb = raw.deck.find((i) => i.uid === b.uid);
  ra.grafts = []; ra.waived = [GID];                  // the graft was reforged away: the entry stayed on the old card
  rb.grafts = [GID, 'g_ember_pin']; rb.waived = [GID]; // a live waiver, which must survive
  raw.deck[2].fused = [GID]; raw.deck[2].waived = [GID]; // a tempered graft keeps its waiver
  const back = RUN.deserializeRun(JSON.stringify(raw));
  const [x, y, z] = [a.uid, b.uid, raw.deck[2].uid].map((u) => back.deck.find((i) => i.uid === u));
  assert.deepEqual([x.waived, y.waived, z.waived], [[], [GID], [GID]]);
  RUN.applyGraft(back, x.uid, GID, { keepPhase: true }); assert.equal(cardSpec(x).cost - CARDS[x.id].cost, 1, 'sewn on again, the old entry does not make it free');
  assert.equal(RUN.serializeRun(RUN.deserializeRun(RUN.serializeRun(back))), RUN.serializeRun(back), 'and a repaired save is stable');
});


// ---------------------------------------------------------------- 15. a cut is a cut: the turn-end cash is not one, and "per stitch" counts what was paid
// The Line cashes itself at the end of your turn (the Line rule: "Pays when cut or at turn end"). Every relic and hero text that
// says "cut" is about a cut. The hooks used to run for the turn-end cash too, and counted stitches from the length of the Line.
t('relic and hero cut hooks do not hear the turn-end cash: the turn ends exactly as it does without them', () => {
  const turnEnd = (o) => {
    const c = fight(o); c.player.hp = 300;
    P(c, 'blood'); P(c, 'blood', { grafts: [GOF.rust] }); P(c, 'blood'); P(c, 'blood'); // a Line of 4 is left standing
    const m = mark(c); endTurn(c);
    return JSON.stringify({ hp: c.player.hp, block: c.player.block, ehp: c.enemies[0].hp, est: { ...c.enemies[0].st }, pst: { ...c.player.st }, hand: c.hand.map((k) => k.uid), draw: c.drawPile.length, rx: c.rx || null,
      pays: pays(c, m), cash: since(c, m, 'seamCut').map((e) => [e.kind, e.paid]) });
  };
  const bare = turnEnd({}), bareM = turnEnd({ hero: 'marrow' });
  assert.ok(JSON.parse(bare).pays.length > 0 && JSON.parse(bare).cash[0][0] === 'end' && JSON.parse(bare).cash[0][1] > 0, 'the turn end does pay the Line');
  for (const id of Object.keys(PAID_ONLY)) {
    if (id === 'marrow') { assert.equal(turnEnd({ hero: 'marrow', passive: true }), bareM, "Marrow's passive: Blood cuts, not the turn end"); continue; }
    assert.equal(turnEnd({ relics: [id] }), bare, id + ' reacted to the turn-end cash');
  }
  // the same hooks, handed a real cut afterwards, still do their work (the rest of this file measures each one)
  assert.deepEqual(oneCut({ relics: ['r_bobbin'] }, false).drawn, 1);
});
t('"per stitch" counts the stitches that were paid: Resonance and a second school included, none for a voided payout', () => {
  // Blood Line of 4 knots, Rust on two of them: Blood pays 3 stitches and Rust 1 (half); at tier 3 each gets one more (4 + 2), at tier 6 both pay twice (8 + 4)
  const cut = (o, tier, cancel) => {
    const c = fight(o); c.player.hp = 300; if (tier) c.res = { blood: tier, rust: tier };
    P(c, 'blood'); P(c, 'blood', { grafts: [GOF.rust] }); P(c, 'blood', { grafts: [GOF.rust] }); P(c, 'blood');
    const card = mk(c, 't_ember'), e = c.enemies[0], b = { hp: c.player.hp, block: c.player.block, ehp: e.hp, hand: c.hand.length - 1 }, m = mark(c);
    const old = ENEMIES.bedpan_slime.on;
    try { if (cancel) ENEMIES.bedpan_slime.on = { ...(old || {}), seamCash: (A, en, i) => { i.cancel = true; } }; play(c, card); } finally { ENEMIES.bedpan_slime.on = old; }
    const all = pays(c, m);
    return { heal: c.player.hp - b.hp, block: c.player.block - b.block, dmg: b.ehp - e.hp, drawn: c.hand.length - b.hand, str: c.player.st.strength || 0, paid: all.reduce((a, p) => a + p[1], 0), blood: (all.find((p) => p[0] === 'blood') || [0, 0])[1] };
  };
  for (const tier of [0, 3, 6]) {
    const base = cut({}, tier), tag = 'tier ' + tier;
    assert.deepEqual([base.paid, base.blood], [[4, 6, 12][[0, 3, 6].indexOf(tier)], [3, 4, 8][[0, 3, 6].indexOf(tier)]], 'the payout itself, ' + tag);
    const d = (o) => { const r = cut(o, tier); return { heal: r.heal - base.heal, block: r.block - base.block, dmg: r.dmg - base.dmg }; };
    assert.deepEqual(d({ relics: ['r_seam_ripper'] }), { heal: 0, block: 0, dmg: 2 * base.paid + base.str }, 'Seam Ripper: 2 damage per stitch paid, ' + tag + (base.str ? ' (+ the Strength Blood 6 gives)' : ''));
    assert.deepEqual(d({ relics: ['r_tapestry_frame'] }), { heal: 0, block: 4 * base.paid, dmg: 0 }, 'Tapestry Frame: 4 Block per stitch paid, ' + tag);
    assert.deepEqual(d({ relics: ['r_second_colour'] }), { heal: 0, block: 2 * base.paid, dmg: 0 }, 'Second Colour: 2 Block per stitch paid, ' + tag);
    assert.deepEqual(d({ hero: 'marrow', passive: true }), { heal: base.blood, block: 0, dmg: 0 }, 'Marrow: 1 extra per Blood stitch paid, ' + tag);
  }
  // a payout an enemy voided paid no stitch: the per-stitch hooks add nothing, the hooks that only ask for the cut still fire
  const none = cut({}, 3, true); assert.equal(none.paid, 0);
  for (const id of ['r_seam_ripper', 'r_tapestry_frame', 'r_second_colour']) { const r = cut({ relics: [id] }, 3, true); assert.deepEqual([r.dmg, r.block], [0, 0], id + ' on a voided payout'); }
  assert.equal(cut({ hero: 'marrow', passive: true }, 3, true).heal, 0, 'Marrow on a voided payout');
  assert.equal(cut({ relics: ['r_bobbin'] }, 3, true).drawn, 1, 'Bobbin: it was still a cut');
  // the grafts that pay per stitch when their card cuts read the same number (Surgeon's Knot 4 gold, Surge Loop 1 Charge, per stitch)
  const g1 = (gid, tier) => { const c = fight(); if (tier) c.res = { blood: tier }; lineOf(c, 'blood', 3); const gold = c.run.gold; play(c, mk(c, 'ta_rust', { grafts: [gid] })); return { gold: c.run.gold - gold, charge: c.player.st.charge || 0 }; };
  assert.deepEqual([g1('g_surgeons_knot', 0).gold, g1('g_surgeons_knot', 3).gold], [8 - 1, 12 - 1], "Surgeon's Knot: the stitch Resonance adds is paid for");
  assert.deepEqual([g1('g_surge_loop', 0).charge, g1('g_surge_loop', 3).charge], [2, 3], 'Surge Loop: the same');
});
t('enemies that speak of a Line cashed (Ferric Warden, Scissor Nurse, Locksmith, Knitter) still see the turn-end cash', () => {
  const line4 = (enemy, o = {}) => { const c = fight({ enemies: [enemy] }); c.player.hp = 300; const e = c.enemies[0]; Object.assign(e.data, o); e.block = 0; P(c, 'blood'); P(c, 'blood'); P(c, 'blood'); P(c, 'blood'); return { c, e, m: mark(c) }; };
  { const { c, e, m } = line4('ferric_warden', { allergy: 'blood' }); SEAM.seamEnd(c); assert.equal(pays(c, m).length, 0, 'Allergy: "a Line cashed in that school pays nothing this turn", turn end included'); assert.equal(since(c, m, 'seamCut')[0].paid, 0);
    const o = line4('ferric_warden', { allergy: 'ember' }); SEAM.seamEnd(o.c); assert.ok(pays(o.c, o.m).length > 0, 'another school pays'); void e; }
  { const { c, e, m } = line4('scissor_nurse'); SEAM.seamEnd(c); assert.equal(pays(c, m).length, 0, 'a Line of 4 or more is snipped, at the turn end too'); assert.equal(e.block, 2, 'and she takes 2 Block');
    const t3 = line4('scissor_nurse'); t3.c.hand = []; SEAM.seamTurnStart(t3.c); P(t3.c, 'blood'); P(t3.c, 'blood'); P(t3.c, 'blood'); const m3 = mark(t3.c); SEAM.seamEnd(t3.c); assert.ok(pays(t3.c, m3).length > 0, 'a Line of 3 is not snipped'); }
  { const { c, e } = line4('locksmith', { seal: 'blood' }); e.block = 0; SEAM.seamEnd(c); assert.equal(e.block, 4, 'the sealed school, cashed at the turn end');
    const o = line4('locksmith', { seal: 'ember' }); o.e.block = 0; SEAM.seamEnd(o.c); assert.equal(o.e.block, 0, 'another school gives it nothing');
    const k = line4('locksmith', { seal: 'blood' }); k.e.block = 0; play(k.c, mk(k.c, 't_ember')); assert.equal(k.e.block, 4, 'and the sealed school cut by a card'); }
  { const { c, e } = line4('knitter'); e.data.cut = false; SEAM.seamEnd(c); assert.equal(e.data.cut, true, 'the cashed Line pays at +50%'); }
});

// ---------------------------------------------------------------- 16. the Locksmith's Block is written on its Sealed status
await ta('Locksmith: the Sealed status it carries says it gains Block when a Line of the sealed school is cut or cashed, with the number the engine uses', async () => {
  const { statusText } = await import('../graftwork/engine/text.js');
  const gain = (seal, how) => { // Block the Locksmith gains from one Line of 4 knots of `seal`, cut by a card of another school or cashed at the turn end
    const c = fight({ enemies: ['locksmith'] }); c.player.hp = 300; const e = c.enemies[0]; e.data.seal = seal; e.block = 0;
    P(c, 'blood'); P(c, 'blood'); P(c, 'blood'); P(c, 'blood');
    if (how === 'cut') P(c, 'ember'); else SEAM.seamEnd(c);
    return e.block;
  };
  const real = gain('blood', 'cut'); assert.equal(real, 4, 'the engine: 4 Block');
  assert.equal(gain('blood', 'end'), real, 'and the same when the Line is cashed at the turn end'); assert.equal(gain('rust', 'cut') + gain('rust', 'end'), 0, 'a Line of another school gives it nothing');
  // the status the Locksmith carries from the first turn names the school and the rule
  const c = newCombat(RUN.newRun({ hero: 'marrow', seed: 'lock-text' }), ['locksmith']), e = c.enemies[0];
  assert.ok(e.st.sealed > 0, 'it is sealed from combat start'); const text = statusText('sealed', e.st.sealed);
  assert.ok(/Your \w+ school is sealed/.test(text), text);
  const m = /gains (\d+) Block each time a Line of that school is cut or cashed at turn end/.exec(text);
  assert.ok(m, 'the status says what its seal does for the Locksmith:\n' + text); assert.equal(+m[1], real, 'with the number the engine uses');
  assert.ok(!/[\u2013\u2014]/.test(text), 'no dashes');
});

// ---------------------------------------------------------------- 17. the Codex Rules tab counts its panels
await ta('Codex, Rules tab: the header names the number of panels the sheet has (desktop and phone stage)', async () => {
  const codex = (await import('../graftwork/ui/codex.js')).default, { CODEX_RULES } = await import('../graftwork/ui/codex.js');
  for (const scale of [1, 0.54]) {
    const app = await makeApp({ run: RUN.newRun({ hero: 'marrow', seed: 'codex-rules' }), meta: META.defaultMeta(), audio: { sfx() {}, music() {} } });
    if (scale < 1) { app.scale = scale; app.minPx = 11; }
    const said = []; const raw = app.text; app.text = (str, x, y, o) => { said.push(String(str)); return raw(str, x, y, o); };
    app.shared.flow = { app, RUN, META, route() {}, toTitle() {}, openDeck() {}, openCodex() {}, openArchive() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, start() {} };
    app.register('codex', codex); app.register('base', { draw() {} }); app.go('base'); app.push('codex', {});
    codex.setTab(6); said.length = 0; frames(app, 12);
    const head = said.find((x) => /^The whole Graft system/.test(x));
    assert.ok(head, 'the Rules tab has its header @' + scale);
    const m = /in (\d+) panels\.$/.exec(head); assert.ok(m, 'the header gives a number: ' + head);
    assert.equal(+m[1], CODEX_RULES.length, 'and it is the number of rules the sheet holds @' + scale);
    const seen = new Set(); // the sheet scrolls when it outgrows the view: walk it from top to bottom
    for (let pos = 0; pos < 3000; pos += 120) { codex.rulesSt.scroll = codex.rulesSt.target = pos; said.length = 0; frames(app, 2); for (const [title] of CODEX_RULES) if (said.includes(title)) seen.add(title); }
    assert.equal(seen.size, CODEX_RULES.length, 'and the sheet really holds that many panels @' + scale);
  }
});

// ---------------------------------------------------------------- 18. the deck view: a tip of the hovered card stays off the list of that card's grafts
// The glossary tip of a hovered card used to open in a band over the side panel, which lists the grafts of that very card.
await ta('Deck view: the tip of a hovered card does not cover the side panel (hover and Shift hold, desktop and phone stage)', async () => {
  const deckview = (await import('../graftwork/ui/deckview.js')).default;
  const LR = await import('../graftwork/ui/layout_registry.js');
  const audio = await import('../graftwork/ui/audio.js');
  const inter = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  const GIDS = ['g_hoard_cache', 'g_sutured_seam', 'g_ember_pin', 'g_oxide_patch', 'g_quick_hands', 'g_leaf_gilt'];
  for (const scale of [1, 0.54]) for (const hold of [false, true]) {
    const run = RUN.newRun({ hero: 'marrow', seed: 'deck-tip' });
    let k = 0; for (const inst of run.deck) { if (k < GIDS.length && RUN.applyGraft(run, inst.uid, GIDS[k], { keepPhase: true }).ok) k++; }
    const app = await makeApp({ run, audio, meta: { settings: { tips: true }, tips: {} } });
    if (scale < 1) { app.scale = scale; app.minPx = 11; }
    app.shared.flow = { RUN, route() {}, openDeck() {}, openSettings() {} };
    app.register('deckview', deckview); app.register('base', { draw() {} }); app.go('base'); app.push('deckview', { run }); frames(app, 40);
    const side = LR.getAll().find((q) => q.id === 'scroll-side'); assert.ok(side, 'the side panel (idle: nothing hovered) reports its rectangle'); // inside the panel that lists the hovered card's grafts
    let tips = 0, covered = [];
    for (let gy = 170; gy < 600; gy += 36) for (let gx = 50; gx < 710; gx += 44) {
      app.keys.delete('Shift'); app.mouse.x = gx + 300; app.mouse.y = gy; frames(app, 3); app.mouse.x = gx; app.mouse.y = gy; frames(app, 4); // leave and come back: the delay starts again
      if (hold) app.keys.add('Shift');
      frames(app, 30);
      const L = app.tipLayout;
      if (app.top().hoverIdx < 0 || !L || L.frame !== app.frame) continue;
      tips++;
      if (inter(L.rect, side)) covered.push(`${gx},${gy}`);
      assert.ok(L.rect.x >= 5.5 && L.rect.y >= 5.5 && L.rect.x + L.rect.w <= 1274.5 && L.rect.y + L.rect.h <= 714.5, 'the tip stays on the stage');
    }
    assert.ok(tips >= 20, `cards were hovered and tips shown: ${tips} @${scale}${hold ? ' held' : ''}`);
    assert.deepEqual(covered, [], `the tip covered the side panel at: ${covered.join(' ')} @${scale}${hold ? ' held' : ''}`);
  }
});
console.log(`${n} rules-fix checks done${bad ? ', ' + bad + ' FAILED' : ''}`);
if (bad) process.exit(1);
