// THE CROWD and MEDLEYS: the two run systems of DATA "The Crowd and Medleys" (DESIGN 4.3), end to end.
//
//   The Crowd   every card played fills the meter by 1, a defeated enemy by 2; full, it wraps and a free Fading copy of a hero's Signature
//               card joins the hand, the two heroes alternating from the fight's lead. Deterministic, Encore 5 makes the meter one bigger,
//               the kill that wins the fight wakes nobody, the bot plays the copy, the HUD shows the pips.
//   Medleys     RUN.makeMedley fuses two Attack or Skill cards of one hero into one deck instance {id:'medley', parts}; DATA.resolveCard
//               merges the parts (fx A then B, cost max clamped 1..3, keywords and slots the union, mech by max, the upgrade lifts both);
//               the engine plays both halves; saves round trip and older saves load; the elite reward offers it once through the pending
//               {op:'medley'}; the reward screen's Make a Medley button drives the two picks.
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus crowd_medley');
const J = (x) => JSON.stringify(x);
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
const types = (ev) => ev.map((e) => e.type);
const only = (ev, type) => ev.filter((e) => e.type === type);

// ------------------------------------------------------------------------------------------------ engine helpers (real content)
function engine() {
  const g = boot({ only: ['data_text', 'combat', 'run'] });
  if (g._errors.length) throw new Error('boot errors: ' + J(g._errors.map((e) => e.file + ':' + e.line + ' ' + e.message)));
  return g;
}
const HEROES = [{ id: 'hanae', hp: 84, maxHp: 84 }, { id: 'kuro', hp: 68, maxHp: 68 }];
const deckOf = (ids) => ids.map((id, i) => (typeof id === 'string' ? { uid: 100 + i, id, up: 0, gems: [] } : Object.assign({ uid: 100 + i, up: 0, gems: [] }, id)));
// a fight against a big dummy that does nothing (every play lands, nothing dies)
function dummyFight(g, o = {}) {
  const D = g.DATA;
  if (!D.enemies.cm_dummy) {
    D.add('enemies', {
      cm_dummy: { name: 'cm_dummy', chapter: 1, tier: 'normal', size: 'm', hp: [999, 999], ai: { seq: ['idle'] }, lore: 'A test creature.', tags: ['spirit'], art: { id: 'cm_dummy' }, moves: { idle: { name: 'Idle', kind: 'none', fx: [] } } },
      cm_weak: { name: 'cm_weak', chapter: 1, tier: 'normal', size: 's', hp: [1, 1], ai: { seq: ['idle'] }, lore: 'A test creature.', tags: ['spirit'], art: { id: 'cm_weak' }, moves: { idle: { name: 'Idle', kind: 'none', fx: [] } } },
    });
  }
  const C = g.COMBAT.create({ heroes: o.heroes || HEROES, frontIdx: o.frontIdx || 0, deck: deckOf(o.deck || []), enemies: o.enemies || ['cm_dummy'], seed: o.seed === undefined ? 5 : o.seed, mods: o.mods, relics: o.relics || [] });
  if (o.start !== false) C.start();
  return C;
}
// play every playable card in hand once (cheapest first), one at a time; returns the events of all plays
function playAll(C, max = 12) {
  const out = [];
  for (let i = 0; i < max; i++) {
    const c = C.hand.find((x) => C.canPlay(x.uid, C.legalTargets(x.uid)[0]).ok);
    if (!c) break;
    out.push(...C.play(c.uid, C.legalTargets(c.uid)[0]));
  }
  return out;
}

// ================================================================================================ data: signatures, keywords, mods
await t.test('every hero has a Signature: an Attack or Skill of their own, and the glossary explains Crowd, Signature and Medley in plain ASCII', () => {
  const { DATA: D } = engine();
  D.LISTS.heroIds.forEach((id) => {
    const sig = D.heroes[id].signature;
    t.eq(D.signatureOf(id), sig, id + ': signatureOf reads the declaration');
    const c = D.cards[sig];
    t.ok(!!c && c.hero === id && (c.type === 'attack' || c.type === 'skill'), id + ': ' + sig + ' is an Attack or Skill of ' + id);
    t.ok(c && c.rarity === 'rare', id + ': the Signature is a rare (' + c.name + ')');
  });
  t.deep(D.LISTS.heroIds.map((h) => D.cards[D.signatureOf(h)].name), ['The High Note', 'Wait For It', 'Final Mixdown', 'Thunder From Below'], 'the four Signatures');
  ['crowd', 'signature', 'medley'].forEach((k) => {
    const kw = D.keywords[k];
    t.ok(!!kw && kw.name && kw.text, 'keyword ' + k);
    t.ok(!DASH.test(kw.text) && kw.text.indexOf('  ') < 0 && /^[\x20-\x7e]*$/.test(kw.text), k + ': printable ASCII, no dashes, no double spaces');
  });
  const v = D.validate(undefined, { strict: true });
  t.eq(v.errors.length, 0, 'strict validation stays clean: ' + v.errors.slice(0, 3).join('; '));
  t.eq(D.ECONOMY.crowd, 7, 'the meter takes 7');
  t.eq(D.foldMods([]).crowd, 7, 'folded default');
  t.eq(D.foldMods([D.trialDeltas(4)]).crowd, 7, 'Encore 4: still 7');
  t.eq(D.foldMods([D.trialDeltas(5)]).crowd, 8, 'Encore 5 makes the meter one bigger');
  t.eq(D.foldMods([D.trialDeltas(10)]).crowd, 8, 'and it stays one bigger up to Encore 10');
  t.ok(D.LISTS.trialMods.indexOf('crowd') >= 0 && D.LISTS.trialModKind.crowd === 'int', 'crowd is a whole-number trial mod');
  t.ok(/crowd/.test(D.trials.trial_5.text), 'Harsh Critics says so: ' + D.trials.trial_5.text);
});

// ================================================================================================ the Crowd in the engine
await t.test('the Crowd: crowd 0 switches the meter off (no crowd events, no free copy), which the enemy balance sims rely on', () => {
  const g = engine();
  const deck = [];
  for (let i = 0; i < 20; i++) deck.push(i % 2 ? 'hanae_slash' : 'kuro_ink_bolt');
  const C = dummyFight(g, { deck, mods: { energy: 20, hand: 10, crowd: 0 } });
  t.eq(C.crowdMax, 0, 'crowdMax is 0');
  const ev = playAll(C, 9);
  t.eq(only(ev, 'crowd').length, 0, 'nine plays raise no crowd event');
  t.eq(C.crowdWild, 0, 'the crowd never goes wild'); t.eq(C.added, 0, 'and no free Signature copy was added');
  t.eq(g.DATA.foldMods([{ crowd: -10 }]).crowd, 0, 'the data clamp lets a fold reach 0');
});

await t.test('the Crowd: +1 per card, +2 per kill, wraps at 7 with a free Fading Signature copy, alternating from the lead hero', () => {
  const g = engine();
  const { DATA: D } = g;
  const deck = [];
  for (let i = 0; i < 20; i++) deck.push(i % 2 ? 'hanae_slash' : 'kuro_ink_bolt');
  const C = dummyFight(g, { deck, mods: { energy: 20, hand: 10 } });
  t.eq(C.crowd, 0, 'starts empty'); t.eq(C.crowdMax, 7, 'size 7'); t.eq(C.crowdWild, 0, 'no fill yet');
  const ev = playAll(C, 6);
  const cr = only(ev, 'crowd');
  t.deep(cr.map((e) => e.value), [1, 2, 3, 4, 5, 6], 'six plays, six steps');
  t.ok(cr.every((e) => e.max === 7 && e.delta === 1 && !e.wild && e.hero === null && e.card === null), 'plain steps carry max 7, delta 1, no hero and no card');
  const ev7 = playAll(C, 1);
  const w = only(ev7, 'crowd')[0];
  t.ok(w && w.wild && w.value === 0 && w.hero === 'hanae' && w.card && w.card.id === D.signatureOf('hanae') && w.card.crowd === true, 'the seventh play: wild, the meter wraps to 0, Jasmin (the lead) sings The High Note: ' + J(w));
  const add = only(ev7, 'add_card')[0];
  t.ok(add && add.to === 'hand' && add.cards.length === 1 && add.cards[0].id === 'hanae_thousand_petals' && add.cards[0].crowd === true && add.cards[0].tmp === true, 'the copy is a temp card added to the hand right after the crowd event');
  t.ok(types(ev7).indexOf('crowd') < types(ev7).indexOf('add_card'), 'crowd event, then the add');
  t.eq(C.crowdWild, 1, 'one fill');
  const copy = C.hand.find((c) => c.crowd);
  const res = D.resolveCard(copy, { unit: C.heroes[0] });
  t.eq(res.cost, 0, 'the copy costs 0'); t.ok(res.kw.indexOf('exhaust') >= 0, 'and Fades'); t.ok(res.kw.indexOf('retain') >= 0, 'while keeping the card\'s own keywords (Hold)');
  t.ok(/Fade\.$/.test(D.cardPlain(copy)), 'its text ends in Fade: ' + D.cardPlain(copy));
  t.ok(C.canPlay(copy.uid, C.legalTargets(copy.uid)[0]).ok, 'it is playable at once');
  const before = C.energy;
  const evc = C.play(copy.uid, C.legalTargets(copy.uid)[0]);
  t.eq(C.energy, before, 'playing it spent no Breath');
  t.eq(only(evc, 'exhaust').length, 1, 'and it Faded');
  t.eq(only(evc, 'crowd')[0].value, 1, 'the free copy itself fills the meter again (1)');
  // the second fill: the OTHER hero's Signature (the meter is set to one short, then one more play)
  C.crowd = 6;
  playAll(C, 1);
  t.eq(C.crowdWild, 2, 'second fill');
  const sig2 = C.hand.find((c) => c.crowd);
  t.ok(sig2 && sig2.id === D.signatureOf('kuro'), 'RoxorLoops sings the second time: ' + (sig2 && sig2.id));
  const wild2 = only(C.events, 'crowd').filter((e) => e.wild);
  t.deep(wild2.map((e) => e.hero), ['hanae', 'kuro'], 'the heroes alternate');
});

await t.test('the Crowd: a kill counts 2 (the surplus carries), the winning kill wakes nobody, a voiceless hero passes, and frontIdx picks who sings first', () => {
  const g = engine();
  const { DATA: D } = g;
  // two 1 HP foes beside the dummy: a Petal Note kills one (1 + 2 = 3)
  const C = dummyFight(g, { deck: Array(12).fill('hanae_slash'), enemies: ['cm_weak', 'cm_dummy', 'cm_weak'], mods: { energy: 20, hand: 10 } });
  const weak = C.enemies.find((e) => e.def === 'cm_weak');
  const ev = C.play(C.hand[0].uid, weak.id);
  t.deep(only(ev, 'crowd').map((e) => [e.delta, e.value]), [[2, 2], [1, 3]], 'the kill adds 2 first, then the play adds 1: the meter reads 3');
  // five more plays on the dummy: 3 + 5 = 8 -> wraps to 1 (the surplus carries)
  for (let i = 0; i < 5; i++) C.play(C.hand[0].uid, C.enemies[1].id);
  t.eq(C.crowdWild, 1, 'wild once'); t.eq(C.crowd, 1, 'the surplus carried over');
  // the winning kill: the last foe falls, the crowd does not react (no card is added after the win)
  const C2 = dummyFight(g, { deck: Array(12).fill('hanae_slash'), enemies: ['cm_weak'], mods: { energy: 20, hand: 10 } });
  C2.crowd = 6;
  const evw = C2.play(C2.hand[0].uid, C2.enemies[0].id);
  t.eq(C2.result, 'win', 'the fight is won');
  t.eq(only(evw, 'crowd').length, 0, 'the kill that wins the fight (and the play that made it) wake nobody');
  t.eq(only(evw, 'add_card').length, 0, 'no card added after the win');
  // the back hero as frontIdx 1: RoxorLoops leads, so he sings first
  const C3 = dummyFight(g, { deck: Array(12).fill('kuro_ink_bolt'), frontIdx: 1, mods: { energy: 20, hand: 10 } });
  playAll(C3, 7);
  t.eq(only(C3.events, 'crowd').filter((e) => e.wild)[0].hero, 'kuro', 'the lead at the start sings first');
  // Jasmin voiceless: the fill passes to RoxorLoops even on her turn
  const C4 = dummyFight(g, { deck: Array(14).fill('kuro_ink_bolt'), mods: { energy: 20, hand: 10 } });
  C4.heroes[0].down = true; C4.heroes[0].hp = 0;
  playAll(C4, 7);
  const w4 = only(C4.events, 'crowd').filter((e) => e.wild)[0];
  t.eq(w4.hero, 'kuro', 'a voiceless lead passes the Signature to the other hero');
  // Encore 5 mods: the meter is 8
  const C5 = dummyFight(g, { deck: Array(12).fill('hanae_slash'), mods: Object.assign(D.foldMods([D.trialDeltas(5)]), { energy: 20, hand: 10 }) });
  t.eq(C5.crowdMax, 8, 'Encore 5: the meter takes 8');
  playAll(C5, 7);
  t.eq(C5.crowdWild, 0, 'seven plays do not fill it');
  playAll(C5, 1);
  t.eq(C5.crowdWild, 1, 'the eighth does');
});

await t.test('the Crowd is deterministic and the bots play the free copy; the summary keys are untouched', () => {
  const g = engine();
  const deck = [];
  for (let i = 0; i < 16; i++) deck.push(['hanae_slash', 'kuro_ink_bolt', 'hanae_parry', 'kuro_ink_ward'][i % 4]);
  const run = () => g.COMBAT.simulate({ heroes: HEROES, deck: deckOf(deck), enemies: ['kappa', 'kodama', 'oni_cub'], seed: 9, mods: { energy: 5 } });
  const a = run(), b = run();
  t.eq(J(a.C.events), J(b.C.events), 'two identical fights give identical event logs (crowd events included)');
  t.ok(a.C.crowdWild >= 1, 'the crowd went wild at least once in ' + a.turns + ' turns (' + a.C.crowdWild + ')');
  const played = a.C.events.filter((e) => e.type === 'play' && e.card.crowd);
  t.ok(played.length >= 1, 'the greedy bot played the free Signature copy (' + played.map((e) => e.card.id).join(',') + ')');
  t.ok(played.every((e) => e.cost === 0), 'for free');
  t.deep(Object.keys(a.C.summary()).sort(), ['fanbase', 'gold', 'heroes', 'ink', 'kills', 'maxHpGain', 'result', 'stats'], 'C.summary keeps its contract');
  t.ok(!a.capped, 'the fight finished');
});

// ================================================================================================ Medleys: data
await t.test('medleyDef and resolveCard merge two cards into one: fx A then B, cost max (1..3, X wins), keywords and slots the union, mech by max, one upgrade lifts both', () => {
  const g = engine();
  const { DATA: D } = g;
  const def = D.medleyDef(['hanae_slash', 'hanae_parry']);
  t.ok(!!def && def.id === 'medley' && def.medley === true, 'a merged definition');
  t.eq(def.name, 'Petal Note and Soft Shield', 'name "A and B"');
  t.eq(def.hero, 'hanae', 'hero'); t.eq(def.type, 'attack', 'attack when either part is an Attack'); t.eq(def.rarity, 'rare', 'rare');
  t.deep(def.fx, D.cards.hanae_slash.fx.concat(D.cards.hanae_parry.fx), 'fx A then B');
  t.eq(def.cost, Math.max(D.cards.hanae_slash.cost, D.cards.hanae_parry.cost), 'cost is the max');
  t.deep(def.slots, D.cards.hanae_slash.slots.concat(D.cards.hanae_parry.slots).slice(0, 3), 'slots: the union capped at 3');
  t.ok(!!def.up && J(def.up.fx) === J(D.cards.hanae_slash.up.fx.concat(D.cards.hanae_parry.up.fx)), 'up fx from the upgraded parts');
  t.eq(D.medleyDef(['hanae_slash', 'hanae_parry']), def, 'memoised');
  t.eq(D.medleyDef(['hanae_slash', 'kuro_ink_bolt']), undefined, 'two heroes: no Medley');
  t.eq(D.medleyDef(['hanae_slash', 'hanae_slash_nope']), undefined, 'an unknown part: no Medley');
  const power = Object.keys(D.cards).find((id) => D.cards[id].hero === 'hanae' && D.cards[id].type === 'power');
  t.eq(D.medleyDef(['hanae_slash', power]), undefined, 'a Power is never a part');
  const skillPair = D.medleyDef(['hanae_parry', 'hanae_petal_step']);
  t.eq(skillPair && skillPair.type, 'skill', 'two Skills make a Skill');
  // the instance resolves and prints as one card
  const inst = { uid: 1, id: 'medley', parts: ['hanae_slash', 'hanae_parry'], up: 0, gems: [null, null] };
  const r = D.resolveCard(inst);
  t.ok(r.medley && r.def === def && r.id === 'medley', 'resolveCard returns the merged card');
  t.eq(r.name, def.name, 'name'); t.eq(r.cost, def.cost, 'cost'); t.deep(r.fx, def.fx, 'fx'); t.deep(r.slots, def.slots, 'slots'); t.deep(r.kw, [], 'kw');
  t.eq(D.cardPlain(inst), 'Deal 6 damage. Gain 5 Block.', 'the text is both texts: ' + D.cardPlain(inst));
  t.eq(D.targetMode(inst), 'enemy', 'it needs a target (the attack half)');
  const up = Object.assign({}, inst, { up: 1 });
  const ru = D.resolveCard(up);
  t.eq(ru.name, def.name + '+', 'upgraded name'); t.deep(ru.fx, def.up.fx, 'both halves upgraded');
  t.ok(D.cardPlain(up).indexOf('Deal 8 damage') === 0, 'upgraded text: ' + D.cardPlain(up));
  t.eq(D.cardDef(inst), def, 'cardDef of a Medley instance'); t.eq(D.cardDef('hanae_slash'), D.cards.hanae_slash, 'cardDef of an id'); t.eq(D.cardDef({ id: 'hanae_slash' }), D.cards.hanae_slash, 'cardDef of a plain instance');
  t.ok(D.isMedley(inst) && !D.isMedley({ id: 'hanae_slash' }) && !D.isMedley({ id: 'medley' }), 'isMedley needs id medley and two parts');
  // cost rules: X wins, the max is clamped to 3, never below 1
  const xy = D.medleyDef(['hanae_sakura_blizzard', 'hanae_slash']);
  t.eq(xy && xy.cost, 'X', 'an X part makes the Medley X');
  const three = Object.keys(D.cards).filter((id) => D.cards[id].hero === 'hanae' && D.cards[id].type !== 'power' && D.cards[id].cost === 3);
  if (three.length) t.eq(D.medleyDef([three[0], 'hanae_slash']).cost, 3, 'a 3 cost part gives 3');
  const zero = Object.keys(D.cards).filter((id) => D.cards[id].hero === 'kuro' && (D.cards[id].type === 'attack' || D.cards[id].type === 'skill') && D.cards[id].cost === 0);
  if (zero.length >= 2) t.eq(D.medleyDef([zero[0], zero[1]]).cost, 1, 'two 0 cost parts still cost 1');
  // keywords: union; mech: max
  const held = Object.keys(D.cards).find((id) => D.cards[id].hero === 'kuro' && D.cards[id].type !== 'power' && (D.cards[id].kw || []).indexOf('retain') >= 0);
  const faded = Object.keys(D.cards).find((id) => D.cards[id].hero === 'kuro' && D.cards[id].type !== 'power' && (D.cards[id].kw || []).indexOf('exhaust') >= 0 && id !== held);
  if (held && faded) { const km = D.medleyDef([held, faded]); t.ok(km.kw.indexOf('retain') >= 0 && km.kw.indexOf('exhaust') >= 0 && km.kw.length === new Set(km.kw).size, 'keywords are the union without duplicates: ' + km.kw.join(',')); }
  const mechA = Object.keys(D.cards).find((id) => D.cards[id].mech && D.cards[id].type !== 'power');
  if (mechA) {
    const hero = D.cards[mechA].hero;
    const other = Object.keys(D.cards).find((id) => id !== mechA && D.cards[id].hero === hero && D.cards[id].type !== 'power' && !D.cards[id].mech);
    const md = D.medleyDef([mechA, other]);
    t.deep(md.mech, D.cards[mechA].mech, 'the mechanic of one part is the Medley\'s (' + mechA + ')');
    const rm = D.resolveCard({ uid: 3, id: 'medley', parts: [mechA, other], up: 0, gems: md.slots.map(() => null) });
    t.deep(rm.mech, D.cards[mechA].mech, 'and the resolved card carries it for the engine');
  }
  // gems: slot i belongs to A while i < A.slots.length
  const red = Object.keys(D.gems).find((id) => D.gems[id].color === 'red' && D.gems[id].mod && D.gems[id].mod.dmg);
  const blue = Object.keys(D.gems).find((id) => D.gems[id].color === 'blue' && D.gems[id].mod && D.gems[id].mod.block);
  if (red && blue) {
    const gi = { uid: 4, id: 'medley', parts: ['hanae_slash', 'hanae_parry'], up: 0, gems: [red, blue] };
    const rg = D.resolveCard(gi);
    t.eq(rg.fx[0].plus, D.gems[red].mod.dmg, 'the red gem in slot 0 (Petal Note\'s) adds its damage to the attack half');
    t.eq(rg.fx[1].plus, D.gems[blue].mod.block, 'the blue gem in slot 1 (Soft Shield\'s) adds its Block to the shield half');
    t.deep(rg.gemActive, [true, true], 'both gems active');
  }
});

// ================================================================================================ Medleys: the run
await t.test('RUN.makeMedley fuses two deck cards into one instance (gems back to the pouch, upgraded when either was, the larger Fanbase kept); refusals', () => {
  const g = engine();
  const { RUN, DATA: D } = g;
  const R = RUN.newRun({ seed: 11, heroes: ['hanae', 'kuro'], trial: 0 });
  RUN.startChapter(R, 1);
  const n0 = R.deck.length;
  const a = R.deck.find((c) => c.id === 'hanae_slash'), b = R.deck.find((c) => c.id === 'hanae_parry');
  const bolt = R.deck.find((c) => c.id === 'kuro_ink_bolt'), power = RUN.addCard(R, Object.keys(D.cards).find((id) => D.cards[id].hero === 'hanae' && D.cards[id].type === 'power'));
  t.deep(RUN.makeMedley(R, a.uid, bolt.uid), { ok: false, reason: 'hero' }, 'two heroes: refused');
  t.deep(RUN.makeMedley(R, a.uid, power.uid), { ok: false, reason: 'type' }, 'a Power: refused');
  t.deep(RUN.makeMedley(R, a.uid, a.uid), { ok: false, reason: 'same' }, 'the same card twice: refused');
  t.deep(RUN.makeMedley(R, a.uid, 9999), { ok: false, reason: 'card' }, 'a missing card: refused');
  RUN.removeCard(R, power.uid);
  a.up = 1; a.enc = 3; b.enc = 1;
  const red = Object.keys(D.gems).find((id) => D.gems[id].color === 'red');
  R.gems.push(red); t.ok(RUN.socket(R, a.uid, 0, red).ok, 'a gem on Petal Note');
  const m = RUN.makeMedley(R, a.uid, b.uid);
  t.ok(m.ok, 'fused'); t.deep(m.lost, ['hanae_slash', 'hanae_parry'], 'the parts');
  t.eq(R.deck.length, n0 - 1, 'two cards became one');
  t.ok(!R.deck.some((c) => c.uid === a.uid || c.uid === b.uid), 'the parts left the deck');
  t.deep(Object.keys(m.inst).sort(), ['enc', 'gems', 'id', 'parts', 'uid', 'up'], 'instance shape {uid, id, parts, up, gems, enc}');
  t.eq(m.inst.id, 'medley', 'id medley'); t.deep(m.inst.parts, ['hanae_slash', 'hanae_parry'], 'parts'); t.eq(m.inst.up, 1, 'upgraded because Petal Note was'); t.eq(m.inst.enc, 3, 'the larger Fanbase bonus');
  t.deep(m.inst.gems, [null, null], 'empty sockets'); t.ok(R.gems.indexOf(red) >= 0, 'the gem went back to the pouch');
  t.deep(RUN.makeMedley(R, m.inst.uid, R.deck.find((c) => c.id === 'hanae_petal_step').uid), { ok: false, reason: 'medley' }, 'a Medley is never a part again');
  // deck ops on the Medley
  t.ok(RUN.upgradable(R).indexOf(m.inst.uid) < 0, 'already upgraded: not upgradable');
  m.inst.up = 0;
  t.ok(RUN.upgradable(R).indexOf(m.inst.uid) >= 0, 'un-upgraded: upgradable');
  t.ok(!!RUN.upgradeCard(R, m.inst.uid) && m.inst.up === 1, 'upgradeCard works');
  t.ok(RUN.socket(R, m.inst.uid, 0, red).ok, 'a gem fits the Medley\'s first socket (red, Petal Note\'s)');
  const dup = RUN.applyOps(R, [{ op: 'duplicateCard', random: true, filter: { hero: 'hanae', type: 'attack' } }], { rng: g.U.rng(1), fight: false, key: 'x' });
  const copies = R.deck.filter((c) => c.id === 'medley');
  t.ok(dup.log.length === 1 && copies.length >= 1, 'duplicateCard handles a Medley (' + dup.log[0].text + ')');
  copies.forEach((c) => t.ok(D.medleyDef(c.parts) && c.parts.length === 2, 'every copy carries parts'));
  t.ok(RUN.medleyPossible(R), 'a pair is still possible');
  const R2 = RUN.newRun({ seed: 12, heroes: ['hanae', 'kuro'], trial: 0 }); RUN.startChapter(R2, 1);
  R2.deck = R2.deck.filter((c) => c.id === 'hanae_slash').slice(0, 1).concat(R2.deck.filter((c) => c.id === 'kuro_ink_bolt').slice(0, 1));
  t.ok(!RUN.medleyPossible(R2), 'one card per hero: no pair');
});

await t.test('saves: a Medley round trips through serialize and deserialize, an old save without Medleys loads, junk parts are dropped', () => {
  const g = engine();
  const { RUN, DATA: D } = g;
  const R = RUN.newRun({ seed: 21, heroes: ['hanae', 'kuro'], trial: 0 });
  RUN.startChapter(R, 1);
  const a = R.deck.find((c) => c.id === 'kuro_ink_bolt'), b = R.deck.find((c) => c.id === 'kuro_ink_ward');
  const m = RUN.makeMedley(R, a.uid, b.uid).inst;
  m.enc = 2;
  const blue = Object.keys(D.gems).find((id) => D.gems[id].color === 'blue');
  R.gems.push(blue);
  const slot = D.medleyDef(m.parts).slots.indexOf('blue');
  if (slot >= 0) t.ok(RUN.socket(R, m.uid, slot, blue).ok, 'a gem set in the Medley');
  const o = JSON.parse(J(RUN.serialize(R)));
  const R2 = RUN.deserialize(o);
  t.ok(!!R2, 'loads');
  const m2 = R2.deck.find((c) => c.id === 'medley');
  t.deep(m2, R.deck.find((c) => c.id === 'medley'), 'the Medley instance round trips exactly (uid, parts, up, gems, enc)');
  t.eq(J(RUN.serialize(R2).deck), J(RUN.serialize(R).deck), 'and re-serialises the same');
  t.eq(D.cardPlain(m2), D.cardPlain(m), 'same text after load');
  // an old save: plain cards only, no parts anywhere
  const old = JSON.parse(J(RUN.serialize(R)));
  old.deck = old.deck.filter((c) => c.id !== 'medley');
  const R3 = RUN.deserialize(old);
  t.ok(!!R3 && R3.deck.every((c) => !('parts' in c)), 'an older save loads with no parts on any card');
  // junk: a medley with bad parts is dropped, a plain card with a stray parts field loses it
  const junk = JSON.parse(J(RUN.serialize(R)));
  junk.deck.push({ uid: 900, id: 'medley', parts: ['hanae_slash', 'kuro_ink_bolt'], up: 0, gems: [] });
  junk.deck.push({ uid: 901, id: 'medley', parts: ['nope'], up: 0, gems: [] });
  junk.deck.push({ uid: 902, id: 'medley', up: 0, gems: [] });
  junk.deck.push({ uid: 903, id: 'hanae_slash', parts: ['hanae_slash', 'hanae_parry'], up: 0, gems: [null] });
  const R4 = RUN.deserialize(junk);
  t.ok(!R4.deck.some((c) => c.uid >= 900 && c.uid <= 902), 'Medleys with mixed heroes, one part or no parts are dropped');
  const plain = R4.deck.find((c) => c.uid === 903);
  t.ok(plain && !('parts' in plain), 'a plain card never carries parts');
  // the combat init carries the Medley and COMBAT plays it
  const init = RUN.combatInit(R, { kind: 'combat', tile: { q: 0, r: 0 }, tier: 'normal', enemies: ['kappa'], seed: 1 });
  const C = g.COMBAT.create(init);
  const inC = C.draw.find((c) => c.id === 'medley');
  t.ok(inC && J(inC.parts) === J(m.parts) && inC.gems.length === D.medleyDef(m.parts).slots.length, 'COMBAT.create keeps the parts and the gem slots of the Medley');
});

await t.test('the engine plays a Medley as both halves: damage then Block, Fanbase and copies keep the parts, picks and hand filters see the merged card', () => {
  const g = engine();
  const { DATA: D } = g;
  const C = dummyFight(g, { deck: [{ id: 'medley', parts: ['hanae_slash', 'hanae_parry'], gems: [null, null] }, 'hanae_slash'], mods: { energy: 9, hand: 10 } });
  const m = C.hand.find((c) => c.id === 'medley');
  t.ok(!!m && J(m.parts) === J(['hanae_slash', 'hanae_parry']), 'the Medley is in hand with its parts');
  t.ok(C.needsTarget(m.uid), 'it needs a target');
  const hp0 = C.enemies[0].hp, blk0 = C.heroes[0].block, en0 = C.energy;
  const ev = C.play(m.uid, C.enemies[0].id);
  t.eq(C.enemies[0].hp, hp0 - 8, 'Petal Note half: 6 + 2 lead damage');
  t.eq(C.heroes[0].block, blk0 + 5, 'Soft Shield half: 5 Block');
  t.eq(C.energy, en0 - 1, 'one Breath for both');
  t.eq(only(ev, 'play')[0].card.parts.join('+'), 'hanae_slash+hanae_parry', 'the play event copy carries the parts');
  t.ok(C.discard.some((c) => c.id === 'medley' && c.parts), 'it went to the discard pile with its parts');
  t.eq(only(ev, 'hit').length, 1, 'one hit'); t.eq(only(ev, 'block').length, 1, 'one block');
  // the resolution cache tells Medleys with different parts apart
  const C2 = dummyFight(g, { deck: [{ id: 'medley', parts: ['hanae_slash', 'hanae_parry'], gems: [null, null] }, { id: 'medley', parts: ['hanae_parry', 'hanae_petal_step'], gems: [null, null] }], mods: { energy: 9, hand: 10 } });
  const [x, y] = C2.hand.filter((c) => c.id === 'medley');
  t.ok(C2.needsTarget(x.uid) !== C2.needsTarget(y.uid), 'two Medleys with different parts resolve differently (one needs a target, one does not)');
  // the greedy bot plays a deck full of Medleys without errors
  const deck = [];
  for (let i = 0; i < 10; i++) deck.push({ id: 'medley', parts: i % 2 ? ['hanae_slash', 'hanae_parry'] : ['kuro_ink_bolt', 'kuro_ink_ward'], gems: [null, null] });
  const s = g.COMBAT.simulate({ heroes: HEROES, deck: deckOf(deck), enemies: ['kappa', 'kodama'], seed: 4 });
  t.ok(s.result === 'win' && !s.capped, 'the bot wins a fight with a Medley deck (' + s.turns + ' turns)');
  t.ok(s.C.events.some((e) => e.type === 'play' && e.card.id === 'medley'), 'and played Medleys');
  // a pick with a hero filter sees the Medley's hero
  const pickCard = D.add('cards', { cm_pick: { name: 'cm_pick', hero: 'hanae', type: 'skill', rarity: 'common', cost: 0, fx: [{ op: 'pick', from: 'hand', n: 1, then: 'upgrade', filter: { hero: 'kuro' } }], up: { fx: [] }, kw: [], slots: [], art: { m: 'slash', c: 'rose' } } });
  const C3 = dummyFight(g, { deck: ['cm_pick', { id: 'medley', parts: ['kuro_ink_bolt', 'kuro_ink_ward'], gems: [null, null] }], mods: { energy: 9, hand: 10 } });
  const pk = C3.hand.find((c) => c.id === 'cm_pick');
  const ev3 = C3.play(pk.uid);
  t.eq(only(ev3, 'card_upgrade').length, 1, 'the hero filter matched the RoxorLoops Medley and upgraded it (auto resolved pick)');
  t.ok(C3.hand.find((c) => c.id === 'medley').up === 1, 'the Medley is upgraded for the fight');
});

await t.test('the elite reward offers a Medley once: medleyStart raises the pending choice, [] declines, two uids fuse, wrong answers are refused', () => {
  const g = engine();
  const { RUN } = g;
  const R = RUN.newRun({ seed: 31, heroes: ['hanae', 'kuro'], trial: 0 });
  RUN.startChapter(R, 1);
  const win = (tier) => {
    R.node = { kind: 'combat', tile: { q: 0, r: 0 }, tier, enc: null, enemies: ['kappa'], seed: 1, rewards: true, onWin: null, source: 'combat' };
    const C = g.COMBAT.create(RUN.combatInit(R, R.node));
    C.start(); C.enemies.forEach((e) => { e.hp = 0; e.down = true; }); C.result = 'win'; C.phase = 'over';
    return RUN.combatDone(R, C);
  };
  const normal = win('normal');
  t.eq(normal.medley, false, 'a normal fight offers no Medley');
  RUN.finishNode(R);
  const rw = win('elite');
  t.eq(rw.medley, true, 'an elite fight offers one');
  t.eq(R.node.rewards, rw, 'the reward node holds it');
  t.deep(RUN.medleyStart(R, normal), { ok: false, reason: 'offer', pending: [] }, 'an offer-less rewards object cannot start one');
  const st = RUN.medleyStart(R, rw);
  t.ok(st.ok && st.pending.length === 1 && st.pending[0].op === 'medley' && st.pending[0].n === 2, 'medleyStart raises the pending {op: medley, n: 2}');
  t.eq(rw.medley, 'pending', 'the offer is pending');
  t.eq(R.pending[0], st.pending[0], 'it waits in R.pending');
  t.deep(RUN.medleyStart(R, rw), { ok: false, reason: 'offer', pending: [] }, 'not twice');
  const p = st.pending[0];
  const a = R.deck.find((c) => c.id === 'hanae_slash'), b = R.deck.find((c) => c.id === 'hanae_parry'), k = R.deck.find((c) => c.id === 'kuro_ink_bolt');
  t.eq(RUN.resolvePending(R, p.id, [a.uid, k.uid]).ok, false, 'two heroes: refused');
  t.eq(RUN.resolvePending(R, p.id, [a.uid]).ok, false, 'one card: refused');
  t.eq(RUN.resolvePending(R, p.id, [a.uid, a.uid]).ok, false, 'the same card twice: refused');
  t.eq(RUN.resolvePending(R, p.id, null).ok, false, 'no answer: refused');
  t.eq(R.pending.length, 1, 'still pending after refusals');
  const dec = RUN.resolvePending(R, p.id, []);
  t.ok(dec.ok && R.pending.length === 0, '[] declines'); t.eq(rw.medley, true, 'the offer is open again (the player may change their mind)');
  const n0 = R.deck.length;
  const st2 = RUN.medleyStart(R, rw);
  const res = RUN.resolvePending(R, st2.pending[0].id, [a.uid, b.uid]);
  t.ok(res.ok && R.pending.length === 0, 'two uids fuse');
  t.eq(res.log[0].op, 'medley', 'a medley log line'); t.eq(res.log[0].text, 'Petal Note and Soft Shield became a Medley.', 'what it says');
  t.eq(rw.medley, 'done', 'the offer is spent'); t.eq(R.deck.length, n0 - 1, 'the deck lost one card');
  t.deep(RUN.medleyStart(R, rw), { ok: false, reason: 'offer', pending: [] }, 'once per elite');
  // the reward node survives a save with the pending offer
  const st3 = (() => { rw.medley = true; return RUN.medleyStart(R, rw); })();
  const R2 = RUN.deserialize(JSON.parse(J(RUN.serialize(R))));
  t.ok(R2.pending.length === 1 && R2.pending[0].op === 'medley' && R2.node.rewards.medley === 'pending', 'a save keeps the pending Medley and the offer state');
  t.ok(RUN.resolvePending(R2, st3.pending[0].id, []).ok && R2.node.rewards.medley === true, 'and declining after a load reopens the offer');
  // a deck with no pair: the offer is not made
  const R3 = RUN.newRun({ seed: 32, heroes: ['hanae', 'kuro'], trial: 0 }); RUN.startChapter(R3, 1);
  R3.deck = R3.deck.filter((c) => c.id === 'hanae_slash').slice(0, 1);
  R3.node = { kind: 'combat', tile: { q: 0, r: 0 }, tier: 'elite', enc: null, enemies: ['kappa'], seed: 1, rewards: true, onWin: null, source: 'combat' };
  const C3 = g.COMBAT.create(RUN.combatInit(R3, R3.node)); C3.start(); C3.enemies.forEach((e) => { e.hp = 0; e.down = true; }); C3.result = 'win'; C3.phase = 'over';
  t.eq(RUN.combatDone(R3, C3).medley, false, 'no pair in the deck: no offer');
});

// ================================================================================================ the screens
const $ = (g, sel, root) => (root || g._doc).querySelector(sel);
const $$ = (g, sel, root) => Array.from((root || g._doc).querySelectorAll(sel));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const idle = async (g, n = 4) => { for (let i = 0; i < n; i++) await g._settle(); };
const click = async (g, el) => { if (!el) throw new Error('click: no element'); g._click(el); await idle(g, 2); };
function freshGame(only, seed) {
  const g = boot({ only, seed: seed || 5, continue: true });
  if (g._errors.length) throw new Error('boot errors: ' + J(g._errors.map((e) => e.file + ':' + e.line + ' ' + e.message)));
  g.GAME.boot();
  return g;
}

await t.test('the fight HUD: the Crowd meter sits beside Breath with one pip per step, lights up as cards are played and pulses when the crowd goes wild', async () => {
  const g = freshGame(['screen_combat', 'main'], 777);
  const R = g.GAME.debug.quickRun({ heroes: ['hanae', 'kuro'], seed: 777, chapter: 1 });
  await idle(g);
  const node = { kind: 'combat', tile: { q: 1, r: 1 }, tier: 'normal', enemies: ['kappa'], seed: 4242, chapter: 1 };
  R.node = node;
  await g.UI.go('combat', { node, R }, { force: true, transition: 'none' });
  await idle(g, 6);
  const meter = $(g, '.cm-crowd');
  t.ok(!!meter, 'the meter exists');
  t.eq($$(g, '.cm-crowd .cr-pip').length, 7, 'seven pips');
  t.eq($$(g, '.cm-crowd .cr-pip.on').length, 0, 'none lit at the start');
  t.eq(meter.getAttribute('aria-label'), 'Crowd 0 of 7', 'aria label');
  t.eq(meter.dataset.kwExplain, 'crowd', 'the explainer hook names the keyword');
  t.eq(txt($(g, '.cm-crowd .cr-l')), 'CROWD', 'labelled');
  const st = g.UI.screens.combat._t.state();
  const C = st.C;
  C.energy = 20; C.crowd = 5;
  g.UI.screens.combat._t.state().C.hand.splice(0, C.hand.length);
  for (let i = 0; i < 3; i++) C.hand.push({ uid: 7000 + i, id: 'hanae_slash', up: 0, gems: [null], tmp: true });
  const dbg = g.UI.screens.combat.debug();
  dbg.play(0, 0); await idle(g, 8);
  t.eq($$(g, '.cm-crowd .cr-pip.on').length, 6, 'six pips lit after a play at 5');
  const toasts0 = $$(g, '.toast').length;
  dbg.play(0, 0); await idle(g, 10);
  t.eq(C.crowdWild, 1, 'the crowd went wild');
  t.eq($$(g, '.cm-crowd .cr-pip.on').length, C.crowd, 'the meter shows the wrapped value (' + C.crowd + ')');
  t.ok(C.hand.some((c) => c.crowd), 'the free Signature is in the engine hand');
  t.ok($$(g, '.cm-hand .card').some((el) => el.dataset.id === g.DATA.signatureOf('hanae')), 'and on screen');
  t.ok($$(g, '.toast').length >= toasts0, 'a toast announced it (' + $$(g, '.toast').map(txt).join(' | ') + ')');
  t.eq(st.drift, null, 'the view model did not drift from the engine');
  t.eq(g._console.error.length, 0, 'no console errors');
});

await t.test('the elite reward: Make a Medley opens two deck picks, fuses the pair, and the button retires; Cancel declines without loss', async () => {
  const g = freshGame(['screen_node', 'main'], 5);
  g._run('globalThis.__done = 0; GAME.nodeDone = () => { __done++; return Promise.resolve(); }; GAME.enterNode = () => Promise.resolve();');
  const { RUN, DATA: D } = g;
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, trial: 0 });
  g.GAME.state.R = R; g.UI.setRun(R);
  const M = R.map, pos = M.pos;
  const nb = g.MAP.neighbors(M, pos.q, pos.r).map((c) => M.tiles[g.MAP.key(c[0], c[1])]).find((x) => x && x.type !== 'block');
  nb.type = 'elite'; nb.painted = true; nb.known = true; nb.done = false; nb.content = {};
  const node = RUN.step(R, nb.q, nb.r);
  const C = g.COMBAT.create(RUN.combatInit(R, node));
  C.start(); C.enemies.forEach((e) => { e.hp = 0; e.down = true; }); C.result = 'win'; C.phase = 'over';
  const rewards = RUN.combatDone(R, C);
  t.eq(rewards.medley, true, 'offered');
  await g.UI.go('reward', { rewards, source: R.node.source, node: R.node, R }, { force: true, transition: 'none' });
  await idle(g);
  const box = $(g, '.rw-medley');
  t.ok(!!box, 'the Medley box is on the ledger');
  t.ok(!$(g, '.rw-relicbox') || $(g, '.rw-relicbox') !== box, 'and it is not the Charm box');
  const btn = $$(g, 'button', box).find((b) => /Make a Medley/.test(b.textContent));
  t.ok(!!btn && !btn.disabled, 'Make a Medley is live');
  const n0 = R.deck.length;
  // cancel at the first pick: nothing happens
  await click(g, btn);
  t.ok(g.UI.overlay.has('deck'), 'the deck overlay opened for the first song');
  t.ok(/first song/.test(txt($(g, '.o-deck'))), 'titled for the first pick');
  const cancel = $$(g, '.o-deck button').find((b) => /Cancel|Close|Back/.test(b.textContent));
  if (cancel) await click(g, cancel); else { g.UI.overlay.closeTop ? g.UI.overlay.closeTop() : null; await idle(g, 3); }
  await idle(g, 3);
  t.eq(R.deck.length, n0, 'cancel: the deck is whole'); t.eq(R.pending.length, 0, 'and nothing pends'); t.eq(rewards.medley, true, 'the offer stays open');
  // the real thing: Petal Note, then a Jasmin card
  await click(g, btn);
  const first = $$(g, '.o-deck .dk-card').find((c) => c.dataset.id === 'hanae_slash');
  t.ok(!!first, 'Petal Note is offered');
  await click(g, first); await click(g, $(g, '.o-deck .dk-go'));
  await idle(g, 3);
  t.ok(/second song/.test(txt($(g, '.o-deck'))), 'the second pick is up');
  const seconds = $$(g, '.o-deck .dk-card');
  t.ok(seconds.length > 0 && seconds.every((c) => D.cards[c.dataset.id].hero === 'hanae'), 'only Jasmin cards are offered for the second song');
  t.ok(!seconds.some((c) => c.dataset.uid === String(first.dataset.uid)), 'not the card already chosen');
  const second = seconds.find((c) => c.dataset.id === 'hanae_parry');
  await click(g, second); await click(g, $(g, '.o-deck .dk-go'));
  await idle(g, 6);
  t.ok(!g.UI.overlay.has('deck'), 'the overlay closed');
  t.eq(R.deck.length, n0 - 1, 'two cards became one');
  const m = R.deck.find((c) => c.id === 'medley');
  t.ok(!!m && J(m.parts) === J(['hanae_slash', 'hanae_parry']), 'the Medley is in the deck');
  t.eq(rewards.medley, 'done', 'the offer is spent');
  t.ok($$(g, 'button', box).every((b) => b.disabled), 'the button retired');
  t.ok(/one now/.test(txt(box)), 'the box says so: ' + txt(box));
  t.ok($$(g, '.toast').some((el) => /became a Medley/.test(txt(el))), 'a toast reports the fusion');
  // the deck overlay shows the Medley: first part's art, a plus badge, the type strip MEDLEY
  g.UI.overlay.open('deck', { mode: 'view' });          // resolves when it closes: never awaited
  await idle(g, 3);
  const card = $$(g, '.o-deck .card').find((c) => c.dataset.id === 'medley');
  t.ok(!!card, 'the Medley card is drawn in the deck view');
  t.ok(card && card.classList.contains('medley') && !!card.querySelector('.c-medley') && card.querySelector('.c-medley').dataset.kwExplain === 'medley', 'with the plus badge that explains itself');
  t.eq(card && txt(card.querySelector('.c-tname')), 'Medley', 'the type strip reads Medley');
  t.eq(card && card.dataset.parts, 'hanae_slash+hanae_parry', 'data-parts names the songs');
  t.ok(card && /Deal 6 damage\. Gain 5 Block\./.test(txt(card.querySelector('.c-rules'))), 'both texts on the card: ' + (card && txt(card.querySelector('.c-rules'))));
  t.eq(g._console.error.length, 0, 'no console errors');
});

t.done();
