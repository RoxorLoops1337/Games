// GUESTS (DATA.guests, data_guests.js; combat.js "GUESTS"; DESIGN 4.3 "Guests"): the Roguebook style ally cards, end to end.
//
//   Data      twelve guests, three per hero (two uncommon Guest cards and one rare), every one validated, with the glossary word, the economy
//             slot count, the generated card text (name, stay, every number, under 110 characters), the upgrade changing a printed number,
//             and the house rule "no guest gives more than 1 Breath per turn, none draws at the end of the turn".
//   Engine    guest_enter on play (enter ops run), guest_act at the end of every owner turn in enter order (after the turnEnd hooks, before the
//             discard), the countdown and guest_exit 'done' (exit ops run), a third guest replacing the oldest ('replaced', its exit effect fires
//             first), a silent guest while its owner is voiceless, hooks that live only while the guest stays, per:'guests' and cond guests,
//             kills credited to the owner, guest_exit 'end' before the end event, no act once the fight is decided, determinism, conservation.
//   Bot       COMBAT.greedyPolicy values and plays a Guest card.   Saves   an old hv_run_v1 save (no guest field exists) still loads and fights.
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus guests');
const J = (x) => JSON.stringify(x);
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
const types = (ev) => ev.map((e) => e.type);
const only = (ev, type) => ev.filter((e) => e.type === type);

function engine() {
  const g = boot({ only: ['data_text', 'combat', 'run'] });
  if (g._errors.length) throw new Error('boot errors: ' + J(g._errors.map((e) => e.file + ':' + e.line + ' ' + e.message)));
  return g;
}
const G = engine();
const { DATA: D, COMBAT, RUN } = G;
const HEROES = [{ id: 'hanae', hp: 84, maxHp: 84 }, { id: 'kuro', hp: 68, maxHp: 68 }];
const deckOf = (ids) => ids.map((id, i) => (typeof id === 'string' ? { uid: 100 + i, id, up: 0, gems: [] } : Object.assign({ uid: 100 + i, up: 0, gems: [] }, id)));
// test enemies: a big dummy that does nothing, a one HP weakling, a hitter
if (!D.enemies.gt_dummy) {
  const base = { chapter: 1, tier: 'normal', size: 'm', ai: { seq: ['idle'] }, lore: 'A test creature for the guests suite.', tags: ['spirit'], moves: { idle: { name: 'Idle', kind: 'none', fx: [] } } };
  D.add('enemies', {
    gt_dummy: Object.assign({ name: 'gt_dummy', hp: [999, 999], art: { id: 'gt_dummy' } }, base),
    gt_dummy2: Object.assign({ name: 'gt_dummy2', hp: [999, 999], art: { id: 'gt_dummy2' } }, base),
    gt_weak: Object.assign({ name: 'gt_weak', hp: [1, 1], art: { id: 'gt_weak' } }, base),
    gt_hitter: Object.assign({ name: 'gt_hitter', hp: [999, 999], art: { id: 'gt_hitter' } }, base, { ai: { seq: ['hit'] }, moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] } } }),
  });
}
// synthetic Guest cards and guests that exercise the counter and the cond (the shipped twelve stay readable)
if (!D.guests.guest_t_counter) {
  D.add('guests', {
    guest_t_counter: { name: 'Counter Guest', hero: 'kuro', stay: 2, act: [{ op: 'block', n: { per: 'guests', mul: 2 }, tgt: 'self' }], art: { m: 'star', c: 'ash' }, blurb: 'Counts heads.' },
    guest_t_hooky: { name: 'Hooky Guest', hero: 'kuro', stay: 1, act: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }], hooks: [{ on: 'onPlay', fx: [{ op: 'block', n: 2, tgt: 'self' }] }], exit: [{ op: 'heal', n: 1, tgt: 'both' }], art: { m: 'star', c: 'ash' }, blurb: 'Hooks on, hooks off.' },
    guest_t_killer: { name: 'Killer Guest', hero: 'hanae', stay: 4, act: [{ op: 'dmg', n: 50, tgt: 'enemy' }], enter: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }], exit: [{ op: 'block', n: 9, tgt: 'both' }], art: { m: 'star', c: 'ash' }, blurb: 'Hits hard.' },
  });
  D.add('cards', {
    kuro_t_guest_counter: { name: 'Counter Call', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 0, fx: [{ op: 'guest', id: 'guest_t_counter' }, { op: 'cond', if: { guests: { gte: 2 } }, then: [{ op: 'draw', n: 1 }] }], up: { fx: [{ op: 'guest', id: 'guest_t_counter' }] }, kw: [], slots: ['gold'], art: { m: 'star', c: 'ash' } },
    kuro_t_guest_hooky: { name: 'Hooky Call', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 0, fx: [{ op: 'guest', id: 'guest_t_hooky' }], up: { cost: 1 }, kw: [], slots: ['gold'], art: { m: 'star', c: 'ash' } },
    hanae_t_guest_killer: { name: 'Killer Call', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 0, fx: [{ op: 'guest', id: 'guest_t_killer' }], up: { cost: 1 }, kw: [], slots: ['gold'], art: { m: 'star', c: 'ash' } },
    kuro_t_count_dmg: { name: 'Head Count', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 0, fx: [{ op: 'dmg', n: { base: 1, per: 'guests', mul: 3 }, tgt: 'enemy' }], up: { cost: 1 }, kw: [], slots: ['red'], art: { m: 'star', c: 'ash' } },
  });
}
function fight(o = {}) {
  const C = COMBAT.create({ heroes: o.heroes || HEROES, frontIdx: o.frontIdx || 0, deck: deckOf(o.deck || []), enemies: o.enemies || ['gt_dummy'], seed: o.seed === undefined ? 5 : o.seed, mods: o.mods || D.modsFor([], 0), relics: o.relics || [] });
  if (o.start !== false) C.start();
  return C;
}
// pull a card into the hand by id and play it (targets: the first living enemy when it asks)
function toHand(C, id) {
  const inHand = C.hand.find((c) => c.id === id);
  if (inHand) return inHand;
  for (const p of [C.draw, C.discard, C.exhaust]) { const i = p.findIndex((c) => c.id === id); if (i >= 0) { const c = p.splice(i, 1)[0]; C.hand.push(c); return c; } }
  return null;
}
function play(C, id) {
  const c = toHand(C, id);
  if (!c) throw new Error('no card ' + id);
  C.energy = Math.max(C.energy, 9);
  const tgt = C.needsTarget(c.uid) ? C.legalTargets(c.uid)[0] : undefined;
  const ev = C.play(c.uid, tgt);
  if (!ev.length) throw new Error('could not play ' + id + ': ' + J(C.canPlay(c.uid, tgt)));
  return ev;
}
const GUEST_CARDS = Object.values(D.cards).filter((c) => c.fx.some((o) => o.op === 'guest') && !/_t_/.test(c.id));
const SHIPPED = Object.values(D.guests).filter((g) => !/^guest_t_/.test(g.id));

// ================================================================================================ data
t.test('twelve guests, three per hero, each called by one Guest card of its hero: two uncommon and one rare Skill per hero, every one with an upgrade', () => {
  t.eq(SHIPPED.length, 12, 'twelve guests');
  t.eq(GUEST_CARDS.length, 12, 'twelve Guest cards');
  t.eq(D.QUOTA.cards.guests, 3, 'the quota');
  D.LISTS.heroIds.forEach((h) => {
    const gs = SHIPPED.filter((g) => g.hero === h), cs = GUEST_CARDS.filter((c) => c.hero === h);
    t.eq(gs.length, 3, h + ': three guests');
    t.eq(cs.length, 3, h + ': three Guest cards');
    t.deep(cs.map((c) => c.rarity).sort(), ['rare', 'uncommon', 'uncommon'], h + ': two uncommon, one rare');
    cs.forEach((c) => {
      t.eq(c.type, 'skill', c.id + ' is a Skill');
      t.ok(/^[a-z]+_guest_[a-z_]+$/.test(c.id), c.id + ' id shape <hero>_guest_*');
      t.ok(c.up && c.up.fx && c.up.fx[0].op === 'guest' && c.up.fx[0].up === true && c.up.fx[0].id === c.fx[0].id, c.id + ': the upgrade calls the upgraded guest');
      t.eq(D.guests[c.fx[0].id].hero, h, c.id + ' calls a guest of its own hero');
      t.eq(D.targetMode(c.id), 'none', c.id + ' never asks for a target (the guest picks its own)');
    });
    t.eq(new Set(cs.map((c) => c.fx[0].id)).size, 3, h + ': three different guests');
  });
  const F = engine().DATA;   // a fresh boot: this suite adds synthetic enemies, guests and cards to G
  const v = F.validate(undefined, { strict: true });
  t.eq(v.errors.length, 0, 'strict validation is clean: ' + v.errors.slice(0, 5).join('; '));
  t.deep(F.audit('cards').filter((x) => x.indexOf('audit') === 0), [], 'the card audit is clean with the Guest cards counted');
  t.eq(D.ECONOMY.guestSlots, 2, 'two guests fit on stage');
  t.ok(D.LISTS.cardOps.indexOf('guest') >= 0 && D.LISTS.hookOps.indexOf('guest') < 0, 'guest is a card op, never a hook op');
  t.ok(D.LISTS.per.indexOf('guests') >= 0 && D.LISTS.cond.indexOf('guests') >= 0, 'the guests counter and cond are in the vocabularies');
  ['guest_enter', 'guest_act', 'guest_exit'].forEach((e) => t.ok(D.LISTS.combatEvents.indexOf(e) >= 0, 'event ' + e + ' listed'));
  const kw = D.keywords.guest;
  t.ok(kw && kw.name === 'Guest' && /two fit on stage/i.test(kw.text) && /never hit guests/i.test(kw.text), 'the glossary explains guests');
});

t.test('guest definitions: stay 1..6, small acts, art from the lists, a blurb, every number readable; one damage, one protection and one odd one per hero', () => {
  SHIPPED.forEach((g) => {
    t.ok(g.stay >= 1 && g.stay <= 6, g.id + ' stay ' + g.stay);
    t.ok(g.act.length >= 1 && g.act.length <= 2, g.id + ' act has one or two ops');
    t.ok(D.LISTS.motifs.indexOf(g.art.m) >= 0 && D.LISTS.palettes.indexOf(g.art.c) >= 0, g.id + ' art from the lists');
    t.ok(typeof g.blurb === 'string' && g.blurb.length <= 100 && /^[\x20-\x7e]+$/.test(g.blurb) && !DASH.test(g.blurb), g.id + ' blurb is one plain line');
    t.ok(g.up && Object.keys(g.up).length, g.id + ' has an upgrade');
    // no guest gives more than 1 Breath per turn, and none draws at the end of the turn (the discard follows at once)
    const all = [].concat(g.act, g.enter || [], g.exit || [], ...(g.hooks || []).map((h) => h.fx), ...Object.values(g.up).flatMap((v) => (Array.isArray(v) ? v : [])));
    D.walkOps(all, (o) => { if (o.op === 'energy') t.ok(o.n <= 1, g.id + ' gives at most 1 Breath'); });
    D.walkOps(g.act, (o) => t.ok(o.op !== 'draw' && o.op !== 'energy', g.id + ': the act neither draws nor gives Breath (the hand is discarded right after)'));
  });
  const kinds = (g) => { const ops = []; D.walkOps(g.act, (o) => ops.push(o.op)); return ops; };
  D.LISTS.heroIds.forEach((h) => {
    const gs = SHIPPED.filter((g) => g.hero === h);
    t.ok(gs.some((g) => kinds(g).indexOf('dmg') >= 0), h + ': a guest that deals damage');
    t.ok(gs.some((g) => kinds(g).some((k) => k === 'block' || k === 'heal')), h + ': a guest that protects');
  });
  // guestDef merges the upgrade field by field
  const d0 = D.guestDef('guest_hype_parrot', false), d1 = D.guestDef('guest_hype_parrot', true);
  t.eq(d0.stay, 2, 'Hype Parrot stays 2'); t.eq(d1.stay, 3, 'Hype Parrot+ stays 3'); t.deep(d1.act, d0.act, 'the act is unchanged by that upgrade'); t.eq(d1.up, true, 'flagged as upgraded');
  t.eq(D.guestDef('nope', false), null, 'unknown id');
  t.deep(D.guestDef('guest_dj_scratchy', true).act, [{ op: 'dmg', n: 6, tgt: 'enemy' }], 'DJ Scratchy+ hits for 6');
});

t.test('text: "Guest <Name> for N turns: ..." names the guest, prints the stay and every number, reads under 110 characters, and the upgrade changes a printed number', () => {
  GUEST_CARDS.forEach((c) => {
    const texts = [0, 1].map((up) => D.cardPlain({ id: c.id, up, gems: [] }));
    const gd = D.guestDef(c.fx[0].id, false);
    texts.forEach((txt, up) => {
      const g = D.guestDef(c.fx[0].id, !!up);
      t.ok(txt.indexOf('Guest ' + g.name + ' for ' + g.stay + ' turn') === 0, `${c.id}${up ? '+' : ''} opens with the guest and its stay: ${txt}`);
      t.ok(txt.length <= 110, `${c.id}${up ? '+' : ''} text is ${txt.length} characters: ${txt}`);
      t.ok(/at (the end of your turn|turn end), /i.test(txt), `${c.id}: says when the guest acts`);
      t.ok(!/undefined|NaN|\[object|something/.test(txt) && !DASH.test(txt) && /^[A-Z]/.test(txt) && /\.$/.test(txt), `${c.id}: clean text`);
      D.walkOps([].concat(g.act, g.enter, g.exit), (o) => { if (typeof o.n === 'number') t.ok(new RegExp('(^|[^0-9])' + o.n + '([^0-9]|$)').test(txt), `${c.id}${up ? '+' : ''} prints ${o.n}`); if (o.op === 'status') t.ok(txt.indexOf(D.statuses[o.s].name) >= 0, `${c.id} names ${D.statuses[o.s].name}`); });
      if (g.enter.length) t.ok(/on arrival, /.test(txt), c.id + ': the enter ops read "on arrival"');
      if (g.exit.length) t.ok(/ On leaving, /.test(txt), c.id + ': the exit ops read "On leaving"');
      g.hooks.forEach(() => t.ok(/At (the start of your turn|turn start), /.test(txt), c.id + ': the hook has its own sentence'));
    });
    t.ok(texts[0] !== texts[1], c.id + ': the upgrade changes the printed text');
    t.ok(gd.name.split(' ').length <= 3, gd.name + ' is at most three words');
  });
  t.eq(D.cardPlain('kuro_guest_dj'), 'Guest DJ Scratchy for 3 turns: at the end of your turn, deal 4 damage to a random enemy.', 'DJ Scratchy');
  t.eq(D.cardPlain({ id: 'kuro_guest_drum_machine', up: 1, gems: [] }), 'Guest Metro Gnome for 3 turns: at turn end, deal 2 damage to all enemies. At turn start, gain 1 Breath.', 'Metro Gnome+ (compact wording, under 110)');
  t.eq(D.cardPlain('raiga_guest_uncle'), 'Guest Mosh Pit Uncle for 2 turns: at turn end, deal 2 damage to all enemies for each guest on stage.', 'the guests counter reads');
  const html = D.cardHtml('kuro_guest_dj');
  t.ok(/<span class="kw" data-kw="guest">Guest<\/span>/.test(html), 'the Guest word is a glossary keyword');
  t.ok(/<span class="num">3<\/span> turns/.test(html) && /<span class="num">4<\/span> damage/.test(html), 'numbers are marked up');
  t.ok(/<span class="num up">6<\/span> damage/.test(D.cardHtml({ id: 'kuro_guest_dj', up: 1, gems: [] })), 'the upgraded number reads as up');
  // the cond and the counter in card text
  t.eq(D.cardPlain('kuro_t_guest_counter'), 'Guest Counter Guest for 2 turns: at turn end, gain 2 Block for each guest on stage. If 2 or more guests are on stage, draw 1 card.', 'cond guests (the compact wording keeps a long card readable)');
  t.eq(D.opsText([{ op: 'cond', if: { guests: { lte: 0 } }, then: [{ op: 'draw', n: 1 }] }]), 'If no guest is on stage, draw 1 card.', 'no guest');
  t.eq(D.opsText([{ op: 'cond', if: { guests: { gte: 1 } }, then: [{ op: 'draw', n: 1 }] }]), 'If a guest is on stage, draw 1 card.', 'a guest');
  t.eq(D.cardPlain('kuro_t_count_dmg'), 'Deal 1 damage, plus 3 for each guest on stage.', 'per guests with a base');
});

t.test('validator: a guest needs a hero, a stay 1..6, a non-empty act of hook ops, list art and a blurb; guest hooks have no once or every; the op sits on a Skill at the top level', () => {
  const errsOf = (defs, cards) => {
    const g2 = boot({ only: ['data_text'] });
    const D2 = g2.DATA;
    if (defs) D2.add('guests', defs);
    if (cards) D2.add('cards', cards);
    return D2.validate(['guests', 'cards']).errors.join(' | ');
  };
  const ok = () => ({ name: 'Ok', hero: 'kuro', stay: 2, act: [{ op: 'block', n: 2, tgt: 'self' }], art: { m: 'star', c: 'ash' }, blurb: 'Fine.' });   // a factory: DATA.add writes the id onto the def
  t.eq(errsOf({ guest_ok: ok() }), '', 'a good guest passes');
  t.ok(/stay/.test(errsOf({ guest_a: Object.assign(ok(), { stay: 7 }) })), 'stay above 6');
  t.ok(/stay/.test(errsOf({ guest_a: Object.assign(ok(), { stay: 0 }) })), 'stay 0');
  t.ok(/act/.test(errsOf({ guest_a: Object.assign(ok(), { act: [] }) })), 'an empty act');
  t.ok(/not allowed in hook/.test(errsOf({ guest_a: Object.assign(ok(), { act: [{ op: 'pick', from: 'hand', n: 1, then: 'discard' }] }) })), 'a pick is not a hook op');
  t.ok(/not allowed in hook|guest/.test(errsOf({ guest_a: Object.assign(ok(), { act: [{ op: 'guest', id: 'guest_ok' }] }) })), 'a guest op is never a hook op');
  t.ok(/hero/.test(errsOf({ guest_a: Object.assign(ok(), { hero: 'nobody' }) })), 'an unknown hero');
  t.ok(/art/.test(errsOf({ guest_a: Object.assign(ok(), { art: { m: 'nope', c: 'ash' } }) })), 'a motif outside the list');
  t.ok(/blurb/.test(errsOf({ guest_a: Object.assign(ok(), { blurb: 42 }) })), 'no blurb');
  t.ok(/unknown field/.test(errsOf({ guest_a: Object.assign(ok(), { hp: 10 }) })), 'guests have no HP');
  t.ok(/once|every|unknown field/.test(errsOf({ guest_a: Object.assign(ok(), { hooks: [{ on: 'turnStart', once: true, fx: [{ op: 'draw', n: 1 }] }] }) })), 'no once on a guest hook');
  t.ok(/combatHooks/.test(errsOf({ guest_a: Object.assign(ok(), { hooks: [{ on: 'onRest', fx: [{ op: 'draw', n: 1 }] }] }) })), 'run hooks are not guest hooks');
  t.ok(/up/.test(errsOf({ guest_a: Object.assign(ok(), { up: {} }) })), 'an empty upgrade');
  t.ok(/up/.test(errsOf({ guest_a: Object.assign(ok(), { up: { name: 'x' } }) })), 'an upgrade may not rename');
  t.ok(/dash/.test(errsOf({ guest_a: Object.assign(ok(), { blurb: 'Oh ' + String.fromCharCode(0x2014) + ' no.' }) })), 'no dashes');
  t.ok(/guest_/.test(errsOf({ dj: ok() })), 'ids start with guest_');
  const card = (fx, extra) => Object.assign({ name: 'Call', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1, fx, up: { cost: 0 }, kw: [], slots: ['gold'], art: { m: 'star', c: 'ash' } }, extra);
  t.eq(errsOf({ guest_ok: ok() }, { kuro_x: card([{ op: 'guest', id: 'guest_ok' }]) }), '', 'a good Guest card passes');
  t.ok(/type skill/.test(errsOf({ guest_ok: ok() }, { kuro_x: card([{ op: 'guest', id: 'guest_ok' }], { type: 'power' }) })), 'a Guest card is a Skill');
  t.ok(/top level/.test(errsOf({ guest_ok: ok() }, { kuro_x: card([{ op: 'cond', if: { row: 'front' }, then: [{ op: 'guest', id: 'guest_ok' }] }]) })), 'never inside a cond');
  t.ok(/belongs to/.test(errsOf({ guest_ok: ok() }, { hanae_x: card([{ op: 'guest', id: 'guest_ok' }], { hero: 'hanae' }) })), 'the guest belongs to the card\'s hero');
  t.ok(/up must be true/.test(errsOf({ guest_ok: ok() }, { kuro_x: card([{ op: 'guest', id: 'guest_ok', up: false }]) })), 'up is true or absent');
  t.ok(/unknown field/.test(errsOf({ guest_ok: ok() }, { kuro_x: card([{ op: 'guest', id: 'guest_ok', n: 2 }]) })), 'no other fields');
  t.ok(/one guest/.test(errsOf({ guest_ok: ok(), guest_two: ok() }, { kuro_x: card([{ op: 'guest', id: 'guest_ok' }], { up: { fx: [{ op: 'guest', id: 'guest_two' }] } }) })), 'base and upgrade call one guest');
  const g2 = boot({ only: ['data_text'] });
  g2.DATA.add('cards', { kuro_x: card([{ op: 'guest', id: 'guest_missing' }]) });
  t.ok(/unknown guest/.test(g2.DATA.validate(undefined, { strict: true }).errors.join(' | ')), 'strict: the guest must exist');
});

// ================================================================================================ engine
t.test('enter: playing a Guest card emits guest_enter with a plain snapshot, runs the enter ops as hook ops of the owner, and lists the guest in C.guests', () => {
  const C = fight({ deck: ['hanae_guest_parrot', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt'] });
  const ev = play(C, 'hanae_guest_parrot');
  t.deep(types(ev).slice(0, 3), ['play', 'energy', 'guest_enter'], 'play, the cost, then guest_enter');
  const ge = only(ev, 'guest_enter')[0];
  t.deep(ge.guest, { kind: 'guest', id: 'guest_hype_parrot#1', def: 'guest_hype_parrot', name: 'Hype Parrot', owner: 'hanae', stay: 2, up: 0, born: 1 }, 'the snapshot');
  t.eq(ge.hero, 'hanae', 'the owner');
  t.ok(ge.guest !== C.guests[0], 'a copy, not the live object');
  t.deep(C.guests.map((g) => ({ kind: g.kind, id: g.id, def: g.def, name: g.name, owner: g.owner, stay: g.stay, up: g.up, born: g.born })), [ge.guest], 'C.guests holds it');
  t.deep(Object.keys(C.guests[0]).sort(), ['born', 'def', 'id', 'kind', 'name', 'owner', 'stay', 'up'], 'exactly the contract fields are enumerable');
  const st = only(ev, 'status');
  t.eq(st.length, 1, 'one status event: the enter op'); t.deep([st[0].dst.id, st[0].s, st[0].delta], ['hanae', 'bloom', 2], 'Jasmin gains 2 Bloom on arrival');
  t.ok(types(ev).indexOf('guest_enter') < types(ev).indexOf('status'), 'guest_enter comes before its enter ops');
  t.eq(C.front().st.bloom, 2, 'the Bloom is real');
  // the same card again brings a second copy
  const C2 = fight({ deck: ['kuro_guest_dj', 'kuro_guest_dj', 'kuro_ink_bolt', 'hanae_slash', 'hanae_parry'] });
  play(C2, 'kuro_guest_dj'); play(C2, 'kuro_guest_dj');
  t.deep(C2.guests.map((g) => g.id), ['guest_dj_scratchy#1', 'guest_dj_scratchy#2'], 'two DJs, numbered');
  t.eq(C2.hand.length + C2.draw.length + C2.discard.length + C2.exhaust.length + C2.powers.length, 5 + C2.added, 'conservation of cards');
});

t.test('act: at the end of every owner turn (after the turnEnd hooks, before the discard) each guest emits guest_act then runs its act; stay counts down and at 0 the guest leaves with its exit ops and guest_exit done', () => {
  const C = fight({ deck: ['hanae_guest_grandma', 'kuro_guest_dj', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  const h = C.front(), k = C.back();
  h.hp = 70; k.hp = 60;
  play(C, 'hanae_guest_grandma'); play(C, 'kuro_guest_dj');
  const e1 = C.endTurn();
  const acts = only(e1, 'guest_act');
  t.deep(acts.map((a) => [a.guest.id, a.hero]), [['guest_harp_grandma#1', 'hanae'], ['guest_dj_scratchy#1', 'kuro']], 'both act, in enter order, each for its owner');
  t.deep(acts.map((a) => a.guest.stay), [2, 3], 'the snapshot shows the stay before the countdown');
  const tt = types(e1);
  t.ok(tt.indexOf('guest_act') > -1 && tt.indexOf('guest_act') < tt.indexOf('discard'), 'the guests act before the hand is discarded');
  t.ok(tt.indexOf('guest_act') < tt.indexOf('turn_end'), 'and before turn_end');
  const heals = only(e1, 'heal');
  t.deep(heals.map((x) => [x.dst.id, x.amount]), [['hanae', 2], ['kuro', 2]], 'Grandma heals both for 2');
  const hits = only(e1, 'hit').filter((x) => x.src === null && x.dst.kind === 'enemy');
  t.eq(hits.length, 1, 'the DJ strikes once'); t.eq(hits[0].raw, 4, 'for 4, with no attacker bonus (RoxorLoops stands in the backing spot, +2 for his own cards only)');
  t.deep(C.guests.map((g) => g.stay), [1, 2], 'stay counted down');
  const e2 = C.endTurn();
  t.deep(only(e2, 'guest_exit').map((x) => [x.guest.id, x.reason, x.guest.stay]), [['guest_harp_grandma#1', 'done', 0]], 'Grandma (stay 2) leaves when her stay runs out');
  const blocks = only(e2, 'block').filter((b) => b.dst.kind === 'hero');
  t.ok(blocks.some((b) => b.dst.id === 'hanae' && b.amount === 3) && blocks.some((b) => b.dst.id === 'kuro' && b.amount === 3), 'Grandma\'s parting gift: 3 Block for both');
  const t2 = types(e2);
  const iAct = t2.indexOf('guest_act'), iExit = t2.indexOf('guest_exit'), iBlock = t2.indexOf('block');
  t.ok(iAct < iBlock && iBlock < iExit, 'act, then exit ops, then guest_exit');
  t.deep(C.guests.map((g) => [g.def, g.stay]), [['guest_dj_scratchy', 1]], 'the DJ stays one more turn');
  const e3 = C.endTurn();
  t.deep(only(e3, 'guest_exit').map((x) => [x.guest.id, x.reason, x.guest.stay]), [['guest_dj_scratchy#1', 'done', 0]], 'the DJ leaves when his stay runs out');
  t.deep(C.guests, [], 'the stage is empty');
  t.eq(C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length, 7 + C.added, 'conservation holds');
  // every guest_act, guest_enter and guest_exit carries a plain snapshot, never the live object
  C.events.filter((e) => /^guest_/.test(e.type)).forEach((e) => t.ok(e.guest && e.guest.kind === 'guest' && !C.guests.some((g) => g === e.guest), e.type + ' carries a copy'));
});

t.test('replacement: a third guest sends the oldest off (exit ops first, guest_exit replaced) before it steps on, and a full stage counts 2 during its enter ops', () => {
  const C = fight({ deck: ['hanae_t_guest_killer', 'kuro_guest_dj', 'kuro_guest_loop_bot', 'hanae_slash', 'kuro_ink_bolt'], enemies: ['gt_dummy', 'gt_dummy2'] });
  play(C, 'hanae_t_guest_killer'); play(C, 'kuro_guest_dj');
  t.deep(C.guests.map((g) => g.def), ['guest_t_killer', 'guest_dj_scratchy'], 'two on stage');
  const ev = play(C, 'kuro_guest_loop_bot');
  const tt = types(ev);
  const ex = only(ev, 'guest_exit')[0];
  t.deep([ex.guest.def, ex.reason, ex.guest.stay], ['guest_t_killer', 'replaced', 4], 'the oldest is replaced with its stay intact');
  const blocks = only(ev, 'block');
  t.deep(blocks.map((b) => [b.dst.id, b.amount]), [['hanae', 9], ['kuro', 9]], 'its exit ops ran (9 Block for both), acted by its owner');
  t.ok(tt.indexOf('block') < tt.indexOf('guest_exit') && tt.indexOf('guest_exit') < tt.indexOf('guest_enter'), 'exit ops, guest_exit, then the newcomer enters');
  t.deep(C.guests.map((g) => g.def), ['guest_dj_scratchy', 'guest_loop_bot'], 'the stage: the DJ and the bot');
  // per guests during enter ops: the newcomer counts itself; the Counter Guest's act counts both
  const C2 = fight({ deck: ['kuro_t_guest_counter', 'kuro_guest_dj', 'kuro_t_guest_hooky', 'kuro_ink_bolt', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry'] });
  play(C2, 'kuro_guest_dj');
  const e2 = play(C2, 'kuro_t_guest_counter');
  t.eq(only(e2, 'draw').length, 1, 'with 2 guests on stage the cond draws a card (the newcomer counts)');
  const e3 = C2.endTurn();
  const blk = only(e3, 'block').find((b) => b.dst.id === 'kuro');
  t.eq(blk && blk.amount, 4, 'the Counter Guest gives 2 Block per guest on stage: 4');
  t.eq(only(C2.events, 'guest_exit').length, 0, 'nobody left yet');
});

t.test('voiceless owner: the guest is silent (no guest_act, no ops) but still counts down, and its exit ops are skipped; the partner\'s guest keeps acting', () => {
  // a 1 HP lead and a hitter that strikes for 5: Jasmin loses her voice in the enemy phase, RoxorLoops carries on
  const C2 = fight({ deck: ['hanae_t_guest_killer', 'kuro_guest_dj', 'hanae_slash', 'kuro_ink_bolt', 'kuro_ink_ward', 'hanae_parry', 'hanae_parry'], enemies: ['gt_hitter'] });
  play(C2, 'hanae_t_guest_killer'); play(C2, 'kuro_guest_dj');
  C2.front().hp = 1; C2.front().block = 0;
  const e1 = C2.endTurn();   // the Killer Guest hits the hitter for 50 (it has 999), the hitter then downs Jasmin
  t.ok(only(e1, 'hero_down').some((x) => x.hero === 'hanae'), 'Jasmin lost her voice in the enemy phase');
  t.eq(C2.guests.length, 2, 'both guests still on stage');
  const e2 = C2.endTurn();
  const acts = only(e2, 'guest_act');
  t.deep(acts.map((a) => a.guest.def), ['guest_dj_scratchy'], 'only the DJ acts: the Killer Guest is silent');
  t.ok(!only(e2, 'hit').some((x) => x.raw === 50), 'no 50 damage strike');
  t.deep(C2.guests.map((g) => [g.def, g.stay]), [['guest_t_killer', 2], ['guest_dj_scratchy', 1]], 'the silent guest still counts down');
  C2.endTurn();
  const e4 = C2.endTurn();
  const ex = only(e4, 'guest_exit').find((x) => x.guest.def === 'guest_t_killer');
  t.ok(ex && ex.reason === 'done', 'the silent guest leaves when its stay runs out');
  t.ok(!only(e4, 'block').some((b) => b.amount === 9), 'its exit ops are skipped while the owner is voiceless');
});

t.test('hooks: a guest\'s hooks are owned by its owner, skip the summoning play, fire while it stays and fall silent when it leaves', () => {
  const C = fight({ deck: ['kuro_t_guest_hooky', 'kuro_ink_ward', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry'] });
  C.heroes.forEach((x) => { x.hp -= 10; });
  const e0 = play(C, 'kuro_t_guest_hooky');
  t.eq(only(e0, 'block').length, 0, 'the onPlay hook does not fire for the play that brought the guest');
  const e1 = play(C, 'kuro_ink_ward');
  const b1 = only(e1, 'block').map((b) => [b.dst.id, b.amount]);
  t.ok(b1.some((x) => x[0] === 'kuro' && x[1] === 2), 'RoxorLoops\' next card wakes the guest hook: 2 Block (' + J(b1) + ')');
  const e2 = play(C, 'hanae_slash');
  t.eq(only(e2, 'block').length, 0, 'an owned hook ignores the partner\'s plays');
  t.deep(C._hooks.filter((h) => h.src === 'guest').map((h) => [h.owner, h.srcId, h.active]), [['kuro', 'guest_t_hooky', true]], 'registered with src guest, srcId the def id, owned by kuro');
  const e3 = C.endTurn();   // stay 1: acts then leaves
  t.ok(only(e3, 'guest_exit').some((x) => x.guest.def === 'guest_t_hooky' && x.reason === 'done'), 'the guest leaves after one act');
  t.deep(only(e3, 'heal').map((x) => [x.dst.id, x.amount]), [['hanae', 1], ['kuro', 1]], 'its exit ops ran: 1 HP for both');
  t.deep(C._hooks.filter((h) => h.src === 'guest').map((h) => h.active), [false], 'the hook is deactivated');
  const e4 = play(C, 'kuro_ink_ward');
  t.ok(!only(e4, 'block').some((b) => b.amount === 2), 'no more 2 Block after it left');
  // the Metro Gnome: 1 Breath at the start of each turn while it stays, then nothing
  const C2 = fight({ deck: ['kuro_guest_drum_machine', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry'] });
  play(C2, 'kuro_guest_drum_machine');
  const t2 = C2.endTurn();
  t.eq(C2.energy, 4, 'turn 2 starts with 3 + 1 Breath'); t.ok(only(t2, 'energy').some((e) => e.delta === 1), 'an energy event for it');
  C2.endTurn();   // stay 2 -> the machine leaves after its second act
  t.deep(C2.guests, [], 'the machine left');
  t.eq(C2.energy, 3, 'turn 3 starts with the plain 3');
});

t.test('counter and cond: per guests and cond guests read the stage for cards and hooks; a guest counts itself in its own act', () => {
  const C = fight({ deck: ['kuro_t_count_dmg', 'kuro_guest_dj', 'kuro_guest_loop_bot', 'kuro_ink_bolt', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry'], enemies: ['gt_dummy'] });
  const raw = (ev) => only(ev, 'hit').map((h) => h.raw);
  t.deep(raw(play(C, 'kuro_t_count_dmg')), [1 + 2], 'no guest: 1 damage (plus 2 for the backing spot)');
  play(C, 'kuro_guest_dj');
  t.deep(raw(play(C, 'kuro_t_count_dmg')), [1 + 3 + 2], 'one guest: 4');
  play(C, 'kuro_guest_loop_bot');
  t.deep(raw(play(C, 'kuro_t_count_dmg')), [1 + 6 + 2], 'two guests: 7');
  // Mosh Pit Uncle: 2 per guest on stage, himself included
  const C2 = fight({ heroes: [{ id: 'raiga', hp: 88, maxHp: 88 }, { id: 'kuro', hp: 68, maxHp: 68 }], deck: ['raiga_guest_uncle', 'kuro_guest_loop_bot', 'raiga_jab', 'kuro_ink_bolt', 'raiga_brace'], enemies: ['gt_dummy', 'gt_dummy2'] });
  play(C2, 'raiga_guest_uncle');
  const e1 = C2.endTurn();
  t.deep(only(e1, 'hit').filter((h) => h.src === null).map((h) => h.raw), [2, 2], 'alone: 2 to each enemy');
  play(C2, 'kuro_guest_loop_bot');
  const e2 = C2.endTurn();
  t.deep(only(e2, 'hit').filter((h) => h.src === null).map((h) => h.raw), [4, 4], 'with the bot beside him: 4 to each enemy');
});

t.test('kills by a guest credit the owner (onKill hooks, Fanbase untouched), and the guests stop acting the moment the fight is decided', () => {
  // one weakling: the first guest wins the fight, the second never acts
  const C2 = fight({ deck: ['hanae_t_guest_killer', 'kuro_guest_dj', 'hanae_slash', 'kuro_ink_bolt', 'hanae_parry'], enemies: ['gt_weak'] });
  play(C2, 'hanae_t_guest_killer'); play(C2, 'kuro_guest_dj');
  const e2 = C2.endTurn();
  t.eq(C2.result, 'win', 'the Killer Guest wins');
  t.deep(only(e2, 'guest_act').map((a) => a.guest.def), ['guest_t_killer'], 'the DJ never acted');
  t.deep(C2.stats.kills, [{ def: 'gt_weak', tier: 'normal', by: 'hook' }], 'the kill is a hook kill');
  const exits = only(e2, 'guest_exit');
  t.deep(exits.map((x) => [x.guest.def, x.reason]), [['guest_t_killer', 'end'], ['guest_dj_scratchy', 'end']], 'both leave with reason end at combat end');
  const tt = types(e2);
  t.ok(tt.lastIndexOf('guest_exit') < tt.indexOf('end') && tt[tt.length - 1] === 'end', 'before the end event, which stays last');
  t.ok(!only(e2, 'block').some((b) => b.amount === 9), 'no exit ops at combat end');
  t.deep(C2.guests, [], 'cleared');
  // onKill credit: a hook owned by Jasmin fires for her guest's kill
  const C3 = fight({ deck: ['hanae_t_guest_killer', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt'], enemies: ['gt_weak'] });
  C3._hooks.push({ on: 'onKill', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }], owner: 'hanae', src: 'relic', srcId: 'test', count: 0, turnFired: 0, fired: false, active: true });
  play(C3, 'hanae_t_guest_killer');
  const e3 = C3.endTurn();
  t.ok(only(e3, 'death').length === 1 && only(e3, 'status').some((s) => s.dst.id === 'hanae' && s.s === 'might' && s.delta === 2), 'Jasmin\'s onKill hook fired for her guest\'s kill');
});

t.test('determinism and C.rng: the same seed gives the same event log with guests picking random enemies; a different seed may pick differently', () => {
  const run = (seed) => {
    const C = fight({ deck: ['kuro_guest_dj', 'kuro_guest_dj', 'hanae_guest_parrot', 'hanae_slash', 'kuro_ink_bolt', 'hanae_parry', 'kuro_ink_ward'], enemies: ['gt_dummy', 'gt_dummy2'], seed });
    play(C, 'kuro_guest_dj'); play(C, 'kuro_guest_dj'); play(C, 'hanae_guest_parrot');
    for (let i = 0; i < 3; i++) C.endTurn();
    return C.events;
  };
  t.eq(J(run(11)), J(run(11)), 'identical logs for one seed');
  const targets = new Set();
  for (let s = 1; s < 12; s++) run(s).filter((e) => e.type === 'hit' && e.src === null).forEach((e) => targets.add(e.dst.id));
  t.eq(targets.size, 2, 'over seeds both dummies get hit: the target is a C.rng roll');
  // the state is plain data
  const C = fight({ deck: ['kuro_guest_dj', 'kuro_ink_bolt', 'hanae_slash', 'hanae_parry'] });
  play(C, 'kuro_guest_dj');
  t.eq(J(JSON.parse(J(C.guests))), J(C.guests), 'C.guests survives a JSON round trip unchanged');
});

t.test('the bot values a Guest card by its act over its stay and plays it; a full stage lowers the value', () => {
  const C = fight({ deck: ['kuro_guest_dj', 'kuro_ink_bolt', 'hanae_slash', 'hanae_parry', 'kuro_ink_ward'], enemies: ['gt_dummy'] });
  const dj = toHand(C, 'kuro_guest_dj');
  const bolt = toHand(C, 'kuro_ink_bolt');
  C.energy = 1;
  const a = COMBAT.greedyPolicy(C);
  t.eq(a.type, 'play', 'the bot plays');
  t.eq(a.uid, dj.uid, 'and it is the DJ (12 damage over 3 turns beats one 6 damage bolt)');
  const ev = COMBAT.applyAction(C, a);
  t.eq(only(ev, 'guest_enter').length, 1, 'the guest is on stage');
  t.ok(!!bolt, 'the bolt stayed in hand');
  // a simulated fight with Guest cards in the deck ends
  const sim = COMBAT.simulate({ heroes: HEROES, deck: deckOf(['kuro_guest_dj', 'kuro_guest_loop_bot', 'hanae_guest_choir', 'hanae_guest_parrot', 'hanae_slash', 'hanae_slash', 'kuro_ink_bolt', 'kuro_ink_bolt', 'hanae_parry', 'kuro_ink_ward']), enemies: ['kappa', 'kodama'], seed: 4, mods: D.modsFor([], 0), relics: [] });
  t.ok(sim.result === 'win' || sim.result === 'lose', 'the simulated fight ends: ' + sim.result);
  t.ok(sim.C.events.some((e) => e.type === 'guest_enter'), 'and a guest came on stage during it');
});

t.test('old saves: a run saved before guests existed loads, fights and finishes unchanged (guests live only inside a combat)', () => {
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 21 });
  const snap = JSON.parse(J(RUN.serialize(R)));
  t.ok(!('guests' in snap) && !('guest' in snap), 'the save shape has no guest field');
  const back = RUN.deserialize(snap);
  t.eq(J(RUN.serialize(back)), J(snap), 'round trip');
  // a fight from the loaded run with a Guest card slipped into the deck
  const node = { kind: 'enemy', tile: { q: 0, r: 0 }, enemies: ['kappa'], tier: 'normal', seed: 7 };
  const o = RUN.combatInit(back, node);
  o.deck.push({ uid: 999, id: 'kuro_guest_dj', up: 0, gems: [] });
  const C = COMBAT.create(o);
  C.start();
  play(C, 'kuro_guest_dj');
  const sm = COMBAT.simulate(Object.assign({}, o, { seed: 8 }));
  t.ok(sm.result === 'win' || sm.result === 'lose', 'the fight ends');
  t.deep(Object.keys(C.summary()).sort(), ['fanbase', 'gold', 'heroes', 'ink', 'kills', 'maxHpGain', 'result', 'stats'], 'C.summary() is unchanged');
});

t.done();
