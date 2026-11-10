// Rules fixes (graftwork/design/CLEANUP_PLAN.md, "Rules fixes"): every card, graft, passive and relic does what its text says,
// and saves keep loading when they name content that no longer exists. Each block failed on the code before the fix.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { newCombat, playCard, endTurn, specOf } from '../graftwork/engine/combat.js';
import { newInst, cardSpec } from '../graftwork/engine/cards.js';
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

console.log(`${n} rules-fix checks done${bad ? ', ' + bad + ' FAILED' : ''}`);
if (bad) process.exit(1);
