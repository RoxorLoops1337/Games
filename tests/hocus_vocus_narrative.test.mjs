// NARRATIVE: the fables (data_events.js) and the meta content (data_meta.js): achievements, Tempo Trials, tips, lore and barks.
//
// Three layers, each honest about what it can and cannot see:
//   1. STRUCTURE   what DATA.validate and DATA.audit assert, repeated here so a regression names this suite, plus every rule of
//                  CONTENT_SPEC 6 that the validator cannot express (safe choice, `once` only for lasting change, fixed ids only,
//                  fights only from the event's own chapter, no dead or unreachable flags, run-op and req coverage, text hygiene).
//   2. MEANING     the Tempo Trial staircase gets a difficulty score and must never drop; every trial's text must quote its own numbers;
//                  achievements must read stats that COMBAT, RUN or META really write; barks must sound like their hero.
//   3. INTEGRATION when the real RUN, MAP and META exist (they do once their files are written) every outcome of every choice is
//                  replayed through RUN.applyOps, every fable is proven reachable through RUN.pickEvent, and every achievement is
//                  unlocked through META.check. When a peer module is missing the layer says so and skips, it never fails for it.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus narrative');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const G = boot({ only: ['data_events', 'data_meta', 'run', 'meta'], continue: true });
const { DATA, U, RUN, META } = G;
const haveRun = !!(RUN && G.MAP && RUN.applyOps && RUN.pickEvent);
const haveMeta = !!(META && META.check);
const L = DATA.LISTS;
const A = (v) => (Array.isArray(v) ? v : []);
const ASCII = /^[\x20-\x7e]*$/;
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');

const evs = Object.values(DATA.events);
const achs = Object.values(DATA.achievements);
const trials = Object.values(DATA.trials).sort((a, b) => a.level - b.level);
const lore = Object.values(DATA.lore);
const barks = lore.filter((l) => /^barks_/.test(l.id));
const stories = lore.filter((l) => !/^barks_/.test(l.id));
const outcomes = (e) => evs.length && e.choices.flatMap((c) => c.out);
const opsOf = (e) => e.choices.flatMap((c) => c.out.flatMap((o) => A(o.ops)));
const walkRun = (fn) => evs.forEach((e) => e.choices.forEach((c, ci) => c.out.forEach((o, oi) => A(o.ops).forEach((x) => fn(x, e, c, o, { ci, oi })))));
const isRisky = (o) => A(o.ops).some((x) => ['hurt', 'addCurse', 'fight'].indexOf(x.op) >= 0 || ((x.op === 'gold' || x.op === 'maxHp') && x.n < 0));
const isSafe = (c) => !c.cost && !c.out.some(isRisky);
const goldDelta = (o) => A(o.ops).reduce((s, x) => s + (x.op === 'gold' && x.n !== undefined ? x.n : 0), 0);
const chapterOf = (e) => (e.chapters && e.chapters.length === 1 ? e.chapters[0] : 0);

// =================================================================================================== 1. structure: events
t.test('both files loaded and every registry validates with no errors and no warnings', () => {
  t.eq(A(G._errors).filter((e) => /data_(events|meta)/.test(e.file)).length, 0, 'data_events.js and data_meta.js load');
  ['events', 'achievements', 'trials', 'tips', 'lore'].forEach((k) => {
    const v = DATA.validate(k);
    t.deep(v.errors, [], `${k} has zero validation errors`);
    t.deep(v.warnings, [], `${k} has zero validation warnings`);
  });
  t.deep(DATA.audit('events'), [], 'events audit is clean');
  t.deep(DATA.audit('meta'), [], 'meta audit is clean');
});

t.test('strict validation finds nothing wrong with our content (peer files that are not written yet are skipped, not failed)', () => {
  const mine = /^(event |achievement |trial |lore |tips\[|fixed: achievement|fixed: lore|hero \w+: unlock achievement)/;
  const peer = /unknown (relic|gem|card|curse)|relic unknown|curses mod needs the curse_/;
  const errs = DATA.validate(undefined, { strict: true }).errors.filter((e) => mine.test(e));
  const real = errs.filter((e) => {
    if (!peer.test(e)) return true;
    if (/curses mod needs/.test(e)) return !!DATA.cards.curse_regret;        // the curse cards are a peer file: once it exists the mod must resolve
    const id = (/"([a-z_0-9]+)"/.exec(e) || [])[1];
    return !!(DATA.relics[id] || DATA.gems[id] || DATA.cards[id]);          // the peer wrote it, so the reference must resolve
  });
  t.deep(real, [], 'no strict errors that are ours');
});

t.test('event counts: 10 per chapter and 10 for any chapter at least, ids unique and snake_case', () => {
  t.ok(evs.length >= 40, `at least 40 fables (have ${evs.length})`);
  [1, 2, 3].forEach((ch) => t.ok(evs.filter((e) => chapterOf(e) === ch).length >= 10, `chapter ${ch} has at least 10 fables`));
  t.ok(evs.filter((e) => !e.chapters).length >= 10, 'at least 10 fables for any chapter');
  t.ok(evs.every((e) => e.chapters === undefined || e.chapters.length === 1), 'chapter fables belong to exactly one chapter');
  t.eq(new Set(evs.map((e) => e.title)).size, evs.length, 'titles are unique');
  t.eq(new Set(evs.map((e) => e.text)).size, evs.length, 'texts are unique');
  t.ok(evs.every((e) => /^[a-z][a-z0-9_]*$/.test(e.id) && e.id === Object.keys(DATA.events).find((k) => DATA.events[k] === e)), 'ids are snake_case and match their keys');
});

t.test('every event has 2 to 4 choices, each with weighted outcomes that read well', () => {
  evs.forEach((e) => {
    t.ok(e.choices.length >= 2 && e.choices.length <= 4, `${e.id}: 2 to 4 choices`);
    t.eq(new Set(e.choices.map((c) => c.label)).size, e.choices.length, `${e.id}: choice labels are unique`);
    e.choices.forEach((c, ci) => {
      t.ok(c.label.length >= 4 && c.label.length <= 48, `${e.id}[${ci}]: label fits a button (${c.label.length})`);
      if (c.cost !== undefined) t.ok(c.cost.length >= 3 && c.cost.length <= 32, `${e.id}[${ci}]: cost is a short display string`);
      t.ok(c.out.length >= 1 && c.out.length <= 3, `${e.id}[${ci}]: 1 to 3 outcomes`);
      t.eq(new Set(c.out.map((o) => o.text)).size, c.out.length, `${e.id}[${ci}]: outcomes read differently`);
      c.out.forEach((o, oi) => {
        t.ok(typeof o.w === 'number' && o.w > 0 && Number.isFinite(o.w), `${e.id}[${ci}].out[${oi}]: positive weight`);
        t.ok(o.text.length >= 40 && o.text.length <= 300, `${e.id}[${ci}].out[${oi}]: outcome text is a real sentence or two (${o.text.length})`);
        t.ok(/[.!?'"]$/.test(o.text), `${e.id}[${ci}].out[${oi}]: outcome ends like a sentence`);
        t.ok(!/todo|tbd|lorem|xxx/i.test(o.text), `${e.id}[${ci}].out[${oi}]: no placeholder text`);
      });
    });
  });
});

t.test('every event has a safe choice that is always available, and no choice is a trap of only hidden or locked options', () => {
  evs.forEach((e) => {
    const safe = e.choices.filter((c) => isSafe(c));
    t.ok(safe.length >= 1, `${e.id}: has a safe choice`);
    t.ok(safe.some((c) => !c.req), `${e.id}: a safe choice needs nothing, so a broke or hurt player is never stuck`);
    t.ok(e.choices.filter((c) => !(c.req && c.req.hero)).length >= 2, `${e.id}: two choices stay visible without any particular hero`);
  });
});

t.test('every event is a dilemma: a safe choice, a weighted gamble, and choices that differ in kind', () => {
  evs.forEach((e) => {
    const gamble = e.choices.filter((c) => c.out.length > 1);
    t.ok(gamble.length >= 1, `${e.id}: holds at least one weighted gamble (CONTENT_SPEC 6: a safe choice plus a gamble)`);
    t.ok(e.choices.some((c) => isSafe(c)), `${e.id}: and a safe choice`);
    gamble.forEach((c) => t.ok(new Set(c.out.map((o) => JSON.stringify(o.ops || []))).size === c.out.length, `${e.id}: "${c.label}" outcomes differ in what they do, not just in words`));
    const kinds = new Set(e.choices.map((c) => (c.cost ? 'cost' : c.out.length > 1 ? 'gamble' : 'sure')));
    t.ok(kinds.size >= 2 || e.choices.length >= 3, `${e.id}: choices differ in kind (${[...kinds].join(', ')})`);
  });
  const costed = evs.filter((e) => e.choices.some((c) => c.cost)).length;
  t.ok(costed >= evs.length * 0.7, `most fables put a price on something (${costed} of ${evs.length})`);
  const weights = evs.flatMap((e) => e.choices.filter((c) => c.out.length > 1).map((c) => c.out.map((o) => o.w)));
  t.ok(weights.some((w) => new Set(w).size > 1), 'some gambles are loaded, not coin flips');
  t.ok(weights.some((w) => new Set(w).size === 1), 'and some are honest coin flips');
});

t.test('once only where the change lasts, and at most 60 percent of events', () => {
  const LASTING = ['flag', 'addRelic', 'addCurse', 'upgradeCard', 'removeCard', 'transformCard', 'duplicateCard', 'addCard', 'cardReward', 'maxHp', 'addGem'];
  const once = evs.filter((e) => e.once);
  t.ok(once.length <= Math.floor(evs.length * 0.6), `once cap (${once.length} of ${evs.length})`);
  t.ok(once.length >= 8, 'a healthy number of story beats are once');
  once.forEach((e) => t.ok(opsOf(e).some((x) => LASTING.indexOf(x.op) >= 0), `${e.id}: once means a lasting consequence`));
  evs.filter((e) => opsOf(e).some((x) => x.op === 'flag')).forEach((e) => t.ok(e.once, `${e.id}: an event that sets a flag is once`));
  evs.filter((e) => e.when && (e.when.hero || e.when.flag)).forEach((e) => t.ok(e.once, `${e.id}: a story beat gated by a hero or flag is once`));
});

t.test('fixed ids only: relics, curses, brushes, enemies and no private card or gem ids', () => {
  const relicIds = Object.keys(DATA.FIXED.relics);
  walkRun((x, e) => {
    if (x.op === 'addRelic' && x.id) t.ok(relicIds.indexOf(x.id) >= 0, `${e.id}: addRelic ${x.id} is a fixed relic`);
    if (x.op === 'addCurse' && x.id) t.ok(DATA.FIXED.curses.indexOf(x.id) >= 0, `${e.id}: addCurse ${x.id} is a fixed curse`);
    if (x.op === 'addBrush') t.ok(x.id === 'random' || !!DATA.brushes[x.id], `${e.id}: brush ${x.id} exists`);
    if (x.op === 'addCard') t.ok(x.card === undefined && x.pool !== undefined, `${e.id}: addCard uses a pool, never a card id`);
    if (x.op === 'addGem') t.ok(x.id === undefined, `${e.id}: addGem uses color and tier, never a gem id`);
    if (x.op === 'fight') t.ok(x.enc === undefined && A(x.enemies).length >= 1, `${e.id}: fight names enemies, never a group id`);
  });
  evs.forEach((e) => {
    if (e.when && e.when.relic) t.ok(relicIds.indexOf(e.when.relic) >= 0, `${e.id}: when.relic is a fixed relic`);
    e.choices.forEach((c) => { if (c.req && c.req.relic) t.ok(relicIds.indexOf(c.req.relic) >= 0, `${e.id}: req.relic is a fixed relic`); });
  });
});

t.test('fights: real roster enemies of the event chapter, no bosses, none in any-chapter events, sane sizes and tiers', () => {
  let fights = 0;
  walkRun((x, e) => {
    if (x.op !== 'fight') return;
    fights++;
    const ch = chapterOf(e);
    t.ok(ch >= 1, `${e.id}: fights only in chapter fables (their enemies must match the chapter)`);
    t.ok(x.enemies.length <= 2, `${e.id}: at most 2 enemies in a fable fight`);
    const tiers = x.enemies.map((id) => { const r = DATA.rosterById[id]; t.ok(!!r, `${e.id}: ${id} is on the roster`); t.eq(r && r.chapter, ch, `${e.id}: ${id} belongs to chapter ${ch}`); if (DATA.enemies[id]) { t.eq(DATA.enemies[id].chapter, ch, `${e.id}: ${id} def chapter`); t.eq(DATA.enemies[id].tier, r.tier, `${e.id}: ${id} def tier`); } return r && r.tier; });
    t.ok(tiers.indexOf('boss') < 0, `${e.id}: never a boss`);
    if (x.tier === 'elite') t.ok(tiers.filter((v) => v === 'elite').length === 1, `${e.id}: an elite fight has exactly one elite`);
    else t.ok(tiers.indexOf('elite') < 0, `${e.id}: a normal fight has no elite`);
    if (ch === 1) t.ok(x.enemies.length <= 3, `${e.id}: chapter 1 groups are at most 3`);
  });
  t.ok(fights >= 6, `at least 6 fight outcomes across the set (have ${fights})`);
  evs.filter((e) => opsOf(e).some((x) => x.op === 'fight')).forEach((e) => t.ok(e.choices.some((c) => !c.out.some((o) => A(o.ops).some((x) => x.op === 'fight'))), `${e.id}: a fight is never the only way through`));
  evs.forEach((e) => e.choices.forEach((c) => { if (c.out.some((o) => A(o.ops).some((x) => x.op === 'fight')) && c.out.length === 1) t.ok(/fight/i.test(c.label), `${e.id}: a certain fight says so in its label`); }));
});

t.test('run op coverage: every run op, every req key, every when key, every who value is used', () => {
  const used = {}, reqs = {}, whens = {}, whos = {};
  walkRun((x) => { used[x.op] = (used[x.op] || 0) + 1; if (x.who) whos[x.who] = true; });
  evs.forEach((e) => { Object.keys(e.when || {}).forEach((k) => { whens[k] = true; }); e.choices.forEach((c) => Object.keys(c.req || {}).forEach((k) => { reqs[k] = true; })); });
  L.runOps.forEach((op) => t.ok(used[op] >= 1, `run op ${op} is used`));
  L.reqKeys.forEach((k) => t.ok(reqs[k], `req.${k} is used`));
  L.whenKeys.forEach((k) => t.ok(whens[k], `when.${k} is used`));
  ['front', 'lowest', 'random'].forEach((w) => t.ok(whos[w], `who:${w} is used`));
  t.ok(L.heroIds.filter((h) => whos[h]).length >= 3, 'at least three heroes are addressed by id');
  let pct = { gold: 0, ink: 0, heal: 0, hurt: 0 };
  walkRun((x) => { if (x.pct !== undefined) pct[x.op] = (pct[x.op] || 0) + 1; });
  Object.keys(pct).forEach((k) => t.ok(pct[k] >= 1, `${k} is also written with pct somewhere`));
  ['ink', 'gold'].forEach((k) => { let neg = false; walkRun((x) => { if (x.op === k && x.n < 0) neg = true; }); t.ok(neg, `${k} is spent somewhere`); });
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'fight' && x.win)), 'a fight uses win ops');
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'fight' && x.tier === 'elite')), 'a fight uses the elite table');
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'removeCard' && x.filter && x.filter.type === 'curse')), 'a fable lets you feed a curse to the Hush');
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'upgradeCard' && x.filter && x.filter.hero)), 'a fable upgrades a specific hero card');
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'upgradeCard' && x.random)), 'a fable upgrades at random');
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'cardReward' && x.rarity)), 'a fable offers a rarity-locked card reward');
});

t.test('costs are honest: a certain price is shown, backed by a req, and every cost string is paid by an op', () => {
  evs.forEach((e) => e.choices.forEach((c, ci) => {
    const w = `${e.id}[${ci}]`;
    const certainLoss = Math.min(...c.out.map((o) => -Math.min(0, goldDelta(o))));
    if (certainLoss > 0) {
      t.ok(!!c.cost && /gold/i.test(c.cost), `${w}: a certain gold price is shown in cost`);
      t.ok(c.req && c.req.gold >= certainLoss, `${w}: req.gold covers the certain price of ${certainLoss}`);
    }
    if (c.req && c.req.gold) t.ok(c.out.some((o) => goldDelta(o) < 0), `${w}: a gold requirement means gold can be spent`);
    const certainInk = Math.min(...c.out.map((o) => -A(o.ops).reduce((s, x) => s + (x.op === 'ink' && x.n < 0 ? x.n : 0), 0)));
    if (certainInk > 0) t.ok(c.cost && /echo/i.test(c.cost), `${w}: a certain Echo price is shown in cost`);
    if (c.cost && /lose a card/i.test(c.cost)) t.ok(c.out.every((o) => A(o.ops).some((x) => x.op === 'removeCard')), `${w}: "Lose a card" really removes one`);
    if (c.cost && /curse/i.test(c.cost)) {
      const adds = (o) => A(o.ops).some((x) => x.op === 'addCurse');
      t.ok(c.out.some(adds), `${w}: a curse cost really can add a curse`);
      if (!c.out.every(adds)) t.ok(/\b(may|maybe|might)\b/i.test(c.cost), `${w}: a curse that is not certain says maybe`);
    }
    if (c.cost && /hurts the front/i.test(c.cost)) t.ok(c.out.every((o) => A(o.ops).some((x) => x.op === 'hurt' && x.who === 'front')), `${w}: "hurts the front hero" hurts the front hero`);
  }));
});

t.test('numbers stay inside the economy: damage, gold, max HP, painting and Ink are bounded', () => {
  walkRun((x, e) => {
    if (x.op === 'hurt') { if (x.n !== undefined) t.ok(x.n >= 3 && x.n <= 12, `${e.id}: hurt ${x.n} is a bruise, not a death sentence`); else t.ok(x.pct <= 0.15, `${e.id}: hurt pct ${x.pct}`); }
    if (x.op === 'gold' && x.n > 0) t.ok(x.n <= 150, `${e.id}: gold gain ${x.n}`);
    if (x.op === 'gold' && x.n < 0) t.ok(x.n >= -80, `${e.id}: gold price ${x.n}`);
    if (x.op === 'gold' && x.pct !== undefined) t.ok(Math.abs(x.pct) <= 0.3, `${e.id}: gold pct ${x.pct}`);
    if (x.op === 'ink' && x.n > 0) t.ok(x.n <= 3, `${e.id}: Ink gain ${x.n} (a well gives 4 and is a whole tile)`);
    if (x.op === 'ink' && x.n < 0) t.ok(x.n >= -2, `${e.id}: Ink price ${x.n}`);
    if (x.op === 'maxHp') t.ok(Math.abs(x.n) <= 6 && x.n > 0, `${e.id}: max HP ${x.n} (this set only ever grants it)`);
    if (x.op === 'paint') t.ok(x.n >= 1 && x.n <= 8, `${e.id}: paint ${x.n}`);
    if (x.op === 'heal' && x.pct !== undefined) t.ok(x.pct <= 0.5, `${e.id}: heal pct ${x.pct}`);
  });
  const g = evs.flatMap((e) => e.choices.flatMap((c) => c.out.map((o) => ({ e, c, o }))));
  t.ok(g.every(({ o }) => A(o.ops).filter((x) => x.op === 'fight').length <= 1), 'at most one fight per outcome');
  t.ok(g.every(({ o }) => A(o.ops).length <= 3), 'no outcome stacks more than three ops');
});

t.test('flags: every flag read is set somewhere, every flag set is read, and the fox path climbs through the chapters', () => {
  const setBy = {}, readBy = {};
  walkRun((x, e) => { if (x.op === 'flag') (setBy[x.k] = setBy[x.k] || []).push(e); });
  evs.forEach((e) => {
    if (e.when && e.when.flag) (readBy[e.when.flag] = readBy[e.when.flag] || []).push(e);
    e.choices.forEach((c) => { if (c.req && c.req.flag) (readBy[c.req.flag] = readBy[c.req.flag] || []).push(e); });
  });
  Object.keys(readBy).forEach((k) => t.ok(setBy[k] && setBy[k].length, `flag ${k} is set by a fable`));
  Object.keys(setBy).forEach((k) => t.ok(readBy[k] && readBy[k].length, `flag ${k} is read by a fable`));
  Object.keys(readBy).forEach((k) => readBy[k].forEach((r) => {
    const rch = chapterOf(r) || 3;
    t.ok(setBy[k].some((s) => (chapterOf(s) || 1) <= rch), `flag ${k}: read in ${r.id} after some setter can have run`);
  }));
  const f1 = DATA.events.fox_in_the_snare, f2 = DATA.events.fox_returns, f3 = DATA.events.fox_at_the_gate;
  t.ok(f1 && f2 && f3, 'the three fox fables exist');
  t.deep([chapterOf(f1), chapterOf(f2), chapterOf(f3)], [1, 2, 3], 'the fox grows up across chapters 1, 2 and 3');
  t.eq(f2.when.flag, 'fox_spared', 'the second fox fable needs the first kindness');
  t.eq(f3.when.flag, 'fox_bond', 'the third fox fable needs the second');
  t.ok(f2.choices.every((c) => c.out.every((o) => o.ops.some((x) => x.op === 'flag' && x.k === 'fox_bond'))), 'every way through the second fox fable keeps the bond');
  t.ok(f1.choices.filter((c) => c.out.some((o) => o.ops && o.ops.some((x) => x.op === 'flag' && x.k === 'fox_spared'))).length === 1, 'exactly one choice frees the fox');
  t.ok(f2.w >= 4 && f3.w >= 4, 'follow-ups are weighted up so a kindness is usually paid back');
  t.ok(A(f2.choices).some((c) => c.out.some((o) => o.ops.some((x) => x.op === 'addRelic' && x.id === 'fox_mask'))), 'the fox hands over fox_mask');
  t.ok(evs.some((e) => e.choices.some((c) => c.req && c.req.relic === 'fox_mask')), 'and a later fable rewards wearing it');
});

t.test('relic-gated fables: silver_bell merchant, jade_door, brass_lantern, and the peddler sells the lamp', () => {
  const bell = evs.filter((e) => e.choices.some((c) => c.req && c.req.relic === 'silver_bell'));
  t.ok(bell.length >= 1, 'a choice needs silver_bell');
  bell.forEach((e) => { t.eq(e.art.scene, 'shop', `${e.id}: the bell merchant sits in the shop scene`); t.ok(e.choices.some((c) => c.cost && c.req && c.req.gold), `${e.id}: it is a real merchant with prices`); });
  t.ok(DATA.events.jade_door && DATA.events.jade_door.when.relic === 'jade_key', 'jade_door needs jade_key');
  t.ok(DATA.events.brass_lantern_secret && DATA.events.brass_lantern_secret.when.relic === 'brass_lantern', 'brass_lantern_secret needs brass_lantern');
  t.ok(evs.some((e) => opsOf(e).some((x) => x.op === 'addRelic' && x.id === 'brass_lantern')), 'a merchant sells brass_lantern');
  const rel = ['brass_lantern', 'fox_mask', 'silver_bell', 'jade_key'];
  t.ok(rel.every((id) => evs.some((e) => (e.when && e.when.relic === id) || e.choices.some((c) => (c.req && c.req.relic === id) || c.out.some((o) => A(o.ops).some((x) => x.id === id))))), 'every fixed relic appears in the fables');
});

t.test('hero moments: one gated fable per hero, a hero choice for every hero, and voices that fit', () => {
  const moment = (h) => evs.filter((e) => e.when && e.when.hero === h);
  L.heroIds.forEach((h) => {
    t.ok(moment(h).length >= 1, `${h} has a moment`);
    t.ok(evs.filter((e) => e.choices.some((c) => c.req && c.req.hero === h)).length >= 2, `${h} has a hero-only choice in at least 2 fables`);
    moment(h).forEach((e) => {
      t.ok(new RegExp(h, 'i').test(e.title + ' ' + e.text), `${e.id}: names ${h}`);
      t.ok(e.w >= 2, `${e.id}: hero moments are weighted up`);
      const others = L.heroIds.filter((o) => o !== h);
      t.ok(!others.some((o) => new RegExp('\\b' + o + '\\b', 'i').test(e.text)), `${e.id}: the text does not mention a hero who might not be there`);
    });
  });
  const seenHeroes = new Set(); evs.forEach((e) => { if (e.when && e.when.hero) seenHeroes.add(e.when.hero); });
  t.eq(seenHeroes.size, 4, 'all four heroes have a moment');
  // nobody may be named where they might be absent: the scene, and every outcome of a choice that any hero can pick
  const named = (str) => L.heroIds.filter((h) => new RegExp('\\b' + h + '\\b', 'i').test(str));
  evs.forEach((e) => {
    const owner = e.when && e.when.hero;
    if (!owner) t.deep(named(e.text), [], `${e.id}: the scene text names no hero`);
    e.choices.forEach((c, ci) => {
      const allowed = (c.req && c.req.hero) || owner;
      c.out.forEach((o, oi) => t.ok(named(o.text).every((h) => h === allowed), `${e.id}[${ci}].out[${oi}]: names only ${allowed || 'nobody'} (${named(o.text).join(',') || 'nobody'})`));
    });
  });
});

t.test('scenes suit the event: shops for merchants, defeat for the Hush, boss scenes for dread', () => {
  const scenes = new Set(evs.map((e) => e.art.scene));
  ['ch1', 'ch2', 'ch3', 'shop', 'event', 'camp', 'paper', 'treasure', 'defeat', 'boss3'].forEach((s) => t.ok(scenes.has(s), `scene ${s} is used`));
  evs.filter((e) => chapterOf(e) >= 1).forEach((e) => t.ok(['ch' + chapterOf(e), 'shop', 'event', 'camp', 'paper', 'defeat', 'boss' + chapterOf(e), 'treasure'].indexOf(e.art.scene) >= 0, `${e.id}: scene ${e.art.scene} does not belong to another chapter`));
  t.ok(evs.filter((e) => ['shop', 'ch1', 'ch2', 'ch3', 'event'].indexOf(e.art.scene) >= 0).length >= 30, 'most fables are staged in the landscape or a shop');
});

// =================================================================================================== 1b. text hygiene, all content
t.test('text hygiene: printable ASCII only, no dashes, no line breaks, no double spaces, in every string we wrote', () => {
  const strings = [];
  const gather = (v, where) => { if (typeof v === 'string') strings.push([where, v]); else if (Array.isArray(v)) v.forEach((x, i) => gather(x, `${where}[${i}]`)); else if (v && typeof v === 'object') Object.keys(v).forEach((k) => gather(v[k], `${where}.${k}`)); };
  evs.forEach((e) => gather(e, 'event ' + e.id));
  achs.forEach((a) => gather(a, 'ach ' + a.id));
  trials.forEach((x) => gather(x, 'trial ' + x.id));
  lore.forEach((l) => gather(l, 'lore ' + l.id));
  DATA.tips.forEach((s, i) => gather(s, 'tip ' + i));
  t.ok(strings.length > 900, `a lot of text to check (${strings.length} strings)`);
  strings.forEach(([w, s]) => {
    t.ok(ASCII.test(s), `${w}: printable ASCII`);
    t.ok(!DASH.test(s), `${w}: no em or en dash`);
    t.ok(!/\n|\r|\t/.test(s), `${w}: no control characters`);
    t.ok(!/  /.test(s) && s === s.trim(), `${w}: clean spacing`);
    t.ok(!/[.,!?;:][A-Za-z]/.test(s.replace(/\.\.\./g, '. ').replace(/\d\.\d/g, '')), `${w}: space after punctuation`);
  });
  const words = strings.filter(([w]) => /^event .*|^lore /.test(w)).map(([, s]) => s).join(' ');
  t.ok(!/\b(very very very|really really)\b/i.test(words), 'no stuttering intensifiers');
  t.ok(!/\b(the the|a a|is is|to to)\b/i.test(words), 'no doubled words');
});

t.test('old theme guard: no ink, brush, page, book, author, blank, quill, scroll, write or paint words in prose fields', () => {
  const OLD = /\b(ink|inks|inked|inky|brush|brushes|pages?|books?|author|blank|quill|scrolls?|write|writes|writing|written|wrote|paint|painted|painting)\b/i;
  const prose = [];
  evs.forEach((e) => {
    prose.push(['event ' + e.id + ' title', e.title], ['event ' + e.id + ' text', e.text]);
    e.choices.forEach((c, ci) => {
      prose.push([`event ${e.id} label ${ci}`, c.label]);
      if (c.cost) prose.push([`event ${e.id} cost ${ci}`, c.cost]);
      c.out.forEach((o, oi) => prose.push([`event ${e.id} outcome ${ci}.${oi}`, o.text]));
    });
  });
  achs.forEach((a) => prose.push(['ach ' + a.id + ' name', a.name], ['ach ' + a.id + ' text', a.text]));
  trials.forEach((x) => prose.push(['trial ' + x.id + ' name', x.name], ['trial ' + x.id + ' text', x.text]));
  stories.forEach((l) => prose.push(['lore ' + l.id + ' title', l.title], ['lore ' + l.id + ' text', l.text]));
  barks.forEach((l) => Object.keys(l.lines).forEach((k) => l.lines[k].forEach((line, i) => prose.push([`${l.id}.${k}[${i}]`, line]))));
  DATA.tips.forEach((tip, i) => prose.push(['tip ' + i, tip]));
  t.ok(prose.length > 600, `a lot of prose to scan (${prose.length} strings)`);
  prose.forEach(([w, str]) => t.ok(!OLD.test(str || ''), `${w}: no old-theme word`));
});

// =================================================================================================== 2. achievements
t.test('achievements: 32, the fixed ids, real stat keys, sane thresholds, monotone rewards', () => {
  t.eq(achs.length, DATA.QUOTA.achievements, 'exactly the quota');
  DATA.FIXED.achievements.forEach((id) => t.ok(DATA.achievements[id], `fixed achievement ${id}`));
  t.deep([DATA.achievements.ch1_clear.stat, DATA.achievements.ch2_clear.stat, DATA.achievements.ch3_clear.stat], [{ k: 'boss1Kills', gte: 1 }, { k: 'boss2Kills', gte: 1 }, { k: 'boss3Kills', gte: 1 }], 'the clears read the boss kill stats');
  t.eq(DATA.heroes.suzu.unlock.ach, 'ch1_clear', 'Suzu unlocks with ch1_clear');
  t.eq(DATA.heroes.raiga.unlock.ach, 'ch2_clear', 'Raiga unlocks with ch2_clear');
  t.eq(new Set(achs.map((a) => a.name)).size, achs.length, 'names are unique');
  t.eq(new Set(achs.map((a) => a.stat.k + ':' + a.stat.gte)).size, achs.length, 'no two achievements share a stat and threshold');
  achs.forEach((a) => {
    t.ok(L.statKeys.indexOf(a.stat.k) >= 0, `${a.id}: ${a.stat.k} is a stat key`);
    t.ok(Number.isInteger(a.stat.gte) && a.stat.gte >= 1, `${a.id}: whole threshold`);
    t.ok(a.reward && Number.isInteger(a.reward.inkstones) && a.reward.inkstones >= 3 && a.reward.inkstones <= 60, `${a.id}: reward 3 to 60 Inkstones`);
    t.ok(a.name.length <= 28 && a.text.length >= 15 && a.text.length <= 100, `${a.id}: name and text fit the Library row`);
    t.ok(/[.!?]$/.test(a.text), `${a.id}: text is a sentence`);
  });
  const byStat = {};
  achs.forEach((a) => { (byStat[a.stat.k] = byStat[a.stat.k] || []).push(a); });
  Object.keys(byStat).forEach((k) => { const s = byStat[k].sort((p, q) => p.stat.gte - q.stat.gte); for (let i = 1; i < s.length; i++) t.ok(s[i].reward.inkstones > s[i - 1].reward.inkstones, `${k}: a higher threshold pays more`); });
  const total = achs.reduce((n, a) => n + a.reward.inkstones, 0);
  t.ok(total >= 300 && total <= 700, `total Inkstone rewards ${total} are a real but not overwhelming purse`);
  t.ok(achs.some((a) => /^wins[A-Z]/.test(a.stat.k)), 'hero mastery');
  L.heroIds.forEach((h) => t.ok(achs.some((a) => a.stat.k === 'wins' + h[0].toUpperCase() + h.slice(1)), `hero mastery for ${h}`));
  ['hexesPainted', 'relicsFound', 'flawlessBosses', 'smallDeckWins', 'trialBest', 'dailyRuns', 'runs', 'wins'].forEach((k) => t.ok(achs.some((a) => a.stat.k === k), `an achievement for ${k}`));
  t.eq(achs.filter((a) => a.stat.k === 'trialBest').map((a) => a.stat.gte).join(','), '1,5,10', 'trial clears at 1, 5 and 10');
});

t.test('achievement thresholds are reachable in principle: the stat is written by COMBAT, RUN or META, and bests stay plausible', () => {
  const src = ['combat', 'run', 'meta'].map((n) => path.join(DIR, 'js', n + '.js')).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  if (src.length < 1000) { t.ok(true, 'peer sources not present, source scan skipped'); return; }
  const family = { boss1Kills: /boss.{0,14}Kills/, boss2Kills: /boss.{0,14}Kills/, boss3Kills: /boss.{0,14}Kills/, winsHanae: /wins.{0,30}(toUpperCase|cap\()/i, winsKuro: /wins.{0,30}(toUpperCase|cap\()/i, winsSuzu: /wins.{0,30}(toUpperCase|cap\()/i, winsRaiga: /wins.{0,30}(toUpperCase|cap\()/i };
  achs.forEach((a) => {
    const k = a.stat.k;
    t.ok(new RegExp('\\b' + k + '\\b').test(src) || (family[k] && family[k].test(src)), `${a.id}: some module writes ${k}`);
  });
  const caps = { maxHit: 100, maxTurnDamage: 300, trialBest: 10, maxDeck: 60, flawlessBosses: 30, smallDeckWins: 20, dailyRuns: 366 };
  achs.forEach((a) => { if (caps[a.stat.k]) t.ok(a.stat.gte <= caps[a.stat.k], `${a.id}: ${a.stat.k} ${a.stat.gte} is attainable (cap ${caps[a.stat.k]})`); });
  t.ok(achs.filter((a) => L.statMax.indexOf(a.stat.k) >= 0).every((a) => a.stat.gte <= { maxHit: 100, maxTurnDamage: 300, maxDeck: 60, trialBest: 10 }[a.stat.k]), 'max-key thresholds are bests, not totals');
});

t.test('achievements really unlock through META.check, pay their Inkstones and unlock the heroes', () => {
  if (!haveMeta) { t.ok(true, 'META not available, skipped'); return; }
  let unlocked = 0;
  achs.forEach((a) => {
    META.reset();
    const k = a.stat.k, max = L.statMax.indexOf(k) >= 0;
    META.track(k, a.stat.gte - 1);
    if (a.stat.gte - 1 > 0) t.ok(META.check().indexOf(a.id) < 0, `${a.id}: not yet at ${a.stat.gte - 1}`);
    META.track(k, max ? a.stat.gte : 1);
    const before = META.inkstones;
    const got = META.check();
    t.ok(got.indexOf(a.id) >= 0, `${a.id}: unlocks at ${a.stat.gte}`);
    if (got.indexOf(a.id) >= 0) unlocked++;
    t.ok(META.inkstones >= before + a.reward.inkstones, `${a.id}: pays ${a.reward.inkstones} Inkstones`);
    t.ok(META.check().indexOf(a.id) < 0, `${a.id}: only ever once`);
  });
  t.eq(unlocked, 32, 'all 32 unlock');
  META.reset(); META.track('boss1Kills', 1); META.check();
  t.ok(META.isUnlocked('hero', 'suzu'), 'ch1_clear unlocks Suzu');
  t.ok(!META.isUnlocked('hero', 'raiga'), 'and not Raiga');
  META.track('boss2Kills', 1); META.check();
  t.ok(META.isUnlocked('hero', 'raiga'), 'ch2_clear unlocks Raiga');
  META.reset();
});

// =================================================================================================== 2. trials
const HARM = { enemyHp: 40, eliteHp: 12, bossHp: 25, enemyDmg: 60, goldMul: -12, priceMul: 10, healMul: -20, reviveFrac: -20, startInk: -3, startGold: -0.05, wellInk: -4, cardChoices: -8, curses: 4 };
const score = (mods) => Object.keys(mods).reduce((s, k) => s + HARM[k] * mods[k], 0);
const cumulative = (n) => { const sum = {}; trials.filter((x) => x.level <= n).forEach((x) => Object.keys(x.mods).forEach((k) => { sum[k] = (sum[k] || 0) + x.mods[k]; })); return sum; };

t.test('Tempo Trials: ten levels, ids and names, own increments, distinct headlines, every trial mod used', () => {
  t.eq(trials.length, 10, 'ten trials');
  t.deep(trials.map((x) => x.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'levels 1 to 10');
  trials.forEach((x) => {
    t.eq(x.id, 'trial_' + x.level, `${x.id}: id matches level`);
    t.ok(x.name.length <= 24 && x.text.length >= 20 && x.text.length <= 96, `${x.id}: name and one-line rule fit (${x.text.length})`);
    t.ok(/[.!?]$/.test(x.text), `${x.id}: rule is a sentence`);
    Object.keys(x.mods).forEach((k) => t.ok(L.trialMods.indexOf(k) >= 0 && HARM[k] !== undefined, `${x.id}: ${k} is a trial mod with a known harm direction`));
  });
  t.eq(new Set(trials.map((x) => x.name)).size, 10, 'names unique');
  t.eq(new Set(trials.map((x) => JSON.stringify(x.mods))).size, 10, 'no two levels apply the same increment');
  t.eq(new Set(trials.map((x) => Object.keys(x.mods)[0])).size, 10, 'ten different headline mods, so the climb reads as a staircase');
  const used = new Set(trials.flatMap((x) => Object.keys(x.mods)));
  L.trialMods.forEach((k) => t.ok(used.has(k), `trial mod ${k} appears in some level`));
});

t.test('Tempo Trials get monotonically harder, and the last one is punishing but fair', () => {
  let prev = 0;
  const incs = [];
  trials.forEach((x) => {
    const inc = score(x.mods), cum = score(cumulative(x.level));
    incs.push(inc);
    t.ok(inc >= 1, `${x.id}: this level alone adds real difficulty (${inc.toFixed(2)})`);
    Object.keys(x.mods).forEach((k) => t.ok(HARM[k] * x.mods[k] > 0, `${x.id}: ${k} ${x.mods[k]} only ever makes the game harder`));
    t.ok(cum >= prev, `${x.id}: cumulative difficulty never decreases (${prev.toFixed(1)} to ${cum.toFixed(1)})`);
    t.ok(cum > prev, `${x.id}: it strictly rises`);
    prev = cum;
  });
  const first = incs.slice(0, 5).reduce((a, b) => a + b, 0), last = incs.slice(5).reduce((a, b) => a + b, 0);
  t.ok(last > first, `the second half of the staircase is steeper (${first.toFixed(1)} then ${last.toFixed(1)})`);
  t.ok(incs[9] === Math.max(...incs), 'the final trial is the biggest single step');
  t.ok(Math.max(...incs) <= 20 * Math.min(...incs), 'no level is absurdly bigger than another');
  t.ok(score(cumulative(10)) >= 3 * score(cumulative(3)), 'trial 10 is at least 3 times trial 3');
  t.ok(score(cumulative(10)) < 100, 'and the total stays fair');
});

t.test('Tempo Trials fold into fair final numbers and never break the Ink budget', () => {
  const E = DATA.ECONOMY;
  trials.forEach((x) => {
    const deltas = DATA.trialDeltas(x.level), want = cumulative(x.level);
    Object.keys(want).forEach((k) => t.near(deltas[k], want[k], 1e-9, `${x.id}: trialDeltas sums level 1..${x.level} for ${k}`));
    const m = DATA.modsFor([], x.level);
    t.ok(m.goldMul >= 0.6 && m.healMul >= 0.6 && m.priceMul <= 1.3, `${x.id}: economy stays playable`);
    t.ok(m.enemyHp <= 1.25 && m.enemyDmg <= 1.3 && m.eliteHp <= 1.3 && m.bossHp <= 1.2, `${x.id}: enemy scaling stays fair`);
    t.ok(m.cardChoices >= 2 && m.startInk >= 8 && m.wellInk >= 3 && m.startGold >= 30 && m.curses <= 1, `${x.id}: choices, Ink, gold and curses stay above the floor`);
    t.ok(m.startInk + 3 * m.wellInk + 8 >= E.map.solve.max, `${x.id}: start Ink plus three wells plus a few kills still crosses the widest legal map`);
    t.ok(m.reviveFrac >= 0.15, `${x.id}: revive stays at 15 percent or better`);
  });
  const t10 = DATA.modsFor([], 10);
  t.eq(t10.startInk, 9, 'trial 10 starts each chapter with 9 Ink');
  t.eq(t10.wellInk, 3, 'trial 10 wells give 3 Ink');
  t.eq(t10.cardChoices, 2, 'trial 10 offers 2 cards');
  t.eq(t10.curses, 1, 'trial 10 starts with one curse');
  t.eq(t10.startGold, 40, 'trial 10 starts with 40 gold');
  t.near(t10.enemyDmg, 1.25, 1e-9, 'trial 10 enemy damage factor 1.25');
  t.near(t10.enemyHp, 1.1, 1e-9, 'trial 10 enemy HP factor 1.1');
  t.near(t10.reviveFrac, E.reviveFrac - 0.1, 1e-9, 'trial 10 revive fraction');
  t.eq(DATA.modsFor([], 0).startInk, E.startInk, 'trial 0 is the base game');
  t.deep(DATA.trialDeltas(0), {}, 'trial 0 has no deltas');
});

t.test('each trial text quotes its own numbers, so the rule and the mod cannot drift apart', () => {
  const pct = (v) => Math.round(Math.abs(v) * 100);
  const E = DATA.ECONOMY;
  const want = {
    goldMul: (v, s) => new RegExp(pct(v) + '% less gold').test(s),
    enemyHp: (v, s) => new RegExp(pct(v) + '% more HP').test(s),
    healMul: (v, s) => new RegExp(pct(v) + '% less').test(s),
    startInk: (v, s) => new RegExp(Math.abs(v) + ' less Echo').test(s),
    enemyDmg: (v, s) => new RegExp(pct(v) + '% (more damage|harder)').test(s),
    wellInk: (v, s) => new RegExp('bells give ' + Math.abs(v) + ' less Echo').test(s),
    reviveFrac: (v, s) => new RegExp(Math.round((E.reviveFrac + v) * 100) + '% HP, not ' + Math.round(E.reviveFrac * 100) + '%').test(s),
    priceMul: (v, s) => new RegExp('charge ' + pct(v) + '% more').test(s),
    startGold: (v, s) => new RegExp(Math.abs(v) + ' less gold').test(s),
    curses: (v, s) => /curse/.test(s),
    eliteHp: (v, s) => new RegExp('Elites have ' + pct(v) + '% more HP').test(s),
    bossHp: (v, s) => new RegExp('bosses have ' + pct(v) + '% more').test(s),
    cardChoices: (v, s) => /one card fewer/.test(s),
  };
  trials.forEach((x) => Object.keys(x.mods).forEach((k) => t.ok(want[k] && want[k](x.mods[k], x.text), `${x.id}: text "${x.text}" quotes ${k} ${x.mods[k]}`)));
});

// =================================================================================================== tips
t.test('tips: 30, short, unique, plain sentences, and they only claim mechanics the game has', () => {
  t.ok(DATA.tips.length >= 30, 'at least 30 tips');
  t.eq(new Set(DATA.tips).size, DATA.tips.length, 'tips are unique');
  DATA.tips.forEach((s, i) => {
    t.ok(s.length >= 30 && s.length <= 110, `tip ${i} fits (${s.length})`);
    t.ok(/[.!?]$/.test(s), `tip ${i} is a sentence`);
    t.ok(!/\d/.test(s.replace(/\bX\b/, '')), `tip ${i}: no hand-typed numbers that tuning could change`);
  });
  const all = DATA.tips.join(' ').toLowerCase();
  ['echo', 'song', 'swap', 'block', 'poison', 'bind', 'gem', 'camp', 'forge', 'shop', 'curse', 'fable', 'treasure', 'retain', 'exhaust', 'trial', 'daily', 'vulnerable', 'weak', 'front', 'back', 'downed', 'bloom'].forEach((w) => t.ok(all.indexOf(w) >= 0, `a tip covers ${w}`));
});

// =================================================================================================== lore
t.test('lore: every fixed id, titles and text within the page, one paragraph each', () => {
  DATA.FIXED.lore.forEach((id) => t.ok(DATA.lore[id], `lore ${id}`));
  t.eq(stories.length, 12, 'twelve story pages: intro, three chapter intros, two clears, victory, defeat, four heroes');
  t.eq(barks.length, 4, 'four bark sets');
  stories.forEach((s) => {
    t.ok(s.title.length >= 5 && s.title.length <= 40, `${s.id}: title fits (${s.title.length})`);
    t.ok(s.text.length >= 400 && s.text.length <= 700, `${s.id}: a full storybook page, within the limit (${s.text.length})`);
    t.ok(/[.!?]$/.test(s.text), `${s.id}: ends like a page`);
    t.ok(s.text.split(/(?<=[.!?])\s+/).length >= 6, `${s.id}: written as short sentences`);
  });
  t.eq(new Set(stories.map((s) => s.title)).size, stories.length, 'page titles are unique');
  t.eq(new Set(stories.map((s) => s.text)).size, stories.length, 'page texts are unique');
});

t.test('lore is the spine: the Singer, the Hush, the Conductor, each keeper who held on, each hero and why they were sung', () => {
  const T = (id) => DATA.lore[id].text;
  t.ok(/Singer/.test(T('intro')) && /Hush/.test(T('intro')), 'the intro names the Singer and the Hush');
  t.ok(/two voices/.test(T('intro')), 'and the two who wake');
  t.ok(/yamabiko/.test(T('intro')) && /held a breath/.test(T('intro')), 'the Hush is a held breath in the shape of a yamabiko');
  t.ok(/Grove/.test(T('ch1_intro')) && /fox/.test(T('ch1_intro')) && /nine/.test(T('ch1_intro')), 'verse 1 introduces the grove and the fox');
  t.ok(/Lantern City/.test(T('ch2_intro')) && /silk/.test(T('ch2_intro')) && /holds/.test(T('ch2_intro')), 'verse 2 introduces the city and the one who holds it together');
  t.ok(/Citadel/.test(T('ch3_intro')) && /red baton/.test(T('ch3_intro')) && /Keeper of the Last Note/.test(T('ch3_intro')), 'verse 3 introduces the citadel and the Keeper');
  t.ok(/Kuzunoha/.test(T('ch1_clear')) && /walls/.test(T('ch1_clear')), 'the fox held the sounds and sang walls');
  t.ok(/Jorogumo/.test(T('ch2_clear')) && /kept/.test(T('ch2_clear')), 'the spider held the people and kept them');
  t.ok(/Conductor/.test(T('victory')) && /perfect/.test(T('victory')) && /Singer/.test(T('victory')) && /again/.test(T('victory')), 'the victory reveals the Conductor speaks with the Singer\'s voice (he is the Singer\'s doubt) and the land asks to be sung again');
  t.ok(/the last line together/.test(T('victory')) && /open/.test(T('victory')), 'the ending is sung together and left open');
  t.ok(/fade|grey/.test(T('defeat')) && /comes back around/.test(T('defeat')) && !/dead|die|kill/i.test(T('defeat')), 'defeat is soft: the beat comes back around, nobody dies');
  t.ok(/silver hair/.test(T('ch1_clear')) && /shrine/.test(T('ch1_clear')), 'the end of verse 1 points at Suzu, who unlocks now');
  t.ok(/storm|thunder/.test(T('ch2_clear')) && /knuckles/.test(T('ch2_clear')), 'the end of verse 2 points at Raiga, who unlocks now');
  const hero = { hanae: /first bar|hero/, kuro: /harmony/, suzu: /shrine|bell|tune/, raiga: /thunderstorm|laugh/ };
  L.heroIds.forEach((h) => {
    const l = DATA.lore['hero_' + h];
    t.ok(new RegExp(h[0].toUpperCase() + h.slice(1)).test(l.text) && l.title.toLowerCase().indexOf(h) === 0, `hero_${h} is about ${h}`);
    t.ok(/Singer/.test(l.text), `hero_${h} says why the Singer sang them`);
    t.ok(hero[h].test(l.text), `hero_${h} carries their signature imagery`);
    t.ok(l.title.indexOf(DATA.heroes[h].title.replace(/^The /, '')) >= 0, `hero_${h} title carries the hero title from DATA.heroes`);
  });
  const all = stories.map((s) => s.text).join(' ');
  t.ok(all.split('Hush').length >= 6, 'the Hush recurs through the pages');
  t.ok(!new RegExp(L.heroIds.map((h) => esc(DATA.heroes[h].name)).join('|')).test([T('intro'), T('ch1_intro'), T('ch2_intro'), T('ch3_intro'), T('ch1_clear'), T('ch2_clear'), T('victory'), T('defeat')].join(' ')), 'the shared story pages never name a hero (the party is chosen by the player)');
  t.ok(all.length > 6000, 'a lot of story');
});

t.test('barks: five lines for each of start, hurt, kill, down, win and swap, at most 64 characters, in four distinct voices', () => {
  const key = L.heroIds.map((h) => 'barks_' + h);
  key.forEach((id) => t.ok(DATA.lore[id], `${id} exists`));
  const every = [];
  barks.forEach((b) => {
    t.deep(Object.keys(b.lines).sort(), DATA.FIXED.barkKeys.slice().sort(), `${b.id}: exactly the six keys`);
    DATA.FIXED.barkKeys.forEach((k) => {
      t.eq(b.lines[k].length, 5, `${b.id}.${k}: five lines`);
      t.eq(new Set(b.lines[k]).size, 5, `${b.id}.${k}: five different lines`);
      b.lines[k].forEach((s) => { every.push(s); t.ok(s.length >= 4 && s.length <= 64, `${b.id}.${k}: "${s}" fits a speech bubble (${s.length})`); });
    });
  });
  t.eq(every.length, 120, '120 lines');
  t.eq(new Set(every).size, 120, 'no line is shared between heroes or events');
  const lines = (h) => Object.values(DATA.lore['barks_' + h].lines).flat();
  const frac = (h, re) => lines(h).filter((s) => re.test(s)).length / lines(h).length;
  t.ok(frac('raiga', /!/) >= 0.6, `Raiga booms (${frac('raiga', /!/).toFixed(2)} of lines shout)`);
  t.ok(frac('raiga', /friend|thunder|storm|boom/i) >= 0.4, 'and speaks of friends and thunder');
  t.ok(frac('suzu', /!/) <= 0.03, 'Suzu never raises her voice');
  t.ok(frac('suzu', /moon|gently|rest|peace|breathe|thread|steady|together|kind|sorry|truly|forgive|stay|careful|thank|quiet|watch|hold|light|worry|page/i) >= 0.5, 'Suzu is soft and steady');
  t.ok(frac('kuro', /verse|chorus|flute|note|\bbars?\b|scene|song|sing|sung|tune|tempo|key|crescendo|cadence|coda|score|solo|spotlight|curtain|applause|perform|play|listen|\brest\b|melody|harmony|rhythm|beat|encore|review|singer|echo|reprise|seats|musical/i) >= 0.6, 'Kuro is musical');
  t.ok(frac('kuro', /!/) <= 0.05, 'and teases with a straight face');
  t.ok(frac('hanae', /!/) <= 0.05, 'Hanae is dry');
  t.ok(frac('hanae', /ponytail|brilliant|excellen|petals|edited|hero|flawless|pride|win|first|front|good spot|next|collection|difficult|lucky|bold|rude/i) >= 0.4, 'and proud');
  t.ok(lines('raiga').some((s) => s.length <= 8) && lines('hanae').some((s) => s.length <= 8), 'shouts and quips can be short');
  L.heroIds.forEach((h) => {
    const own = lines(h).join(' ').toLowerCase();
    L.heroIds.filter((o) => o !== h).forEach((o) => t.ok(own.indexOf(o) < 0, `${h}'s barks never name ${o}`));
  });
  t.ok(barks.every((b) => Object.values(b.lines).flat().every((s) => /[.!?]$/.test(s) || /\.\.\.$/.test(s))), 'every bark ends with punctuation');
  t.ok(lines('hanae').filter((s) => /^Nobody\. Saw\. That\.$/.test(s)).length === 1, 'the running gags exist');
});

t.test('the Library lists every story page and no bark set', () => {
  if (!haveMeta || !META.storyList) { t.ok(true, 'META not available, skipped'); return; }
  const list = META.storyList().map((s) => s.id).sort();
  t.deep(list, stories.map((s) => s.id).sort(), 'storyList is every lore id except barks');
});

// =================================================================================================== 3. integration with the real RUN
const HERO_SETS = [['hanae', 'kuro'], ['suzu', 'raiga'], ['hanae', 'suzu'], ['kuro', 'raiga']];
const partyFor = (e) => {
  const need = new Set();
  if (e.when && e.when.hero) need.add(e.when.hero);
  e.choices.forEach((c) => { if (c.req && c.req.hero) need.add(c.req.hero); });
  const has = HERO_SETS.find((s) => [...need].every((h) => s.indexOf(h) >= 0));
  return has || ['hanae', 'kuro'];
};
const baseRuns = {};                                                            // map generation dominates the cost, so build each base run once
const clone = (R) => RUN.deserialize(JSON.parse(JSON.stringify(RUN.serialize(R))));
function baseRun(heroes, chapter) {
  const key = heroes.join('+') + ':' + chapter;
  if (!baseRuns[key]) { const R = RUN.newRun({ heroes, seed: 100, trial: 0 }); R.chapter = chapter; baseRuns[key] = R; }
  return clone(baseRuns[key]);
}
function richRun(e, seed) {
  const R = baseRun(partyFor(e), chapterOf(e) || 2);
  R.seed = seed;                                                                // every roll is seeded from R.seed, so this varies the outcomes
  R.gold = 400; R.ink = 6;
  R.heroes.forEach((h) => { h.hp = Math.ceil(h.maxHp * 0.5); });
  R.relics = ['brass_lantern', 'fox_mask', 'silver_bell', 'jade_key'];                    // RUN only tests membership here, so this works before data_relics.js exists
  R.flags.fox_spared = 1; R.flags.fox_bond = 1;
  return R;
}
// RUN locks a choice whose every outcome can only do nothing (a fixed treasure already owned, a curse to remove with none in the deck): these loops want the
// choice open, so they make it meaningful first. The locks themselves are tested in their own test below.
function liveFor(R, c) {
  c.out.forEach((o) => A(o.ops).forEach((x) => {
    if (x.op === 'addRelic' && x.id && !(c.req && c.req.relic === x.id)) R.relics = R.relics.filter((r) => r !== x.id);
    if (x.op === 'removeCard' && x.filter && x.filter.type === 'curse' && DATA.cards.curse_regret && !R.deck.some((k) => k.id === 'curse_regret')) RUN.addCard(R, 'curse_regret');
  }));
  return R;
}
function answerPending(R, res) {
  const log = [];
  A(res.pending).slice().forEach((p) => {
    if (p.op === 'cardReward') { const r = RUN.resolvePending(R, p.id, p.offers[0]); t.ok(r.ok, `pending cardReward accepts an offered card`); return; }
    const cands = R.deck.filter((c) => {
      const d = DATA.cards[c.id];
      if (p.filter && p.filter.type && (!d || d.type !== p.filter.type)) return false;
      if (p.filter && p.filter.hero && (!d || d.hero !== p.filter.hero)) return false;
      if (p.op === 'upgradeCard') return !!d && !!d.up && !c.up;
      if (p.op === 'transformCard' || p.op === 'duplicateCard') return !!d && L.heroIds.indexOf(d.hero) >= 0;
      return true;
    });
    const need = Math.min(p.n, cands.length);
    const r = RUN.resolvePending(R, p.id, cands.slice(0, need).map((c) => c.uid));
    t.ok(r.ok, `pending ${p.op} accepts ${need} card(s) from the deck`);
    r.log.forEach((x) => log.push(x));
  });
  return log;
}

t.test('integration: every outcome of every choice applies cleanly through RUN.applyOps', () => {
  if (!haveRun) { t.ok(true, 'RUN or MAP not available, replay skipped'); return; }
  let replayed = 0, fights = 0;
  evs.forEach((e, ei) => e.choices.forEach((c, ci) => c.out.forEach((o, oi) => {
    const w = `${e.id}[${ci}].out[${oi}]`;
    const R0 = richRun(e, 100 + ei), R = clone(R0);
    const gold0 = R.gold, ink0 = R.ink, deck0 = R.deck.length, brush0 = R.brushes.length;
    let res;
    try { res = RUN.applyOps(R, U.deepCopy(A(o.ops)), { rng: U.rng(oi + 1), tile: { q: R.map.start.q, r: R.map.start.r } }); } catch (err) { t.ok(false, `${w}: applyOps threw ${err && err.message}`); return; }
    replayed++;
    t.ok(res && Array.isArray(res.log) && Array.isArray(res.pending), `${w}: returns a log and pending list`);
    const ops = A(o.ops);
    const relicy = ops.some((x) => x.op === 'addRelic');                       // a relic's onPickup hook may legitimately move gold, Ink, brushes or the deck
    const fight = ops.find((x) => x.op === 'fight');
    if (fight) {
      fights++;
      t.ok(res.fight && res.fight.kind === 'combat', `${w}: a fight op yields a combat node`);
      t.deep(res.fight.enemies, fight.enemies, `${w}: the node fights exactly the named enemies`);
      t.eq(res.fight.tier, fight.tier === 'elite' ? 'elite' : 'normal', `${w}: reward tier rides on the node`);
      t.deep(res.fight.onWin, fight.win ? fight.win : null, `${w}: win ops ride on the node`);
      t.eq(ops[ops.length - 1], fight, `${w}: the fight is last`);
    } else t.ok(!res.fight, `${w}: no fight without a fight op`);
    const log = answerPending(R, res);
    t.eq(R.pending.length, 0, `${w}: every pending choice can be answered`);
    R.heroes.forEach((h) => t.ok(h.hp >= 1 && h.hp <= h.maxHp, `${w}: ${h.id} HP ${h.hp}/${h.maxHp} stays legal`));
    t.ok(R.gold >= 0 && R.ink >= 0 && R.ink <= R.inkMax, `${w}: gold and Ink stay in range`);
    const upTo = (op) => ops.filter((x) => x.op === op).reduce((s, x) => s + (x.n || 1), 0);
    const goldOps = ops.filter((x) => x.op === 'gold');
    if (!relicy && goldOps.length && goldOps.every((x) => x.n !== undefined)) t.eq(R.gold, Math.max(0, gold0 + goldOps.reduce((s, x) => s + x.n, 0)), `${w}: gold moves by exactly the ops`);
    const inkOps = ops.filter((x) => x.op === 'ink' && x.n !== undefined);
    if (!relicy && ops.filter((x) => x.op === 'ink').length === inkOps.length && inkOps.length) t.eq(R.ink, Math.max(0, Math.min(R.inkMax, ink0 + inkOps.reduce((s, x) => s + x.n, 0))), `${w}: Ink moves by exactly the ops`);
    ops.filter((x) => x.op === 'maxHp').forEach((x) => { const who = x.who && L.heroIds.indexOf(x.who) >= 0 ? R.heroes.find((h) => h.id === x.who) : null; if (who) t.ok(who.maxHp >= DATA.heroes[who.id].maxHp + x.n, `${w}: ${who.id} max HP rose`); });
    if (!relicy && ops.some((x) => x.op === 'addBrush')) t.eq(R.brushes.length, brush0 + upTo('addBrush'), `${w}: brushes gained`);
    if (ops.some((x) => x.op === 'flag')) ops.filter((x) => x.op === 'flag').forEach((x) => t.ok(R.flags[x.k], `${w}: flag ${x.k} is set`));
    const removes = ops.filter((x) => x.op === 'removeCard');
    if (!relicy && removes.length && !removes.some((x) => x.filter)) t.eq(R.deck.length, deck0 - removes.length + (DATA.cards.curse_regret ? upTo('addCurse') : 0) + upTo('duplicateCard') + upTo('addCard'), `${w}: removals shrink the deck by their count`);
    if (ops.some((x) => x.op === 'duplicateCard') && !removes.length) t.ok(R.deck.length >= deck0 + upTo('duplicateCard'), `${w}: duplicates grow the deck`);
    if (ops.some((x) => x.op === 'transformCard') && !removes.length && !ops.some((x) => x.op === 'duplicateCard')) t.ok(R.deck.length >= deck0, `${w}: transforming never shrinks the deck`);
    if (ops.some((x) => x.op === 'addCurse') && DATA.cards.curse_regret) t.ok(R.deck.length > deck0 - removes.length, `${w}: curses reach the deck`);
    if (ops.some((x) => x.op === 'upgradeCard')) t.ok(R.deck.some((c) => c.up), `${w}: some card is upgraded`);
    if (ops.some((x) => x.op === 'paint')) t.ok(log.length >= 0 && res.log.some((x) => x.op === 'paint'), `${w}: painting is logged`);
  })));
  t.ok(replayed >= 150, `replayed ${replayed} outcomes`);
  t.ok(fights >= 6, `replayed ${fights} fights`);
});

t.test('integration: relic outcomes hand over a real relic on a fresh run, so the rarity pools the fables draw from are never empty', () => {
  if (!haveRun || !Object.keys(DATA.relics).length) { t.ok(true, 'RUN or the relic file is not available, skipped'); return; }
  let checked = 0;
  evs.forEach((e) => e.choices.forEach((c, ci) => c.out.forEach((o, oi) => {
    const grants = A(o.ops).filter((x) => x.op === 'addRelic');
    if (!grants.length) return;
    const R = baseRun(partyFor(e), chapterOf(e) || 2); R.relics = []; R.seed = 900 + oi;
    RUN.applyOps(R, U.deepCopy(A(o.ops)), { rng: U.rng(7 + oi) });
    checked++;
    t.ok(R.relics.length >= grants.length, `${e.id}[${ci}].out[${oi}]: ${grants.length} relic(s) granted (have ${R.relics.length})`);
    grants.filter((x) => x.id).forEach((x) => t.ok(R.relics.indexOf(x.id) >= 0, `${e.id}: ${x.id} is now owned`));
    const wanted = grants.filter((x) => x.rarity).map((x) => x.rarity), fixed = grants.filter((x) => x.id).map((x) => x.id);
    R.relics.forEach((id) => t.ok(fixed.indexOf(id) >= 0 || (DATA.relics[id] && wanted.indexOf(DATA.relics[id].rarity) >= 0), `${e.id}: ${id} is a relic the fable asked for (${wanted.join('/') || 'by id'})`));
    grants.filter((x) => x.rarity).forEach((x) => t.ok(DATA.relicPool(x.rarity, undefined, partyFor(e)).length >= 4, `${e.id}: the ${x.rarity} pool has room to draw from`));
  })));
  t.ok(checked >= 10, `checked ${checked} relic outcomes`);
  const owned = baseRun(['hanae', 'kuro'], 2); owned.relics = ['fox_mask'];
  const again = RUN.applyOps(owned, [{ op: 'addRelic', id: 'fox_mask' }], { rng: U.rng(1) });
  const standIn = owned.relics.filter((r) => r !== 'fox_mask');
  t.ok(owned.relics.length === 2 && standIn.length === 1 && DATA.relics[standIn[0]].rarity === DATA.relics.fox_mask.rarity, 'granting a relic you already own gives a stand-in of the same rarity, never nothing (' + owned.relics.join(',') + ')');
  t.ok(again.log.length === 1 && again.log[0].id === standIn[0] && /^Found /.test(again.log[0].text), 'and the log names the relic that really arrived');
});

t.test('integration: a choice that can only do nothing is locked with a reason (the fixed treasure owned, no curse to remove, nothing to sharpen), and a fable never locks itself', () => {
  if (!haveRun) { t.ok(true, 'RUN or MAP not available, skipped'); return; }
  const dead = (e, over) => { const R = richRun(e, 7); R.gold = 400; R.flags = { fox_spared: 1, fox_bond: 1 }; R.deck = R.deck.filter((c) => !(DATA.cards[c.id] && DATA.cards[c.id].hero === 'curse')); R.deck.forEach((c) => { if (DATA.cards[c.id] && DATA.cards[c.id].up) c.up = 1; }); Object.assign(R, over || {}); return R; };
  const row = (id, ci, R) => RUN.eventChoices(R, DATA.events[id])[ci];
  let r = row('peddler_silver_bell', 1, dead(DATA.events.peddler_silver_bell));
  t.ok(!r.ok && new RegExp(esc(DATA.relics.brass_lantern.name)).test(r.reason), 'the brass lamp is locked while the Brass Lantern is owned (' + r.reason + ')');
  const free = dead(DATA.events.peddler_silver_bell); free.relics = ['silver_bell']; t.eq(row('peddler_silver_bell', 1, free).ok, true, 'and open without it');
  r = row('fox_returns', 0, dead(DATA.events.fox_returns)); t.ok(!r.ok && new RegExp(esc(DATA.relics.fox_mask.name)).test(r.reason), 'the fox mask is locked while owned (' + r.reason + ')');
  r = row('void_tear', 1, dead(DATA.events.void_tear)); t.ok(!r.ok && /no curse/i.test(r.reason), 'feeding the tear a regret needs a curse (' + r.reason + ')');
  r = row('blank_patch', 2, dead(DATA.events.blank_patch)); t.ok(!r.ok && /no curse/i.test(r.reason), 'so does the cursed page (' + r.reason + ')');
  const cursed = dead(DATA.events.void_tear); RUN.addCard(cursed, 'curse_regret'); t.eq(row('void_tear', 1, cursed).ok, true, 'open with a curse in the deck');
  r = row('wandering_storyteller', 0, dead(DATA.events.wandering_storyteller)); t.ok(!r.ok && /sharpen/i.test(r.reason), 'paying to sharpen with every card sharp is locked (' + r.reason + ')');
  const sharp = dead(DATA.events.wandering_storyteller); sharp.deck[0].up = 0; t.eq(row('wandering_storyteller', 0, sharp).ok, true, 'open with a card to sharpen');
  const sample = dead(DATA.events.void_tear); const chosen = Object.assign(sample, { node: { kind: 'event', tile: { q: sample.map.start.q, r: sample.map.start.r }, event: 'void_tear', chosen: null } });
  const refused = RUN.eventChoose(chosen, DATA.events.void_tear, 1); t.ok(!refused.ok && /no curse/i.test(refused.reason) && chosen.node.chosen === null, 'eventChoose refuses a locked choice and changes nothing');
  // a gamble with one live outcome stays open (the koi might give a gem)
  const koi = dead(DATA.events.koi_wishing_pond); koi.chapter = 2; t.eq(row('koi_wishing_pond', 0, koi).ok, true, 'a wish with another outcome that can happen is not locked');
  // the worst hand for every fable: broke, every fixed treasure owned, no curse, every card sharp. Something is still open, and every lock says why.
  let worst = 0;
  evs.forEach((e) => {
    const R = dead(e); R.gold = 0; R.heroes.forEach((h) => { h.hp = h.maxHp; });
    const rows = RUN.eventChoices(R, e);
    t.ok(rows.some((x) => x.ok), `${e.id}: even in the worst hand a choice is open`);
    rows.forEach((x) => { if (!x.ok && !x.hidden) { worst++; t.ok(typeof x.reason === 'string' && x.reason.length > 4, `${e.id}[${x.index}]: the lock says why (${x.reason})`); } });
  });
  t.ok(worst > 10, 'many choices lock in the worst hand (' + worst + ')');
  // hand-made fable: every choice dead is lifted
  const all = { id: 'allDead', title: 'x', choices: [{ label: 'a', out: [{ w: 1, text: 't', ops: [{ op: 'removeCard', filter: { type: 'curse' } }] }] }, { label: 'b', out: [{ w: 1, text: 'u', ops: [{ op: 'upgradeCard' }] }] }] };
  const D = dead(DATA.events.void_tear); D.deck.forEach((c) => { c.up = 1; }); t.deep(RUN.eventChoices(D, all).map((x) => x.ok), [true, true], 'a fable whose every choice is dead locks none of them');
});

t.test('integration: RUN.eventChoose runs each choice end to end with seeded, declared outcomes, and reqs gate correctly', () => {
  if (!haveRun) { t.ok(true, 'RUN or MAP not available, skipped'); return; }
  evs.forEach((e, ei) => {
    const R0 = richRun(e, 500 + ei);
    e.choices.forEach((c, ci) => {
      const R = clone(R0);
      R.relics = R0.relics.slice();                                              // deserialize drops relic ids nobody has defined yet
      if (c.req && c.req.chapter) R.chapter = c.req.chapter;                     // a chapter-gated choice is only offered in that chapter
      liveFor(R, c);
      R.node = { kind: 'event', tile: { q: R.map.start.q, r: R.map.start.r }, event: e.id, chosen: null };
      const st = RUN.eventChoices(R, e);
      t.eq(st[ci].ok, true, `${e.id}[${ci}]: available to a rich party that meets every requirement`);
      const res = RUN.eventChoose(R, e, ci);
      t.ok(res.ok, `${e.id}[${ci}]: chosen`);
      t.ok(c.out.some((o) => o.text === res.text), `${e.id}[${ci}]: the text shown is a declared outcome`);
      t.eq(R.node.chosen === undefined ? null : (R.node.chosen === null ? null : ci), R.node.kind === 'combat' ? null : ci, `${e.id}[${ci}]: the choice is recorded`);
      if (res.fight) t.ok(c.out.some((o) => A(o.ops).some((x) => x.op === 'fight')), `${e.id}[${ci}]: fights only where declared`);
      if (res.pending) answerPending(R, res);
      t.eq(R.pending.length, 0, `${e.id}[${ci}]: nothing left pending`);
    });
    e.choices.forEach((c, ci) => {
      if (!(c.req && c.req.chapter)) return;
      [1, 2, 3].forEach((ch) => { const X = clone(R0); X.relics = R0.relics.slice(); X.chapter = ch; t.eq(RUN.eventChoices(X, e)[ci].ok, ch === c.req.chapter, `${e.id}[${ci}]: the chapter gate opens in chapter ${c.req.chapter} only (tested in ${ch})`); });
    });
    // a broke, healthy, empty-handed party in the wrong chapter still has the safe choice
    const B = clone(R0);
    B.gold = 0; B.relics = []; B.flags = {}; B.chapter = chapterOf(e) || 1; B.heroes.forEach((h) => { h.hp = h.maxHp; });
    const bst = RUN.eventChoices(B, e);
    t.ok(e.choices.some((c, i) => isSafe(c) && !c.req && bst[i].ok), `${e.id}: a broke party with no relics still has a safe way through`);
    e.choices.forEach((c, i) => {
      if (c.req && c.req.hero) t.ok(bst[i].hidden === !(B.heroes.some((h) => h.id === c.req.hero)), `${e.id}[${i}]: a hero choice is hidden exactly when that hero is away`);
      if (c.req && c.req.gold) t.eq(bst[i].ok, false, `${e.id}[${i}]: a broke party cannot pay`);
      if (c.req && c.req.relic) t.eq(bst[i].ok, false, `${e.id}[${i}]: no relic, no option`);
    });
  });
  // outcomes are weighted by w over many seeds
  const ev = DATA.events.kappa_toll, bow = 1;
  let fights = 0, free = 0;
  for (let s = 0; s < 400; s++) {
    const R = baseRun(['hanae', 'kuro'], 1); R.seed = s;
    R.node = { kind: 'event', tile: { q: R.map.start.q, r: R.map.start.r }, event: ev.id, chosen: null };
    const res = RUN.eventChoose(R, ev, bow);
    if (res.fight) fights++; else free++;
  }
  t.ok(fights > 400 * 0.28 && fights < 400 * 0.52, `the kappa fights about 2 times in 5 (${fights} of 400)`);
  t.eq(fights + free, 400, 'and always resolves');
});

t.test('integration: RUN.pickEvent can reach every fable, and never offers one it should not', () => {
  if (!haveRun) { t.ok(true, 'RUN or MAP not available, skipped'); return; }
  const tiles = []; for (let q = 0; q < 24; q++) for (let r = 0; r < 20; r++) tiles.push({ q, r });
  const sweeps = {};
  const reach = (R) => {
    const key = JSON.stringify([R.chapter, R.heroes.map((h) => h.id), R.flags, R.relics, R.seen.events]);
    if (sweeps[key]) return sweeps[key];
    const seen = {}; tiles.forEach((tl) => { const id = RUN.pickEvent(R, tl); if (id) seen[id] = (seen[id] || 0) + 1; });
    return (sweeps[key] = seen);
  };
  const setup = (ch, opts) => { const R = baseRun(opts.heroes || ['hanae', 'kuro'], ch); R.seed = opts.seed || 5; R.flags = Object.assign({}, opts.flags); R.relics = A(opts.relics).slice(); return R; };
  evs.forEach((e) => {
    const chs = e.chapters || [1, 2, 3];
    const heroes = e.when && e.when.hero ? partyFor(e) : ['hanae', 'kuro'];
    const flags = {}; if (e.when && e.when.flag) flags[e.when.flag] = 1;
    const relics = e.when && e.when.relic ? [e.when.relic] : [];
    chs.forEach((ch) => t.ok(reach(setup(ch, { heroes, flags, relics }))[e.id] > 0, `${e.id}: can roll in chapter ${ch} when its conditions hold`));
    [1, 2, 3].filter((ch) => chs.indexOf(ch) < 0).forEach((ch) => t.ok(!reach(setup(ch, { heroes, flags, relics }))[e.id], `${e.id}: never rolls in chapter ${ch}`));
    if (e.when && e.when.flag) t.ok(!reach(setup(chs[0], { heroes, relics }))[e.id], `${e.id}: never rolls without flag ${e.when.flag}`);
    if (e.when && e.when.relic) t.ok(!reach(setup(chs[0], { heroes, flags }))[e.id], `${e.id}: never rolls without ${e.when.relic}`);
    if (e.when && e.when.hero) t.ok(!reach(setup(chs[0], { heroes: L.heroIds.filter((h) => h !== e.when.hero).slice(0, 2), flags, relics }))[e.id], `${e.id}: never rolls without ${e.when.hero}`);
  });
  // once events do not repeat, and the follow-up outweighs the field
  const R = setup(2, { flags: { fox_spared: 1 } });
  const fx = reach(R);
  const others = Object.keys(fx).filter((k) => k !== 'fox_returns');
  const avg = others.reduce((s, k) => s + fx[k], 0) / others.length;
  t.ok(fx.fox_returns > avg * 2, `fox_returns is favoured over the average fable (${fx.fox_returns} vs ${avg.toFixed(0)})`);
  R.seen.events.push('fox_returns');
  t.ok(!reach(R).fox_returns, 'once: a fable already seen never comes back');
  const fresh = setup(1, {});
  t.ok(Object.keys(reach(fresh)).length >= 20, 'a fresh chapter 1 run sees a wide field of fables');
});

t.done();
