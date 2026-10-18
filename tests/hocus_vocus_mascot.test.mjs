// THE MASCOT (DESIGN 4.7 "The Mascot"): the tour bus pet that grows during the tour.
//
// What this suite covers, against the real data, COMBAT, MAP and RUN:
//   data       six mascots, each exactly ECONOMY.mascotXp.length levels, every level text one sentence of at most 90 characters that
//              carries every number, status, target and trigger of its data (the Charm text rules of the treasure suite), blurbs, the
//              validator and the audit (accept the real data, reject broken shapes, Breath and hand size stay Headliner trades)
//   helpers    DATA.mascotLevel thresholds, mascotNext, activeMascotTiers stacking, modsFor and rowFor folding, mascotProgress, mascotLabel
//   run        R.mascot null at birth, RUN.adoptMascot (ok, owned, unknown), RUN.mascotXp (levels, two levels at once, without a mascot),
//              RUN.mods folds the levels, run hooks fire through RUN.hook after the set tiers, combatDone feeds the fight tier's XP and
//              leads the reward log with the level-up lines, Rewards keeps its field list
//   combat     combatInit passes the mascot, COMBAT.create echoes C.mascot, registers the levels' hooks with src 'mascot' (no `relic` event),
//              rows reach the heroes (Stage Goose), combatStart hooks land (Karaoke Parrot), determinism
//   adoption   the Detour stray_at_the_bus_stop (once, any act, heavy weight), req.mascot hides the calls, eventChoose adopts, all six
//              mascots reachable, the same tile gives the same stray twice, the run ops adoptMascot and mascotXp and their dead reasons
//   snack      the Merch Stall stocks one Snack while the bus has a mascot (price follows priceMul), shopBuy feeds it, sold once, absent
//              without a mascot, refused without one
//   saves      serialize carries R.mascot, round trip, old saves without the field, junk and unknown ids load as no mascot
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus mascot');
const g = boot({ only: ['data_text', 'combat', 'map', 'run'] });
const { DATA, COMBAT, MAP, RUN, U } = g;
const E = DATA.ECONOMY, L = DATA.LISTS;
const J = (x) => JSON.stringify(x);
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
const mascots = Object.values(DATA.mascots);
const IDS = ['mascot_pug', 'mascot_cat', 'mascot_hamster', 'mascot_goose', 'mascot_fox', 'mascot_parrot'];
const NEW = (o) => RUN.newRun(Object.assign({ heroes: ['hanae', 'kuro'], seed: 11 }, o || {}));
const winSummary = (R, over) => Object.assign({ result: 'win', heroes: R.heroes.map((x) => ({ id: x.id, hp: x.hp, maxHp: x.maxHp, down: false })), maxHpGain: {}, stats: { kills: [{ def: 'kappa', tier: 'normal', by: 'card' }] }, gold: 0, ink: 0, fanbase: {} }, over || {});
const fakeC = (R, over) => { const s = winSummary(R, over); return { tier: over && over.tier, summary: () => s, front: () => ({ id: R.heroes[R.frontIdx].id }) }; };
// a combat node on the current tile (the real map's generator decides nothing here: combatDone only reads tier, tile, rewards, onWin, source)
const fightNode = (R, tier) => { R.node = { kind: 'combat', tile: { q: R.map.pos.q, r: R.map.pos.r }, tier, enc: null, enemies: ['kappa'], seed: 5, rewards: true, onWin: null, source: 'combat' }; return R.node; };
// paint a chain to `tile` and step onto it (every other tile pre-resolved so the walk crosses no node): what the last step gave
function walkTo(R, tile) {
  Object.keys(R.map.tiles).forEach((k) => { const x = R.map.tiles[k]; if (x !== tile) x.done = true; });
  R.node = null;
  const p = MAP.pathToPaint(R.map, tile.q, tile.r);
  if (p) p.path.forEach((c) => { R.ink = R.inkMax; RUN.paint(R, c[0], c[1]); });
  const pos = R.map.pos, prev = {}, q = [[pos.q, pos.r]];
  prev[MAP.key(pos.q, pos.r)] = null;
  while (q.length) {
    const c = q.shift();
    if (c[0] === tile.q && c[1] === tile.r) break;
    MAP.neighbors(R.map, c[0], c[1]).forEach((n) => { const k = MAP.key(n[0], n[1]); const nt = R.map.tiles[k]; if (!(k in prev) && nt.painted && nt.type !== 'block') { prev[k] = c; q.push(n); } });
  }
  const path = [];
  for (let c = [tile.q, tile.r]; c; c = prev[MAP.key(c[0], c[1])]) path.unshift(c);
  let res = null;
  path.slice(1).forEach((c) => { res = RUN.step(R, c[0], c[1]); });
  return res;
}
const tilesOf = (R, type) => Object.keys(R.map.tiles).map((k) => R.map.tiles[k]).filter((x) => x.type === type);
const reachable = (R, type) => tilesOf(R, type).find((x) => !x.done && (x.painted || MAP.pathToPaint(R.map, x.q, x.r)));
function enter(R, type, mutate) {
  const tile = reachable(R, type);
  if (!tile) return null;
  if (mutate) mutate(tile);
  R.brushes = ['stroke'];
  return walkTo(R, tile);
}

// ================================================================================================ data
t.test('boot: data_mascots.js loads, six mascots, strict validation and the audit accept them', () => {
  t.eq(g._errors.filter((e) => /data_mascots|run|combat/.test(e.file)).length, 0, 'the files load: ' + J(g._errors.map((e) => e.file + ': ' + e.message)));
  t.eq(mascots.length, DATA.QUOTA.mascots, 'QUOTA.mascots mascots'); t.eq(DATA.QUOTA.mascots, 6, 'and the quota is six');
  t.deep(mascots.map((m) => m.id).sort(), IDS.slice().sort(), 'the six ids');
  const v = DATA.validate(undefined, { strict: true });
  t.eq(v.errors.length, 0, 'strict validation: ' + v.errors.slice(0, 6).join('; '));
  t.eq(v.counts.mascots, 6, 'validate counts them');
  t.deep(DATA.audit('mascots'), [], 'the mascot audit is clean');
  t.deep(DATA.audit().filter((x) => x.indexOf('audit') === 0), [], 'no hard audit line anywhere (events quota still met with the new Detour)');
  t.deep(E.mascotXp, [0, 5, 12], 'ECONOMY.mascotXp'); t.deep(E.mascotFightXp, { normal: 1, elite: 2, boss: 3 }, 'ECONOMY.mascotFightXp'); t.eq(E.snackXp, 2, 'ECONOMY.snackXp'); t.eq(E.price.snack, 35, 'ECONOMY.price.snack');
  t.ok(L.runOps.indexOf('adoptMascot') >= 0 && L.runOps.indexOf('mascotXp') >= 0, 'LISTS.runOps has the two new ops');
  t.ok(L.reqKeys.indexOf('mascot') >= 0, 'LISTS.reqKeys has mascot');
  t.ok(DATA.keywords.mascot && /level 2 at 5 XP/.test(DATA.keywords.mascot.text) && /level 3 at 12 XP/.test(DATA.keywords.mascot.text), 'the glossary line states the thresholds');
  mascots.forEach((m) => {
    t.ok(/^[a-z][a-z0-9_]*$/.test(m.id) && m.id === Object.keys(DATA.mascots).find((k) => DATA.mascots[k] === m), `${m.id}: snake_case id matching its key`);
    t.ok(typeof m.name === 'string' && m.name.length >= 3 && m.name.length <= 24, `${m.id}: name`);
    t.ok(typeof m.blurb === 'string' && m.blurb.length <= 80 && /^[\x20-\x7e]+$/.test(m.blurb) && /[.!?]$/.test(m.blurb), `${m.id}: blurb is one printable line ending in . ! or ?`);
    t.ok(L.motifs.indexOf(m.art.m) >= 0 && L.palettes.indexOf(m.art.c) >= 0, `${m.id}: art from LISTS.motifs and LISTS.palettes`);
    t.deep(Object.keys(m.levels).map(Number).sort(), [1, 2, 3], `${m.id}: exactly levels 1, 2, 3`);
    [1, 2, 3].forEach((n) => { const lv = m.levels[n]; t.ok(!!(lv.mods || lv.hooks || lv.rows), `${m.id} level ${n} does something`); });
  });
  t.eq(new Set(mascots.map((m) => m.name)).size, 6, 'names are unique');
  t.eq(new Set(mascots.map((m) => m.art.m + '/' + m.art.c)).size, 6, 'every mascot has its own (motif, palette) pair');
});

// The Charm text rules (tests/hocus_vocus_treasure.test.mjs): every number, noun, status, target and trigger of the data must be in the sentence.
const NUMWORDS = { 0: ['zero', 'no', 'free'], 1: ['one', 'a', 'an', 'once', 'first', 'next', 'single', 'another', 'extra', 'more', 'less', 'fewer'], 2: ['two', 'twice', 'second', 'both'], 3: ['three', 'third'], 4: ['four', 'fourth'], 5: ['five', 'fifth'], 6: ['six'], 8: ['eight'], 10: ['ten'], 20: ['twenty'] };
const mentions = (text, n) => new RegExp('(^|[^0-9.])' + n + '(?![0-9])').test(text) || (NUMWORDS[n] || []).some((w) => new RegExp('\\b' + w + '\\b', 'i').test(text));
const OPWORD = { dmg: /damage/i, block: /block/i, heal: /heal/i, draw: /draw/i, energy: /breath/i, gold: /gold/i, ink: /\bvox\b/i, maxHp: /max HP/i, hurt: /lose|hurt/i, paint: /unmute/i, addBrush: /spell/i, addGem: /gem/i, addCurse: /curse/i, upgradeCard: /upgrade/i };
const MODWORD = { energy: [/breath/i], hand: [/card/i], startBlock: [/block/i], inkMax: [/vox/i], startInk: [/vox/i], wellInk: [/tea stall/i], cardChoices: [/card/i], freeSwaps: [/swap/i], campActions: [/green room/i], rareBoost: [/rare/i], goldMul: [/gold/i], priceMul: [/price/i], healMul: [/heal/i] };
const ROWWORD = { dmgAdd: /damage/i, blockAdd: /block/i, startBlock: /block/i, regen: /warm tea/i, thorns: /feedback/i, drawAdd: /draw/i };
const ROWNAME = { front: /\blead\b/i, back: /backing/i };
const TRIG = {
  combatStart: /start(s)? (of )?(each )?(combat|fight)/i, combatEnd: /end of (each|the) (combat|fight)/i,
  turnStart: /start of (your|each|every) turn|turn start|first turn|\d(st|nd|rd|th) turn|each turn|every turn/i, turnEnd: /end of (your|each) turn/i,
  onPlay: /\bplay(s|ed)?\b/i, onDamaged: /\bhit\b/i, onKill: /defeat|kill/i, onSwap: /swap/i, onHeroDown: /loses? (their|a) voice/i, onShuffle: /reshuffle/i, onExhaust: /fade/i,
  onPickup: /when you take this/i, onChapterStart: /\bact\b/i, onRest: /rest/i, onPaint: /unmute/i, onFightWon: /fight|winning/i, onShopEnter: /stall/i,
};
const TGTWORD = { all: /\ball\b/i, both: /both|heroes|each/i, ally: /ally/i, front: /\blead\b/i };
function summary(lv) {
  const nums = [], words = [];
  const needNum = (n, why) => { if (typeof n === 'number' && Number.isFinite(n)) nums.push({ n: Math.abs(n), why }); };
  const needWord = (re, why) => { if (re) words.push({ re, why }); };
  Object.keys(lv.mods || {}).forEach((k) => { needNum(L.modKind[k] === 'frac' ? Math.round(lv.mods[k] * 100) : lv.mods[k], `mod ${k}`); (MODWORD[k] || []).forEach((re) => needWord(re, `mod ${k}`)); });
  ['front', 'back'].forEach((row) => Object.keys((lv.rows || {})[row] || {}).forEach((k) => { needNum(lv.rows[row][k], `${row} ${k}`); needWord(ROWWORD[k], `${row} ${k}`); needWord(ROWNAME[row], `row ${row}`); }));
  (lv.hooks || []).forEach((h) => {
    needWord(TRIG[h.on], `trigger ${h.on}`);
    if (h.every) needNum(h.every, 'every');
    if (h.limit) needNum(h.limit, 'limit');
    if (h.once) needWord(/first time|once|next/i, 'once');
    const f = h.filter || {};
    if (f.type) [].concat(f.type).forEach((x) => needWord(new RegExp(x, 'i'), `filter type ${x}`));
    DATA.walkOps(h.fx, (o) => {
      if (OPWORD[o.op]) needWord(OPWORD[o.op], `op ${o.op}`);
      if (typeof o.n === 'number') needNum(o.n, `${o.op} n`);
      if (o.op === 'status' && DATA.statuses[o.s]) needWord(new RegExp(DATA.statuses[o.s].name, 'i'), `status ${o.s}`);
      if (o.op === 'dmg' && o.tgt === 'enemy' && h.on === 'onDamaged') needWord(/attacker/i, 'attacker');
      if (o.tgt && TGTWORD[o.tgt]) needWord(TGTWORD[o.tgt], `target ${o.tgt}`);
    });
  });
  return { nums, words };
}
t.test('text: every level text is one clean sentence of at most 90 characters that agrees with its data (numbers, nouns, statuses, targets, triggers)', () => {
  mascots.forEach((m) => [1, 2, 3].forEach((n) => {
    const lv = m.levels[n], tag = `${m.id} level ${n}`, text = lv.text;
    t.ok(typeof text === 'string' && text.length >= 12 && text.length <= 90 && /^[A-Z0-9]/.test(text) && /\.$/.test(text) && !/[.!?;:](\s|$)/.test(text.slice(0, -1)) && !/\s\s/.test(text) && !DASH.test(text) && /^[\x20-\x7e]+$/.test(text), `${tag}: one clean sentence: "${text}"`);
    const s = summary(lv);
    s.nums.forEach((x) => t.ok(mentions(text, x.n), `${tag}: "${text}" must mention ${x.n} (${x.why})`));
    s.words.forEach((x) => t.ok(x.re.test(text), `${tag}: "${text}" must match ${x.re} (${x.why})`));
    (lv.hooks || []).forEach((h) => {
      const str = DATA.hookText(h);
      t.ok(typeof str === 'string' && str.length > 10 && /\.$/.test(str) && !/undefined|NaN|\[object/.test(str), `${tag}: hookText reads the ${h.on} hook: ${str}`);
      const run = L.runHooks.indexOf(h.on) >= 0;
      const out = DATA.opsText(h.fx, { run });
      (out.match(/\d+/g) || []).map(Number).filter((x) => x >= 2).forEach((x) => t.ok(mentions(text, x), `${tag}: opsText says "${out}", so the text must mention ${x}`));
    });
    t.ok(!DASH.test(J(m)), `${m.id}: no em or en dash anywhere`);
  }));
  t.eq(DATA.hookText(DATA.mascots.mascot_pug.levels[1].hooks[0]), 'Whenever you defeat an enemy, heal 2 HP.', 'Beatbox Pug 1 reads as a Charm hook');
  t.eq(DATA.hookText(DATA.mascots.mascot_hamster.levels[3].hooks[0]), 'At the start of each act, gain 2 Vox and gain 20 gold.', 'Tour Bus Hamster 3 reads as a Charm run hook');
  // Breath and hand size stay Headliner trades
  const extras = [];
  mascots.forEach((m) => [1, 2, 3].forEach((n) => {
    const lv = m.levels[n];
    if (lv.mods && (lv.mods.energy || lv.mods.hand)) extras.push(`${m.id}:${n}:mod`);
    (lv.hooks || []).forEach((h) => DATA.walkOps(h.fx, (o) => { if (o.op === 'energy' || (o.op === 'draw' && !(h.every >= 3))) extras.push(`${m.id}:${n}:${o.op}`); }));
  }));
  t.deep(extras, [], 'no level gives Breath or an ungated draw');
  t.ok(mascots.some((m) => [1, 2, 3].some((n) => (m.levels[n].hooks || []).some((h) => h.fx.some((o) => o.op === 'dmg')))), 'one mascot deals damage');
  t.ok(mascots.some((m) => [1, 2, 3].some((n) => m.levels[n].rows)), 'one mascot gives row bonuses');
  t.ok(mascots.some((m) => [1, 2, 3].some((n) => m.levels[n].mods && (m.levels[n].mods.priceMul || m.levels[n].mods.goldMul))), 'one mascot is about money');
  t.ok(mascots.some((m) => [1, 2, 3].some((n) => (m.levels[n].hooks || []).some((h) => L.runHooks.indexOf(h.on) >= 0))), 'one mascot has run hooks');
});

t.test('validator: broken mascots are caught, good ones pass, run op and req shapes are checked', () => {
  const fresh = () => boot({ only: [] }).DATA;
  const base = () => ({ name: 'Test Stray', blurb: 'A stray.', art: { m: 'fox', c: 'rose' }, levels: { 1: { text: 'The lead hero deals 1 more damage.', rows: { front: { dmgAdd: 1 } } }, 2: { text: 'Prices are 10% lower.', mods: { priceMul: -0.1 } }, 3: { text: 'After each fight, both heroes heal 2 HP.', hooks: [{ on: 'onFightWon', fx: [{ op: 'heal', n: 2, who: 'both' }] }] } } });
  const errs = (mut) => { const D = fresh(); const m = base(); if (mut) mut(m); D.add('mascots', { m_test: m }); return D.validate('mascots').errors; };
  const has = (list, sub) => list.some((e) => e.indexOf(sub) >= 0);
  t.eq(errs().length, 0, 'a good mascot passes: ' + errs().join('; '));
  t.ok(has(errs((m) => { m.bogus = 1; }), 'unknown field "bogus"'), 'unknown field');
  t.ok(has(errs((m) => { delete m.levels[3]; }), 'levels must be exactly 1..3'), 'a missing level');
  t.ok(has(errs((m) => { m.levels[4] = m.levels[3]; }), 'levels must be exactly 1..3'), 'a fourth level');
  t.ok(has(errs((m) => { m.levels[1].text = 'x'.repeat(91); }), 'text over 90'), 'text over 90 characters');
  t.ok(has(errs((m) => { m.levels[1] = { text: 'Nothing.' }; }), 'needs mods, hooks or rows'), 'an empty level');
  t.ok(has(errs((m) => { m.levels[2].mods = { bogus: 1 }; }), 'unknown mod'), 'unknown mod');
  t.ok(has(errs((m) => { m.levels[3].hooks[0].fx = [{ op: 'fight', enemies: ['kappa'] }]; }), 'fight is only legal in an event outcome'), 'fight in a run hook');
  t.ok(has(errs((m) => { m.art = { m: 'nope' }; }), 'not in LISTS.motifs'), 'art motif');
  t.ok(has(errs((m) => { m.blurb = 'no full stop'; }), 'blurb must end'), 'blurb shape');
  t.ok(has(errs((m) => { m.levels[1].rows = { middle: { dmgAdd: 1 } }; }), 'rows.middle'), 'row name');
  t.ok(has(errs((m) => { m.levels[1].text = 'An em dash ' + String.fromCharCode(0x2014) + ' here.'; }), 'em or en dash'), 'dash hygiene');
  // the audit: Breath and hand size
  { const D = fresh(); const m = base(); m.levels[2].mods = { energy: 1 }; D.add('mascots', { m_test: m }); t.ok(D.audit('mascots').some((x) => /Breath or hand size/.test(x)), 'the audit refuses a Breath mod'); }
  { const D = fresh(); const m = base(); m.levels[3].hooks = [{ on: 'turnStart', fx: [{ op: 'draw', n: 1 }] }]; D.add('mascots', { m_test: m }); t.ok(D.audit('mascots').some((x) => /must be gated/.test(x)), 'the audit refuses an ungated draw'); }
  // run ops and req.mascot on events
  const ev = (over) => Object.assign({ title: 'Stray', art: { scene: 'event' }, text: 'A stray sits at the stop and looks at the bus with the confidence of a creature that has already decided.', choices: [{ label: 'Adopt', req: { mascot: false }, out: [{ w: 1, text: 'Yes.', ops: [{ op: 'adoptMascot', id: 'mascot_pug' }] }] }, { label: 'Feed', req: { mascot: true }, out: [{ w: 1, text: 'Munch.', ops: [{ op: 'mascotXp', n: 2 }] }] }, { label: 'Go', out: [{ w: 1, text: 'Bye.' }] }] }, over || {});
  const evErrs = (over, strict) => { const D = fresh(); D.add('events', { ev_stray: ev(over) }); return D.validate('events', strict ? { strict: true } : undefined).errors; };
  t.eq(evErrs().length, 0, 'the mascot event shape passes: ' + evErrs().join('; '));
  t.ok(has(evErrs({ choices: [{ label: 'A', req: { mascot: 'yes' }, out: [{ w: 1, text: 'x' }] }, { label: 'B', out: [{ w: 1, text: 'y' }] }] }), 'req.mascot must be a boolean'), 'req.mascot takes a boolean');
  t.ok(has(evErrs({ choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops: [{ op: 'adoptMascot' }] }] }, { label: 'B', out: [{ w: 1, text: 'y' }] }] }), 'adoptMascot needs a mascot id'), 'adoptMascot needs an id');
  t.ok(has(evErrs({ choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops: [{ op: 'mascotXp', n: 0 }] }] }, { label: 'B', out: [{ w: 1, text: 'y' }] }] }), 'mascotXp needs n 1..12'), 'mascotXp needs a positive n');
  t.ok(has(evErrs({ choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops: [{ op: 'adoptMascot', id: 'mascot_pug', n: 2 }] }] }, { label: 'B', out: [{ w: 1, text: 'y' }] }] }), 'unknown field "n" for adoptMascot'), 'adoptMascot takes only id');
  { const D = fresh(); D.add('events', { ev_stray: ev({ choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops: [{ op: 'adoptMascot', id: 'mascot_ghost' }] }] }, { label: 'B', out: [{ w: 1, text: 'y' }] }] }) }); t.ok(has(D.validate(undefined, { strict: true }).errors, 'adoptMascot: unknown mascot "mascot_ghost"'), 'strict mode checks the mascot id'); t.eq(D.validate('events').errors.length, 0, 'lenient mode does not'); }
});

// ================================================================================================ helpers
t.test('helpers: mascotLevel thresholds, mascotNext, activeMascotTiers stacking, modsFor and rowFor folding, progress and label', () => {
  t.deep([0, 1, 4, 5, 6, 11, 12, 13, 99].map((xp) => DATA.mascotLevel(xp)), [1, 1, 1, 2, 2, 2, 3, 3, 3], 'level 1 at 0, 2 at 5, 3 at 12');
  t.eq(DATA.mascotLevel(undefined), 1, 'no xp is level 1'); t.eq(DATA.mascotLevel(NaN), 1, 'junk is level 1'); t.eq(DATA.mascotMax(), 3, 'three levels');
  t.deep([0, 3, 5, 9, 12, 40].map((xp) => DATA.mascotNext(xp)), [5, 2, 7, 3, 0, 0], 'XP to the next level, 0 at the top');
  t.deep(DATA.activeMascotTiers(null), [], 'no mascot: no tiers'); t.deep(DATA.activeMascotTiers(undefined), [], 'undefined: no tiers'); t.deep(DATA.activeMascotTiers({ id: 'mascot_ghost', xp: 20 }), [], 'unknown id: no tiers');
  const tiers = (xp) => DATA.activeMascotTiers({ id: 'mascot_fox', xp }).map((x) => x.mascot + ':' + x.level);
  t.deep(tiers(0), ['mascot_fox:1'], 'level 1 alone'); t.deep(tiers(5), ['mascot_fox:1', 'mascot_fox:2'], 'levels stack'); t.deep(tiers(12), ['mascot_fox:1', 'mascot_fox:2', 'mascot_fox:3'], 'all three at 12');
  const tr = DATA.activeMascotTiers({ id: 'mascot_fox', xp: 5 })[1];
  t.eq(tr.name, 'Merch Fox', 'the tier carries the name'); t.eq(tr.def, DATA.mascots.mascot_fox.levels[2], 'and the level def');
  // folding: the fox is money, the goose is rows
  const base = DATA.modsFor([], 0);
  t.near(DATA.modsFor([], 0, { id: 'mascot_fox', xp: 0 }).priceMul, 0.9, 1e-9, 'Merch Fox 1: prices 10% lower'); t.near(DATA.modsFor([], 0, { id: 'mascot_fox', xp: 0 }).goldMul, 1, 1e-9, 'level 3 not yet');
  t.near(DATA.modsFor([], 0, { id: 'mascot_fox', xp: 12 }).goldMul, 1.2, 1e-9, 'Merch Fox 3: gold 20% higher'); t.near(DATA.modsFor([], 0, { id: 'mascot_fox', xp: 12 }).priceMul, 0.9, 1e-9, 'and level 1 still counts');
  t.deep(DATA.modsFor([], 0, null), base, 'null mascot changes nothing'); t.deep(DATA.modsFor([], 0), base, 'the third argument is optional');
  t.near(DATA.modsFor(['gaffer_tape'], 2, { id: 'mascot_fox', xp: 0 }).priceMul, DATA.modsFor(['gaffer_tape'], 2).priceMul - 0.1, 1e-9, 'folds on top of Charms and the Encore');
  const kuroFront = DATA.rowFor('kuro', 'front', []), kuroBack = DATA.rowFor('kuro', 'back', []);
  t.eq(DATA.rowFor('kuro', 'front', [], { id: 'mascot_goose', xp: 0 }).thorns, (kuroFront.thorns || 0) + 1, 'Stage Goose 1: lead spot Feedback 1');
  t.eq(DATA.rowFor('kuro', 'back', [], { id: 'mascot_goose', xp: 0 }).startBlock || 0, kuroBack.startBlock || 0, 'level 2 not yet');
  t.eq(DATA.rowFor('kuro', 'back', [], { id: 'mascot_goose', xp: 5 }).startBlock, (kuroBack.startBlock || 0) + 2, 'Stage Goose 2: backing spot Block 2');
  t.eq(DATA.rowFor('hanae', 'front', [], { id: 'mascot_pug', xp: 5 }).dmgAdd, (DATA.rowFor('hanae', 'front', []).dmgAdd || 0) + 1, 'Beatbox Pug 2: lead spot damage 1');
  t.deep(DATA.rowFor('hanae', 'front', [], null), DATA.rowFor('hanae', 'front', []), 'null mascot: the hero row alone');
  // progress and label (what the Charms overlay and the toasts print)
  const p = DATA.mascotProgress({ id: 'mascot_pug', xp: 7 });
  t.deep({ id: p.id, name: p.name, xp: p.xp, level: p.level, max: p.max, next: p.next, lit: p.levels.map((x) => x.active), at: p.levels.map((x) => x.at), texts: p.levels.map((x) => x.text) }, { id: 'mascot_pug', name: 'Beatbox Pug', xp: 7, level: 2, max: 3, next: 5, lit: [true, true, false], at: [0, 5, 12], texts: [1, 2, 3].map((n) => DATA.mascots.mascot_pug.levels[n].text) }, 'mascotProgress');
  t.eq(p.blurb, DATA.mascots.mascot_pug.blurb, 'with the blurb'); t.eq(p.art, DATA.mascots.mascot_pug.art, 'and the art');
  t.eq(DATA.mascotProgress(null), null, 'no mascot: null'); t.eq(DATA.mascotProgress({ id: 'nope', xp: 1 }), null, 'unknown: null');
  t.eq(DATA.mascotLabel('mascot_pug', 2), 'Beatbox Pug 2 of 3: ' + DATA.mascots.mascot_pug.levels[2].text, 'the toast line'); t.eq(DATA.mascotLabel('mascot_pug', 9), '', 'no such level'); t.eq(DATA.mascotLabel('nope', 1), '', 'no such mascot');
});

// ================================================================================================ run
t.test('run: adoption, XP, levels, R.log notes, mods fold, run hooks fire after the set tiers', () => {
  const R = NEW();
  t.eq(R.mascot, null, 'a new tour has no mascot');
  t.deep(RUN.mascotXp(R, 3), { level: 0, leveled: false, xp: 0, log: [] }, 'feeding nobody does nothing');
  t.eq(R.mascot, null, 'still none');
  t.deep(RUN.adoptMascot(R, 'mascot_ghost'), { ok: false, reason: 'unknown', log: [], pending: [] }, 'unknown stray');
  const a = RUN.adoptMascot(R, 'mascot_fox');
  t.deep({ ok: a.ok, id: a.id, level: a.level, pending: a.pending }, { ok: true, id: 'mascot_fox', level: 1, pending: [] }, 'adopted at level 1');
  t.deep(a.log, [{ op: 'mascot', id: 'mascot_fox', level: 1, text: DATA.mascotLabel('mascot_fox', 1) }], 'the level 1 line');
  t.deep(R.mascot, { id: 'mascot_fox', xp: 0 }, 'R.mascot');
  t.ok(R.log.some((l) => l.mascot === 'mascot_fox' && l.level === 1 && /Merch Fox joins/.test(l.msg)), 'R.log notes the adoption');
  t.deep(RUN.adoptMascot(R, 'mascot_pug'), { ok: false, reason: 'owned', log: [], pending: [] }, 'one mascot per tour');
  t.eq(R.mascot.id, 'mascot_fox', 'the fox stays');
  t.near(RUN.mods(R).priceMul, 0.9, 1e-9, 'RUN.mods folds level 1');
  let x = RUN.mascotXp(R, 2);
  t.deep({ level: x.level, leveled: x.leveled, xp: x.xp, log: x.log }, { level: 1, leveled: false, xp: 2, log: [] }, '2 XP: still level 1');
  x = RUN.mascotXp(R, 3);
  t.deep({ level: x.level, leveled: x.leveled, xp: x.xp }, { level: 2, leveled: true, xp: 5 }, '5 XP: level 2');
  t.deep(x.log, [{ op: 'mascot', id: 'mascot_fox', level: 2, text: DATA.mascotLabel('mascot_fox', 2) }], 'one line for the level');
  t.ok(R.log.some((l) => l.mascot === 'mascot_fox' && l.level === 2 && /grew to level 2/.test(l.msg)), 'R.log notes the level');
  x = RUN.mascotXp(R, 20);
  t.deep({ level: x.level, leveled: x.leveled, xp: x.xp, levels: x.log.map((l) => l.level) }, { level: 3, leveled: true, xp: 25, levels: [3] }, 'a big meal tops out at 3');
  t.near(RUN.mods(R).goldMul, 1.2, 1e-9, 'RUN.mods folds level 3');
  t.deep(RUN.mascotXp(R, 1), { level: 3, leveled: false, xp: 26, log: [] }, 'past the top: no more levels');
  // two levels at once
  const R2 = NEW({ seed: 12 });
  RUN.adoptMascot(R2, 'mascot_hamster');
  const big = RUN.mascotXp(R2, 12);
  t.deep({ level: big.level, leveled: big.leveled, levels: big.log.map((l) => l.level) }, { level: 3, leveled: true, levels: [2, 3] }, '0 to 12 XP lights levels 2 and 3, one line each');
  t.deep(RUN.mascotXp(R2, -5), { level: 3, leveled: false, xp: 12, log: [] }, 'negative or junk XP never takes anything away');
  // run hooks through RUN.hook: Tour Bus Hamster 1 (heal 3 both on rest) and 2 (15 gold on rest), 3 (act start: 2 Vox and 20 gold)
  R2.heroes.forEach((h) => { h.hp = h.maxHp - 10; });
  const gold0 = R2.gold;
  const rest = RUN.hook(R2, 'onRest', {});
  t.ok(R2.heroes.every((h) => h.hp === h.maxHp - 7), 'both heroes healed 3 on rest (healMul 1)');
  t.eq(R2.gold, gold0 + 15, '15 gold on rest');
  t.deep(rest.log.filter((l) => l.op === 'mascot').map((l) => l.level + ':' + l.hook), ['1:onRest', '2:onRest'], 'the hook log names the mascot levels');
  t.ok(rest.log.filter((l) => l.op === 'mascot').every((l) => l.id === 'mascot_hamster' && l.text === ''), 'silent header lines with the id');
  const gold1 = R2.gold;
  const ch = RUN.startChapter(R2, 2);
  t.eq(R2.gold, gold1 + 20, 'act start: 20 gold'); t.eq(R2.ink, Math.min(R2.inkMax, RUN.mods(R2).startInk + 2), 'and 2 Vox on top of the act top-up');
  t.ok(ch.log.some((l) => l.op === 'mascot' && l.level === 3 && l.hook === 'onChapterStart'), 'logged as a mascot hook');
  // order: a set tier's run hook fires before the mascot's (merch 4: 25 gold at act start)
  const R3 = NEW({ seed: 13 });
  RUN.adoptMascot(R3, 'mascot_hamster'); RUN.mascotXp(R3, 12);
  DATA.setMembers('merch').slice(0, 4).forEach((id) => { R3.relics.push(id); });
  const ops = RUN.startChapter(R3, 2).log.filter((l) => l.op === 'set' || l.op === 'mascot').map((l) => l.op);
  t.deep(ops, ['set', 'mascot'], 'set tier hooks first, then the mascot');
});

t.test('combatDone: the fight tier feeds the mascot before the mods and hooks, level-up lines lead the reward log, Rewards keeps its fields, a loss feeds nothing', () => {
  const R = NEW({ seed: 21 });
  RUN.adoptMascot(R, 'mascot_fox');
  fightNode(R, 'normal');
  let rw = RUN.combatDone(R, fakeC(R, { tier: 'normal' }));
  t.deep(Object.keys(rw).sort(), ['boss', 'brush', 'cards', 'claimed', 'gems', 'gold', 'goldBase', 'ink', 'log', 'maxHp', 'medley', 'pending', 'relics', 'source', 'tier'], 'Rewards fields unchanged');
  t.eq(R.mascot.xp, 1, 'a creature fight: 1 XP'); t.eq(rw.log.filter((l) => l.op === 'mascot').length, 0, 'no level line yet');
  RUN.finishNode(R);
  fightNode(R, 'elite');
  rw = RUN.combatDone(R, fakeC(R, { tier: 'elite' }));
  t.eq(R.mascot.xp, 3, 'a rival: 2 XP');
  RUN.finishNode(R);
  fightNode(R, 'elite');
  rw = RUN.combatDone(R, fakeC(R, { tier: 'elite' }));
  t.eq(R.mascot.xp, 5, 'level 2 reached'); t.eq(DATA.mascotLevel(R.mascot.xp), 2, 'at 5 XP');
  t.deep(rw.log[0], { op: 'mascot', id: 'mascot_fox', level: 2, text: DATA.mascotLabel('mascot_fox', 2) }, 'the level-up line leads Rewards.log');
  t.ok(R.log.some((l) => l.mascot === 'mascot_fox' && l.level === 2), 'and R.log notes it');
  t.eq(RUN.combatDone(R, fakeC(R, { tier: 'elite' })), rw, 'a repeat call changes nothing'); t.eq(R.mascot.xp, 5, 'no double XP');
  RUN.finishNode(R);
  // the boss: 3 XP, and a level that switches on counts for THIS fight's gold (Merch Fox 3: gold 20% higher)
  R.mascot.xp = 9;
  fightNode(R, 'boss');
  const goldBefore = R.gold;
  rw = RUN.combatDone(R, fakeC(R, { tier: 'boss' }));
  t.eq(R.mascot.xp, 12, 'a headliner: 3 XP'); t.eq(rw.log[0].level, 3, 'level 3 line first');
  const gr = U.rng(U.hash(R.seed, 'reward', R.chapter, R.node.tile.q, R.node.tile.r, 'gold'));
  const rolled = gr.int(E.gold.boss[0], E.gold.boss[1]);
  t.eq(rw.goldBase, Math.round(rolled * 1.2), 'the boss gold already carries the new level\'s goldMul'); t.eq(R.gold - goldBefore, rw.gold, 'and the ledger agrees');
  // a lost fight feeds nothing
  const L2 = NEW({ seed: 22 });
  RUN.adoptMascot(L2, 'mascot_pug');
  fightNode(L2, 'elite');
  t.eq(RUN.combatDone(L2, fakeC(L2, { result: 'lose' })), null, 'the loss');
  t.eq(L2.mascot.xp, 0, 'no XP for a loss'); t.eq(L2.done, true, 'the tour ends');
  // no mascot: nothing happens and no mascot line
  const N = NEW({ seed: 23 });
  fightNode(N, 'boss');
  const rwN = RUN.combatDone(N, fakeC(N, { tier: 'boss' }));
  t.eq(N.mascot, null, 'still none'); t.eq(rwN.log.filter((l) => l.op === 'mascot').length, 0, 'no mascot line');
});

// ================================================================================================ combat
t.test('combat: combatInit passes the mascot, C.mascot echoes {id, level}, hooks register with src mascot, rows and combatStart bonuses land, determinism', () => {
  const R = NEW({ seed: 31 });
  fightNode(R, 'normal');
  t.eq(RUN.combatInit(R).mascot, null, 'no mascot: null');
  RUN.adoptMascot(R, 'mascot_goose'); RUN.mascotXp(R, 5);
  const opts = RUN.combatInit(R);
  t.deep(opts.mascot, { id: 'mascot_goose', xp: 5 }, 'combatInit passes {id, xp}');
  opts.mascot.xp = 99; t.eq(R.mascot.xp, 5, 'a copy, not the live object');
  const with_ = COMBAT.create(Object.assign({}, opts, { mascot: { id: 'mascot_goose', xp: 5 } })), without = COMBAT.create(Object.assign({}, opts, { mascot: null }));
  t.deep(with_.mascot, { id: 'mascot_goose', level: 2 }, 'C.mascot echoes id and level'); t.eq(without.mascot, null, 'C.mascot null without one');
  t.eq(COMBAT.create(Object.assign({}, opts, { mascot: { id: 'mascot_ghost', xp: 3 } })).mascot, null, 'an unknown id is no mascot');
  t.eq(COMBAT.create(Object.assign({}, opts, { mascot: 'mascot_goose' })).mascot, null, 'a bare string is no mascot');
  with_.start(); without.start();
  const back = (C) => C.heroes.find((h) => h.row === 'back'), front = (C) => C.heroes.find((h) => h.row === 'front');
  t.eq(back(with_).block, back(without).block + 2, 'Stage Goose 2: the backing hero starts each turn with 2 more Block (rowB includes the mascot rows)');
  t.eq((front(with_).rowSt && front(with_).rowSt.thorns) || 0, ((front(without).rowSt && front(without).rowSt.thorns) || 0) + 1, 'Stage Goose 1: the lead spot carries 1 Feedback');
  // hooks: Karaoke Parrot at level 3 has two combatStart hooks (Muffled 1 on all, Tag 1 on all) and an onShuffle hook; all src 'mascot'
  const P = COMBAT.create(Object.assign({}, opts, { mascot: { id: 'mascot_parrot', xp: 12 } }));
  const mh = P._hooks.filter((h) => h.src === 'mascot');
  t.deep(mh.map((h) => h.srcId + '/' + h.on), ['mascot_parrot:1/combatStart', 'mascot_parrot:2/onShuffle', 'mascot_parrot:3/combatStart'], 'the three levels register in level order after the Charm hooks');
  t.ok(mh.every((h) => h.owner === null && h.active), 'party hooks, active');
  const setIdx = P._hooks.findIndex((h) => h.src === 'set'), lastRelic = P._hooks.map((h) => h.src).lastIndexOf('relic');
  t.ok(P._hooks.findIndex((h) => h.src === 'mascot') > Math.max(setIdx, lastRelic), 'after the Charm and set hooks');
  P.start();
  t.ok(P.enemies.every((e) => e.st.weak === 1 && e.st.mark === 1), 'Karaoke Parrot 1 and 3: every enemy starts Muffled 1 and Tag 1');
  t.eq(P.events.filter((e) => e.type === 'relic').length, P.events.filter((e) => e.type === 'relic' && e.id && DATA.relics[e.id]).length, 'no `relic` event names a mascot');
  t.eq(COMBAT.create(Object.assign({}, opts, { mascot: { id: 'mascot_parrot', xp: 0 } }))._hooks.filter((h) => h.src === 'mascot').length, 1, 'level 1 alone registers one hook');
  t.eq(COMBAT.create(Object.assign({}, opts, { mascot: null }))._hooks.filter((h) => h.src === 'mascot').length, 0, 'no mascot, no mascot hooks');
  // determinism: the same opts give the same fight
  const a = COMBAT.simulate(Object.assign({}, opts, { mascot: { id: 'mascot_pug', xp: 12 } })), b = COMBAT.simulate(Object.assign({}, opts, { mascot: { id: 'mascot_pug', xp: 12 } }));
  t.eq(J(a), J(b), 'two simulations with the same mascot agree');
  t.ok(a.result === 'win' || a.result === 'lose', 'and the fight finishes: ' + a.result);
  t.deep(Object.keys(a.C.summary()).sort(), Object.keys(without.summary()).sort(), 'C.summary() is unchanged by the mascot');
});

// ================================================================================================ adoption
t.test('adoption: the Detour stray_at_the_bus_stop, req.mascot visibility, eventChoose adopts, all six reachable, seeded, dead reasons', () => {
  const ev = DATA.events.stray_at_the_bus_stop;
  t.ok(!!ev, 'the Detour exists');
  t.eq(ev.once, true, 'once per tour'); t.eq(ev.chapters, undefined, 'any act'); t.ok(ev.w >= 10, 'heavily weighted (' + ev.w + ')');
  const calls = ev.choices.filter((c) => c.req && c.req.mascot === false);
  t.eq(calls.length, 3, 'three calls'); t.eq(ev.choices.length, 4, 'plus the drive on');
  const safe = ev.choices.find((c) => !c.req);
  t.ok(safe && !safe.cost && safe.out.every((o) => !(o.ops || []).length), 'the drive on is free and does nothing');
  const offered = calls.flatMap((c) => c.out.map((o) => o.ops[0])).map((o) => o.op + ':' + o.id);
  t.deep(offered.sort(), IDS.map((id) => 'adoptMascot:' + id).sort(), 'every call adopts, and the six outcomes cover the six mascots');
  calls.forEach((c, i) => t.ok(c.out.every((o) => o.ops.length === 1), `call ${i} does nothing but adopt`));
  // visibility
  const R = NEW({ seed: 41 });
  let rows = RUN.eventChoices(R, 'stray_at_the_bus_stop');
  t.deep(rows.map((r) => r.ok + '/' + r.hidden), ['true/false', 'true/false', 'true/false', 'true/false'], 'no mascot: all four open');
  RUN.adoptMascot(R, 'mascot_cat');
  rows = RUN.eventChoices(R, 'stray_at_the_bus_stop');
  t.deep(rows.map((r) => r.ok + '/' + r.hidden), ['false/true', 'false/true', 'false/true', 'true/false'], 'with a mascot: the calls hide, the drive on stays');
  t.ok(rows.slice(0, 3).every((r) => r.reason === 'mascot'), 'reason mascot');
  // req.mascot true works the other way, and a mascotXp choice is locked (dead) without a mascot
  const fake = { id: 'ev_feed', title: 'Feed', art: { scene: 'event' }, text: 'x'.repeat(60), choices: [{ label: 'Feed it', req: { mascot: true }, out: [{ w: 1, text: 'Munch.', ops: [{ op: 'mascotXp', n: 2 }] }] }, { label: 'Feed anyway', out: [{ w: 1, text: 'Munch.', ops: [{ op: 'mascotXp', n: 2 }] }] }, { label: 'Go', out: [{ w: 1, text: 'Bye.' }] }] };
  const N = NEW({ seed: 42 });
  rows = RUN.eventChoices(N, fake);
  t.deep(rows.map((r) => r.ok + '/' + r.hidden + '/' + r.reason), ['false/true/mascot', 'false/false/No mascot to feed', 'true/false/null'], 'no mascot: req.mascot true hides, a bare mascotXp choice is locked with its reason');
  rows = RUN.eventChoices(R, fake);
  t.deep(rows.map((r) => r.ok + '/' + r.hidden), ['true/false', 'true/false', 'true/false'], 'with a mascot: all open');
  // eventChoose on the real map: step onto a Detour tile that holds the stray
  const W = NEW({ seed: 43 });
  const node = enter(W, 'event', (tile) => { tile.content = { id: 'stray_at_the_bus_stop' }; });
  t.ok(node && node.kind === 'event' && node.event === 'stray_at_the_bus_stop', 'the Detour opens: ' + J(node && node.kind));
  const res = RUN.eventChoose(W, 'stray_at_the_bus_stop', 0);
  t.ok(res.ok, 'the whistle works');
  t.ok(W.mascot && (W.mascot.id === 'mascot_pug' || W.mascot.id === 'mascot_cat') && W.mascot.xp === 0, 'a pug or a cat boards at level 1: ' + J(W.mascot));
  t.ok(res.applied.some((l) => l.op === 'adoptMascot' && l.id === W.mascot.id && /hops aboard/.test(l.text)), 'the applied log says who');
  t.ok(res.applied.some((l) => l.op === 'mascot' && l.level === 1), 'and carries the level 1 line for the toast');
  t.ok(W.seen.events.indexOf('stray_at_the_bus_stop') >= 0, 'seen, so never again');
  t.eq(RUN.pickEvent(W, { q: 0, r: 0 }) === 'stray_at_the_bus_stop', false, 'pickEvent never offers it twice');
  // the same tile gives the same stray: replay from the save taken at the node
  const W2 = NEW({ seed: 43 });
  enter(W2, 'event', (tile) => { tile.content = { id: 'stray_at_the_bus_stop' }; });
  RUN.eventChoose(W2, 'stray_at_the_bus_stop', 0);
  t.eq(W2.mascot.id, W.mascot.id, 'seeded by the tile');
  // every call, over seeds, reaches both of its strays
  const got = {};
  for (let s = 0; s < 40; s++) {
    const X = NEW({ seed: 100 + s });
    enter(X, 'event', (tile) => { tile.content = { id: 'stray_at_the_bus_stop' }; });
    RUN.eventChoose(X, 'stray_at_the_bus_stop', s % 3);
    if (X.mascot) got[X.mascot.id] = (got[X.mascot.id] || 0) + 1;
  }
  t.deep(Object.keys(got).sort(), IDS.slice().sort(), 'all six mascots show up across seeds: ' + J(got));
  // a second adoption through the op changes nothing and says so
  const out = RUN.applyOps(W, [{ op: 'adoptMascot', id: 'mascot_goose' }], { key: 'test' });
  t.eq(W.mascot.id === 'mascot_goose', false, 'the first stray stays'); t.ok(/already has a mascot/.test(out.log[0].text), 'and the log says so');
  const fed = RUN.applyOps(W, [{ op: 'mascotXp', n: 5 }], { key: 'test2' });
  t.eq(W.mascot.xp, 5, 'the mascotXp op feeds'); t.deep(fed.log.map((l) => l.op), ['mascotXp', 'mascot'], 'its log: the meal, then the level line');
  t.deep(RUN.applyOps(NEW({ seed: 44 }), [{ op: 'mascotXp', n: 2 }], { key: 'test3' }).log, [{ op: 'mascotXp', n: 2, text: 'No mascot to feed.' }], 'feeding nobody');
  // the weight: in Act I the stray wins a good share of first Detour picks
  let wins = 0;
  for (let s = 0; s < 120; s++) { const X = NEW({ seed: 500 + s }); if (RUN.pickEvent(X, { q: 3, r: 4 }) === 'stray_at_the_bus_stop') wins++; }
  t.ok(wins >= 24, `the stray is the first Detour of at least a fifth of tours (${wins} of 120)`);
});

// ================================================================================================ snack
t.test('snack: the Merch Stall stocks one Snack while the bus has a mascot, shopBuy feeds it, sold once, absent and refused without one', () => {
  const B = NEW({ seed: 51 });
  const bare = enter(B, 'shop');
  t.ok(bare && bare.kind === 'shop', 'a stall without a mascot');
  t.eq(bare.stock.items.filter((x) => x.kind === 'snack').length, 0, 'no Snack without a mascot');
  const fakeStock = { items: [{ key: 's0', kind: 'snack', id: 'snack', price: 35, sale: false, sold: false }], removePrice: 75 };
  t.deep(RUN.shopBuy(B, fakeStock, 's0'), { ok: false, reason: 'mascot' }, 'a Snack cannot be bought without a mascot');
  const R = NEW({ seed: 51 });   // the same seed: the same stall, the same stock seed, so the two stocks compare
  RUN.adoptMascot(R, 'mascot_fox');
  R.gold = 200;
  const shop = enter(R, 'shop');
  t.ok(shop && shop.kind === 'shop', 'a stall with a mascot');
  const snacks = shop.stock.items.filter((x) => x.kind === 'snack');
  t.eq(snacks.length, 1, 'exactly one Snack');
  const sn = snacks[0];
  t.deep({ key: sn.key, id: sn.id, sale: sn.sale, sold: sn.sold }, { key: 's0', id: 'snack', sale: false, sold: false }, 'the Snack item');
  t.eq(sn.price, Math.max(1, Math.round(E.price.snack * RUN.mods(R).priceMul)), 'priced at ECONOMY.price.snack times priceMul (the fox makes it ' + sn.price + ')');
  t.eq(shop.stock.items.filter((x) => x.kind !== 'snack').length, bare.stock.items.length, 'the rest of the stock is the usual size');
  const gold0 = R.gold, bought0 = R.stats.purchases;
  const buy = RUN.shopBuy(R, shop.stock, 's0');
  t.eq(buy.ok, true, 'bought'); t.eq(R.gold, gold0 - sn.price, 'paid'); t.eq(R.stats.purchases, bought0 + 1, 'counted as a purchase');
  t.eq(R.mascot.xp, 2, 'the mascot gains ECONOMY.snackXp'); t.eq(sn.sold, true, 'sold');
  t.deep(buy.log.map((l) => l.op), ['mascotXp'], 'the buy log: the meal'); t.deep({ id: buy.log[0].id, n: buy.log[0].n, xp: buy.log[0].xp, level: buy.log[0].level, leveled: buy.log[0].leveled }, { id: 'mascot_fox', n: 2, xp: 2, level: 1, leveled: false }, 'with the numbers');
  t.deep(RUN.shopBuy(R, shop.stock, 's0'), { ok: false, reason: 'sold' }, 'one per stall');
  // a Snack that levels the mascot logs the level line too
  R.mascot.xp = 3;
  sn.sold = false;
  const up = RUN.shopBuy(R, shop.stock, 's0');
  t.deep(up.log.map((l) => l.op + ':' + (l.level || '')), ['mascotXp:2', 'mascot:2'], 'the meal (its level is the new one), then the level 2 line');
  t.eq(up.log[0].leveled, true, 'leveled');
  R.gold = 0; sn.sold = false;
  t.deep(RUN.shopBuy(R, shop.stock, 's0'), { ok: false, reason: 'gold' }, 'needs the gold');
  // the stock is seeded: a reload at the stall offers the same Snack
  const snap = JSON.parse(J(RUN.serialize(R)));
  const back = RUN.deserialize(snap);
  t.eq(J(back.node.stock.items.filter((x) => x.kind === 'snack')), J(R.node.stock.items.filter((x) => x.kind === 'snack')), 'the Snack survives a save');
});

// ================================================================================================ saves
t.test('saves: serialize carries R.mascot, round trip, old saves without the field, junk and unknown ids load as no mascot', () => {
  const R = NEW({ seed: 61 });
  RUN.adoptMascot(R, 'mascot_parrot'); RUN.mascotXp(R, 7);
  const o = RUN.serialize(R);
  t.deep(o.mascot, { id: 'mascot_parrot', xp: 7 }, 'serialize carries it');
  const back = RUN.deserialize(JSON.parse(J(o)));
  t.deep(back.mascot, { id: 'mascot_parrot', xp: 7 }, 'round trip');
  t.eq(J(RUN.serialize(back)), J(o), 'serialize(deserialize(x)) is x');
  t.near(RUN.mods(back).goldMul, RUN.mods(R).goldMul, 1e-9, 'the loaded tour has the same mods');
  t.deep(RUN.combatInit(Object.assign(back, { node: fightNode(back, 'normal') })).mascot, { id: 'mascot_parrot', xp: 7 }, 'and passes the mascot to combat');
  // an old save: no field at all
  const old = JSON.parse(J(RUN.serialize(NEW({ seed: 62 }))));
  delete old.mascot;
  const o2 = RUN.deserialize(old);
  t.ok(o2 && o2.mascot === null, 'an old save loads with no mascot');
  t.eq(RUN.combatInit(Object.assign(o2, { node: fightNode(o2, 'normal') })).mascot, null, 'combatInit passes null');
  t.deep(RUN.mascotXp(o2, 3), { level: 0, leveled: false, xp: 0, log: [] }, 'and feeding does nothing');
  ['junk', 7, [], { id: 'mascot_ghost', xp: 3 }, { id: 'mascot_pug' }, { id: 'mascot_pug', xp: 'lots' }, { id: 'mascot_pug', xp: -4 }, { id: 'mascot_pug', xp: 2.7 }].forEach((m) => {
    const s = JSON.parse(J(RUN.serialize(NEW({ seed: 63 }))));
    s.mascot = m;
    const r = RUN.deserialize(s);
    const want = m && typeof m === 'object' && !Array.isArray(m) && DATA.mascots[m.id] ? { id: m.id, xp: typeof m.xp === 'number' ? Math.max(0, Math.floor(m.xp)) : 0 } : null;
    t.deep(r.mascot, want, `a saved mascot of ${J(m)} loads as ${J(want)}`);
  });
  // old saves stay deterministic with the field absent: RUN.summary and score ignore it
  const S = NEW({ seed: 64 });
  const sum0 = J(RUN.summary(S)), score0 = RUN.score(S);
  RUN.adoptMascot(S, 'mascot_pug');
  t.eq(J(RUN.summary(S)), sum0, 'RUN.summary is unchanged by a mascot'); t.eq(RUN.score(S), score0, 'RUN.score too');
});

t.done();
