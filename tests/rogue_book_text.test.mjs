// TEXT: DATA.resolveCard and the text layer of DESIGN 5.1 (data_text.js), tested with synthetic content (ids start with t_) registered
// inside the test after boot({only:['data_text']}) (util, data and data_text only, so real content files cannot change an expectation).
//
// Layout: helpers, resolveCard (upgrades, gems, colour and row gating, purity), exact card text for every op kind, keywords and markup
// rules, up and down colouring (upgrade, gems, live combat numbers, cross-checked against C.preview), hooks and run ops, gems, statuses,
// intents, rows, target mode, a randomised well-formedness pass, and a bonus pass over any real content that already exists.
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book text');

// ------------------------------------------------------------------ helpers
const world = () => {
  const g = boot({ only: ['data_text'] });
  const D = g.DATA;
  let n = 0;
  const W = { g, D, U: g.U, n: () => ++n };
  W.card = (fx, over = {}) => { const id = 't_c' + (++n); D.add('cards', { [id]: Object.assign({ name: 'Test ' + n, hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx, kw: [], slots: [], art: { m: 'slash', c: 'rose' } }, over) }); return id; };
  W.gem = (mod, over = {}) => { const id = 't_g' + (++n); D.add('gems', { [id]: Object.assign({ name: id, color: 'red', tier: 1, art: { cut: 'round' }, mod }, over) }); return id; };
  W.relic = (over = {}) => { const id = 't_r' + (++n); D.add('relics', { [id]: Object.assign({ name: 'Relic ' + n, rarity: 'common', text: 'A test relic.', art: { m: 'lantern' } }, over) }); return id; };
  W.enemy = (over = {}) => { const id = 't_e' + (++n); D.add('enemies', { [id]: Object.assign({ name: 'Foe ' + n, art: { id }, chapter: 1, tier: 'normal', size: 'm', hp: [10, 10], moves: { idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['idle'] }, lore: 'x', tags: ['spirit'] }, over) }); return id; };
  return W;
};
const W = world();
const D = W.D;
const P = (x, ctx) => D.cardPlain(x, ctx);
const H = (x, ctx) => D.cardHtml(x, ctx);
const text = (fx, over) => P(W.card(fx, over));
const SK = { type: 'skill' };
const PW = { type: 'power' };
const XC = { cost: 'X' };
const nums = (html) => [...html.matchAll(/<span class="num( up| down)?">(-?\d+)<\/span>/g)].map((m) => [Number(m[2]), (m[1] || '').trim()]);
const kws = (html) => [...html.matchAll(/<span class="kw" data-kw="([^"]+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');   // built at run time: this file must contain no dash characters itself
const strip = (h) => h.replace(/<[^>]*>/g, '');
// a junk card and a normal card the add ops can name
const INK = W.card([], { name: 'Ink Blot', type: 'status', hero: 'status', kw: ['unplayable'], cost: null, rarity: 'token' });
const PLAINC = W.card([{ op: 'dmg', n: 1 }], { name: 'Pebble' });
const KURO_UNIT = (st = {}, row = 'front') => ({ unit: { id: 'kuro', row, st } });
const HANAE_UNIT = (st = {}, row = 'front') => ({ unit: { id: 'hanae', row, st } });

// ------------------------------------------------------------------ resolveCard
t.test('resolveCard: shape, unknown ids, ids versus instances', () => {
  const id = W.card([{ op: 'dmg', n: 6 }], { name: 'Slasher', slots: ['red', 'blue'], art: { m: 'slash', c: 'rose' } });
  const r = D.resolveCard(id);
  t.deep(Object.keys(r).sort(), ['art', 'base', 'cost', 'costX', 'def', 'fx', 'gemActive', 'gemNotes', 'gems', 'hero', 'id', 'inst', 'kw', 'name', 'playableType', 'rarity', 'slots', 'type', 'up'], 'documented keys');
  t.eq(r.id, id, 'id'); t.eq(r.name, 'Slasher', 'name'); t.eq(r.cost, 1, 'cost'); t.eq(r.costX, false, 'costX'); t.eq(r.type, 'attack', 'type'); t.eq(r.rarity, 'common', 'rarity');
  t.eq(r.hero, 'hanae', 'hero'); t.eq(r.up, false, 'not upgraded'); t.eq(r.playableType, 'attack', 'playable type'); t.deep(r.slots, ['red', 'blue'], 'slots'); t.deep(r.gems, [null, null], 'gems padded to the slots');
  t.deep(r.gemActive, [false, false], 'gemActive as long as slots'); t.deep(r.gemNotes, [], 'no gem notes'); t.deep(r.art, { m: 'slash', c: 'rose' }, 'art'); t.eq(r.def, D.cards[id], 'def is the definition');
  t.deep(r.inst, { id, up: 0, gems: [] }, 'an id becomes a bare instance');
  const inst = { uid: 9, id, up: 0, gems: [null, null] };
  t.eq(D.resolveCard(inst).inst, inst, 'an instance is passed through');
  t.deep(D.resolveCard({ id }).gems, [null, null], 'an instance with no gems array still resolves');
  t.deep(D.resolveCard({ id, gems: ['t_x'] }).gems, ['t_x', null], 'short gems arrays pad with null');
  const u = D.resolveCard('t_nope');
  t.eq(u.def, null, 'unknown id: no def'); t.eq(u.name, 't_nope', 'unknown id: name is the id'); t.eq(u.cost, null, 'unknown id: no cost'); t.deep(u.fx, [], 'unknown id: no fx'); t.eq(u.playableType, null, 'unknown id: not playable');
  t.eq(D.cardPlain('t_nope'), '', 'unknown id has no text'); t.eq(D.cardHtml('t_nope'), '', 'unknown id has no html'); t.eq(D.targetMode('t_nope'), 'none', 'unknown id needs no target'); t.deep(D.cardOps('t_nope'), [], 'unknown id has no ops');
  t.deep(D.resolveCard(null).fx, [], 'null resolves to an empty card');
  ['skill', 'power', 'curse', 'status'].forEach((ty) => t.eq(D.resolveCard(W.card([], { type: ty, hero: ty === 'curse' ? 'curse' : ty === 'status' ? 'status' : 'hanae' })).playableType, ty === 'skill' || ty === 'power' ? ty : null, `${ty}: playableType`));
  t.eq(D.resolveCard(W.card([], Object.assign({ cost: 'X' }))).costX, true, 'X cost sets costX'); t.eq(D.resolveCard(W.card([], { cost: 'X' })).cost, 'X', 'X cost is the string X');
  t.eq(D.resolveCard(W.card([], { cost: null, kw: ['unplayable'], type: 'curse', hero: 'curse' })).cost, null, 'unplayable junk has a null cost');
});

t.test('resolveCard: upgrades replace fx, cost and keywords wholesale', () => {
  const id = W.card([{ op: 'dmg', n: 6 }], { name: 'Edge', cost: 2, kw: ['exhaust', 'retain'], up: { fx: [{ op: 'dmg', n: 9 }, { op: 'draw', n: 1 }], cost: 1, kw: ['retain'] } });
  const b = D.resolveCard({ id, up: 0 }), u = D.resolveCard({ id, up: 1 });
  t.eq(b.name, 'Edge', 'base name'); t.eq(u.name, 'Edge+', 'upgraded name gets a plus'); t.eq(u.up, true, 'up is true');
  t.eq(b.cost, 2, 'base cost'); t.eq(u.cost, 1, 'up.cost replaces the cost');
  t.deep(b.kw, ['exhaust', 'retain'], 'base keywords'); t.deep(u.kw, ['retain'], 'up.kw REPLACES the keywords');
  t.deep(u.fx, [{ op: 'dmg', n: 9 }, { op: 'draw', n: 1 }], 'up.fx replaces fx wholesale');
  t.deep(u.base.fx, [{ op: 'dmg', n: 6 }], 'base keeps the printed fx'); t.eq(u.base.cost, 2, 'base keeps the printed cost'); t.deep(u.base.kw, ['exhaust', 'retain'], 'base keeps the printed keywords');
  const partial = W.card([{ op: 'dmg', n: 6 }], { cost: 2, kw: ['exhaust'], up: { cost: 1 } });
  const pu = D.resolveCard({ id: partial, up: 1 });
  t.deep(pu.fx, [{ op: 'dmg', n: 6 }], 'an up with only a cost keeps the fx'); t.deep(pu.kw, ['exhaust'], 'an up with no kw keeps the keywords'); t.eq(pu.cost, 1, 'and takes the new cost');
  const emptyKw = W.card([{ op: 'dmg', n: 6 }], { kw: ['exhaust'], up: { fx: [{ op: 'dmg', n: 8 }], kw: [] } });
  t.deep(D.resolveCard({ id: emptyKw, up: 1 }).kw, [], 'up.kw [] removes every keyword');
  const noUp = W.card([{ op: 'dmg', n: 6 }]);
  const nu = D.resolveCard({ id: noUp, up: 1 });
  t.eq(nu.up, false, 'a card with no upgrade never reads as upgraded'); t.eq(nu.name, D.cards[noUp].name, 'and gets no plus');
  const xc = W.card([{ op: 'dmg', n: 3, hits: { per: 'X' } }], { cost: 'X', up: { fx: [{ op: 'dmg', n: 4, hits: { per: 'X' } }] } });
  t.eq(D.resolveCard({ id: xc, up: 1 }).cost, 'X', 'an X cost survives an upgrade that does not touch the cost');
  const zero = W.card([{ op: 'dmg', n: 3 }], { cost: 1, up: { cost: 0 } });
  t.eq(D.resolveCard({ id: zero, up: 1 }).cost, 0, 'up.cost 0 is honoured (not treated as missing)');
});

t.test('resolveCard: gems (DESIGN 4.6) merge in slot order and never touch the definition', () => {
  const slots = ['red', 'blue', 'green', 'gold'];
  const id = W.card([{ op: 'dmg', n: 6 }], { cost: 2, slots, kw: ['exhaust'] });
  const before = JSON.stringify(D.cards[id]);
  const r = (gems, ctx) => D.resolveCard({ id, up: 0, gems }, ctx);
  const gd = W.gem({ dmg: 2 }), gd3 = W.gem({ dmg: 3 }, { color: 'blue' }), gh = W.gem({ hits: 1 }), gb = W.gem({ block: 3 }), gheal = W.gem({ heal: 2 });
  const gdraw = W.gem({ draw: 1 }, { color: 'blue' }), gen = W.gem({ energy: 1 }, { color: 'green' }), gst = W.gem({ status: { s: 'bloom', n: 2, tgt: 'self' } }), gpo = W.gem({ poison: 2 }, { color: 'green' });
  const gfx = W.gem({ fx: [{ op: 'block', n: 2 }] }, { color: 'gold' }), gcost = W.gem({ cost: -1 }, { color: 'gold', tier: 3 }), gcost2 = W.gem({ cost: -2 }, { color: 'gold', tier: 3 });
  const gkw = W.gem({ kw: ['retain'] }, { color: 'blue' }), grm = W.gem({ kwRemove: ['exhaust'] }, { color: 'blue' });
  t.deep(r([gd]).fx, [{ op: 'dmg', n: 6, plus: 2 }], 'a damage gem adds plus to the matching op'); t.deep(r([gd]).gemActive, [true, false, false, false], 'and is active');
  t.deep(r([gd, gd3]).fx, [{ op: 'dmg', n: 6, plus: 5 }], 'two damage gems stack'); t.deep(r([gd, gd3]).gemActive, [true, true, false, false], 'both active');
  t.deep(r([gh]).fx, [{ op: 'dmg', n: 6, hitsPlus: 1 }], 'a hits gem adds hitsPlus to the first top-level dmg op');
  t.deep(r([gb]).fx, [{ op: 'dmg', n: 6 }], 'a block gem on a card with no block op does nothing'); t.deep(r([gb]).gemActive, [false, false, false, false], 'and is shown grey');
  t.deep(r([null, gdraw]).fx, [{ op: 'dmg', n: 6 }, { op: 'draw', n: 1 }], 'a draw gem appends a draw op'); t.deep(r([null, gdraw]).gemActive, [false, true, false, false], 'and is active');
  t.deep(r([null, null, gen]).fx, [{ op: 'dmg', n: 6 }, { op: 'energy', n: 1 }], 'an energy gem appends an energy op');
  t.deep(r([gst]).fx, [{ op: 'dmg', n: 6 }, { op: 'status', s: 'bloom', n: 2, tgt: 'self' }], 'a status gem appends its status op');
  t.deep(r([null, null, gpo]).fx, [{ op: 'dmg', n: 6 }, { op: 'status', s: 'poison', n: 2, tgt: 'enemy' }], 'a poison gem appends poison aimed at the card\'s enemy target');
  t.deep(r([null, null, null, gfx]).fx, [{ op: 'dmg', n: 6 }, { op: 'block', n: 2 }], 'an fx gem appends copies of its ops');
  t.deep(r([gd, gdraw, gen, gfx]).fx, [{ op: 'dmg', n: 6, plus: 2 }, { op: 'draw', n: 1 }, { op: 'energy', n: 1 }, { op: 'block', n: 2 }], 'appended ops keep slot order');
  t.deep(r([null, gdraw, null, gfx]).fx.map((o) => o.op), ['dmg', 'draw', 'block'], 'an empty slot is skipped');
  const both = r([gd, null, null, gfx]);
  t.deep(both.fx, [{ op: 'dmg', n: 6, plus: 2 }, { op: 'block', n: 2 }], 'flat mods apply to matching ops only');
  const blockGems = W.gem({ block: 3 }, { color: 'gold' });
  t.deep(r([null, null, null, blockGems]).fx, [{ op: 'dmg', n: 6 }], 'a block gem does not touch a dmg-only card');
  t.deep(r([null, null, null, gfx, ]).gemActive, [false, false, false, true], 'the appended fx gem is active');
  const withBlock = W.card([{ op: 'dmg', n: 6 }, { op: 'block', n: 4 }], { slots: ['gold', 'red'] });
  t.deep(D.resolveCard({ id: withBlock, gems: [blockGems, null] }).fx, [{ op: 'dmg', n: 6 }, { op: 'block', n: 4, plus: 3 }], 'a block gem boosts the block op');
  const healCard = W.card([{ op: 'heal', n: 3 }], Object.assign({ slots: ['red'] }, SK));
  t.deep(D.resolveCard({ id: healCard, gems: [gheal] }).fx, [{ op: 'heal', n: 3, plus: 2 }], 'a heal gem boosts the heal op');
  t.deep(r([null, null, null, gcost]).cost, 1, 'a tier 3 cost gem lowers the cost'); t.eq(r([null, null, null, gcost2]).cost, 0, 'never below 0');
  t.deep(r([null, null, null, gcost]).gemActive, [false, false, false, true], 'and is active');
  const xCard = W.card([{ op: 'dmg', n: 3, hits: { per: 'X' } }], { cost: 'X', slots: ['gold'] });
  t.eq(D.resolveCard({ id: xCard, gems: [gcost] }).cost, 'X', 'a cost gem is ignored on an X card'); t.deep(D.resolveCard({ id: xCard, gems: [gcost] }).gemActive, [false], 'and shown grey');
  const zCard = W.card([{ op: 'dmg', n: 3 }], { cost: 0, slots: ['gold'] });
  t.eq(D.resolveCard({ id: zCard, gems: [gcost] }).cost, 0, 'a cost gem is ignored on a 0 cost card'); t.deep(D.resolveCard({ id: zCard, gems: [gcost] }).gemActive, [false], 'and shown grey');
  t.deep(r([null, gkw]).kw, ['exhaust', 'retain'], 'a kw gem adds a keyword'); t.deep(r([null, grm]).kw, [], 'a kwRemove gem removes one');
  t.deep(D.cards[id].kw, ['exhaust'], 'the definition keywords are never mutated');
  t.deep(r([null, gkw, null, null]).base.kw, ['exhaust'], 'base keywords stay printed');
  const dup = W.gem({ kw: ['exhaust'] }, { color: 'blue' });
  t.deep(r([null, dup]).kw, ['exhaust'], 'adding a keyword the card already has changes nothing'); t.deep(r([null, dup]).gemActive, [false, false, false, false], 'and the gem is grey');
  // colour rules
  t.deep(r([gdraw]).fx, [{ op: 'dmg', n: 6 }], 'a blue gem in a red slot is skipped'); t.deep(r([gdraw]).gemActive, [false, false, false, false], 'and grey');
  const prism = W.card([{ op: 'dmg', n: 6 }], { slots: ['any', 'red'] });
  t.deep(D.resolveCard({ id: prism, gems: [gdraw, null] }).fx, [{ op: 'dmg', n: 6 }, { op: 'draw', n: 1 }], 'a prism (any) slot accepts every colour');
  t.deep(D.resolveCard({ id: prism, gems: [gd, gd] }).fx, [{ op: 'dmg', n: 6, plus: 4 }], 'a prism slot and a matching slot both apply');
  t.deep(D.resolveCard({ id: prism, gems: ['t_nope', null] }).fx, [{ op: 'dmg', n: 6 }], 'an unknown gem id is skipped');
  t.deep(D.resolveCard({ id: prism, gems: [W.gem(undefined, { mod: undefined }), null] }).fx, [{ op: 'dmg', n: 6 }], 'a gem with no mod is skipped');
  t.eq(JSON.stringify(D.cards[id]), before, 'resolving never mutates the definition');
  // a plus reaches through cond and repeat but not into hook fx
  const deep = W.card([{ op: 'cond', if: { row: 'front' }, then: [{ op: 'dmg', n: 2 }], else: [{ op: 'block', n: 2 }] }, { op: 'repeat', n: 2, do: [{ op: 'dmg', n: 1 }] }, { op: 'hook', on: 'onPlay', fx: [{ op: 'dmg', n: 1 }] }], { slots: ['red'] });
  const dr = D.resolveCard({ id: deep, gems: [gd] });
  t.eq(dr.fx[0].then[0].plus, 2, 'plus goes through cond.then'); t.eq(dr.fx[1].do[0].plus, 2, 'plus goes through repeat.do'); t.eq(dr.fx[2].fx[0].plus, undefined, 'plus never goes into hook fx');
  t.eq(D.cards[deep].fx[0].then[0].plus, undefined, 'and the definition stays clean (deep copy)');
  // hits gem reaches only the first TOP-LEVEL dmg op
  const hitsCard = W.card([{ op: 'block', n: 2 }, { op: 'dmg', n: 3 }, { op: 'dmg', n: 4 }], { slots: ['red'] });
  const hr = D.resolveCard({ id: hitsCard, gems: [gh] });
  t.eq(hr.fx[1].hitsPlus, 1, 'hitsPlus goes on the first dmg op'); t.eq(hr.fx[2].hitsPlus, undefined, 'and only there');
  const condHits = W.card([{ op: 'cond', if: { row: 'front' }, then: [{ op: 'dmg', n: 3 }] }], { slots: ['red'] });
  t.deep(D.resolveCard({ id: condHits, gems: [gh] }).gemActive, [false], 'a hits gem needs a top-level dmg op');
  // a gem may change the resolved cost, keywords and fx together
  const combo = W.card([{ op: 'dmg', n: 5 }], { cost: 2, kw: ['exhaust'], slots: ['gold', 'blue'] });
  const cr = D.resolveCard({ id: combo, gems: [gcost, grm] });
  t.eq(cr.cost, 1, 'combo cost'); t.deep(cr.kw, [], 'combo keywords'); t.deep(cr.gemActive, [true, true], 'combo activity');
  // gems apply on top of an upgrade
  const upG = W.card([{ op: 'dmg', n: 6 }], { slots: ['red'], up: { fx: [{ op: 'dmg', n: 9 }] } });
  t.deep(D.resolveCard({ id: upG, up: 1, gems: [gd] }).fx, [{ op: 'dmg', n: 9, plus: 2 }], 'gems apply on top of the upgraded fx');
});

t.test('resolveCard: row gated gems merge only for a unit in that row, otherwise they become notes', () => {
  const gf = W.gem({ dmg: 3, cond: 'front' }), gbk = W.gem({ block: 2, cond: 'back' }, { color: 'blue' });
  const id = W.card([{ op: 'dmg', n: 6 }, { op: 'block', n: 4 }], { slots: ['red', 'blue'] });
  const at = (row, gems) => D.resolveCard({ id, gems }, row ? { unit: { id: 'hanae', row, st: {} } } : undefined);
  t.deep(at(null, [gf, gbk]).fx, [{ op: 'dmg', n: 6 }, { op: 'block', n: 4 }], 'no ctx: nothing merges');
  t.deep(at(null, [gf, gbk]).gemNotes, [{ slot: 0, gem: gf, cond: 'front' }, { slot: 1, gem: gbk, cond: 'back' }], 'no ctx: both gems are notes');
  t.deep(at(null, [gf, gbk]).gemActive, [false, false], 'and grey');
  t.deep(at('front', [gf, gbk]).fx, [{ op: 'dmg', n: 6, plus: 3 }, { op: 'block', n: 4 }], 'front unit: the front gem merges');
  t.deep(at('front', [gf, gbk]).gemNotes, [{ slot: 1, gem: gbk, cond: 'back' }], 'and the back gem stays a note'); t.deep(at('front', [gf, gbk]).gemActive, [true, false], 'active flags follow');
  t.deep(at('back', [gf, gbk]).fx, [{ op: 'dmg', n: 6 }, { op: 'block', n: 4, plus: 2 }], 'back unit: the back gem merges');
  t.deep(at('back', [gf, gbk]).gemNotes, [{ slot: 0, gem: gf, cond: 'front' }], 'and the front gem is the note'); t.deep(at('back', [gf, gbk]).gemActive, [false, true], 'active flags follow');
  t.deep(D.resolveCard({ id, gems: [gf, gbk] }, { unit: { id: 'hanae', st: {} } }).gemNotes.length, 2, 'a unit with no row counts as not in either row');
  t.deep(D.resolveCard({ id, gems: [null, null] }, { unit: { id: 'hanae', row: 'front', st: {} } }).gemNotes, [], 'empty slots make no notes');
});

t.test('resolveCard and text never mutate their inputs and are deterministic', () => {
  const g = W.gem({ dmg: 2, hits: 1, draw: 1 });
  const id = W.card([{ op: 'dmg', n: 6 }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'dmg', n: 3 }] }], { slots: ['red'], up: { fx: [{ op: 'dmg', n: 8 }] } });
  const inst = { uid: 1, id, up: 1, gems: [g] };
  const ctx = HANAE_UNIT({ might: 2 });
  const snap = JSON.stringify([D.cards[id], inst, ctx, D.gems[g]]);
  const a = H(inst, ctx), b = H(inst, ctx);
  D.resolveCard(inst, ctx); D.cardPlain(inst, ctx); D.targetMode(inst); D.cardOps(inst); D.opsText(D.cards[id].fx, ctx);
  t.eq(a, b, 'the same input gives the same html'); t.eq(JSON.stringify([D.cards[id], inst, ctx, D.gems[g]]), snap, 'nothing was mutated');
  t.eq(P(id), P({ id, up: 0, gems: [] }), 'an id and a bare instance read the same');
  t.eq(P(D.resolveCard(id)), P(id), 'a resolved card can be passed back in');
});

// ------------------------------------------------------------------ exact card text
const dmg = (n, x) => Object.assign({ op: 'dmg', n }, x);
const blk = (n, x) => Object.assign({ op: 'block', n }, x);
const st = (s, n, x) => Object.assign({ op: 'status', s, n }, x);
const pick = (from, n, then, x) => Object.assign({ op: 'pick', from, n, then }, x);
const cond = (c, th, el) => (el ? { op: 'cond', if: c, then: th, else: el } : { op: 'cond', if: c, then: th });
const hook = (on, fx, x) => Object.assign({ op: 'hook', on, fx }, x);

t.test('card text: damage', () => {
  [
    ['plain', [dmg(6)], {}, 'Deal 6 damage.'],
    ['hits', [dmg(4, { hits: 3 })], {}, 'Deal 4 damage 3 times.'],
    ['one hit is not mentioned', [dmg(4, { hits: 1 })], {}, 'Deal 4 damage.'],
    ['all', [dmg(5, { tgt: 'all' })], {}, 'Deal 5 damage to all enemies.'],
    ['random', [dmg(5, { tgt: 'random' })], {}, 'Deal 5 damage to a random enemy.'],
    ['lowest', [dmg(5, { tgt: 'lowest' })], {}, 'Deal 5 damage to the enemy with the lowest HP.'],
    ['others', [dmg(5, { tgt: 'others' })], {}, 'Deal 5 damage to all other enemies.'],
    ['random hits', [dmg(4, { tgt: 'random', hits: 3 })], {}, 'Deal 4 damage to a random enemy 3 times.'],
    ['all hits', [dmg(2, { tgt: 'all', hits: 2 })], {}, 'Deal 2 damage to all enemies 2 times.'],
    ['pierce', [dmg(6, { pierce: true })], {}, 'Deal 6 damage, ignoring Block.'],
    ['lifesteal', [dmg(6, { lifesteal: true })], {}, 'Deal 6 damage. Heal for the HP it removes.'],
    ['repeat of one dmg reads as times', [{ op: 'repeat', n: 3, do: [dmg(2)] }], {}, 'Deal 2 damage 3 times.'],
    ['X hits', [dmg(4, { hits: { per: 'X' } })], XC, 'Deal 4 damage X times.'],
    ['X repeat', [{ op: 'repeat', n: { per: 'X' }, do: [dmg(4)] }], XC, 'Deal 4 damage X times.'],
    ['X mul', [dmg({ per: 'X', mul: 4 })], XC, 'Deal 4 damage for each Energy spent.'],
    ['repeat two ops', [{ op: 'repeat', n: 2, do: [dmg(3), blk(2)] }], {}, 'Repeat 2 times: deal 3 damage and gain 2 Block.'],
    ['repeat per hand', [{ op: 'repeat', n: { per: 'handSize' }, do: [dmg(1)] }], {}, 'Deal 1 damage for each card in your hand.'],
    ['zero damage', [dmg(0)], {}, 'Deal 0 damage.'],
  ].forEach(([name, fx, over, want]) => t.eq(text(fx, over), want, 'damage: ' + name));
});

t.test('card text: block, heal, hurt and the targets of each', () => {
  [
    ['block', [blk(8)], 'Gain 8 Block.'],
    ['block ally', [blk(8, { tgt: 'ally' })], 'Give your ally 8 Block.'],
    ['block both', [blk(8, { tgt: 'both' })], 'Both heroes gain 8 Block.'],
    ['block front', [blk(8, { tgt: 'front' })], 'The front hero gains 8 Block.'],
    ['block back', [blk(8, { tgt: 'back' })], 'The back hero gains 8 Block.'],
    ['heal', [{ op: 'heal', n: 4 }], 'Heal 4 HP.'],
    ['heal ally', [{ op: 'heal', n: 4, tgt: 'ally' }], 'Heal your ally for 4 HP.'],
    ['heal both', [{ op: 'heal', n: 4, tgt: 'both' }], 'Heal both heroes for 4 HP.'],
    ['heal front', [{ op: 'heal', n: 4, tgt: 'front' }], 'Heal the front hero for 4 HP.'],
    ['hurt', [{ op: 'hurt', n: 3 }], 'Lose 3 HP.'],
    ['hurt ally', [{ op: 'hurt', n: 3, tgt: 'ally' }], 'Your ally loses 3 HP.'],
    ['hurt both', [{ op: 'hurt', n: 3, tgt: 'both' }], 'Both heroes lose 3 HP.'],
    ['hurt lethal', [{ op: 'hurt', n: 3, lethal: true }], 'Lose 3 HP (this can be fatal).'],
    ['block then dmg', [blk(5), dmg(5)], 'Gain 5 Block. Deal 5 damage.'],
    ['dmg then heal', [dmg(5), { op: 'heal', n: 2 }], 'Deal 5 damage. Heal 2 HP.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, name));
});

t.test('card text: statuses merge into one sentence per side', () => {
  [
    ['gain a status', [st('bloom', 1)], 'Gain 1 Bloom.'],
    ['debuff defaults to the enemy', [st('weak', 2)], 'Apply 2 Weak.'],
    ['two debuffs merge', [st('vulnerable', 2), st('weak', 1)], 'Apply 2 Vulnerable and 1 Weak.'],
    ['two buffs merge', [st('might', 2), st('bulwark', 1)], 'Gain 2 Might and 1 Bulwark.'],
    ['three merge with commas', [st('might', 2), st('bulwark', 1), st('bloom', 3)], 'Gain 2 Might, 1 Bulwark and 3 Bloom.'],
    ['a debuff and a buff stay apart', [st('weak', 1), st('might', 1)], 'Apply 1 Weak. Gain 1 Might.'],
    ['all enemies', [st('poison', 3, { tgt: 'all' })], 'Apply 3 Poison to all enemies.'],
    ['random enemy', [st('poison', 3, { tgt: 'random' })], 'Apply 3 Poison to a random enemy.'],
    ['weakest enemy', [st('weak', 1, { tgt: 'lowest' })], 'Apply 1 Weak to the enemy with the lowest HP.'],
    ['all other enemies', [st('burn', 3, { tgt: 'others' })], 'Apply 3 Burn to all other enemies.'],
    ['ally', [st('might', 2, { tgt: 'ally' })], 'Give your ally 2 Might.'],
    ['both', [st('bulwark', 2, { tgt: 'both' })], 'Both heroes gain 2 Bulwark.'],
    ['front', [st('bulwark', 2, { tgt: 'front' })], 'The front hero gains 2 Bulwark.'],
    ['different targets do not merge', [st('weak', 1), st('weak', 1, { tgt: 'all' })], 'Apply 1 Weak. Apply 1 Weak to all enemies.'],
    ['negative on self', [st('bloom', -1)], 'Lose 1 Bloom.'],
    ['negative on an enemy', [st('vulnerable', -1, { tgt: 'enemy' })], 'Remove 1 Vulnerable from the enemy.'],
    ['per status', [st('poison', { per: 'status', who: 'target', s: 'poison', cap: 10 })], 'Double the target\'s Poison (adds at most 10).'],
    ['per turn', [st('burn', { per: 'turn', mul: 2, cap: 10 }, { tgt: 'enemy' })], 'Apply 2 Burn for each turn of this combat (max 10).'],
    ['remove all debuffs', [{ op: 'removeStatus', s: 'debuffs' }], 'Remove all debuffs.'],
    ['remove debuffs from the ally', [{ op: 'removeStatus', s: 'debuffs', tgt: 'ally' }], 'Remove all debuffs from your ally.'],
    ['remove debuffs from both', [{ op: 'removeStatus', s: 'debuffs', tgt: 'both' }], 'Remove all debuffs from both heroes.'],
    ['remove buffs from the enemy', [{ op: 'removeStatus', s: 'buffs' }], 'Remove all buffs from the enemy.'],
    ['remove one status from self', [{ op: 'removeStatus', s: 'weak' }], 'Lose all Weak.'],
    ['remove a counted status', [{ op: 'removeStatus', s: 'weak', n: 1 }], 'Lose 1 Weak.'],
    ['remove a buff from the enemy', [{ op: 'removeStatus', s: 'might', tgt: 'enemy' }], 'Remove Might from the enemy.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, name));
  // a conditional bonus of the same status reads "more"
  t.eq(text([dmg(4), st('burn', 3), cond({ row: 'front' }, [st('burn', 2)])]), 'Deal 4 damage. Apply 3 Burn. Front: apply 2 more Burn.', 'a same status conditional bonus reads "more"');
  t.eq(text([dmg(4), st('bloom', 1), cond({ row: 'back' }, [st('bloom', 2)])]), 'Deal 4 damage. Gain 1 Bloom. Back: gain 2 more Bloom.', 'and works for buffs');
  t.eq(text([dmg(4), st('burn', 3), cond({ row: 'front' }, [st('poison', 2)])]), 'Deal 4 damage. Apply 3 Burn. Front: apply 2 Poison.', 'a different status does not read "more"');
});

t.test('card text: energy, draw, cards and the rest', () => {
  [
    ['draw 2', [{ op: 'draw', n: 2 }], 'Draw 2 cards.'],
    ['draw 1', [{ op: 'draw', n: 1 }], 'Draw 1 card.'],
    ['energy', [{ op: 'energy', n: 1 }], 'Gain 1 Energy.'],
    ['energy 2', [{ op: 'energy', n: 2 }], 'Gain 2 Energy.'],
    ['lose energy', [{ op: 'energy', n: -1 }], 'Lose 1 Energy.'],
    ['swap', [{ op: 'swap' }], 'Swap rows.'],
    ['discard one', [pick('hand', 1, 'discard')], 'Discard a card.'],
    ['discard up to two', [pick('hand', 2, 'discard', { optional: true })], 'Discard up to 2 cards.'],
    ['discard two', [pick('hand', 2, 'discard')], 'Discard 2 cards.'],
    ['exhaust one', [pick('hand', 1, 'exhaust')], 'Exhaust a card.'],
    ['retain one', [pick('hand', 1, 'retain')], 'Retain a card.'],
    ['upgrade in hand', [pick('hand', 1, 'upgrade')], 'Upgrade a card in your hand.'],
    ['copy in hand', [pick('hand', 1, 'copy')], 'Copy a card in your hand.'],
    ['discard to hand', [pick('discard', 1, 'toHand')], 'Put a card from your discard pile into your hand.'],
    ['exhaust to hand', [pick('exhaust', 1, 'toHand')], 'Return a card from your Exhaust pile to your hand.'],
    ['draw top to hand', [pick('draw', 1, 'toHand', { top: 3 })], 'Put a card from the top 3 cards of your draw pile into your hand.'],
    ['draw top 1', [pick('draw', 1, 'toHand', { top: 1 })], 'Put a card from the top of your draw pile into your hand.'],
    ['draw pile whole', [pick('draw', 1, 'discard')], 'Discard a card from your draw pile.'],
    ['discard to draw top', [pick('discard', 1, 'toDrawTop')], 'Put a card from your discard pile on top of your draw pile.'],
    ['random exhaust', [pick('hand', 1, 'exhaust', { random: true })], 'Exhaust a random card.'],
    ['random two', [pick('hand', 2, 'discard', { random: true })], 'Discard 2 random cards.'],
    ['type filter', [pick('hand', 1, 'discard', { filter: { type: 'attack' } })], 'Discard an Attack.'],
    ['type filter plural', [pick('hand', 2, 'discard', { filter: { type: 'skill' } })], 'Discard 2 Skills.'],
    ['hero filter', [pick('discard', 2, 'toHand', { filter: { hero: 'kuro' } })], 'Put 2 Kuro cards from your discard pile into your hand.'],
    ['choose', [pick('hand', 1, undefined)], 'Choose a card.'],
    ['picked count', [pick('hand', 2, 'discard'), { op: 'draw', n: { per: 'picked' } }], 'Discard 2 cards. Draw 1 card for each card chosen.'],
    ['picked mul', [pick('hand', 2, 'exhaust', { optional: true }), blk({ per: 'picked', mul: 3 })], 'Exhaust up to 2 cards. Gain 3 Block for each card chosen.'],
    ['gold', [{ op: 'gold', n: 10 }], 'Gain 10 gold.'],
    ['ink', [{ op: 'ink', n: 2 }], 'Gain 2 Ink.'],
    ['max hp', [{ op: 'maxHp', n: 2 }], 'Gain 2 max HP.'],
    ['revive pct', [{ op: 'revive', pct: 0.3 }], 'Revive a fallen hero with 30% HP.'],
    ['revive n', [{ op: 'revive', n: 8 }], 'Revive a fallen hero with 8 HP.'],
    ['empty', [], ''],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, name));
  t.eq(text([{ op: 'add', card: PLAINC }], SK), 'Add a Pebble to your hand.', 'add: a normal card goes to the hand');
  t.eq(text([{ op: 'add', card: INK }], SK), 'Add an Ink Blot card to your discard pile.', 'add: junk goes to the discard pile, and "an" before a vowel');
  t.eq(text([{ op: 'add', card: INK, n: 2, to: 'discard' }], SK), 'Add 2 Ink Blot cards to your discard pile.', 'add: a count');
  t.eq(text([{ op: 'add', card: INK, to: 'draw' }], SK), 'Shuffle an Ink Blot card into your draw pile.', 'add: to the draw pile shuffles');
  t.eq(text([{ op: 'add', card: PLAINC, to: 'exhaust' }], SK), 'Add a Pebble to your Exhaust pile.', 'add: to the exhaust pile');
  t.eq(text([{ op: 'add', card: PLAINC, up: 1 }], SK), 'Add a Pebble+ to your hand.', 'add: an upgraded copy');
  t.eq(text([{ op: 'add', card: 't_missing' }], SK), 'Add a t_missing to your hand.', 'add: an unknown card falls back to its id');
  const spicy = W.card([], { name: 'A&B <i>' });
  t.eq(text([{ op: 'add', card: spicy }], SK), 'Add an A&B <i> to your hand.', 'add: names come through the plain text unescaped');
  t.ok(H(W.card([{ op: 'add', card: spicy }], SK)).indexOf('A&amp;B &lt;i&gt;') > 0, 'add: and are escaped in the html');
});

t.test('card text: conditions', () => {
  const hero = (s, x) => Object.assign({ who: 'self', s }, x);
  [
    ['front bonus merges into the damage', [dmg(6), cond({ row: 'front' }, [dmg(3)])], 'Deal 6 damage. Front: deal 3 more damage.'],
    ['back bonus merges into the block', [blk(6), cond({ row: 'back' }, [blk(3)])], 'Gain 6 Block. Back: gain 3 more Block.'],
    ['row bonus of another kind stays whole', [dmg(4), cond({ row: 'back' }, [{ op: 'draw', n: 1 }])], 'Deal 4 damage. Back: draw 1 card.'],
    ['row with an else', [cond({ row: 'front' }, [dmg(9)], [blk(5)])], 'Front: deal 9 damage. Back: gain 5 Block.'],
    ['back with an else', [cond({ row: 'back' }, [blk(9)], [dmg(5)])], 'Back: gain 9 Block. Front: deal 5 damage.'],
    ['status gte', [dmg(4), cond({ status: hero('bloom', { gte: 3 }) }, [dmg(4)])], 'Deal 4 damage. If you have at least 3 Bloom, deal 4 more damage.'],
    ['status gte 1', [cond({ status: hero('bloom', { gte: 1 }) }, [{ op: 'draw', n: 1 }])], 'If you have Bloom, draw 1 card.'],
    ['status none', [cond({ status: hero('bloom', { lte: 0 }) }, [{ op: 'draw', n: 1 }])], 'If you have no Bloom, draw 1 card.'],
    ['status at most', [cond({ status: hero('bloom', { lte: 2 }) }, [{ op: 'draw', n: 1 }])], 'If you have at most 2 Bloom, draw 1 card.'],
    ['status range', [cond({ status: hero('bloom', { gte: 2, lte: 4 }) }, [{ op: 'draw', n: 1 }])], 'If you have 2 to 4 Bloom, draw 1 card.'],
    ['ally status', [cond({ status: { who: 'ally', s: 'weak', gte: 1 } }, [blk(4)])], 'If your ally has Weak, gain 4 Block.'],
    ['target status', [cond({ status: { who: 'target', s: 'poison', gte: 2 } }, [dmg(4)])], 'If the target has at least 2 Poison, deal 4 damage.'],
    ['hp below', [dmg(5), cond({ hpPct: { who: 'target', lt: 0.5 } }, [dmg(5)])], 'Deal 5 damage. If the target is below 50% HP, deal 5 more damage.'],
    ['hp above self', [cond({ hpPct: { who: 'self', gt: 0.5 } }, [blk(5)])], 'If you are above 50% HP, gain 5 Block.'],
    ['hp ally', [cond({ hpPct: { who: 'ally', lt: 0.3 } }, [blk(5)])], 'If your ally is below 30% HP, gain 5 Block.'],
    ['hand empty', [cond({ handEmpty: true }, [{ op: 'draw', n: 2 }])], 'If your hand is empty, draw 2 cards.'],
    ['no card played', [cond({ cardsPlayed: { lte: 0 } }, [{ op: 'energy', n: 1 }])], 'If you have not played a card this turn, gain 1 Energy.'],
    ['three cards played', [cond({ cardsPlayed: { gte: 3 } }, [{ op: 'energy', n: 1 }])], 'If you have played at least 3 cards this turn, gain 1 Energy.'],
    ['a card played', [cond({ cardsPlayed: { gte: 1 } }, [{ op: 'energy', n: 1 }])], 'If you have played a card this turn, gain 1 Energy.'],
    ['at most one card', [cond({ cardsPlayed: { lte: 1 } }, [{ op: 'energy', n: 1 }])], 'If you have played at most 1 card this turn, gain 1 Energy.'],
    ['card range', [cond({ cardsPlayed: { gte: 2, lte: 3 } }, [{ op: 'energy', n: 1 }])], 'If you have played 2 to 3 cards this turn, gain 1 Energy.'],
    ['no attack played', [cond({ attacksPlayed: { lte: 0 } }, [blk(4)])], 'If you have not played an Attack this turn, gain 4 Block.'],
    ['an attack played', [cond({ attacksPlayed: { gte: 1 } }, [{ op: 'draw', n: 1 }])], 'If you have played an Attack this turn, draw 1 card.'],
    ['two attacks played', [cond({ attacksPlayed: { gte: 2 } }, [{ op: 'draw', n: 1 }])], 'If you have played at least 2 Attacks this turn, draw 1 card.'],
    ['at most two attacks', [cond({ attacksPlayed: { lte: 2 } }, [{ op: 'draw', n: 1 }])], 'If you have played at most 2 Attacks this turn, draw 1 card.'],
    ['turn or later', [cond({ turn: { gte: 3 } }, [blk(6)])], 'If it is turn 3 or later, gain 6 Block.'],
    ['turn or earlier', [cond({ turn: { lte: 2 } }, [blk(6)])], 'If it is turn 2 or earlier, gain 6 Block.'],
    ['turn range', [cond({ turn: { gte: 2, lte: 4 } }, [blk(6)])], 'If it is turn 2 to 4, gain 6 Block.'],
    ['last kill', [dmg(5), cond({ lastKill: true }, [{ op: 'energy', n: 1 }])], 'Deal 5 damage. If this defeats an enemy, gain 1 Energy.'],
    ['target status key', [dmg(5), cond({ targetStatus: { s: 'poison', gte: 1 } }, [dmg(5)])], 'Deal 5 damage. If the target has Poison, deal 5 more damage.'],
    ['ally down', [cond({ allyDown: true }, [blk(9)])], 'If your ally is down, gain 9 Block.'],
    ['block', [cond({ block: { gte: 10 } }, [{ op: 'draw', n: 1 }])], 'If you have at least 10 Block, draw 1 card.'],
    ['no block', [cond({ block: { lte: 0 } }, [{ op: 'draw', n: 1 }])], 'If you have no Block, draw 1 card.'],
    ['no energy', [cond({ energy: { lte: 0 } }, [{ op: 'draw', n: 1 }])], 'If you have no Energy left, draw 1 card.'],
    ['energy gte', [cond({ energy: { gte: 2 } }, [{ op: 'draw', n: 1 }])], 'If you have at least 2 Energy left, draw 1 card.'],
    ['energy at most', [cond({ energy: { lte: 1 } }, [{ op: 'draw', n: 1 }])], 'If you have at most 1 Energy left, draw 1 card.'],
    ['energy range', [cond({ energy: { gte: 1, lte: 2 } }, [{ op: 'draw', n: 1 }])], 'If you have 1 to 2 Energy left, draw 1 card.'],
    ['hand small', [cond({ handSize: { lte: 2 } }, [{ op: 'draw', n: 2 }])], 'If you hold at most 2 cards, draw 2 cards.'],
    ['hand none', [cond({ handSize: { lte: 0 } }, [{ op: 'draw', n: 2 }])], 'If you hold no cards, draw 2 cards.'],
    ['hand big', [cond({ handSize: { gte: 6 } }, [{ op: 'energy', n: 1 }])], 'If you hold at least 6 cards, gain 1 Energy.'],
    ['hand range', [cond({ handSize: { gte: 2, lte: 4 } }, [{ op: 'energy', n: 1 }])], 'If you hold 2 to 4 cards, gain 1 Energy.'],
    ['enemies many', [cond({ enemies: { gte: 2 } }, [dmg(4, { tgt: 'all' })])], 'If 2 or more enemies remain, deal 4 damage to all enemies.'],
    ['enemies one', [cond({ enemies: { gte: 1 } }, [dmg(4)])], 'If an enemy remains, deal 4 damage.'],
    ['enemies few', [cond({ enemies: { lte: 2 } }, [dmg(4)])], 'If 2 or fewer enemies remain, deal 4 damage.'],
    ['one enemy', [cond({ enemies: { lte: 1 } }, [dmg(4)])], 'If only one enemy remains, deal 4 damage.'],
    ['enemies range', [cond({ enemies: { gte: 2, lte: 3 } }, [dmg(4)])], 'If 2 to 3 enemies remain, deal 4 damage.'],
    ['two keys in one condition', [cond({ row: 'front', status: hero('might', { gte: 2 }) }, [dmg(9)])], 'If you are in the front row and you have at least 2 Might, deal 9 damage.'],
    ['else without a row', [cond({ handEmpty: true }, [{ op: 'draw', n: 2 }], [{ op: 'draw', n: 1 }])], 'If your hand is empty, draw 2 cards. Otherwise, draw 1 card.'],
    ['two ops in then', [cond({ handEmpty: true }, [{ op: 'draw', n: 2 }, blk(3)])], 'If your hand is empty, draw 2 cards and gain 3 Block.'],
    ['nested', [cond({ row: 'front' }, [cond({ handEmpty: true }, [{ op: 'draw', n: 2 }])])], 'Front: if your hand is empty, draw 2 cards.'],
    ['cond in a repeat', [{ op: 'repeat', n: 2, do: [cond({ row: 'front' }, [dmg(3)])] }], 'Repeat 2 times: Front: deal 3 damage.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, 'cond: ' + name));
  t.eq(text([dmg(6), cond({ row: 'front' }, [dmg(3, { pierce: true })])]), 'Deal 6 damage. Front: deal 3 damage, ignoring Block.', 'cond: a fancy bonus stays a whole clause');
  t.eq(text([dmg(6), cond({ row: 'front' }, [dmg(3, { tgt: 'all' })])]), 'Deal 6 damage. Front: deal 3 damage to all enemies.', 'cond: a different target does not merge');
  t.eq(text([blk(6, { tgt: 'both' }), cond({ row: 'front' }, [blk(3, { tgt: 'both' })])], SK), 'Both heroes gain 6 Block. Front: both heroes gain 3 more Block.', 'cond: a same target block bonus merges');
  t.eq(text([{ op: 'heal', n: 3 }, cond({ row: 'back' }, [{ op: 'heal', n: 2 }])], SK), 'Heal 3 HP. Back: heal 2 more HP.', 'cond: a heal bonus merges');
});

t.test('card text: value expressions (per)', () => {
  const status = (s, x) => Object.assign({ per: 'status', who: 'self', s }, x);
  [
    ['block', dmg({ per: 'block', who: 'self' }), 'Deal damage equal to your Block.'],
    ['ally block', dmg({ per: 'block', who: 'ally' }), 'Deal damage equal to your ally\'s Block.'],
    ['target block', dmg({ per: 'targetBlock' }), 'Deal damage equal to the target\'s Block.'],
    ['status mul', dmg(status('bloom', { mul: 2 })), 'Deal 2 damage for each Bloom you have.'],
    ['status mul 1', dmg(status('bloom')), 'Deal damage equal to your Bloom.'],
    ['status base', dmg(status('bloom', { base: 2, mul: 2 })), 'Deal 2 damage, plus 2 for each Bloom you have.'],
    ['status base 1', dmg(status('bloom', { base: 3 })), 'Deal damage equal to 3 plus your Bloom.'],
    ['ally status', dmg(status('might', { who: 'ally', mul: 2 })), 'Deal 2 damage for each Might your ally has.'],
    ['target status', dmg(status('poison', { who: 'target', mul: 5, cap: 50 })), 'Deal 5 damage for each Poison the target has (max 50).'],
    ['hand', blk({ per: 'handSize', mul: 2 }), 'Gain 2 Block for each card in your hand.'],
    ['draw pile', blk({ per: 'drawPile' }), 'Gain Block equal to the number of cards in your draw pile.'],
    ['discard pile cap', dmg({ per: 'discardPile', mul: 1, cap: 12 }), 'Deal damage equal to the number of cards in your discard pile (max 12).'],
    ['exhaust pile', dmg({ per: 'exhaustPile', mul: 2 }), 'Deal 2 damage for each card in your Exhaust pile.'],
    ['cards played', dmg({ per: 'cardsPlayed', mul: 2 }), 'Deal 2 damage for each card played earlier this turn.'],
    ['attacks played', dmg({ per: 'attacksPlayed', mul: 2 }), 'Deal 2 damage for each Attack played earlier this turn.'],
    ['skills played', dmg({ base: 2, per: 'skillsPlayed', mul: 3, upTo: 3 }), 'Deal 2 damage, plus 3 for each Skill played earlier this turn (up to 3).'],
    ['energy', dmg({ per: 'energy', mul: 3 }), 'Deal 3 damage for each Energy you have left.'],
    ['hp', blk({ per: 'hp', who: 'self', mul: 1 }), 'Gain Block equal to your current HP.'],
    ['missing hp', dmg({ per: 'missingHp', who: 'self', mul: 1, upTo: 20 }), 'Deal damage equal to your missing HP (up to 20).'],
    ['debuffs', dmg({ per: 'debuffs', who: 'target', mul: 3 }), 'Deal 3 damage for each debuff on the target.'],
    ['own debuffs', dmg({ per: 'debuffs', who: 'self', mul: 3 }), 'Deal 3 damage for each debuff on you.'],
    ['enemies', dmg({ per: 'enemies', mul: 3 }), 'Deal 3 damage for each living enemy.'],
    ['kills', blk({ per: 'kills', mul: 2 }), 'Gain 2 Block for each enemy defeated this combat.'],
    ['turn', blk({ per: 'turn', mul: 2, cap: 10 }), 'Gain 2 Block for each turn of this combat (max 10).'],
    ['gems', dmg({ per: 'gems', mul: 3 }), 'Deal 3 damage for each gem in this card.'],
    ['damage taken', dmg({ base: 2, per: 'damageTaken', cap: 15 }), 'Deal damage equal to 2 plus the damage you took last enemy turn (max 15).'],
    ['hits taken', blk({ per: 'hitsTaken', mul: 2 }), 'Gain 2 Block for each hit you took last enemy turn.'],
    ['front', dmg({ base: 4, per: 'front', mul: 3 }), 'Deal 4 damage (7 in the Front row).'],
    ['front only', dmg({ per: 'front', mul: 3 }), 'Deal 3 damage while in the Front row.'],
    ['X', dmg({ per: 'X', mul: 4 }), 'Deal 4 damage for each Energy spent.'],
    ['X plus base', dmg({ base: 2, per: 'X', mul: 3 }), 'Deal 2 damage, plus 3 for each Energy spent.'],
  ].forEach(([name, op, want]) => t.eq(text([op], name === 'X' || name === 'X plus base' ? Object.assign({ cost: 'X' }, SK) : SK), want, 'per: ' + name));
  ['X', 'handSize', 'drawPile', 'discardPile', 'exhaustPile', 'cardsPlayed', 'attacksPlayed', 'skillsPlayed', 'energy', 'block', 'hp', 'missingHp', 'status', 'debuffs', 'enemies', 'kills', 'turn', 'gems', 'damageTaken', 'hitsTaken', 'targetBlock', 'picked', 'front'].forEach((per) => {
    const v = { per, who: 'self', s: 'bloom', mul: 2, base: 1 }, v1 = { per, who: 'self', s: 'bloom' };
    [v, v1].forEach((vv) => { const s = text([dmg(vv)], SK); t.ok(s.length > 5 && !/something|undefined|NaN|object/.test(s), `per ${per}: reads as a sentence (${s})`); });
    const s2 = text([dmg(4, { hits: v1 })], SK); t.ok(!/something|undefined|NaN|object/.test(s2), `per ${per} as hits: no placeholder (${s2})`);
  });
});

t.test('card text: spend, lose all Block, and the spent count', () => {
  const bloom = (mul, x) => Object.assign({ per: 'status', who: 'self', s: 'bloom', mul }, x);
  [
    ['spend up to', [dmg(bloom(4), { consume: { s: 'bloom', upTo: 4 } })], 'Spend up to 4 Bloom. Deal 4 damage for each Bloom spent.'],
    ['spend all', [dmg(bloom(3), { consume: 'bloom' })], 'Spend all Bloom. Deal 3 damage for each Bloom spent.'],
    ['spend all mul 1', [dmg(bloom(1), { consume: 'bloom' })], 'Spend all Bloom. Deal damage equal to the Bloom spent.'],
    ['spend with base', [dmg(bloom(3, { base: 3 }), { consume: { s: 'bloom', upTo: 3 } })], 'Spend up to 3 Bloom. Deal 3 damage, plus 3 for each Bloom spent.'],
    ['spend for block', [blk(bloom(2), { consume: 'bloom', tgt: 'both' })], 'Spend all Bloom. Both heroes gain 2 Block for each Bloom spent.'],
    ['spend for heal', [{ op: 'heal', n: bloom(3), consume: { s: 'bloom', upTo: 4 }, tgt: 'both' }], 'Spend up to 4 Bloom. Heal both heroes for 3 HP for each Bloom spent.'],
    ['spend for draw', [{ op: 'draw', n: { per: 'status', who: 'self', s: 'sumi' }, consume: 'sumi' }], 'Spend all Sumi. Draw cards equal to the Sumi spent.'],
    ['spend for energy', [{ op: 'energy', n: { per: 'status', who: 'self', s: 'sumi', mul: 1 }, consume: 'sumi' }], 'Spend all Sumi. Gain Energy equal to the Sumi spent.'],
    ['spend for hits', [dmg(3, { hits: { per: 'status', who: 'self', s: 'sumi', upTo: 4 }, consume: { s: 'sumi', upTo: 4 } })], 'Spend up to 4 Sumi. Deal 3 damage for each Sumi spent.'],
    ['spend for status', [st('poison', { per: 'status', who: 'self', s: 'sumi', mul: 2 }, { consume: 'sumi' })], 'Spend all Sumi. Apply 2 Poison for each Sumi spent.'],
    ['consume block', [dmg({ per: 'block', who: 'self' }, { consume: 'block' })], 'Deal damage equal to your Block. Lose all your Block.'],
    ['consume block upTo', [dmg({ per: 'block', who: 'self' }, { consume: { s: 'block', upTo: 6 } })], 'Deal damage equal to your Block. Lose up to 6 Block.'],
    ['sums to hit count when hits per is spent', [dmg(2, { hits: { per: 'status', who: 'self', s: 'bloom' }, consume: 'bloom' })], 'Spend all Bloom. Deal 2 damage for each Bloom spent.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, name));
  t.eq(text([dmg(3, { hits: { per: 'status', who: 'self', s: 'sumi', upTo: 4 } })], SK), 'Deal 3 damage for each Sumi you have (up to 4).', 'without a consume the count reads "you have"');
  t.eq(text([dmg(3, { tgt: 'random' }), dmg(3, { tgt: 'random', hits: { per: 'status', s: 'sumi', upTo: 4 }, consume: { s: 'sumi', upTo: 4 } })]), 'Deal 3 damage to a random enemy. Spend up to 4 Sumi. Deal 3 damage to a random enemy for each Sumi spent.', 'a strike followed by a spending strike');
});

t.test('card text: keywords lead, Exhaust trails, hand text for curses', () => {
  [
    ['innate', [dmg(4)], { kw: ['innate'] }, 'Innate. Deal 4 damage.'],
    ['retain and exhaust', [blk(4)], { kw: ['retain', 'exhaust'], type: 'skill' }, 'Retain. Gain 4 Block. Exhaust.'],
    ['ethereal', [dmg(9)], { kw: ['ethereal'] }, 'Ethereal. Deal 9 damage.'],
    ['exhaust', [dmg(9)], { kw: ['exhaust'] }, 'Deal 9 damage. Exhaust.'],
    ['fixed lead order', [dmg(9)], { kw: ['exhaust', 'ethereal', 'retain', 'innate'] }, 'Innate. Retain. Ethereal. Deal 9 damage. Exhaust.'],
    ['unplayable curse with a turn end', [], { type: 'curse', hero: 'curse', kw: ['unplayable'], cost: null, hand: { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] } }, 'Unplayable. If this is in your hand at the end of your turn, the front hero loses 2 HP.'],
    ['status when drawn', [], { type: 'status', hero: 'status', kw: ['unplayable'], cost: null, hand: { drawn: [{ op: 'energy', n: -1 }] } }, 'Unplayable. When drawn, lose 1 Energy.'],
    ['both hand hooks', [], { type: 'curse', hero: 'curse', kw: ['unplayable'], cost: null, hand: { turnEnd: [st('weak', 1, { tgt: 'front' })], drawn: [st('vulnerable', 1, { tgt: 'front' })] } }, 'Unplayable. If this is in your hand at the end of your turn, the front hero gains 1 Weak. When drawn, the front hero gains 1 Vulnerable.'],
    ['a playable status', [{ op: 'hurt', n: 2 }, { op: 'draw', n: 1 }], { type: 'status', hero: 'status', cost: 0, kw: ['exhaust'] }, 'The front hero loses 2 HP. Draw 1 card. Exhaust.'],
  ].forEach(([name, fx, over, want]) => t.eq(text(fx, over), want, name));
  const withNote = W.card([dmg(4)], { kw: ['retain'], slots: ['red'] });
  t.eq(P(withNote), 'Retain. Deal 4 damage.', 'keywords do not disturb the ops');
});

t.test('card text: hooks read as sentences', () => {
  [
    ['play a skill', hook('onPlay', [st('sumi', 1)], { filter: { type: 'skill' } }), 'Whenever you play a Skill, gain 1 Sumi.'],
    ['limit one', hook('onPlay', [blk(2)], { filter: { type: 'attack' }, limit: 1 }), 'Once per turn, whenever you play an Attack, gain 2 Block.'],
    ['limit two', hook('onPlay', [st('bloom', 1)], { filter: { type: 'attack' }, limit: 2 }), 'Up to 2 times per turn, whenever you play an Attack, gain 1 Bloom.'],
    ['turn start', hook('turnStart', [{ op: 'draw', n: 1 }]), 'At the start of your turn, draw 1 card.'],
    ['turn start once', hook('turnStart', [{ op: 'energy', n: 2 }], { once: true }), 'Next turn: gain 2 Energy.'],
    ['turn end', hook('turnEnd', [blk(4)]), 'At the end of your turn, gain 4 Block.'],
    ['turn end once', hook('turnEnd', [st('might', -2)], { once: true }), 'At the end of this turn, lose 2 Might.'],
    ['every third turn', hook('turnStart', [{ op: 'energy', n: 1 }], { every: 3 }), 'At the start of every 3rd turn, gain 1 Energy.'],
    ['every second turn end', hook('turnEnd', [blk(2)], { every: 2 }), 'At the end of every 2nd turn, gain 2 Block.'],
    ['every third play', hook('onPlay', [{ op: 'draw', n: 1 }], { filter: { type: 'attack' }, every: 3 }), 'Every 3rd time you play an Attack, draw 1 card.'],
    ['on damaged', hook('onDamaged', [dmg(3)]), 'Whenever you are hit, deal 3 damage to the attacker.'],
    ['on kill', hook('onKill', [{ op: 'heal', n: 5 }], { filter: { tier: ['elite', 'boss'] } }), 'Whenever you defeat an Elite or a Boss, heal 5 HP.'],
    ['on any kill', hook('onKill', [{ op: 'energy', n: 1 }]), 'Whenever you defeat an enemy, gain 1 Energy.'],
    ['on kill spreads', hook('onKill', [st('burn', 3, { tgt: 'all' })]), 'Whenever you defeat an enemy, apply 3 Burn to all enemies.'],
    ['on exhaust', hook('onExhaust', [{ op: 'draw', n: 1 }]), 'Whenever a card is Exhausted, draw 1 card.'],
    ['on swap', hook('onSwap', [blk(3)]), 'Whenever you swap into the front row, gain 3 Block.'],
    ['on hero down', hook('onHeroDown', [{ op: 'revive', pct: 0.5 }], { once: true }), 'The next time you fall, revive yourself with 50% HP.'],
    ['on shuffle', hook('onShuffle', [blk(3)]), 'Whenever you reshuffle your draw pile, gain 3 Block.'],
    ['free plays', hook('onPlay', [dmg(2, { tgt: 'random' })], { filter: { cost: { lte: 0 } } }), 'Whenever you play a card that costs 0, deal 2 damage to a random enemy.'],
    ['cheap plays', hook('onPlay', [blk(1)], { filter: { cost: { lte: 1 } } }), 'Whenever you play a card that costs 1 or less, gain 1 Block.'],
    ['pricey plays', hook('onPlay', [blk(1)], { filter: { cost: { gte: 2 } } }), 'Whenever you play a card that costs 2 or more, gain 1 Block.'],
    ['exact cost', hook('onPlay', [blk(1)], { filter: { cost: { gte: 2, lte: 2 } } }), 'Whenever you play a card that costs 2, gain 1 Block.'],
    ['cost range', hook('onPlay', [blk(1)], { filter: { cost: { gte: 1, lte: 2 } } }), 'Whenever you play a card that costs 1 to 2, gain 1 Block.'],
    ['keyword filter', hook('onPlay', [blk(2)], { filter: { kw: ['exhaust'] } }), 'Whenever you play a card with Exhaust, gain 2 Block.'],
    ['two keywords', hook('onPlay', [blk(2)], { filter: { kw: ['exhaust', 'retain'] } }), 'Whenever you play a card with Exhaust and Retain, gain 2 Block.'],
    ['hero filter', hook('onPlay', [blk(2)], { filter: { hero: 'kuro', type: 'attack' } }), 'Whenever you play a Kuro Attack, gain 2 Block.'],
    ['type list', hook('onPlay', [blk(2)], { filter: { type: ['attack', 'skill'] } }), 'Whenever you play an Attack or Skill, gain 2 Block.'],
    ['same target', hook('onPlay', [st('mark', 1)], { filter: { type: 'attack' } }), 'Whenever you play an Attack, apply 1 Mark to the same target.'],
    ['gems filter', hook('onPlay', [blk(2)], { filter: { gems: { gte: 1 } } }), 'Whenever you play a card with a gem, gain 2 Block.'],
    ['gems filter 2', hook('onPlay', [blk(2)], { filter: { gems: { gte: 2 } } }), 'Whenever you play a card with 2 or more gems, gain 2 Block.'],
    ['exhausted filter', hook('onExhaust', [blk(2)], { filter: { type: 'attack' } }), 'Whenever an Attack is Exhausted, gain 2 Block.'],
    ['two ops', hook('onDamaged', [dmg(2), st('bloom', 1)]), 'Whenever you are hit, deal 2 damage to the attacker and gain 1 Bloom.'],
  ].forEach(([name, op, want]) => t.eq(text([op], PW), want, 'hook: ' + name));
  t.eq(text([hook('onPlay', [st('mark', 1)], { filter: { type: 'skill' } })], PW), 'Whenever you play a Skill, apply 1 Mark to the same target.', 'hook: onPlay enemy effects read "the same target"');
  t.eq(text([hook('onShuffle', [dmg(3)])], PW), 'Whenever you reshuffle your draw pile, deal 3 damage to a random enemy.', 'hook: other triggers read "a random enemy"');
});

t.test('card text: empty and silent branches print nothing, and an else-only branch reads naturally', () => {
  t.eq(text([dmg(4), cond({ row: 'front' }, [])], {}), 'Deal 4 damage.', 'an empty conditional prints nothing');
  t.eq(text([dmg(4), cond({ row: 'front' }, [], [])], {}), 'Deal 4 damage.', 'an empty conditional with an empty else prints nothing');
  t.eq(text([dmg(4), { op: 'repeat', n: 3, do: [] }], {}), 'Deal 4 damage.', 'an empty repeat prints nothing');
  t.eq(text([dmg(4), hook('onPlay', [])], {}), 'Deal 4 damage.', 'an empty hook prints nothing');
  t.eq(text([dmg(4), { op: 'flag', id: 'x' }], {}), 'Deal 4 damage.', 'a flag op is silent');
  t.eq(text([cond({ row: 'front' }, [], [blk(5)])], SK), 'Back: gain 5 Block.', 'a row conditional that only has an else reads as the other row');
  t.eq(text([cond({ handEmpty: true }, [], [blk(5)])], SK), 'Unless your hand is empty, gain 5 Block.', 'any other else-only conditional reads as "unless"');
  t.eq(text([cond({ row: 'front' }, [{ op: 'flag', id: 'x' }])], SK), '', 'a conditional of silent ops prints nothing');
  t.eq(D.hookText({ on: 'turnStart', fx: [] }), '', 'hookText of an empty hook');
  t.eq(text([], { kw: ['exhaust'] }), 'Exhaust.', 'a card with only a keyword prints the keyword');
});

t.test('card text: text stays under the 110 character audit for the typical shapes', () => {
  const shapes = [
    [dmg(12, { hits: 2, tgt: 'all' }), st('vulnerable', 2, { tgt: 'all' }), st('weak', 2, { tgt: 'all' })],
    [dmg(9), cond({ row: 'front' }, [dmg(9)]), st('bloom', 2)],
    [cond({ row: 'front' }, [dmg(20, { pierce: true })], [blk(12)]), { op: 'draw', n: 2 }],
    [hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack' }, limit: 2 })],
  ];
  shapes.forEach((fx, i) => { const s = text(fx, { kw: ['retain', 'exhaust'] }); t.ok(s.length <= 110, `shape ${i} stays short (${s.length}): ${s}`); });
});

// ------------------------------------------------------------------ markup
t.test('markup: only kw and num spans, keyword keys resolve, plain equals stripped html', () => {
  const rich = W.card([dmg(6, { hits: 2, pierce: true }), st('vulnerable', 2), st('weak', 1), blk(4, { tgt: 'both' }), pick('exhaust', 1, 'toHand'), { op: 'swap' }, { op: 'energy', n: 1 }, cond({ row: 'front' }, [dmg(3)]), hook('onExhaust', [{ op: 'draw', n: 1 }])], { kw: ['innate', 'exhaust'], cost: 'X' });
  const html = H(rich);
  const tags = [...html.matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[1]);
  t.ok(tags.length > 10 && tags.every((x) => x === 'span'), 'every tag is a span');
  t.eq((html.match(/<span/g) || []).length, (html.match(/<\/span>/g) || []).length, 'spans are balanced');
  const okKey = (k) => !!D.keywords[k] || !!D.statuses[k];
  t.ok(kws(html).length >= 8 && kws(html).every(([k]) => okKey(k)), 'every data-kw is a key of DATA.keywords or DATA.statuses: ' + kws(html).map((x) => x[0]).join(','));
  t.ok([...html.matchAll(/<span class="([^"]*)"/g)].every((m) => /^(kw|num|num up|num down)$/.test(m[1])), 'classes are kw, num, num up or num down');
  t.eq(strip(html), P(rich), 'cardPlain is cardHtml with the tags removed');
  t.ok(!/[<>]/.test(P(rich).replace(/&[a-z]+;/g, '')), 'no stray angle brackets in the plain text');
  const words = Object.fromEntries(kws(html));
  t.eq(words.innate, 'Innate', 'Innate keyword word'); t.eq(words.exhaust, 'Exhaust', 'Exhaust keyword word'); t.eq(words.block, 'Block', 'Block keyword word'); t.eq(words.vulnerable, 'Vulnerable', 'status keyword word'); t.eq(words.swap, 'Swap', 'Swap keyword word');
  t.eq(words.front, 'Front', 'row keyword word'); t.eq(words.xcost, undefined, 'the cost X is not part of rules text here');
  t.ok(html.indexOf('<span class="kw" data-kw="innate">Innate</span>.') === 0, 'a leading keyword opens the text');
  // a keyword key for every keyword the engine can print
  const all = W.card([dmg(4, { lifesteal: true, pierce: true }), blk(1), pick('exhaust', 1, 'retain'), pick('hand', 1, 'exhaust'), { op: 'ink', n: 1 }, dmg({ per: 'X', mul: 1 })], { kw: ['retain', 'ethereal', 'unplayable', 'exhaust', 'innate'], cost: 'X' });
  kws(H(all)).forEach(([k]) => t.ok(okKey(k), 'keyword ' + k + ' is a registered key'));
  t.ok(kws(H(all)).some(([k]) => k === 'xcost'), 'X costs use the xcost keyword');
});

t.test('markup: numbers are spans, words are not, and text has no dashes or debris', () => {
  const html = H(W.card([dmg(6), st('bloom', 2), { op: 'draw', n: 2 }, { op: 'energy', n: 1 }]));
  t.deep(nums(html).map((x) => x[0]), [6, 2, 2, 1], 'every count is a num span, in reading order');
  const many = [];
  for (let i = 0; i < 40; i++) many.push(text([dmg(i + 1, { hits: (i % 3) + 1 }), blk(i), st(i % 2 ? 'poison' : 'bloom', i + 1)], { kw: i % 2 ? ['exhaust'] : [] }));
  t.ok(many.every((s) => !DASH.test(s) && s.indexOf('  ') < 0 && !/\s[.,]/.test(s) && !/\.\./.test(s) && /^[A-Z]/.test(s) && /[.)]$/.test(s)), 'no dashes, double spaces, stray punctuation, and every text is a capitalised sentence');
});

// ------------------------------------------------------------------ up and down
t.test('up and down: upgrades colour the changed numbers only', () => {
  const up1 = W.card([dmg(6), st('bloom', 1)], { name: 'Upper', up: { fx: [dmg(9), st('bloom', 2)], cost: 0 } });
  t.deep(nums(H(up1)), [[6, ''], [1, '']], 'a printed card shows plain numbers');
  t.deep(nums(H({ id: up1, up: 1 })), [[9, 'up'], [2, 'up']], 'an upgraded card marks the higher numbers up');
  t.deep(nums(H({ id: up1, up: 0, gems: [] })), [[6, ''], [1, '']], 'a bare instance reads like the printed card');
  const partial = W.card([dmg(6), st('bloom', 1)], { up: { fx: [dmg(9), st('bloom', 1)] } });
  t.deep(nums(H({ id: partial, up: 1 })), [[9, 'up'], [1, '']], 'unchanged numbers stay plain');
  const dn = W.card([dmg(9, { hits: 2 })], { up: { fx: [dmg(7, { hits: 2 })] } });
  t.deep(nums(H({ id: dn, up: 1 })), [[7, 'down'], [2, '']], 'a lower number is marked down');
  const hitsUp = W.card([dmg(3, { hits: 2 })], { up: { fx: [dmg(3, { hits: 3 })] } });
  t.deep(nums(H({ id: hitsUp, up: 1 })), [[3, ''], [3, 'up']], 'a higher hit count is marked up');
  const repUp = W.card([{ op: 'repeat', n: 2, do: [dmg(2)] }], { up: { fx: [{ op: 'repeat', n: 3, do: [dmg(2)] }] } });
  t.deep(nums(H({ id: repUp, up: 1 })), [[2, ''], [3, '']], 'a repeat count carries no up marker (its own structure changes, the damage does not)');
  const newOp = W.card([dmg(6)], { up: { fx: [dmg(6), { op: 'draw', n: 1 }] } });
  t.deep(nums(H({ id: newOp, up: 1 })), [[6, ''], [1, 'up']], 'a brand new op is entirely up');
  const swapOrder = W.card([dmg(6), blk(5)], { up: { fx: [blk(7), dmg(6)] } });
  t.deep(nums(H({ id: swapOrder, up: 1 })), [[7, 'up'], [6, '']], 'ops are compared with the printed op of the same kind');
  const statusSwap = W.card([st('weak', 1)], { up: { fx: [st('vulnerable', 2)] } });
  t.deep(nums(H({ id: statusSwap, up: 1 })), [[2, 'up']], 'a different status is a new effect, so up');
  const cardUp = W.card([{ op: 'draw', n: 1 }], { up: { fx: [{ op: 'draw', n: 2 }] } });
  t.deep(nums(H({ id: cardUp, up: 1 })), [[2, 'up']], 'a draw count is coloured');
  const energyUp = W.card([{ op: 'energy', n: 1 }], { up: { fx: [{ op: 'energy', n: 2 }] } });
  t.deep(nums(H({ id: energyUp, up: 1 })), [[2, 'up']], 'an energy gain is coloured');
  const hd = W.card([{ op: 'hurt', n: 3 }, { op: 'draw', n: 1 }], Object.assign({ up: { fx: [{ op: 'hurt', n: 2 }, { op: 'draw', n: 1 }] } }, SK));
  t.deep(nums(H({ id: hd, up: 1 })), [[2, 'down'], [1, '']], 'HP loss going down is marked down (numeric, not "good or bad")');
  t.eq(P({ id: up1, up: 1 }), 'Deal 9 damage. Gain 2 Bloom.', 'the plain text carries the new numbers');
});

t.test('up and down: gems colour the numbers they change', () => {
  const gd = W.gem({ dmg: 2 }), gh = W.gem({ hits: 1 }), gdraw = W.gem({ draw: 1 }, { color: 'blue' }), gpo = W.gem({ poison: 2 }, { color: 'green' }), gb = W.gem({ block: 3 }, { color: 'gold' });
  const id = W.card([dmg(6)], { slots: ['red', 'blue', 'green', 'any'], cost: 2 });
  const I = (gems) => ({ id, up: 0, gems });
  t.deep(nums(H(I([gd]))), [[8, 'up']], 'a damage gem raises the damage: up');
  t.deep(nums(H(I([gd, null, null, gd]))), [[10, 'up']], 'two gems stack');
  t.deep(nums(H(I([gh]))), [[6, ''], [2, 'up']], 'a hits gem adds "2 times" with the count up');
  t.eq(P(I([gh])), 'Deal 6 damage 2 times.', 'and reads naturally');
  t.eq(P(I([W.gem({ hits: 2 })])), 'Deal 6 damage 3 times.', 'a +2 hits gem reads 3 times');
  t.deep(nums(H(I([null, gdraw]))), [[6, ''], [1, 'up']], 'an appended draw is up');
  t.eq(P(I([null, gdraw])), 'Deal 6 damage. Draw 1 card.', 'and reads as one more sentence');
  t.eq(P(I([null, null, gpo])), 'Deal 6 damage. Apply 2 Poison.', 'a poison gem appends poison on the enemy target');
  t.deep(nums(H(I([null, null, gpo]))), [[6, ''], [2, 'up']], 'and is up');
  t.eq(P(I([gb])), 'Deal 6 damage.', 'a gem that cannot apply changes nothing');
  t.eq(P(I([null, gdraw, null, gb])), 'Deal 6 damage. Draw 1 card.', 'a block gem on a dmg-only card stays grey while the draw gem applies');
  // gem plus on a per V
  const perCard = W.card([dmg({ per: 'block', who: 'self' })], { slots: ['red'] });
  t.eq(P({ id: perCard, gems: [gd] }), 'Deal damage equal to your Block, plus 2.', 'a gem plus on a per value reads ", plus N"');
  t.ok(H({ id: perCard, gems: [gd] }).indexOf('plus <span class="num up">2</span>') > 0, 'with the bonus marked up');
  const spendCard = W.card([dmg({ per: 'status', who: 'self', s: 'bloom', mul: 3 }, { consume: 'bloom' })], { slots: ['red'] });
  t.eq(P({ id: spendCard, gems: [gd] }), 'Spend all Bloom. Deal 3 damage for each Bloom spent, plus 2.', 'and after a spend');
  // gems on top of an upgrade
  const upG = W.card([dmg(6)], { slots: ['red'], up: { fx: [dmg(9)] } });
  t.deep(nums(H({ id: upG, up: 1, gems: [gd] })), [[11, 'up']], 'upgrade and gem add up, still marked up against the printed card');
  // cost gems are not text, but resolveCard shows them
  const gc = W.gem({ cost: -1 }, { color: 'gold', tier: 3 });
  const cc = W.card([dmg(6)], { slots: ['gold'], cost: 2 });
  t.eq(D.resolveCard({ id: cc, gems: [gc] }).cost, 1, 'a cost gem is visible on the resolved cost, not in the rules text'); t.eq(P({ id: cc, gems: [gc] }), 'Deal 6 damage.', 'and the text is unchanged');
  // keyword gems reach the text through the keywords
  const gk = W.gem({ kw: ['retain'] }, { color: 'blue' }), grm = W.gem({ kwRemove: ['exhaust'] }, { color: 'blue' });
  const kc = W.card([blk(5)], { slots: ['blue'], kw: ['exhaust'], type: 'skill' });
  t.eq(P({ id: kc, gems: [gk] }), 'Retain. Gain 5 Block. Exhaust.', 'a kw gem adds a leading keyword'); t.eq(P({ id: kc, gems: [grm] }), 'Gain 5 Block.', 'a kwRemove gem removes the trailing one');
  // fx gems
  const gfx = W.gem({ fx: [{ op: 'block', n: 2 }, { op: 'draw', n: 1 }] }, { color: 'blue' });
  t.eq(P({ id, gems: [null, gfx] }), 'Deal 6 damage. Gain 2 Block. Draw 1 card.', 'an fx gem appends its ops as text');
  t.deep(nums(H({ id, gems: [null, gfx] })), [[6, ''], [2, 'up'], [1, 'up']], 'all of them marked up');
});

t.test('up and down: row gated gems read as a note until the unit stands in the row', () => {
  const gf = W.gem({ dmg: 3, cond: 'front' }), gbk = W.gem({ block: 2, hits: 1, draw: 1, cond: 'back' }, { color: 'blue' });
  const id = W.card([dmg(6), blk(4)], { slots: ['red', 'blue'] });
  t.eq(P({ id, gems: [gf] }), 'Deal 6 damage. Gain 4 Block. Front: +3 damage.', 'no ctx: a front gem is a Front note');
  t.eq(P({ id, gems: [null, gbk] }), 'Deal 6 damage. Gain 4 Block. Back: +2 Block, +1 hit, draw 1 card.', 'no ctx: a back gem lists its effects');
  t.ok(H({ id, gems: [gf] }).indexOf('<span class="kw" data-kw="front">Front</span>: +3 damage.') > 0, 'the note carries a Front keyword');
  t.eq(P({ id, gems: [gf] }, HANAE_UNIT({}, 'back')), 'Deal 6 damage. Gain 5 Block. Front: +3 damage.', 'a unit in the back: still a note, and Hanae\'s back row adds 1 Block');
  t.deep(nums(H({ id, gems: [gf] }, HANAE_UNIT({}, 'front'))), [[11, 'up'], [4, '']], 'a unit in the front: merged (6 + 3 gem + 2 Hanae front row) and marked up');
  t.eq(P({ id, gems: [gf] }, HANAE_UNIT({}, 'front')), 'Deal 11 damage. Gain 4 Block.', 'and the note is gone');
  t.eq(P({ id, gems: [null, gbk] }, HANAE_UNIT({}, 'back')), 'Deal 6 damage 2 times. Gain 7 Block. Draw 1 card.', 'a unit in the back: the back gem merges (4 + 2 gem + 1 Hanae back row)');
});

t.test('up and down: live numbers for a combat unit (Might, rows, Weak, Frail, Bulwark, relic rows)', () => {
  const id = W.card([dmg(6), blk(5)]);
  const at = (ctx) => nums(H(id, ctx));
  t.deep(at(undefined), [[6, ''], [5, '']], 'no ctx: the printed numbers');
  t.deep(at({}), [[6, ''], [5, '']], 'an empty ctx changes nothing');
  t.deep(at({ C: {} }), [[6, ''], [5, '']], 'a ctx with no unit changes nothing');
  t.deep(at(HANAE_UNIT({})), [[8, 'up'], [5, '']], 'Hanae in the front: +2 damage, marked up');
  t.deep(at(HANAE_UNIT({ might: 2 })), [[10, 'up'], [5, '']], 'Might adds to damage');
  t.deep(at(HANAE_UNIT({ weak: 1 })), [[6, ''], [5, '']], 'Weak takes 25 percent off the row-boosted damage (8 becomes 6, equal to the printed number)');
  t.deep(at(HANAE_UNIT({ weak: 1, might: 4 })), [[9, 'up'], [5, '']], 'Might, then Weak: floor((6 + 2 + 4) x 0.75) = 9');
  t.deep(at(HANAE_UNIT({ weak: 1 }, 'back')), [[4, 'down'], [6, 'up']], 'Weak in the back row: floor(6 x 0.75) = 4 marked down, and the back row +1 Block marked up');
  t.deep(at(HANAE_UNIT({ bulwark: 2 })), [[8, 'up'], [7, 'up']], 'Bulwark adds to Block');
  t.deep(at(HANAE_UNIT({ frail: 1 })), [[8, 'up'], [3, 'down']], 'Frail takes 25 percent off Block: floor(5 x 0.75) = 3');
  t.deep(at(HANAE_UNIT({ frail: 1, bulwark: 3 })), [[8, 'up'], [6, 'up']], 'Bulwark first, then Frail: floor((5 + 3) x 0.75) = 6');
  t.deep(at(HANAE_UNIT({}, 'back')), [[6, ''], [6, 'up']], 'Hanae in the back: +1 Block');
  t.deep(at(KURO_UNIT({})), [[6, ''], [5, '']], 'Kuro in the front has no damage bonus and no Block bonus');
  t.deep(at(KURO_UNIT({}, 'back')), [[8, 'up'], [5, '']], 'Kuro in the back: +2 damage');
  t.deep(at(HANAE_UNIT({ might: -2 })), [[6, ''], [5, '']], 'negative Might lowers the damage back to the printed number (8 - 2)');
  t.deep(at(HANAE_UNIT({ might: -5 })), [[3, 'down'], [5, '']], 'a big negative Might is marked down');
  t.deep(at(HANAE_UNIT({ might: -50 })), [[0, 'down'], [5, '']], 'and never below 0');
  t.eq(P(id, HANAE_UNIT({ might: 2 })), 'Deal 10 damage. Gain 5 Block.', 'plain text carries the live numbers');
  // relic row bonuses come through ctx.C.relics
  const rel = W.relic({ rows: { front: { dmgAdd: 1 }, back: { blockAdd: 2 } } });
  t.deep(at(Object.assign(HANAE_UNIT({}), { C: { relics: [rel] } })), [[9, 'up'], [5, '']], 'a relic row bonus adds to the live damage (6 + 2 + 1)');
  t.deep(at(Object.assign(HANAE_UNIT({}, 'back'), { C: { relics: [rel] } })), [[6, ''], [8, 'up']], 'and to the live Block in the back row (5 + 1 + 2)');
  t.deep(at(Object.assign(HANAE_UNIT({}), { relics: [rel] })), [[9, 'up'], [5, '']], 'ctx.relics works as well');
  // a live number is marked against the number without live modifiers, or the printed one when those are equal
  const up2 = W.card([dmg(6)], { up: { fx: [dmg(9)] } });
  t.deep(nums(H({ id: up2, up: 1 }, HANAE_UNIT({ might: 1 }))), [[12, 'up']], 'an upgraded card with live Might: 9 + 2 + 1 marked up');
  // plain numbers that are not damage or Block never take live modifiers
  const draw = W.card([{ op: 'draw', n: 2 }, st('bloom', 2)], SK);
  t.deep(nums(H(draw, HANAE_UNIT({ might: 5, bulwark: 5 }))), [[2, ''], [2, '']], 'draw counts and statuses ignore Might and Bulwark');
  // per values print their multiplier, not a live total
  const per = W.card([dmg({ per: 'status', who: 'self', s: 'bloom', mul: 2 })]);
  t.deep(nums(H(per, HANAE_UNIT({ might: 3 }))), [[2, '']], 'a per damage prints its multiplier without live modifiers');
  // the ally, target and enemy specific effects stay out of card text
  t.eq(P(id, HANAE_UNIT({ vulnerable: 2 })), 'Deal 8 damage. Gain 5 Block.', 'the unit\'s own Vulnerable does not change its attack text');
});

// ------------------------------------------------------------------ hooks, run ops, opsText
t.test('hookText and opsText: hooks of relics and events', () => {
  [
    [{ on: 'onPickup', fx: [{ op: 'maxHp', n: 5, who: 'both' }] }, 'When you take this, both heroes gain 5 max HP.'],
    [{ on: 'onFightWon', fx: [{ op: 'gold', n: 10 }] }, 'Whenever you win a fight, gain 10 gold.'],
    [{ on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'heal', pct: 0.1 }] }, 'Whenever you win an elite fight, heal both heroes for 10% of max HP.'],
    [{ on: 'onFightWon', filter: { tier: ['normal', 'elite'] }, fx: [{ op: 'gold', n: 5 }] }, 'Whenever you win a normal or elite fight, gain 5 gold.'],
    [{ on: 'onRest', fx: [{ op: 'maxHp', n: 2, who: 'front' }] }, 'Whenever you rest at a camp, the front hero gains 2 max HP.'],
    [{ on: 'onChapterStart', fx: [{ op: 'ink', n: 2 }] }, 'At the start of each chapter, gain 2 Ink.'],
    [{ on: 'onChapterStart', every: 2, fx: [{ op: 'ink', n: 2 }] }, 'Every 2nd chapter start, gain 2 Ink.'],
    [{ on: 'onShopEnter', fx: [{ op: 'gold', n: 20 }] }, 'Whenever you enter a shop, gain 20 gold.'],
    [{ on: 'onPaint', limit: 1, fx: [{ op: 'ink', n: 1 }] }, 'Once per chapter, whenever you paint a hex, gain 1 Ink.'],
    [{ on: 'combatStart', fx: [blk(6)] }, 'At the start of combat, gain 6 Block.'],
    [{ on: 'combatEnd', fx: [{ op: 'heal', n: 3 }] }, 'At the end of combat, heal 3 HP.'],
    [{ on: 'turnStart', fx: [{ op: 'draw', n: 1 }] }, 'At the start of your turn, draw 1 card.'],
    [{ on: 'turnEnd', fx: [blk(2)], limit: 1 }, 'Once per turn, at the end of your turn, gain 2 Block.'],
    [{ on: 'onPlay', filter: { type: 'attack' }, limit: 2, fx: [st('bloom', 1)] }, 'Up to 2 times per turn, whenever you play an Attack, gain 1 Bloom.'],
    [{ on: 'onPlay', filter: { type: 'attack' }, every: 3, fx: [{ op: 'draw', n: 1 }] }, 'Every 3rd time you play an Attack, draw 1 card.'],
    [{ on: 'onKill', once: true, fx: [{ op: 'energy', n: 1 }] }, 'The next time you defeat an enemy, gain 1 Energy.'],
    [{ on: 'onDamaged', fx: [st('thorns', 1)] }, 'Whenever you are hit, gain 1 Thorns.'],
    [{ on: 'onWhatever', fx: [{ op: 'draw', n: 1 }] }, 'When onWhatever, draw 1 card.'],
  ].forEach(([h, want]) => t.eq(D.hookText(h), want, 'hookText: ' + h.on + (h.filter ? ' ' + JSON.stringify(h.filter) : '')));
  t.eq(D.hookText({ op: 'hook', on: 'turnStart', fx: [{ op: 'draw', n: 1 }] }), 'At the start of your turn, draw 1 card.', 'a hook op is accepted as well as a bare hook');
  t.eq(D.opsText([hook('onPlay', [st('sumi', 1)], { filter: { type: 'skill' } })]), 'Whenever you play a Skill, gain 1 Sumi.', 'opsText of a hook op');
  t.eq(D.opsText([hook('turnStart', [{ op: 'energy', n: 2 }], { once: true })]), 'Next turn: gain 2 Energy.', 'opsText of a one-shot next turn hook');
  t.eq(D.opsText([hook('turnStart', [blk(2)])]), 'At the start of your turn, gain 2 Block.', 'opsText of a turn start hook');
  t.eq(D.opsText([dmg(3), blk(2)]), 'Deal 3 damage. Gain 2 Block.', 'opsText of combat ops');
  t.eq(D.opsText([]), '', 'opsText of nothing'); t.eq(D.opsText(undefined), '', 'opsText of undefined'); t.eq(D.opsText(null), '', 'opsText of null');
  t.eq(D.opsText([null, 7, 'x']), '', 'opsText ignores non-op entries');
  t.eq(D.opsText([{ op: 'zzz' }]), 'Zzz.', 'an unknown op prints its name');
  t.eq(D.opsText([dmg(3)], { unit: { id: 'hanae', row: 'front', st: { might: 1 } } }), 'Deal 6 damage.', 'opsText takes live numbers from ctx.unit');
});

t.test('opsText: run ops (events and run hooks)', () => {
  const RUN = { run: true };
  t.eq(D.opsText([{ op: 'gold', n: 30 }, { op: 'heal', pct: 0.3 }, { op: 'hurt', pct: 0.1, who: 'both' }, { op: 'maxHp', n: 3, who: 'hanae' }, { op: 'ink', n: 2 }], RUN), 'Gain 30 gold. Heal both heroes for 30% of max HP. Both heroes lose 10% of max HP. Hanae gains 3 max HP. Gain 2 Ink.', 'gold, heal, hurt, max HP and ink');
  t.eq(D.opsText([{ op: 'heal', who: 'front', n: 5 }, { op: 'hurt', who: 'kuro', n: 4 }, { op: 'heal', who: 'lowest', pct: 0.5 }, { op: 'heal', who: 'random', n: 2 }], RUN), 'Heal the front hero for 5 HP. Kuro loses 4 HP. Heal the weakest hero for 50% of max HP. Heal a random hero for 2 HP.', 'who variants');
  t.eq(D.opsText([{ op: 'gold', n: -20 }, { op: 'gold', pct: -0.1 }, { op: 'ink', n: -1 }, { op: 'ink', pct: 0.5 }, { op: 'maxHp', n: -2, who: 'front' }], RUN), 'Lose 20 gold. Lose 10% of your gold. Lose 1 Ink. Gain 50% of your max Ink. The front hero loses 2 max HP.', 'negative and percent forms');
  t.eq(D.opsText([{ op: 'heal', pct: 0.3 }]), 'Heal both heroes for 30% of max HP.', 'a pct heal is a run heal even without the run flag');
  t.eq(D.opsText([{ op: 'hurt', n: 3, who: 'both' }]), 'Both heroes lose 3 HP.', 'a who hurt is a run hurt even without the run flag');
  t.eq(D.opsText([{ op: 'addCard', card: PLAINC }, { op: 'addCard', n: 2, rarity: 'rare' }, { op: 'addCard' }, { op: 'removeCard' }, { op: 'removeCard', n: 2 }, { op: 'upgradeCard', n: 2 }, { op: 'transformCard', random: true }, { op: 'duplicateCard' }], RUN), 'Add a Pebble to your deck. Add 2 random rare cards to your deck. Add a random card to your deck. Remove a card from your deck. Remove 2 cards from your deck. Upgrade 2 cards. Transform a random card. Duplicate a card.', 'card ops');
  const rl = W.relic({ name: 'Lucky Coin' }), gm = W.gem({ dmg: 1 }, { name: 'Ruby' });
  t.eq(D.opsText([{ op: 'addRelic', rarity: 'rare' }, { op: 'addRelic', id: rl }, { op: 'addGem', color: 'red', tier: 2 }, { op: 'addGem', id: gm }, { op: 'addGem' }, { op: 'addBrush', id: 'random' }, { op: 'addCurse', n: 2 }, { op: 'addCurse' }, { op: 'paint', n: 3 }, { op: 'paint', n: 1 }, { op: 'cardReward' }, { op: 'fight' }, { op: 'flag', id: 'x' }], RUN), 'Gain a random rare Treasure. Gain Lucky Coin. Gain a random red gem of tier 2. Gain Ruby. Gain a random gem. Gain a random Brush. Add 2 curses to your deck. Add a curse to your deck. Paint 3 hexes for free. Paint 1 hex for free. Choose a card reward. A fight begins.', 'relic, gem, brush, curse, paint, reward, fight, and flags print nothing');
  t.eq(D.opsText([{ op: 'flag', id: 'x' }], RUN), '', 'a flag op is silent');
  t.eq(D.opsText([{ op: 'addCurse', id: INK }], RUN), 'Add Ink Blot to your deck.', 'a named curse');
});

// ------------------------------------------------------------------ gems, relics, statuses, intents, rows
t.test('gemText: mods read as compact plain text', () => {
  const G = (mod, extra) => D.gemText(Object.assign({ name: 'g', color: 'red', tier: 1, mod }, extra));
  [
    [{ dmg: 2 }, '+2 damage'], [{ block: 3 }, '+3 Block'], [{ heal: 2 }, '+2 healing'], [{ hits: 1 }, '+1 hit'], [{ hits: 2 }, '+2 hits'], [{ cost: -1 }, 'Costs 1 less'], [{ cost: -2 }, 'Costs 2 less'],
    [{ draw: 1 }, 'Draw 1 card'], [{ draw: 2 }, 'Draw 2 cards'], [{ energy: 1 }, 'Gain 1 Energy'], [{ status: { s: 'bloom', n: 2, tgt: 'self' } }, 'Gain 2 Bloom'], [{ status: { s: 'weak', n: 1 } }, 'Apply 1 Weak'],
    [{ poison: 2 }, 'Apply 2 Poison'], [{ fx: [{ op: 'block', n: 2 }] }, 'Gain 2 Block'], [{ kw: ['retain'] }, 'Gains Retain'], [{ kwRemove: ['exhaust'] }, 'Loses Exhaust'],
    [{ kw: ['retain'], kwRemove: ['exhaust'] }, 'Gains Retain, loses Exhaust'], [{ dmg: 3, cond: 'front' }, 'Front row: +3 damage'], [{ block: 2, hits: 1, draw: 1, cond: 'back' }, 'Back row: +2 Block, +1 hit, draw 1 card'],
    [{ dmg: 2, hits: 1 }, '+2 damage, +1 hit'], [{ dmg: 2, draw: 1, energy: 1 }, '+2 damage, draw 1 card, gain 1 Energy'],
  ].forEach(([mod, want]) => t.eq(G(mod), want, 'gemText ' + JSON.stringify(mod)));
  t.eq(G({ dmg: 2 }, { text: 'Custom words' }), 'Custom words', 'a def.text wins');
  const id = W.gem({ block: 3 });
  t.eq(D.gemText(id), '+3 Block', 'a gem id works'); t.eq(D.gemText(D.gems[id]), '+3 Block', 'and so does a definition');
  t.eq(D.gemText('t_none'), '', 'an unknown gem has no text'); t.eq(D.gemText({ name: 'x' }), '', 'a gem with no mod has no text'); t.eq(D.gemText(null), '', 'null has no text');
  t.ok(!DASH.test(G({ dmg: 2, hits: 1, cond: 'front' })), 'gem text has no dashes');
});

t.test('relicText: the hand written text, as given', () => {
  const r = W.relic({ text: 'Gain 1 Energy at the start of combat.' });
  t.eq(D.relicText(r), 'Gain 1 Energy at the start of combat.', 'by id'); t.eq(D.relicText(D.relics[r]), 'Gain 1 Energy at the start of combat.', 'by definition');
  t.eq(D.relicText('t_none'), '', 'unknown id'); t.eq(D.relicText(null), '', 'null'); t.eq(D.relicText({ name: 'x' }), '', 'no text');
});

t.test('statusText: the stack is inserted and durations get a Lasts sentence', () => {
  Object.keys(D.statuses).forEach((id) => {
    const s = D.statuses[id];
    t.eq(D.statusText(id), `${s.name}: ${s.text}`, `${id}: no stack keeps the template`);
    const withN = D.statusText(id, 3);
    t.ok(withN.indexOf(`${s.name} 3: `) === 0, `${id}: starts with the name and the number`);
    t.ok(!/\bN\b/.test(withN), `${id}: no N left over`);
    if (s.stack === 'dur' && id !== 'stun') t.ok(/Lasts 3 more rounds\.$/.test(withN), `${id}: a duration status says how long it lasts`);
    else t.ok(!/Lasts/.test(withN), `${id}: only durations say Lasts`);
    t.ok(!DASH.test(withN), `${id}: no dashes`);
  });
  t.eq(D.statusText('poison', 4), 'Poison 4: At the start of its turn, lose 4 HP (ignores Block), then Poison falls by 1.', 'poison 4');
  t.eq(D.statusText('poison'), 'Poison: At the start of its turn, lose N HP (ignores Block), then Poison falls by 1.', 'poison with no stack');
  t.eq(D.statusText('weak', 2), 'Weak 2: Deals 25% less attack damage. Lasts 2 more rounds.', 'weak 2');
  t.eq(D.statusText('weak', 1), 'Weak 1: Deals 25% less attack damage. Lasts 1 more round.', 'weak 1 is singular');
  t.eq(D.statusText('stun', 1), 'Stun 1: Skips its next action. A stunned hero cannot play cards on their next turn.', 'stun has no Lasts');
  t.eq(D.statusText('might', 3), 'Might 3: Attacks deal +3 damage per hit.', 'might 3');
  t.eq(D.statusText('thorns', 2), 'Thorns 2: Whenever it is hit by an attack, the attacker takes 2 damage.', 'thorns 2');
  t.eq(D.statusText('mark', 2), 'Mark 2: The next 2 attack hits against it deal +3 damage each (one stack per hit).', 'mark 2');
  t.eq(D.statusText('t_nope', 2), 't_nope', 'an unknown status is just its id');
  t.eq(D.statusText('weak', null), D.statusText('weak'), 'null n reads like no n');
  t.eq(D.statusText('poison', 0), 'Poison 0: At the start of its turn, lose 0 HP (ignores Block), then Poison falls by 1.', 'zero is a number');
});

t.test('intentText: the line under an enemy', () => {
  const IT = (o) => Object.assign({ move: 'x', name: 'Hit', kind: 'attack', dmg: null, hits: 1, tgt: ['hanae'], tgtKind: 'front', taunted: false, statuses: [], adds: [], summons: [], removes: [] }, o);
  const mid = W.card([], { name: 'Blot', type: 'status', hero: 'status', kw: ['unplayable'], cost: null, rarity: 'token' }), foe = W.enemy({ name: 'Imp' });
  [
    [{ dmg: 7 }, 'Deals 7 to the front hero'],
    [{ dmg: 7, hits: 2 }, 'Deals 7 x2 to the front hero'],
    [{ dmg: 7, hits: 1 }, 'Deals 7 to the front hero'],
    [{ dmg: 4, tgtKind: 'back', tgt: ['kuro'] }, 'Deals 4 to the back hero'],
    [{ dmg: 4, tgtKind: 'both', tgt: ['hanae', 'kuro'] }, 'Deals 4 to both heroes'],
    [{ dmg: 4, tgtKind: 'random', tgt: 'random' }, 'Deals 4 to a random hero'],
    [{ dmg: 4, tgtKind: 'lowest', tgt: ['kuro'] }, 'Deals 4 to the weakest hero'],
    [{ dmg: 4, tgtKind: 'back', tgt: ['hanae'], taunted: true }, 'Deals 4 to Hanae'],
    [{ dmg: 0 }, 'Deals 0 to the front hero'],
    [{ kind: 'debuff', statuses: [{ s: 'weak', n: 2, to: 'front' }] }, 'Applies 2 Weak to the front hero'],
    [{ dmg: 7, statuses: [{ s: 'weak', n: 2, to: 'front' }] }, 'Deals 7 to the front hero and applies 2 Weak'],
    [{ kind: 'debuff', statuses: [{ s: 'vulnerable', n: 1, to: 'both' }] }, 'Applies 1 Vulnerable to both heroes'],
    [{ kind: 'debuff', statuses: [{ s: 'frail', n: 1, to: 'back' }] }, 'Applies 1 Frail to the back hero'],
    [{ kind: 'debuff', statuses: [{ s: 'poison', n: 2, to: 'random' }] }, 'Applies 2 Poison to a random hero'],
    [{ kind: 'debuff', statuses: [{ s: 'bind', n: 1, to: 'lowest' }] }, 'Applies 1 Bind to the weakest hero'],
    [{ kind: 'buff', statuses: [{ s: 'might', n: 2, to: 'self' }] }, 'Gains 2 Might'],
    [{ kind: 'buff', statuses: [{ s: 'might', n: 2, to: 'self' }, { s: 'plating', n: 3, to: 'self' }] }, 'Gains 2 Might and 3 Plating'],
    [{ kind: 'defend', block: 8 }, 'Gains 8 Block'],
    [{ kind: 'heal', heal: 6 }, 'Heals 6'],
    [{ kind: 'defend', block: 8, statuses: [{ s: 'thorns', n: 2, to: 'self' }] }, 'Gains 8 Block and 2 Thorns'],
    [{ kind: 'debuff', adds: [{ card: mid, n: 2, to: 'discard' }] }, 'Adds 2 Blot cards to your discard pile'],
    [{ kind: 'debuff', adds: [{ card: mid, n: 1, to: 'draw' }] }, 'Adds a Blot card to your draw pile'],
    [{ kind: 'summon', summons: [{ enemy: foe, n: 2 }] }, 'Summons 2 Imps'],
    [{ kind: 'summon', summons: [{ enemy: foe, n: 1 }] }, 'Summons an Imp'],
    [{ kind: 'debuff', steals: 15 }, 'Steals 15 gold'],
    [{ kind: 'debuff', swap: true }, 'Swaps your rows'],
    [{ kind: 'flee', flee: true }, 'Flees'],
    [{ kind: 'debuff', removes: [{ s: 'buffs' }, { s: 'might' }] }, 'Removes all buffs and Might from the front hero'],
    [{ kind: 'debuff', removes: [{ s: 'debuffs' }] }, 'Removes all debuffs from the front hero'],
    [{ kind: 'none', name: 'Idle' }, 'Idle'],
    [{ kind: 'none', name: '' }, ''],
    [{ kind: 'attack', name: 'Mystery' }, 'Mystery'],
    [{ stunned: true, text: '' }, 'Stunned'],
    [{ stunned: true, text: 'Dazed' }, 'Dazed'],
    [{ dmg: 3, hits: 3, block: 4, heal: 2 }, 'Deals 3 x3 to the front hero, gains 4 Block and heals 2'],
    [{ dmg: 5, adds: [{ card: 't_missing', n: 1, to: 'discard' }] }, 'Deals 5 to the front hero and adds a t_missing to your discard pile'],
  ].forEach(([o, want]) => t.eq(D.intentText(IT(o)), want, 'intentText ' + JSON.stringify(o).slice(0, 80)));
  t.eq(D.intentText(null), '', 'null intent'); t.eq(D.intentText(undefined), '', 'undefined intent');
  t.eq(D.intentText({ dmg: 6, hits: 2, tgtKind: 'front', tgt: ['hanae'] }), 'Deals 6 x2 to the front hero', 'a minimal intent object');
  t.eq(D.intentText({ dmg: 6, hits: 1, tgt: ['hanae', 'kuro'] }), 'Deals 6 to both heroes', 'two hero names read as both');
  t.eq(D.intentText({ dmg: 6, hits: 1, tgt: ['kuro'] }), 'Deals 6 to Kuro', 'a single hero name reads as the name');
  t.eq(D.intentText({ dmg: 6, hits: 1 }), 'Deals 6 to the front hero', 'no target reads as the front hero');
});

t.test('rowText: rows read as one line per hero', () => {
  t.eq(D.rowText('hanae', 'front'), 'Front: +2 damage on attacks', 'Hanae front'); t.eq(D.rowText('hanae', 'back'), 'Back: +1 Block on cards', 'Hanae back');
  t.eq(D.rowText('kuro', 'front'), 'Front: no bonus', 'Kuro front'); t.eq(D.rowText('kuro', 'back'), 'Back: +2 damage on attacks', 'Kuro back');
  t.eq(D.rowText('suzu', 'front'), 'Front: +1 Block on cards, Thorns 2', 'Suzu front'); t.eq(D.rowText('suzu', 'back'), 'Back: Regen 2', 'Suzu back');
  t.eq(D.rowText('raiga', 'front'), 'Front: start each turn with 3 Block, Thorns 2', 'Raiga front'); t.eq(D.rowText('raiga', 'back'), 'Back: +1 damage on attacks', 'Raiga back');
  t.eq(D.rowText('t_nobody', 'front'), 'Front: no bonus', 'an unknown hero has no bonus'); t.eq(D.rowText('t_nobody', 'back'), 'Back: no bonus', 'in either row');
  const h = { id: 't_hero', name: 'Test', rows: { front: { dmgAdd: -1, blockAdd: -2, drawAdd: 1, regen: 1 }, back: { drawAdd: 2, startBlock: 2, thorns: 1 } } };
  const saved = D.heroes.hanae.rows;
  D.heroes.hanae.rows = h.rows;
  t.eq(D.rowText('hanae', 'front'), 'Front: -1 damage on attacks, -2 Block on cards, Regen 1, draw 1 extra card each turn', 'negative bonuses keep their sign; every field reads');
  t.eq(D.rowText('hanae', 'back'), 'Back: start each turn with 2 Block, Thorns 1, draw 2 extra cards each turn', 'back with every field');
  D.heroes.hanae.rows = saved;
  t.eq(D.rowText('hanae', 'front'), 'Front: +2 damage on attacks', 'restored');
  ['hanae', 'kuro', 'suzu', 'raiga'].forEach((id) => ['front', 'back'].forEach((row) => t.ok(!DASH.test(D.rowText(id, row)) && D.rowText(id, row).indexOf(row === 'front' ? 'Front: ' : 'Back: ') === 0, `${id} ${row}: prefixed, no dashes`)));
});

// ------------------------------------------------------------------ target mode and cardOps
t.test('targetMode and cardOps', () => {
  const tm = (fx, over) => D.targetMode(W.card(fx, over));
  [
    ['dmg', [dmg(3)], 'enemy'], ['dmg all', [dmg(3, { tgt: 'all' })], 'none'], ['dmg random', [dmg(3, { tgt: 'random' })], 'none'], ['dmg lowest', [dmg(3, { tgt: 'lowest' })], 'none'], ['dmg others', [dmg(3, { tgt: 'others' })], 'enemy'],
    ['block', [blk(3)], 'none'], ['debuff', [st('weak', 1)], 'enemy'], ['debuff all', [st('weak', 1, { tgt: 'all' })], 'none'], ['debuff random', [st('weak', 1, { tgt: 'random' })], 'none'],
    ['buff', [st('bloom', 1)], 'none'], ['buff on the enemy', [st('might', 1, { tgt: 'enemy' })], 'enemy'], ['a heal', [{ op: 'heal', n: 2 }], 'none'],
    ['per target block', [blk({ per: 'targetBlock' })], 'enemy'], ['per target status', [dmg({ per: 'status', who: 'target', s: 'poison', mul: 1 }, { tgt: 'all' })], 'enemy'],
    ['per enemy status', [blk({ per: 'status', who: 'enemy', s: 'poison' })], 'enemy'], ['hits per target', [dmg(2, { tgt: 'all', hits: { per: 'targetBlock' } })], 'enemy'],
    ['cond target status', [cond({ targetStatus: { s: 'poison', gte: 1 } }, [{ op: 'draw', n: 1 }])], 'enemy'], ['cond status on target', [cond({ status: { who: 'target', s: 'poison', gte: 1 } }, [{ op: 'draw', n: 1 }])], 'enemy'],
    ['cond hp on target', [cond({ hpPct: { who: 'target', lt: 0.5 } }, [{ op: 'draw', n: 1 }])], 'enemy'], ['cond on self', [cond({ status: { who: 'self', s: 'bloom', gte: 1 } }, [{ op: 'draw', n: 1 }])], 'none'],
    ['cond row', [cond({ row: 'front' }, [blk(3)], [dmg(3)])], 'enemy'], ['remove buffs', [{ op: 'removeStatus', s: 'buffs' }], 'enemy'], ['remove debuffs', [{ op: 'removeStatus', s: 'debuffs' }], 'none'],
    ['remove a buff id', [{ op: 'removeStatus', s: 'might' }], 'enemy'], ['remove a debuff id', [{ op: 'removeStatus', s: 'weak' }], 'none'], ['remove from the enemy', [{ op: 'removeStatus', s: 'might', tgt: 'enemy' }], 'enemy'],
    ['hook with a dmg', [hook('onPlay', [dmg(3)])], 'enemy'], ['hook with a block', [hook('onPlay', [blk(3)])], 'none'], ['repeat of dmg', [{ op: 'repeat', n: 2, do: [dmg(2)] }], 'enemy'],
    ['pick never targets', [pick('hand', 1, 'discard')], 'none'], ['nothing', [], 'none'], ['swap', [{ op: 'swap' }], 'none'], ['consume upTo per target', [dmg(1, { tgt: 'all', consume: { s: 'bloom', upTo: { per: 'targetBlock' } } })], 'enemy'],
  ].forEach(([name, fx, want]) => t.eq(tm(fx, SK), want, 'targetMode: ' + name));
  const gp = W.gem({ poison: 2 }, { color: 'green' });
  const sc = W.card([blk(3)], { slots: ['green'], type: 'skill' });
  t.eq(D.targetMode({ id: sc, gems: [gp] }), 'none', 'a poison gem on a card with no enemy target adds nothing, so no target');
  const gfx = W.gem({ fx: [dmg(3)] }, { color: 'green' });
  t.eq(D.targetMode({ id: sc, gems: [gfx] }), 'enemy', 'an fx gem that adds a dmg op makes the card need a target');
  t.eq(D.targetMode(D.resolveCard(W.card([dmg(3)]))), 'enemy', 'a resolved card is accepted');
  t.eq(D.targetMode({ id: W.card([dmg(3)]), up: 1 }), 'enemy', 'an instance is accepted');
  // cardOps: flat, through cond, repeat and hook fx, in walk order
  const id = W.card([dmg(3), cond({ row: 'front' }, [blk(1)], [{ op: 'draw', n: 1 }]), { op: 'repeat', n: 2, do: [{ op: 'energy', n: 1 }] }, hook('onPlay', [{ op: 'swap' }])]);
  t.deep(D.cardOps(id).map((o) => o.op), ['dmg', 'cond', 'block', 'draw', 'repeat', 'energy', 'hook', 'swap'], 'every op, containers first, in walk order');
  t.deep(D.cardOps(D.resolveCard(id)).map((o) => o.op), D.cardOps(id).map((o) => o.op), 'a resolved card gives the same list');
  const gd = W.gem({ dmg: 2 });
  const gc = W.card([dmg(3)], { slots: ['red'] });
  t.deep(D.cardOps({ id: gc, gems: [gd] })[0], { op: 'dmg', n: 3, plus: 2 }, 'cardOps sees the gem plus');
  t.deep(D.cardOps(W.card([])), [], 'an empty card has no ops');
});

// ------------------------------------------------------------------ randomised well-formedness
t.test('random cards: text never throws and is always well formed', () => {
  const rng = W.U.rng(20240607);
  const pers = ['X', 'handSize', 'drawPile', 'discardPile', 'exhaustPile', 'cardsPlayed', 'attacksPlayed', 'skillsPlayed', 'energy', 'block', 'hp', 'missingHp', 'status', 'debuffs', 'enemies', 'kills', 'turn', 'gems', 'damageTaken', 'hitsTaken', 'targetBlock', 'picked', 'front'];
  const whos = ['self', 'ally', 'target', 'enemy'];
  const V = () => {
    if (rng.chance(0.55)) return rng.int(0, 20);
    const v = { per: rng.pick(pers), who: rng.pick(whos), s: rng.pick(Object.keys(D.statuses)) };
    if (rng.chance(0.6)) v.mul = rng.int(1, 4); if (rng.chance(0.3)) v.base = rng.int(1, 5); if (rng.chance(0.3)) v.cap = rng.int(3, 20); if (rng.chance(0.2)) v.upTo = rng.int(1, 5);
    return v;
  };
  const range = () => (rng.chance(0.5) ? { gte: rng.int(0, 4) } : rng.chance(0.5) ? { lte: rng.int(0, 4) } : { gte: rng.int(0, 2), lte: rng.int(3, 5) });
  const genCond = () => {
    const c = {};
    const pool = [() => { c.row = rng.pick(['front', 'back']); }, () => { c.status = Object.assign({ who: rng.pick(whos), s: rng.pick(Object.keys(D.statuses)) }, range()); }, () => { c.hpPct = { who: rng.pick(whos), lt: rng.pick([0.3, 0.5, 0.75]) }; },
      () => { c.handEmpty = true; }, () => { c.cardsPlayed = range(); }, () => { c.attacksPlayed = range(); }, () => { c.turn = range(); }, () => { c.lastKill = true; }, () => { c.targetStatus = Object.assign({ s: rng.pick(Object.keys(D.statuses)) }, range()); },
      () => { c.allyDown = true; }, () => { c.block = range(); }, () => { c.energy = range(); }, () => { c.handSize = range(); }, () => { c.enemies = range(); }];
    for (let i = rng.int(1, 2); i > 0; i--) rng.pick(pool)();
    return c;
  };
  const TG = ['enemy', 'all', 'random', 'lowest', 'others', 'self', 'ally', 'both', 'front', 'back'];
  const genOps = (depth) => {
    const out = [];
    for (let i = rng.int(0, 4); i > 0; i--) {
      const r = rng() * 100; let o;
      if (r < 20) { o = { op: 'dmg', n: V() }; if (rng.chance(0.3)) o.hits = V(); if (rng.chance(0.5)) o.tgt = rng.pick(['enemy', 'all', 'random', 'lowest', 'others']); if (rng.chance(0.1)) o.pierce = true; if (rng.chance(0.1)) o.lifesteal = true; }
      else if (r < 30) o = { op: 'block', n: V(), tgt: rng.pick(['self', 'ally', 'both', 'front', 'back']) };
      else if (r < 36) o = { op: 'heal', n: V(), tgt: rng.pick(['self', 'ally', 'both', 'front', 'back']) };
      else if (r < 40) { o = { op: 'hurt', n: rng.int(1, 6), tgt: rng.pick(['self', 'ally', 'both']) }; if (rng.chance(0.3)) o.lethal = true; }
      else if (r < 54) { o = { op: 'status', s: rng.pick(Object.keys(D.statuses)), n: rng.chance(0.85) ? V() : -rng.int(1, 3) }; if (rng.chance(0.5)) o.tgt = rng.pick(TG); }
      else if (r < 58) { o = { op: 'removeStatus', s: rng.pick([...Object.keys(D.statuses), 'debuffs', 'buffs']) }; if (rng.chance(0.4)) o.n = rng.int(1, 3); if (rng.chance(0.4)) o.tgt = rng.pick(TG); }
      else if (r < 62) o = { op: 'draw', n: V() };
      else if (r < 66) o = { op: 'energy', n: rng.chance(0.8) ? V() : -1 };
      else if (r < 70) o = { op: 'pick', from: rng.pick(['hand', 'draw', 'discard', 'exhaust']), n: rng.int(1, 3), then: rng.pick(['discard', 'exhaust', 'retain', 'upgrade', 'copy', 'toHand', 'toDrawTop']), optional: rng.chance(0.3), random: rng.chance(0.15), top: rng.chance(0.2) ? rng.int(1, 4) : undefined };
      else if (r < 73) o = { op: 'add', card: rng.pick([INK, PLAINC]), n: rng.int(1, 3), to: rng.pick(['hand', 'draw', 'discard', 'exhaust']) };
      else if (r < 75) o = { op: 'swap' };
      else if (r < 77) o = { op: rng.pick(['gold', 'ink']), n: rng.int(1, 20) };
      else if (r < 79) o = rng.chance(0.5) ? { op: 'revive', pct: 0.3 } : { op: 'revive', n: 5 };
      else if (r < 89 && depth < 2) o = { op: 'cond', if: genCond(), then: genOps(depth + 1), else: rng.chance(0.3) ? genOps(depth + 1) : undefined };
      else if (r < 93 && depth < 2) o = { op: 'repeat', n: rng.chance(0.6) ? rng.int(1, 4) : V(), do: genOps(depth + 1) };
      else if (depth < 2) o = { op: 'hook', on: rng.pick(['onPlay', 'onExhaust', 'onKill', 'onDamaged', 'onSwap', 'onHeroDown', 'onShuffle', 'turnStart', 'turnEnd']), fx: genOps(depth + 1), filter: rng.chance(0.4) ? { type: rng.pick(['attack', 'skill', 'power']) } : undefined, limit: rng.chance(0.3) ? rng.int(1, 3) : undefined, once: rng.chance(0.2) ? true : undefined, every: rng.chance(0.1) ? rng.int(2, 4) : undefined };
      else o = { op: 'dmg', n: V() };
      Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
      out.push(o);
    }
    return out;
  };
  const gems = [W.gem({ dmg: 2 }), W.gem({ hits: 1 }), W.gem({ draw: 1 }, { color: 'blue' }), W.gem({ dmg: 1, cond: 'front' }), W.gem({ block: 2, cond: 'back' }, { color: 'blue' }), W.gem({ kw: ['retain'] }, { color: 'blue' }), W.gem({ poison: 2 }, { color: 'green' })];
  const bad = [];
  let plays = 0, nonEmpty = 0;
  for (let i = 0; i < 500; i++) {
    const fx = genOps(0), upFx = genOps(0);
    const slots = Array.from({ length: rng.int(0, 3) }, () => rng.pick(['red', 'blue', 'green', 'gold', 'any']));
    const id = W.card(fx, { slots, cost: rng.chance(0.15) ? 'X' : rng.int(0, 3), kw: rng.chance(0.4) ? [rng.pick(['exhaust', 'retain', 'ethereal', 'innate'])] : [], up: { fx: upFx }, type: rng.pick(['attack', 'skill', 'power']) });
    const inst = { id, up: rng.int(0, 1), gems: slots.map((sl) => (rng.chance(0.5) ? rng.pick(gems) : null)) };
    const ctx = rng.chance(0.5) ? { unit: { id: rng.pick(['hanae', 'kuro']), row: rng.pick(['front', 'back']), st: { might: rng.int(-2, 4), weak: rng.int(0, 1), frail: rng.int(0, 1), bulwark: rng.int(0, 3) } } } : undefined;
    let html, plain;
    try { html = H(inst, ctx); plain = P(inst, ctx); D.targetMode(inst); D.cardOps(inst); D.resolveCard(inst, ctx); plays++; } catch (e) { bad.push(`card ${i} threw: ${e.stack.split('\n').slice(0, 3).join(' | ')} ${JSON.stringify(fx)}`); continue; }
    if (plain) nonEmpty++;
    const problems = [];
    if (typeof html !== 'string') problems.push('html is not a string');
    if (strip(html) !== plain) problems.push('plain differs from the stripped html');
    if (/undefined|NaN|\[object|null|Infinity/.test(plain)) problems.push('debris: ' + plain);
    if (/something/.test(plain)) problems.push('placeholder: ' + plain);
    if (DASH.test(plain)) problems.push('dash');
    if (/  /.test(plain) || /\s[.,;:]/.test(plain) || /\.\./.test(plain) || /,\s*,/.test(plain)) problems.push('spacing or punctuation: ' + plain);
    if (plain && !/^[A-Z]/.test(plain)) problems.push('not capitalised: ' + plain);
    if (plain && !/[.)]$/.test(plain)) problems.push('no final period: ' + plain);
    if ((html.match(/<span/g) || []).length !== (html.match(/<\/span>/g) || []).length) problems.push('unbalanced spans');
    if (![...html.matchAll(/data-kw="([^"]+)"/g)].every((m) => D.keywords[m[1]] || D.statuses[m[1]])) problems.push('an unknown data-kw');
    if (![...html.matchAll(/<span class="([^"]*)"/g)].every((m) => /^(kw|num|num up|num down)$/.test(m[1]))) problems.push('an unexpected class');
    if (H(inst, ctx) !== html) problems.push('not deterministic');
    if (problems.length) bad.push(`card ${i}: ${problems.join('; ')} :: ${JSON.stringify(fx).slice(0, 200)}`);
  }
  t.eq(bad.length, 0, 'random cards: ' + bad.slice(0, 5).join('\n   '));
  t.ok(plays === 500 && nonEmpty > 350, `500 random cards rendered, ${nonEmpty} with text`);
});

// ------------------------------------------------------------------ bonus: real content
// Guarded: it runs over whatever real (non t_) content exists right now and passes trivially while a content file is not written yet.
const isReal = (id) => id.indexOf('t_') !== 0;

t.test('real content: every real card, base and upgraded, has clean, short rules text', () => {
  const R = boot({ only: ['data*'] }); const RD = R.DATA;
  const ids = Object.keys(RD.cards).filter(isReal);
  if (!ids.length) { t.ok(true, 'no real cards written yet: nothing to check'); return; }
  const bad = []; let checked = 0, longest = 0;
  const okKey = (k) => !!RD.keywords[k] || !!RD.statuses[k];
  ids.forEach((id) => {
    const def = RD.cards[id];
    [0, 1].forEach((up) => {
      if (up && !def.up) return;
      const inst = { id, up, gems: (def.slots || []).map(() => null) };
      let html, plain;
      try { html = RD.cardHtml(inst); plain = RD.cardPlain(inst); RD.resolveCard(inst); RD.targetMode(inst); RD.cardOps(inst); } catch (e) { bad.push(`${id}${up ? '+' : ''} threw: ${e.message}`); return; }
      checked++; longest = Math.max(longest, plain.length);
      const p = [];
      if (!plain && (def.type === 'attack' || def.type === 'skill' || def.type === 'power')) p.push('a playable card with no text');
      if (plain.length > 110) p.push('over 110 characters (' + plain.length + ')');
      if (/undefined|NaN|\[object|null|Infinity|something/.test(plain)) p.push('debris: ' + plain);
      if (DASH.test(plain)) p.push('dash');
      if (/  |\s[.,]|\.\./.test(plain)) p.push('spacing');
      if (plain && !/^[A-Z]/.test(plain)) p.push('not capitalised');
      if (plain && !/[.)]$/.test(plain)) p.push('no final period');
      if (strip(html) !== plain) p.push('plain differs from html');
      if (![...html.matchAll(/data-kw="([^"]+)"/g)].every((m) => okKey(m[1]))) p.push('unknown data-kw');
      if (RD.resolveCard(inst).kw.indexOf('exhaust') >= 0 && !/Exhaust\.$/.test(plain) && (def.type !== 'power')) p.push('Exhaust is not last');
      if (p.length) bad.push(`${id}${up ? '+' : ''}: ${p.join('; ')}`);
    });
  });
  t.eq(bad.length, 0, 'real card text: ' + bad.slice(0, 6).join('\n   '));
  t.ok(checked >= ids.length, `${checked} real card texts checked (longest ${longest} characters)`);
});

t.test('real content: enemy moves, relics, gems and heroes all read', () => {
  const R = boot({ only: ['data*'] }); const RD = R.DATA;
  const bad = [];
  Object.keys(RD.enemies).filter(isReal).forEach((id) => {
    const e = RD.enemies[id];
    Object.keys(e.moves || {}).forEach((m) => {
      const mv = e.moves[m];
      const s = RD.opsText(mv.fx || []);
      if (mv.kind !== 'none' && (mv.fx || []).length && !s) bad.push(`${id}.${m}: no text`);
      if (DASH.test(s) || /undefined|NaN|\[object|null|something/.test(s)) bad.push(`${id}.${m}: ${s}`);
    });
    (e.hooks || []).forEach((h, i) => { const s = RD.hookText(h); if (!s || DASH.test(s) || /undefined|NaN|\[object|null/.test(s)) bad.push(`${id} hook ${i}: ${s}`); });
    (e.phases || []).forEach((ph, i) => { if (ph.fx) { const s = RD.opsText(ph.fx); if (DASH.test(s) || /undefined|NaN|\[object|null/.test(s)) bad.push(`${id} phase ${i}: ${s}`); } });
  });
  Object.keys(RD.relics).filter(isReal).forEach((id) => { const s = RD.relicText(id); if (!s || DASH.test(s)) bad.push(`relic ${id}: "${s}"`); (RD.relics[id].hooks || []).forEach((h, i) => { const s2 = RD.hookText(h); if (!s2 || /undefined|NaN|\[object|null/.test(s2)) bad.push(`relic ${id} hook ${i}: ${s2}`); }); });
  Object.keys(RD.gems).filter(isReal).forEach((id) => { const s = RD.gemText(id); if (!s || DASH.test(s) || /undefined|NaN|\[object|null/.test(s)) bad.push(`gem ${id}: "${s}"`); });
  Object.keys(RD.events || {}).filter(isReal).forEach((id) => { const ev = RD.events[id]; (ev.choices || []).forEach((c, i) => { const s = RD.opsText(c.fx || [], { run: true }); if (/undefined|NaN|\[object|null/.test(s) || DASH.test(s)) bad.push(`event ${id} choice ${i}: ${s}`); }); });
  RD.LISTS.heroIds.forEach((h) => ['front', 'back'].forEach((row) => { const s = RD.rowText(h, row); if (!s || DASH.test(s)) bad.push(`row ${h} ${row}: ${s}`); }));
  Object.keys(RD.statuses).forEach((s) => { const x = RD.statusText(s, 2); if (!x || DASH.test(x)) bad.push(`status ${s}: ${x}`); });
  t.eq(bad.length, 0, 'real text: ' + bad.slice(0, 8).join('\n   '));
});

// ------------------------------------------------------------------ text agrees with the engine
t.test('the live numbers in card text equal what C.preview says (front and back, Might, Weak, Frail, Bulwark)', () => {
  const g = boot({ only: ['combat'] });
  const GD = g.DATA, COMBAT = g.COMBAT;
  const foe = 't_dummy';
  GD.add('enemies', { [foe]: { name: 'Dummy', art: { id: foe }, chapter: 1, tier: 'normal', size: 'm', hp: [200, 200], moves: { idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['idle'] }, lore: 'x', tags: ['spirit'] } });
  const add = (id, fx) => { GD.add('cards', { [id]: { name: id, hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx, kw: [], slots: [], art: { m: 'slash', c: 'rose' } } }); return id; };
  const strike = add('t_pv_strike', [{ op: 'dmg', n: 6 }, { op: 'block', n: 5 }]);
  const multi = add('t_pv_multi', [{ op: 'dmg', n: 3, hits: 3 }]);
  const combos = [];
  [0, 1].forEach((frontIdx) => [{}, { might: 3 }, { weak: 1 }, { might: 2, weak: 1 }, { frail: 1 }, { bulwark: 2 }, { bulwark: 2, frail: 1 }, { might: -1 }].forEach((stx) => combos.push({ frontIdx, st: stx })));
  let checked = 0;
  combos.forEach(({ frontIdx, st: stx }) => {
    const deck = [{ uid: 1, id: strike, up: 0, gems: [] }, { uid: 2, id: multi, up: 0, gems: [] }];
    for (let i = 3; i < 13; i++) deck.push({ uid: i, id: strike, up: 0, gems: [] });
    const C = COMBAT.create({ heroes: [{ id: 'hanae', hp: 60, maxHp: 60 }, { id: 'kuro', hp: 60, maxHp: 60 }], frontIdx, deck, enemies: [foe], seed: 3, mods: { energy: 9 } });
    C.start();
    C.heroes.forEach((h) => { h.st = Object.assign({}, stx); });
    const hanae = C.unit('hanae');
    const grab = (uid) => { const c = C.hand.concat(C.draw, C.discard).find((x) => x.uid === uid); if (C.hand.indexOf(c) < 0) { [C.draw, C.discard].forEach((pile) => { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }); C.hand.push(c); } return c; };
    const target = C.enemies[0].id;
    const ctx = { unit: hanae, C };
    const label = `hanae in the ${hanae.row} ${JSON.stringify(stx)}`;
    const pv = C.preview(grab(1).uid, target);
    const [d, b] = nums(GD.cardHtml({ id: strike, up: 0, gems: [] }, ctx)).map((x) => x[0]);
    t.eq(d, pv.dmg, `${label}: card text damage ${d} equals preview ${pv.dmg}`);
    t.eq(b, pv.block, `${label}: card text block ${b} equals preview ${pv.block}`);
    const pv2 = C.preview(grab(2).uid, target);
    const nn = nums(GD.cardHtml({ id: multi, up: 0, gems: [] }, ctx));
    t.eq(nn[0][0], pv2.dmg, `${label}: multi hit text damage equals preview`);
    t.eq(nn[1][0], pv2.hits, `${label}: and the hit count`);
    checked++;
  });
  t.ok(checked === 16, `${checked} live comparisons made`);
});

t.test('intentText reads a live C.intent object', () => {
  const g = boot({ only: ['combat'] });
  const GD = g.DATA, COMBAT = g.COMBAT;
  const mid = 't_blot';
  GD.add('cards', { [mid]: { name: 'Blot', hero: 'status', type: 'status', rarity: 'token', cost: null, fx: [], kw: ['unplayable'], slots: [], art: { m: 'skull' } } });
  const minion = 't_imp';
  GD.add('enemies', { [minion]: { name: 'Imp', art: { id: minion }, chapter: 1, tier: 'minion', size: 's', hp: [4, 4], moves: { idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['idle'] }, lore: 'x', tags: ['spirit'] } });
  const moves = {
    a: { name: 'Double Claw', kind: 'attack', fx: [{ op: 'dmg', n: 7, hits: 2, tgt: 'front' }, { op: 'status', s: 'weak', n: 2, tgt: 'front' }] },
    b: { name: 'Bulk Up', kind: 'buff', fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'status', s: 'might', n: 2, tgt: 'self' }] },
    c: { name: 'Curse Ink', kind: 'debuff', fx: [{ op: 'add', card: mid, n: 2, to: 'discard' }, { op: 'stealGold', n: 15 }] },
    d: { name: 'Call Help', kind: 'summon', fx: [{ op: 'summon', enemy: minion, n: 2 }] },
    e: { name: 'Rally', kind: 'heal', fx: [{ op: 'heal', n: 6, tgt: 'self' }, { op: 'swap' }] },
    f: { name: 'Sweep', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'both' }] },
  };
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  const foe = 't_boss';
  GD.add('enemies', { [foe]: { name: 'Boss', art: { id: foe }, chapter: 1, tier: 'normal', size: 'm', hp: [100, 100], moves, ai: { seq: order }, lore: 'x', tags: ['spirit'] } });
  const filler = 't_fill';
  GD.add('cards', { [filler]: { name: 'Fill', hero: 'hanae', type: 'skill', rarity: 'common', cost: 9, fx: [{ op: 'block', n: 1 }], kw: [], slots: [], art: { m: 'slash', c: 'rose' } } });
  const deck = Array.from({ length: 12 }, (_, i) => ({ uid: i + 1, id: filler, up: 0, gems: [] }));
  const C = COMBAT.create({ heroes: [{ id: 'hanae', hp: 60, maxHp: 60 }, { id: 'kuro', hp: 60, maxHp: 60 }], frontIdx: 0, deck, enemies: [foe], seed: 1, mods: {}, gold: 50 });
  C.start();
  // the last strike is printed with the Might 2 the enemy gained two moves earlier: 4 + 2
  const want = ['Deals 7 x2 to the front hero and applies 2 Weak', 'Gains 8 Block and 2 Might', 'Adds 2 Blot cards to your discard pile and steals 15 gold', 'Summons 2 Imps', 'Heals 6 and swaps your rows', 'Deals 6 to both heroes'];
  order.forEach((m, i) => {
    const e = C.enemies[0];
    t.eq(e.intent.move, m, `move ${m} is up`);
    t.eq(GD.intentText(C.intent(e)), want[i], `intentText of move ${m}`);
    C.endTurn();
  });
});

// ------------------------------------------------------------------ the editor's pass: wording a player could misread
t.test('card text: hero:any hooks name BOTH heroes, plain owned hooks name only the owner', () => {
  const any = { hero: 'any' };
  [
    ['play', hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack', hero: 'any' }, limit: 2 }), 'Up to 2 times per turn, whenever either hero plays an Attack, deal 2 damage to all enemies.'],
    ['play without any', hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack' }, limit: 2 }), 'Up to 2 times per turn, whenever you play an Attack, deal 2 damage to all enemies.'],
    ['kill', hook('onKill', [st('burn', 3, { tgt: 'all' })], { filter: any }), 'Whenever either hero defeats an enemy, apply 3 Burn to all enemies.'],
    ['damaged', hook('onDamaged', [dmg(2)], { filter: any }), 'Whenever either hero is hit, deal 2 damage to the attacker.'],
    ['swap with any is any swap', hook('onSwap', [blk(2)], { filter: any, limit: 1 }), 'Once per turn, whenever either hero swaps rows, gain 2 Block.'],
    ['swap without any only hears swaps that put the owner in front', hook('onSwap', [blk(2)]), 'Whenever you swap into the front row, gain 2 Block.'],
    ['hero down with any', hook('onHeroDown', [{ op: 'revive', pct: 0.4 }], { filter: any, once: true }), 'The next time a hero falls, revive that hero with 40% HP.'],
    ['hero down without any is the owner', hook('onHeroDown', [{ op: 'revive', pct: 0.4 }], { once: true }), 'The next time you fall, revive yourself with 40% HP.'],
  ].forEach(([name, op, want]) => t.eq(text([op], PW), want, 'hook: ' + name));
  // a party hook (relic, passive) keeps "you": the phrase is the old one
  t.eq(D.hookText({ on: 'onPlay', filter: { type: 'attack' }, fx: [blk(1)] }), 'Whenever you play an Attack, gain 1 Block.', 'a relic hook keeps the plain you');
  t.eq(D.hookText({ on: 'onSwap', fx: [blk(1)] }), 'Whenever you swap rows, gain 1 Block.', 'and so does a relic swap hook');
});

t.test('card text: gains of different kinds share one sentence, same kinds do not', () => {
  [
    ['block and a status', [blk(5), st('taunt', 1)], 'Gain 5 Block and 1 Taunt.'],
    ['a status and block', [st('bloom', 1), blk(3)], 'Gain 1 Bloom and 3 Block.'],
    ['three kinds', [blk(10), st('taunt', 2), st('thorns', 1)], 'Gain 10 Block, 2 Taunt and 1 Thorns.'],
    ['both heroes', [blk(4, { tgt: 'both' }), st('thorns', 1, { tgt: 'both' })], 'Both heroes gain 4 Block and 1 Thorns.'],
    ['different targets stay apart', [blk(4, { tgt: 'both' }), st('bloom', 1)], 'Both heroes gain 4 Block. Gain 1 Bloom.'],
    ['two blocks stay apart', [blk(4), blk(2)], 'Gain 4 Block. Gain 2 Block.'],
    ['a computed block stays apart', [blk({ per: 'block', who: 'ally' }), st('bloom', 1)], 'Gain Block equal to your ally\'s Block. Gain 1 Bloom.'],
    ['gold and Ink', [{ op: 'ink', n: 1 }, { op: 'gold', n: 3 }], 'Gain 1 Ink and 3 gold.'],
    ['a draw is not a gain', [st('bloom', 1), { op: 'draw', n: 1 }], 'Gain 1 Bloom. Draw 1 card.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, 'gain: ' + name));
  t.eq(text([blk(6), st('thorns', 1), cond({ row: 'front' }, [st('thorns', 2)])], SK), 'Gain 6 Block and 1 Thorns. Front: gain 2 more Thorns.', 'a same status row bonus still reads "more" after a merged sentence');
  t.eq(text([blk(6), cond({ row: 'front' }, [blk(6)])], SK), 'Gain 6 Block. Front: gain 6 more Block.', 'and a block row bonus too');
});

t.test('card text: a status taken back by a once-hook reads as "this turn" or "until your next turn"', () => {
  const back = (on, s, n, tgt) => hook(on, [st(s, -n, tgt ? { tgt } : undefined)], { once: true });
  [
    ['might this turn', [st('might', 2), back('turnEnd', 'might', 2)], 'Gain 2 Might until the end of this turn.'],
    ['dodge until next turn', [st('dodge', 1), back('turnStart', 'dodge', 1)], 'Gain 1 Dodge until your next turn.'],
    ['both heroes', [st('might', 2, { tgt: 'both' }), back('turnEnd', 'might', 2, 'both')], 'Both heroes gain 2 Might until the end of this turn.'],
    ['the ally', [st('might', 3, { tgt: 'ally' }), back('turnEnd', 'might', 3, 'ally')], 'Give your ally 3 Might until the end of this turn.'],
    ['with a draw between', [st('might', 2, { tgt: 'both' }), { op: 'draw', n: 2 }, back('turnEnd', 'might', 2, 'both')], 'Both heroes gain 2 Might until the end of this turn. Draw 2 cards.'],
    ['an op in front', [dmg({ per: 'status', s: 'dodge', mul: 3, who: 'self' }), st('dodge', 1), back('turnStart', 'dodge', 1)], 'Deal 3 damage for each Dodge you have. Gain 1 Dodge until your next turn.'],
    ['a different amount is not a pair', [st('might', 2), back('turnEnd', 'might', 1)], 'Gain 2 Might. At the end of this turn, lose 1 Might.'],
    ['a different status is not a pair', [st('might', 2), back('turnEnd', 'bulwark', 2)], 'Gain 2 Might. At the end of this turn, lose 2 Bulwark.'],
    ['a different target is not a pair', [st('might', 2), back('turnEnd', 'might', 2, 'both')], 'Gain 2 Might. At the end of this turn, both heroes lose 2 Might.'],
    ['a repeating hook is not a pair', [st('might', 2), hook('turnEnd', [st('might', -2)])], 'Gain 2 Might. At the end of your turn, lose 2 Might.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, 'temp: ' + name));
});

t.test('card text: swaps read as steps and row bonuses after a swap say "Now"', () => {
  [
    ['a step to the front', [cond({ row: 'back' }, [{ op: 'swap' }]), st('bloom', 1)], 'Move to the front row. Gain 1 Bloom.'],
    ['a step to the back', [cond({ row: 'front' }, [{ op: 'swap' }]), blk(3)], 'Move to the back row. Gain 3 Block.'],
    ['a step then a bonus', [cond({ row: 'back' }, [{ op: 'swap' }]), dmg(5), cond({ row: 'front' }, [st('bloom', 1)])], 'Move to the front row. Deal 5 damage. Front: gain 1 Bloom.'],
    ['a swap then rows', [{ op: 'swap' }, cond({ row: 'front' }, [blk(6)], [{ op: 'heal', n: 4, tgt: 'both' }])], 'Swap rows. Now Front: gain 6 Block. Now Back: heal both heroes for 4 HP.'],
    ['a swap then one row', [dmg(6), { op: 'swap' }, cond({ row: 'back' }, [blk(3, { tgt: 'both' })])], 'Deal 6 damage. Swap rows. Now Back: both heroes gain 3 Block.'],
    ['rows before a swap are plain', [cond({ row: 'front' }, [dmg(3)]), { op: 'swap' }], 'Front: deal 3 damage. Swap rows.'],
    ['a swap then a long condition', [{ op: 'swap' }, cond({ row: 'back', handEmpty: true }, [{ op: 'draw', n: 1 }])], 'Swap rows. If you are now in the back row and your hand is empty, draw 1 card.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, SK), want, 'swap: ' + name));
});

t.test('card text: doubling, area strikes with a debuff, spent counts and the target placement', () => {
  const sumi = (mul, x) => Object.assign({ per: 'status', who: 'self', s: 'sumi', mul }, x);
  [
    ['double the target\'s status', [st('poison', { per: 'status', who: 'target', s: 'poison', cap: 10 })], 'Double the target\'s Poison (adds at most 10).'],
    ['double your own', [st('thorns', { per: 'status', s: 'thorns', cap: 8 })], 'Double your Thorns (adds at most 8).'],
    ['double with no cap', [st('burn', { per: 'status', who: 'target', s: 'burn' })], 'Double the target\'s Burn.'],
    ['another status is not a double', [st('burn', { per: 'status', who: 'target', s: 'poison', cap: 10 })], 'Apply Burn equal to the target\'s Poison (max 10).'],
    ['a strike and a debuff on all', [dmg(5, { tgt: 'all' }), st('weak', 1, { tgt: 'all' })], 'Deal 5 damage and apply 1 Weak to all enemies.'],
    ['and a second debuff', [dmg(5, { tgt: 'all' }), st('weak', 1, { tgt: 'all' }), st('vulnerable', 1, { tgt: 'all' })], 'Deal 5 damage and apply 1 Weak and 1 Vulnerable to all enemies.'],
    ['one target keeps two sentences', [dmg(5), st('weak', 1)], 'Deal 5 damage. Apply 1 Weak.'],
    ['a strike and a debuff on others', [dmg(5, { tgt: 'others' }), st('weak', 1, { tgt: 'others' })], 'Deal 5 damage and apply 1 Weak to all other enemies.'],
    ['a strike and a debuff on another target', [dmg(3, { tgt: 'all' }), st('mark', 1, { tgt: 'lowest' })], 'Deal 3 damage to all enemies. Apply 1 Mark to the enemy with the lowest HP.'],
    ['repeat of a strike and a debuff', [{ op: 'repeat', n: { per: 'X' }, do: [dmg(3, { tgt: 'all' }), st('burn', 1, { tgt: 'all' })] }], 'Repeat X times: deal 3 damage and apply 1 Burn to all enemies.'],
    ['a spent count puts the target first', [dmg(sumi(2, { base: 4, upTo: 3 }), { tgt: 'all', consume: { s: 'sumi', upTo: 3 } })], 'Spend up to 3 Sumi. Deal 4 damage to all enemies, plus 2 for each Sumi spent.'],
    ['and the for each form', [dmg(sumi(4, { upTo: 6 }), { tgt: 'all', consume: { s: 'sumi', upTo: 6 } })], 'Spend up to 6 Sumi. Deal 4 damage to all enemies for each Sumi spent.'],
    ['and X hits with a plus', [dmg({ base: 2, per: 'status', who: 'self', s: 'bloom', mul: 1 }, { hits: { per: 'X' }, tgt: 'all', consume: 'bloom' })], 'Spend all Bloom. Deal 2 damage to all enemies X times, plus 1 for each Bloom spent.'],
    ['a plain equal form keeps the target at the end', [dmg({ per: 'block' }, { tgt: 'all' })], 'Deal damage equal to your Block to all enemies.'],
    ['draw for each chosen', [pick('hand', 2, 'discard', { optional: true }), { op: 'draw', n: { per: 'picked' } }], 'Discard up to 2 cards. Draw 1 card for each card chosen.'],
    ['a status for each chosen', [pick('hand', 2, 'exhaust', { optional: true }), st('sumi', { per: 'picked' })], 'Exhaust up to 2 cards. Gain 1 Sumi for each card chosen.'],
    ['earlier plays', [dmg({ per: 'cardsPlayed', mul: 2 })], 'Deal 2 damage for each card played earlier this turn.'],
  ].forEach(([name, fx, want]) => t.eq(text(fx, name.indexOf('X hits') >= 0 || name.indexOf('repeat of') >= 0 ? Object.assign({ cost: 'X' }, SK) : SK), want, 'wording: ' + name));
});

t.test('card text: Curse and Status cards are acted by the front hero, and dead resource conditions are not printed', () => {
  const junk = (fx, hand) => text(fx, { type: 'status', hero: 'status', cost: 0, kw: ['exhaust'], hand });
  t.eq(junk([{ op: 'hurt', n: 2 }, { op: 'draw', n: 1 }]), 'The front hero loses 2 HP. Draw 1 card. Exhaust.', 'hurt self reads the front hero');
  t.eq(junk([blk(3), st('bloom', 1)]), 'The front hero gains 3 Block and 1 Bloom. Exhaust.', 'block and a status read the front hero');
  t.eq(junk([{ op: 'energy', n: -1 }]), 'Lose 1 Energy. Exhaust.', 'Energy is the player\'s, not the hero\'s');
  t.eq(junk([{ op: 'removeStatus', s: 'debuffs' }]), 'Remove all debuffs from the front hero. Exhaust.', 'a cleanse reads the front hero');
  t.eq(junk([], { turnEnd: [{ op: 'hurt', n: 1, tgt: 'both' }] }), 'If this is in your hand at the end of your turn, both heroes lose 1 HP. Exhaust.', 'explicit targets stay');
  const res = (hero) => W.card([st('might', 1), cond({ status: { s: 'bloom', who: 'self' } }, [st('bloom', 2)]), cond({ status: { s: 'sumi', who: 'self' } }, [st('sumi', 2)])], { hero, type: 'skill' });
  t.eq(P(res('hanae')), 'Gain 1 Might. If you have Bloom, gain 2 Bloom.', 'a Hanae card never holds Sumi, so that line is left out');
  t.eq(P(res('kuro')), 'Gain 1 Might. If you have Sumi, gain 2 Sumi.', 'and a Kuro card never holds Bloom');
  t.eq(P(W.card([cond({ status: { s: 'bloom', who: 'self', lte: 0 } }, [st('might', 1)])], { hero: 'kuro', type: 'skill' })), 'If you have no Bloom, gain 1 Might.', 'an "at most" condition on another hero\'s resource is still true, so it stays');
});

t.test('card text: numbers inside a hook are not given the hero\'s row, Might or Weak, and hook Block gets no row bonus', () => {
  const card = W.card([hook('onPlay', [dmg(2, { tgt: 'all' }), blk(3)], { filter: { type: 'attack' } })], PW);
  const nn = (ctx) => nums(H(card, ctx)).map((x) => x[0]);
  t.deep(nn(), [2, 3], 'printed numbers');
  t.deep(nn(HANAE_UNIT({ might: 3 })), [2, 3], 'hook damage ignores Might and the front row bonus (hook damage has no attacker)');
  t.deep(nn(HANAE_UNIT({ might: 3, weak: 1 }, 'back')), [2, 3], 'hook Block ignores the back row bonus too (only Bulwark and Frail count)');
  t.deep(nn(HANAE_UNIT({ bulwark: 2 })), [2, 5], 'hook Block does take Bulwark');
  t.deep(nn(HANAE_UNIT({ frail: 1 })), [2, 2], 'and Frail');
  const plain = W.card([dmg(2), blk(3)], SK);
  t.deep(nums(H(plain, HANAE_UNIT({ might: 3 }))).map((x) => x[0]), [7, 3], 'while a card\'s own damage does take Might and the row');
});

t.test('enemy text: an enemy move reads from the enemy\'s side (the bestiary prints DATA.opsText(move.fx))', () => {
  const foe = W.enemy({ name: 'Cat', moves: {
    a: { name: 'Claw', kind: 'attack', fx: [dmg(5), st('vulnerable', 1, { tgt: 'front' })] },
    b: { name: 'Pounce', kind: 'multi', fx: [dmg(3, { hits: 3, tgt: 'random' })] },
    c: { name: 'Hiss', kind: 'debuff', fx: [st('weak', 1, { tgt: 'both' }), st('frail', 1, { tgt: 'both' })] },
    d: { name: 'Curl', kind: 'defend', fx: [blk(8), st('thorns', 2)] },
    e: { name: 'Purr', kind: 'heal', fx: [{ op: 'heal', n: 6, tgt: 'lowestEnemy' }, blk(4, { tgt: 'allEnemies' }), st('ritual', 1, { tgt: 'otherEnemy' })] },
    f: { name: 'Kittens', kind: 'summon', fx: [{ op: 'summon', enemy: 't_cat_kit', n: 2 }, { op: 'summon', enemy: 't_cat_kit', n: 1 }] },
    g: { name: 'Hairball', kind: 'debuff', fx: [{ op: 'add', card: INK, n: 2, to: 'draw' }, { op: 'add', card: INK, to: 'draw', top: true }, { op: 'stealGold', n: 10 }, { op: 'swap' }, { op: 'flee' }] },
    h: { name: 'Pounce Plus', kind: 'heavy', fx: [dmg({ base: 5, per: 'debuffs', who: 'target', mul: 3, cap: 14 }), dmg({ base: 4, per: 'enemies', mul: 3, cap: 14 }), dmg({ base: 9, per: 'block', who: 'target', mul: 0.5, cap: 18 }, { pierce: true }), dmg({ base: 14, per: 'missingHp', who: 'target', mul: 0.25, cap: 30 }, { tgt: 'lowest' })] },
    i: { name: 'Stalk', kind: 'attack', fx: [dmg({ per: 'turn', base: 6, cap: 12 }, { tgt: 'both' }), dmg({ base: 15, per: 'status', who: 'self', s: 'plating', cap: 26 })] },
    j: { name: 'Strip', kind: 'debuff', fx: [{ op: 'removeStatus', s: 'buffs', tgt: 'both' }, { op: 'removeStatus', s: 'bloom', tgt: 'both' }, { op: 'removeStatus', s: 'sumi', tgt: 'both' }, { op: 'removeStatus', s: 'thorns', tgt: 'self' }, { op: 'removeStatus', s: 'debuffs' }] },
  }, start: [st('plating', 3), st('thorns', 2)], hooks: [{ on: 'onDeath', fx: [dmg(4, { tgt: 'front' })] }, { on: 'onHurt', limit: 1, fx: [st('plating', -1, { tgt: 'self' })] }], phases: [{ at: 0.5, fx: [st('might', 1), blk(12)] }] });
  D.add('enemies', { t_cat_kit: Object.assign({}, D.enemies[foe], { id: 't_cat_kit', name: 'Kitten', tier: 'minion', size: 's' }) });
  const e = D.enemies[foe];
  const M = (k) => D.opsText(e.moves[k].fx);
  t.eq(M('a'), 'Deal 5 damage and apply 1 Vulnerable to the front hero.', 'a strike and a debuff on the front hero share the target');
  t.eq(M('b'), 'Deal 3 damage to a random hero 3 times.', 'a random enemy op hits a random HERO');
  t.eq(M('c'), 'Apply 1 Weak and 1 Frail to both heroes.', 'debuffs merge');
  t.eq(M('d'), 'Gain 8 Block and 2 Thorns.', 'self gains merge');
  t.eq(M('e'), 'Heal the enemy with the lowest HP for 6 HP. All enemies gain 4 Block. Another enemy gains 1 Ritual.', 'help for other enemies');
  t.eq(M('f'), 'Summon 2 Kittens. Summon a Kitten.', 'summons are pluralised');
  t.eq(M('g'), 'Shuffle 2 Ink Blot cards into your draw pile. Put an Ink Blot card on top of your draw pile. Steal 10 gold. Swap your rows. Flee.', 'junk, theft, swap and flee');
  t.eq(M('h'), 'Deal 5 damage to the front hero, plus 3 for each debuff on the hero (max 14). Deal 4 damage to the front hero, plus 3 for each enemy still standing (max 14). Deal 9 damage to the front hero, plus 1 for every 2 Block the hero has (max 18), ignoring Block. Deal 14 damage to the weakest hero, plus 1 for every 4 HP the hero is missing (max 30).', 'per values read from the enemy\'s side, fractions never print as decimals');
  t.eq(M('i'), 'Deal damage equal to 6 plus its turn count (max 12) to both heroes. Deal damage equal to 15 plus its Plating (max 26) to the front hero.', 'self counters read "its"');
  t.eq(M('j'), 'Remove all buffs, Bloom and Sumi from both heroes. Lose all Thorns. Remove all debuffs from itself.', 'removals');
  t.eq(D.opsText(e.start), 'Gain 3 Plating and 2 Thorns.', 'start ops');
  t.eq(D.hookText(e.hooks[0]), 'When it dies, deal 4 damage to the front hero.', 'an onDeath hook');
  t.eq(D.hookText(e.hooks[1]), 'Once per turn, when it is hurt, lose 1 Plating.', 'an onHurt hook');
  t.eq(D.opsText(e.phases[0].fx), 'Gain 1 Might and 12 Block.', 'a phase');
  t.eq(D.moveText(e.moves.a), 'Deal 5 damage and apply 1 Vulnerable to the front hero.', 'moveText is opsText with the enemy side forced');
  t.eq(D.opsText([dmg(5)]), 'Deal 5 damage.', 'a card op list is still a card op list');
  t.eq(D.opsText([dmg(5)], { enemy: true }), 'Deal 5 damage to the front hero.', 'unless the caller says it is an enemy');
});

t.test('intentText: help for other enemies is told apart from help for itself, and parts group by target', () => {
  const kit = W.enemy({ name: 'Kit', moves: {
    wall: { name: 'Shield Wall', kind: 'defend', fx: [blk(8, { tgt: 'allEnemies' })] },
    warm: { name: 'Warm Glow', kind: 'defend', fx: [blk(5, { tgt: 'otherEnemy' })] },
    kindle: { name: 'Light the Wicks', kind: 'buff', fx: [st('ritual', 1, { tgt: 'allEnemies' })] },
    tighten: { name: 'Tighten', kind: 'attack', fx: [dmg(10, { tgt: 'front' }), st('might', 2, { tgt: 'otherEnemy' })] },
    mend: { name: 'Mend', kind: 'heal', fx: [{ op: 'heal', n: 12, tgt: 'lowestEnemy' }] },
  } });
  const IT = (o) => Object.assign({ name: 'x', kind: 'attack', dmg: null, hits: 1, tgt: ['hanae'], tgtKind: 'front', taunted: false, statuses: [], adds: [], summons: [], removes: [] }, o);
  t.eq(D.intentText(IT({ move: 'wall', name: 'Shield Wall', kind: 'defend', block: 8 })), 'Gives all enemies 8 Block', 'all enemies get the Block');
  t.eq(D.intentText(IT({ move: 'warm', name: 'Warm Glow', kind: 'defend' })), 'Gives another enemy 5 Block', 'a Block for another enemy is no longer just the move name');
  t.eq(D.intentText(IT({ move: 'kindle', name: 'Light the Wicks', kind: 'buff', statuses: [{ s: 'ritual', n: 1, to: 'self' }] })), 'Gives all enemies 1 Ritual', 'a buff for everyone');
  t.eq(D.intentText(IT({ move: 'tighten', name: 'Tighten', dmg: 10, tgt: ['hanae'], statuses: [{ s: 'might', n: 2, to: 'self' }] })), 'Deals 10 to the front hero and gives another enemy 2 Might', 'a strike plus a buff for another');
  t.eq(D.intentText(IT({ move: 'mend', name: 'Mend', kind: 'heal', heal: 12 })), 'Heals the enemy with the lowest HP for 12', 'a heal for the weakest enemy');
  t.eq(D.intentText(IT({ move: 'wall', name: 'Not The Same Name', kind: 'defend', block: 8 })), 'Gains 8 Block', 'a name that matches no enemy move reads as before');
  t.eq(D.intentText(IT({ dmg: 6, tgtKind: 'both', tgt: ['hanae', 'kuro'], statuses: [{ s: 'burn', n: 2, to: 'both' }] })), 'Deals 6 to both heroes and applies 2 Burn', 'the same target is not repeated');
  t.eq(D.intentText(IT({ dmg: 6, statuses: [{ s: 'weak', n: 1, to: 'both' }, { s: 'frail', n: 1, to: 'both' }] })), 'Deals 6 to the front hero and applies 1 Weak and 1 Frail to both heroes', 'two debuffs on another target group');
  t.eq(D.intentText(IT({ kind: 'debuff', removes: [{ s: 'bloom', to: 'both' }, { s: 'sumi', to: 'both' }, { s: 'ward', to: 'both' }, { s: 'charge', to: 'both' }] })), 'Removes Bloom, Sumi, Ward and Charge from both heroes', 'resource wipes group');
  t.eq(D.intentText(IT({ dmg: 24, removes: [{ s: 'thorns', to: 'self' }] })), 'Deals 24 to the front hero and loses its Thorns', 'an enemy dropping its own buff');
  t.eq(D.intentText(IT({ kind: 'summon', summons: [{ enemy: kit, n: 1 }] })), 'Summons a Kit', 'a summon of a named enemy');
});

t.test('gemText: effects read as sentences, and lifesteal is not a clumsy phrase', () => {
  const G = (mod) => D.gemText({ name: 'g', color: 'red', tier: 1, mod });
  t.eq(G({ fx: [dmg(4, { tgt: 'enemy', lifesteal: true })] }), 'Deal 4 damage and heal for the HP it removes', 'lifesteal');
  t.eq(G({ fx: [{ op: 'ink', n: 1 }, { op: 'gold', n: 3 }] }), 'Gain 1 Ink and 3 gold', 'Ink and gold share a gain');
  t.eq(G({ status: { s: 'thorns', n: 2, tgt: 'self' }, block: 1 }), '+1 Block, gain 2 Thorns', 'a flat bonus and a status');
});

t.test('markup: an upgrade colours the base and the multiplier of a "plus ... for each" number too', () => {
  const sumi = (base, mul) => ({ base, per: 'status', who: 'self', s: 'sumi', mul, upTo: 3 });
  const id = W.card([dmg(sumi(4, 2), { consume: { s: 'sumi', upTo: 3 } })], { up: { fx: [dmg(sumi(5, 3), { consume: { s: 'sumi', upTo: 3 } })] } });
  t.deep(nums(H({ id, up: 0, gems: [] })).map((x) => x[1]), ['', '', ''], 'base card: nothing coloured');
  const up = nums(H({ id, up: 1, gems: [] }));
  t.deep(up.map((x) => [x[0], x[1]]), [[3, ''], [5, 'up'], [3, 'up']], 'upgraded: the base 5 and the multiplier 3 are "up", the cap 3 is not');
  const both = W.card([dmg({ base: 5, per: 'status', who: 'self', s: 'sumi', mul: 3, upTo: 3 })], { up: { fx: [dmg({ base: 4, per: 'status', who: 'self', s: 'sumi', mul: 3, upTo: 3 })] } });
  t.ok(nums(H({ id: both, up: 1, gems: [] })).some((x) => x[0] === 4 && x[1] === 'down'), 'a lowered base reads "down"');
});

t.done();
