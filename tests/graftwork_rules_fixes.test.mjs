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


console.log(`${n} rules-fix checks done${bad ? ', ' + bad + ' FAILED' : ''}`);
if (bad) process.exit(1);
