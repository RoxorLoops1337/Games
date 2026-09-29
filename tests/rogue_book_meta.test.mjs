// META: the profile, settings, run save, stats, achievements, Inkstones, the Library, bestiary, story and history (DESIGN 4.10, 5.5).
//
// The suite boots meta.js with util, data and run.js only (`skip` keeps every real content file, combat.js and map.js out), installs a
// tiny stand-in for MAP (RUN only needs generate, serialize and deserialize here) and a synthetic universe, and drives the real RUN
// through newRun and score. Storage is the loader's localStorage stub: `store` seeds it, `failStorage` makes it behave like private mode.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './rogue_book_lib.mjs';

const t = harness('rogue_book meta');
const eq0 = t.eq;
t.eq = (a, b, msg) => (typeof a === 'string' && a.length > 160 ? t.ok(a === b, msg + ' (long strings differ, first 300 chars: ' + a.slice(0, 300) + ')') : eq0(a, b, msg));
const J = (x) => JSON.stringify(x);
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));

// ------------------------------------------------------------------------------------------------ page setup
function stubMap(DATA, U) {
  const key = (q, r) => q + ',' + r;
  const copy = (o) => JSON.parse(JSON.stringify(o));
  return { key, neighbors: () => [], generate: (o) => ({ v: 1, chapter: o.chapter, seed: o.seed, cols: 3, rows: 1, tiles: { '0,0': { q: 0, r: 0, type: 'start', painted: true, done: false, content: {} } }, start: { q: 0, r: 0 }, boss: { q: 2, r: 0 }, pos: { q: 0, r: 0 } }), serialize: copy, deserialize: copy };
}
function universe(D) {
  const pal = D.LISTS.palettes, motifs = D.LISTS.motifs;
  let n = 0;
  const defs = {};
  const mk = (id, hero, rarity, type, extra) => {
    defs[id] = Object.assign({ name: id.replace(/_/g, ' '), hero, type, rarity, cost: 1, fx: type === 'attack' ? [{ op: 'dmg', n: 6, tgt: 'enemy' }] : [{ op: 'block', n: 6 }], up: type === 'attack' ? { fx: [{ op: 'dmg', n: 9, tgt: 'enemy' }] } : { fx: [{ op: 'block', n: 9 }] }, kw: [], slots: [type === 'attack' ? 'red' : 'blue'], art: { m: motifs[n % motifs.length], c: pal[n % pal.length] } }, extra || {});
    n++;
  };
  D.LISTS.heroIds.forEach((h) => {
    const st = D.heroes[h].starter.filter((x, i, a) => a.indexOf(x) === i);
    mk(st[0], h, 'starter', 'attack'); mk(st[1], h, 'starter', 'skill'); mk(st[2], h, 'starter', 'skill');
    mk(h + '_c0', h, 'common', 'attack'); mk(h + '_u0', h, 'uncommon', 'skill', { locked: true }); mk(h + '_u1', h, 'uncommon', 'attack'); mk(h + '_r0', h, 'rare', 'attack', { locked: true, flavor: 'x' }); mk(h + '_r1', h, 'rare', 'skill', { locked: true, flavor: 'x' });
  });
  D.add('cards', defs);
  const curses = {};
  D.FIXED.curses.forEach((id) => { curses[id] = { name: id, hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'skull' } }; });
  D.add('cards', curses);
  const rel = {};
  const mkr = (id, rarity, locked) => { rel[id] = { name: id, rarity, text: 'A charm.', art: { m: 'lantern', c: 'gold' }, mods: { startBlock: 1 }, locked: locked || undefined }; };
  mkr('m_free', 'common'); mkr('m_c', 'common', true); mkr('m_u', 'uncommon', true); mkr('m_r', 'rare', true); mkr('m_b', 'boss', true); mkr('m_s', 'shop', true);
  D.add('relics', rel);
  const gems = {};
  [['m_g1', 1, false], ['m_g2', 2, true], ['m_g3', 3, true], ['m_g2b', 2, true]].forEach(([id, tier, locked]) => { gems[id] = { name: id, color: 'red', tier, art: { cut: 'round' }, mod: { dmg: 1 }, locked: locked || undefined }; });
  D.add('gems', gems);
  const ach = {
    ch1_clear: { name: 'Grove', text: 'Beat chapter 1.', stat: { k: 'boss1Kills', gte: 1 } }, ch2_clear: { name: 'Lanterns', text: 'Beat chapter 2.', stat: { k: 'boss2Kills', gte: 1 } }, ch3_clear: { name: 'Citadel', text: 'Beat chapter 3.', stat: { k: 'boss3Kills', gte: 1 }, reward: { inkstones: 25 } },
    hit20: { name: 'Big hit', text: 'A 20 damage hit.', stat: { k: 'maxHit', gte: 20 }, reward: { inkstones: 5 } }, deck30: { name: 'Thick book', text: 'A deck of 30.', stat: { k: 'maxDeck', gte: 30 } },
    curse3: { name: 'Cursed', text: 'End with 3 curses.', stat: { k: 'curseCards', gte: 3 } }, paint100: { name: 'Painter', text: 'Paint 100 hexes.', stat: { k: 'hexesPainted', gte: 100 }, reward: { inkstones: 10 } },
    trial1: { name: 'Trial 1', text: 'Win trial 1.', stat: { k: 'trialBest', gte: 1 } }, hanae1: { name: 'Blossom', text: 'Win with Hanae.', stat: { k: 'winsHanae', gte: 1 } }, daily1: { name: 'Daily', text: 'A daily.', stat: { k: 'dailyRuns', gte: 1 }, reward: { inkstones: 7 } },
    kills10: { name: 'Ten', text: '10 kills.', stat: { k: 'kills', gte: 10 } }, small1: { name: 'Slim', text: 'Win small.', stat: { k: 'smallDeckWins', gte: 1 } }, wins2: { name: 'Twice', text: 'Win twice.', stat: { k: 'wins', gte: 2 } },
  };
  D.add('achievements', ach);
  D.add('lore', {
    intro: { id: 'intro', title: 'Once', text: 'Once upon a page.' }, ch1_intro: { id: 'ch1_intro', title: 'Grove', text: 'Bamboo.' }, hero_hanae: { id: 'hero_hanae', title: 'Hanae', text: 'A blade.' }, extra_note: { id: 'extra_note', title: 'Note', text: 'A note.' },
    barks_hanae: { id: 'barks_hanae', lines: { start: ['a', 'b', 'c', 'd', 'e'], hurt: ['a', 'b', 'c', 'd', 'e'], kill: ['a', 'b', 'c', 'd', 'e'], down: ['a', 'b', 'c', 'd', 'e'], win: ['a', 'b', 'c', 'd', 'e'], swap: ['a', 'b', 'c', 'd', 'e'] } },
  });
}
const STUB = stubMap.toString();
function fresh(opts) {
  const api = boot(Object.assign({ only: ['meta'], skip: ['data_*', 'map', 'combat'] }, opts || {}));
  api._run('globalThis.MAP = (' + STUB + ')(DATA, U);');
  universe(api.DATA);
  return api;
}
const G = fresh();
const { DATA, RUN, U } = G;
const E = DATA.ECONOMY, L = DATA.LISTS;
// a run as the end screens see it: real RUN.newRun, then the stats a finished run would carry
function mkRun(A, over) {
  over = over || {};
  const R = A.RUN.newRun({ heroes: over.heroes || ['hanae', 'kuro'], seed: over.seed || 1, trial: over.trial || 0, daily: !!over.daily, unlocked: over.unlocked || null });
  Object.assign(R.stats, over.stats || {});
  if (over.victory) { R.done = true; R.victory = true; }
  if (over.chapter) R.chapter = over.chapter;
  if (over.trialSet !== undefined) R.trial = over.trialSet;
  if (over.deckSize) { while (R.deck.length < over.deckSize) A.RUN.addCard(R, 'hanae_c0'); R.deck.length = over.deckSize; }
  if (over.curses) for (let i = 0; i < over.curses; i++) A.RUN.addCard(R, 'curse_regret');
  if (over.foes) R.foes = over.foes;
  if (over.gold !== undefined) R.gold = over.gold;
  return R;
}

// ================================================================================================ load, save, defaults
t.test('nothing touches storage until load; load never writes; save writes the versioned key', () => {
  const A = fresh();
  t.deep(Object.keys(A._store), [], 'booting reads and writes nothing');
  const P = A.META.load();
  t.deep(Object.keys(A._store), [], 'load of an empty store writes nothing'); t.eq(P.v, 1, 'version 1');
  t.eq(A.META.save(), true, 'save reports success'); t.deep(Object.keys(A._store), ['rb_profile_v1'], 'exactly the documented key'); t.eq(JSON.parse(A._store.rb_profile_v1).v, 1, 'stored with a version');
});
t.test('a fresh profile has every documented field and the DATA.SETTINGS defaults', () => {
  const A = fresh(); const P = A.META.load();
  t.deep(Object.keys(P).sort(), ['ach', 'daily', 'history', 'inkstones', 'kills', 'seen', 'settings', 'stats', 'story', 'tutorial', 'unlocked', 'v'], 'top-level fields');
  t.eq(P.inkstones, 0, 'no Inkstones'); t.deep(Object.keys(P.stats).sort(), L.statKeys.slice().sort(), 'every stat key'); L.statKeys.forEach((k) => t.eq(P.stats[k], 0, 'stat ' + k));
  t.deep(P.unlocked, { card: [], relic: [], gem: [], hero: [] }, 'nothing unlocked'); t.deep(P.ach, {}, 'no achievements'); t.deep(P.seen, {}, 'seen'); t.deep(P.kills, {}, 'kills'); t.deep(P.story, {}, 'story'); t.deep(P.history, [], 'history'); t.deep(P.tutorial, {}, 'tutorial'); t.deep(P.daily, { last: 0 }, 'daily');
  t.deep(Object.keys(P.settings).sort(), Object.keys(DATA.SETTINGS).sort(), 'every setting'); Object.keys(DATA.SETTINGS).forEach((k) => t.eq(P.settings[k], DATA.SETTINGS[k].def, 'default ' + k));
  t.eq(A.META.get('musicVol'), 0.7, 'music volume'); t.eq(A.META.get('sfxVol'), 0.8, 'sfx volume'); t.eq(A.META.get('shake'), 1, 'shake'); t.eq(A.META.get('reduceMotion'), null, 'reduceMotion follows the system'); t.eq(A.META.get('textScale'), 1, 'text scale'); t.eq(A.META.get('fastAnim'), 0, 'fastAnim'); t.eq(A.META.get('damageNumbers'), true, 'damage numbers'); t.eq(A.META.get('colorblind'), false, 'colorblind'); t.eq(A.META.get('quality'), 'auto', 'quality'); t.eq(A.META.get('hints'), true, 'hints');
  t.eq(A.META.profile, P, 'META.profile is the live object'); t.eq(A.META.inkstones, 0, 'META.inkstones'); t.eq(A.META.history, P.history, 'META.history');
});
t.test('the profile survives a reload', () => {
  const A = fresh(); A.META.load();
  A.META.set('musicVol', 0.3); A.META.track('kills', 12); A.META.track('maxHit', 31); A.META.markLore('intro'); A.META.setTutorial('map'); A.META.seen('kappa');
  A.META.profile.inkstones = 44; A.META.profile.ach.ch1_clear = 99; A.META.save();
  const B = fresh({ store: Object.assign({}, A._store) }); const P = B.META.load();
  t.eq(P.inkstones, 44, 'Inkstones'); t.eq(P.stats.kills, 12, 'stats'); t.eq(P.stats.maxHit, 31, 'max stat'); t.eq(P.settings.musicVol, 0.3, 'setting'); t.eq(P.story.intro, true, 'lore'); t.eq(P.tutorial.map, true, 'tutorial'); t.eq(P.seen.kappa, 1, 'seen'); t.eq(P.ach.ch1_clear, 99, 'achievement timestamp');
  t.eq(canon(B.META.profile), canon(A.META.profile), 'identical');
});
t.test('corrupt storage falls back to a fresh profile, keeps the raw text, and never throws', () => {
  ['{not json', '', '[]', '5', 'null', '"text"', '{"v":1,'].forEach((raw) => {
    const A = fresh({ store: { rb_profile_v1: raw } });
    let P = null; try { P = A.META.load(); } catch (e) { P = 'threw ' + e.message; }
    t.ok(P && typeof P === 'object' && P.v === 1 && P.inkstones === 0, `"${raw}" -> a fresh profile`);
    t.eq(A._store.rb_profile_v1_bad, raw, `"${raw}" is kept under rb_profile_v1_bad`);
    t.eq(A.META.get('musicVol'), 0.7, 'usable straight away'); t.eq(A.META.save(), true, 'and saveable');
    t.eq(A._store.rb_profile_v1_bad, raw, 'the evidence survives the next save'); t.eq(JSON.parse(A._store.rb_profile_v1).v, 1, 'the good profile replaced the bad one');
  });
  const ok = fresh({ store: { rb_profile_v1: J({ v: 1, inkstones: 3 }) } }); ok.META.load(); t.eq(ok._store.rb_profile_v1_bad, undefined, 'valid JSON leaves no bad copy');
});
t.test('forward compatible: missing fields get defaults, unknown fields survive, junk is sanitised', () => {
  const A = fresh({ store: { rb_profile_v1: J({ v: 1, inkstones: 5, futureThing: { a: 1 } }) } }); const P = A.META.load();
  t.eq(P.inkstones, 5, 'kept'); t.deep(Object.keys(P.stats).sort(), L.statKeys.slice().sort(), 'stats filled'); t.eq(P.settings.sfxVol, 0.8, 'settings filled'); t.deep(P.futureThing, { a: 1 }, 'unknown top-level field kept'); A.META.save(); t.deep(JSON.parse(A._store.rb_profile_v1).futureThing, { a: 1 }, 'and written back');
  const future = fresh({ store: { rb_profile_v1: J({ v: 7, inkstones: 9 }) } }); t.eq(future.META.load().v, 7, 'a newer version is loaded as is, not downgraded'); t.eq(future.META.load().inkstones, 9, 'and readable');
  const noVersion = fresh({ store: { rb_profile_v1: J({ inkstones: 2 }) } }); t.eq(noVersion.META.load().v, 1, 'no version means 1');
  const junk = fresh({ store: { rb_profile_v1: J({ v: 1, inkstones: -5, stats: { kills: 'x', wins: -3, maxHit: 12.7, bogus: 4, runs: null }, ach: { a: 5, b: 'x', c: null, d: false, e: true }, unlocked: { card: ['a', 'a', 7, null], relic: 'no' }, seen: { kappa: 2.9, oni: -1, x: 'y' }, kills: [], story: { a: 1, b: 0 }, tutorial: { t: 1, u: '' }, history: [1, { score: 5 }, 'x', null], settings: { musicVol: 9, textScale: 2, reduceMotion: 'yes', shake: 'x', nope: 1 }, daily: { last: 'z' } }) } });
  const j = junk.META.load();
  t.eq(j.inkstones, 0, 'negative Inkstones'); t.eq(j.stats.kills, 0, 'junk stat'); t.eq(j.stats.wins, 0, 'negative stat'); t.eq(j.stats.maxHit, 12, 'fractional stat floored'); t.eq(j.stats.runs, 0, 'null stat'); t.eq(j.stats.bogus, 4, 'a numeric unknown stat is kept (a newer build may know it)');
  t.deep(j.ach, { a: 5, b: 0, e: 0 }, 'achievement stamps: numbers kept, truthy junk becomes 0, falsy dropped'); t.deep(j.unlocked, { card: ['a'], relic: [], gem: [], hero: [] }, 'unlock lists cleaned'); t.deep(j.seen, { kappa: 2 }, 'seen counts'); t.deep(j.kills, {}, 'an array where a map belongs'); t.deep(j.story, { a: true }, 'story flags'); t.deep(j.tutorial, { t: true }, 'tutorial flags');
  t.deep(j.history, [{ score: 5 }], 'history keeps objects only'); t.eq(j.settings.musicVol, 1, 'volume clamped'); t.eq(j.settings.textScale, 1, 'an unlisted text scale falls back'); t.eq(j.settings.reduceMotion, null, 'junk reduceMotion falls back to follow the system'); t.eq(j.settings.shake, 1, 'junk shake'); t.eq(j.settings.nope, undefined, 'unknown settings are dropped'); t.deep(j.daily, { last: 0 }, 'daily');
  const long = fresh({ store: { rb_profile_v1: J({ v: 1, history: Array.from({ length: 40 }, (_, i) => ({ score: i })) }) } }); t.eq(long.META.load().history.length, 20, 'history is capped at 20 on load');
});
t.test('private mode: storage that throws never breaks the game', () => {
  const setFails = fresh({ failStorage: true }); const P = setFails.META.load();
  t.eq(P.v, 1, 'load works when only writes fail'); t.eq(setFails.META.save(), false, 'save reports the failure'); t.eq(setFails.META.set('musicVol', 0.2), 0.2, 'set still works in memory'); t.eq(setFails.META.get('musicVol'), 0.2, 'and reads back');
  const all = fresh({ failStorage: 'all', store: { rb_profile_v1: J({ v: 1, inkstones: 99 }) } }); const a = all.META.load(); t.eq(a.inkstones, 0, 'unreadable storage: a fresh in-memory profile'); t.eq(all.META.save(), false, 'save false'); all.META.track('kills', 3); t.eq(all.META.stat('kills'), 3, 'stats work in memory');
  t.eq(all.META.hasRun(), false, 'no run'); t.eq(all.META.loadRun(), null, 'loadRun does not throw'); all.META.clearRun(); t.ok(true, 'clearRun does not throw');
  const noAccess = fresh({ failStorage: 'access' }); t.eq(noAccess.META.load().v, 1, 'window.localStorage itself throwing is survived'); t.eq(noAccess.META.save(), false, 'save false'); t.eq(noAccess.META.set('hints', false), false, 'settings in memory'); t.eq(noAccess.META.get('hints'), false, 'and read back');
  const R = mkRun(noAccess); t.eq(noAccess.META.saveRun(R), false, 'saveRun false'); t.ok(noAccess.META.loadRun(), 'but the session can still Continue from memory'); t.eq(noAccess.META.hasRun(), true, 'hasRun agrees');
});

// ================================================================================================ settings
t.test('settings: clean values, unknown keys, persistence', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.set('musicVol', 0.25), 0.25, 'set returns the stored value'); t.eq(A.META.set('musicVol', 7), 1, 'clamped'); t.eq(A.META.set('sfxVol', -1), 0, 'clamped low'); t.eq(A.META.set('sfxVol', 'x'), 0.8, 'junk gives the default');
  t.eq(A.META.set('textScale', 1.3), 1.3, 'listed value'); t.eq(A.META.set('textScale', 2), 1, 'unlisted value falls back'); t.eq(A.META.set('reduceMotion', true), true, 'boolean'); t.eq(A.META.set('reduceMotion', null), null, 'null follows the system'); t.eq(A.META.set('fastAnim', 2), 2, 'fastAnim'); t.eq(A.META.set('quality', 'low'), 'low', 'quality');
  t.eq(A.META.set('nope', 1), undefined, 'unknown key'); t.eq(A.META.get('nope'), undefined, 'reads undefined'); t.eq(JSON.parse(A._store.rb_profile_v1).settings.fastAnim, 2, 'saved at once');
  const B = fresh({ store: Object.assign({}, A._store) }); t.eq(B.META.get('textScale'), 1, 'reloaded: textScale'); t.eq(B.META.get('quality'), 'low', 'quality');
});

// ================================================================================================ stats
t.test('track and stat: sums, max keys, unknown keys and junk are ignored', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.track('kills'), 1, 'default n is 1'); t.eq(A.META.track('kills', 4), 5, 'sums'); t.eq(A.META.stat('kills'), 5, 'stat reads it');
  t.eq(A.META.track('maxHit', 12), 12, 'max key'); t.eq(A.META.track('maxHit', 7), 12, 'a lower value never wins'); t.eq(A.META.track('maxHit', 30), 30, 'a higher one does');
  L.statMax.forEach((k) => { const B = fresh(); B.META.load(); B.META.track(k, 5); B.META.track(k, 3); t.eq(B.META.stat(k), 5, k + ' is a max key'); });
  t.eq(A.META.track('bogus', 5), 0, 'unknown stat ignored'); t.eq(A.META.stat('bogus'), 0, 'reads 0'); t.eq(A.META.track('kills', 'x'), 5, 'junk n ignored'); t.eq(A.META.track('kills', NaN), 5, 'NaN ignored'); t.eq(A.META.stat('nothing'), 0, 'unknown stat is 0');
  const dst = { kills: 2, maxHit: 9 }; A.META.mergeStats(dst, { kills: 3, maxHit: 4, turns: 8, bogus: 1, wins: 'x' }); t.deep(dst, { kills: 5, maxHit: 9, turns: 8 }, 'mergeStats: sum, max, known numeric keys only');
});

// ================================================================================================ achievements
t.test('check: unlocks by profile stats, once each, with timestamp, reward and bus events', () => {
  const A = fresh(); A.META.load();
  const got = []; A.META.bus.on('achievement', (e) => got.push(e.id));
  t.deep(A.META.check(), [], 'nothing yet');
  A.META.track('maxHit', 25); A.META.track('kills', 10);
  const first = A.META.check(null, 1234);
  t.deep(first.sort(), ['hit20', 'kills10'], 'both stat gates met'); t.eq(A.META.profile.ach.hit20, 1234, 'the caller supplied timestamp is stored'); t.eq(A.META.inkstones, 5, 'hit20 pays 5 Inkstones, kills10 pays none'); t.deep(got.sort(), ['hit20', 'kills10'], 'one bus event each');
  t.deep(A.META.check(null, 9999), [], 'a second check finds nothing new'); t.eq(A.META.inkstones, 5, 'rewards are paid once'); t.deep(got.length, 2, 'no repeat events'); t.eq(A.META.profile.ach.hit20, 1234, 'the timestamp is not rewritten');
  A.META.track('hexesPainted', 100); t.deep(A.META.check(null, 5), ['paint100'], 'a later stat unlocks its own'); t.eq(A.META.inkstones, 15, 'reward 10'); t.eq(JSON.parse(A._store.rb_profile_v1).ach.paint100, 5, 'saved at once');
  const noNow = fresh(); noNow.META.load(); noNow.META.track('kills', 10); noNow.META.check(); t.eq(noNow.META.profile.ach.kills10, 0, 'no clock is read: without now the stamp is 0'); t.deep(noNow.META.check(), [], 'and it still only fires once');
  const order = fresh(); order.META.load(); ['kills', 'wins'].forEach((k) => order.META.track(k, 20)); order.META.track('maxHit', 99); t.deep(order.META.check(), Object.keys(DATA.achievements).filter((id) => ['hit20', 'kills10', 'wins2'].indexOf(id) >= 0), 'ids come back in registry order');
});
t.test('check(R): evaluates profile stats plus the live run, without merging it', () => {
  const A = fresh(); A.META.load();
  const R = mkRun(A, { stats: { boss1Kills: 1, bossKills: 1, kills: 6 } });
  A.META.track('kills', 4);
  const got = A.META.check(R, 50);
  t.deep(got.sort(), ['ch1_clear', 'kills10'], 'profile kills 4 + run kills 6 reach 10, and the run boss counts mid-run');
  t.eq(A.META.stat('boss1Kills'), 0, 'nothing was merged into the profile'); t.eq(A.META.stat('kills'), 4, 'still only the profile value'); t.deep(A.META.check(R, 60), [], 'and it does not fire twice');
  const B = fresh(); B.META.load(); const big = mkRun(B, { deckSize: 30 }); t.deep(B.META.check(big), ['deck30'], 'maxDeck reads the live deck size');
  const C = fresh(); C.META.load(); const cur = mkRun(C, { curses: 3 }); t.deep(C.META.check(cur), ['curse3'], 'curseCards reads the curses in the live deck');
  const D = fresh(); D.META.load(); D.META.track('curseCards', 2); const two = mkRun(D, { curses: 1 }); t.deep(D.META.check(two), ['curse3'], 'profile curses plus live curses');
  const E2 = fresh(); E2.META.load(); const daily = mkRun(E2, { daily: true, stats: { kills: 50, boss1Kills: 1 } }); t.deep(E2.META.check(daily), [], 'a daily run never counts toward achievements');
  const F = fresh(); F.META.load(); t.deep(F.META.check({ stats: {} }), [], 'a bare run object is fine'); t.deep(F.META.check(null), [], 'null is fine');
});
t.test('heroes unlock through achievements, mid-run and for good', () => {
  const A = fresh(); A.META.load();
  const unlocks = []; A.META.bus.on('unlock', (e) => unlocks.push(e.kind + ':' + e.id));
  t.eq(A.META.isUnlocked('hero', 'hanae'), true, 'starting heroes'); t.eq(A.META.isUnlocked('hero', 'kuro'), true, 'kuro'); t.eq(A.META.isUnlocked('hero', 'suzu'), false, 'suzu is locked'); t.eq(A.META.isUnlocked('hero', 'raiga'), false, 'raiga is locked'); t.eq(A.META.isUnlocked('hero', 'ghost'), false, 'an unknown hero is not playable');
  const R = mkRun(A, { stats: { boss1Kills: 1, bossKills: 1 } });
  t.deep(A.META.check(R), ['ch1_clear'], 'clearing chapter 1 mid-run'); t.eq(A.META.isUnlocked('hero', 'suzu'), true, 'Suzu is open at once'); t.eq(A.META.isUnlocked('hero', 'raiga'), false, 'Raiga waits'); t.deep(unlocks, ['hero:suzu'], 'an unlock event for the hero'); t.ok(A.META.profile.unlocked.hero.indexOf('suzu') >= 0, 'recorded in the profile');
  R.stats.boss2Kills = 1; A.META.check(R); t.eq(A.META.isUnlocked('hero', 'raiga'), true, 'chapter 2 opens Raiga'); t.deep(unlocks, ['hero:suzu', 'hero:raiga'], 'events');
  const B = fresh({ store: { rb_profile_v1: J({ v: 1, ach: { ch1_clear: 5 } }) } }); B.META.load(); t.eq(B.META.isUnlocked('hero', 'suzu'), true, 'an old profile with the achievement but no hero list still counts');
});
t.test('achievements(): the Library tab rows, with live progress', () => {
  const A = fresh(); A.META.load(); A.META.track('kills', 4); A.META.track('maxHit', 25); A.META.check(null, 77);
  const rows = A.META.achievements();
  t.eq(rows.length, Object.keys(DATA.achievements).length, 'one row per achievement'); t.deep(Object.keys(rows[0]).sort(), ['done', 'gte', 'id', 'k', 'name', 'progress', 'reward', 'text', 'ts', 'value'], 'fields');
  const kills = rows.find((r) => r.id === 'kills10'), hit = rows.find((r) => r.id === 'hit20'), boss = rows.find((r) => r.id === 'ch1_clear');
  t.eq(kills.value, 4, 'value'); t.eq(kills.progress, 0.4, 'progress is value over gte'); t.eq(kills.done, false, 'not done'); t.eq(kills.ts, null, 'no timestamp'); t.eq(hit.done, true, 'done'); t.eq(hit.progress, 1, 'progress capped at 1'); t.eq(hit.ts, 77, 'timestamp'); t.deep(hit.reward, { inkstones: 5 }, 'reward'); t.eq(boss.reward, null, 'no reward');
});

// ================================================================================================ unlocks and the Library
t.test('isUnlocked and unlockedSet: only defs with locked:true need buying', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.isUnlocked('card', 'hanae_c0'), true, 'a plain card'); t.eq(A.META.isUnlocked('card', 'hanae_u0'), false, 'a locked card'); t.eq(A.META.isUnlocked('relic', 'm_free'), true, 'plain relic'); t.eq(A.META.isUnlocked('relic', 'm_u'), false, 'locked relic'); t.eq(A.META.isUnlocked('gem', 'm_g1'), true, 'tier 1 gem'); t.eq(A.META.isUnlocked('gem', 'm_g2'), false, 'locked gem');
  t.eq(A.META.isUnlocked('card', 'ghost'), true, 'unknown ids never gate anything'); t.eq(A.META.isUnlocked('banana', 'x'), true, 'unknown kinds neither');
  t.deep(A.META.unlockedSet(), { card: [], relic: [], gem: [] }, 'nothing owned');
  A.META.profile.unlocked.card.push('hanae_u0', 'ghost_card'); A.META.profile.unlocked.relic.push('m_u'); A.META.profile.unlocked.gem.push('m_g2');
  t.eq(A.META.isUnlocked('card', 'hanae_u0'), true, 'bought'); t.deep(A.META.unlockedSet(), { card: ['hanae_u0'], relic: ['m_u'], gem: ['m_g2'] }, 'the set is what RUN.newRun takes, cleaned of ids that no longer exist');
  const set = A.META.unlockedSet(); set.card.push('x'); t.deep(A.META.profile.unlocked.card, ['hanae_u0', 'ghost_card'], 'a copy, not the live list');
});
t.test('libraryList: every locked def, priced by ECONOMY.library, stable order, affordability', () => {
  const A = fresh(); A.META.load();
  const list = A.META.libraryList();
  const lockedIds = [].concat(Object.keys(DATA.cards).filter((id) => DATA.cards[id].locked), Object.keys(DATA.relics).filter((id) => DATA.relics[id].locked), Object.keys(DATA.gems).filter((id) => DATA.gems[id].locked));
  t.deep(list.map((x) => x.id).sort(), lockedIds.slice().sort(), 'one entry per def with locked:true, and no others'); t.deep(Object.keys(list[0]).sort(), ['affordable', 'cost', 'hero', 'id', 'kind', 'name', 'rarity', 'unlocked'], 'fields');
  const cost = (x) => x.kind === 'card' ? E.library.card[DATA.cards[x.id].rarity] : x.kind === 'relic' ? E.library.relic[DATA.relics[x.id].rarity] : E.library.gem[DATA.gems[x.id].tier];
  list.forEach((x) => { t.eq(x.cost, cost(x), `price of ${x.id}`); t.eq(x.unlocked, false, 'locked'); t.eq(x.affordable, false, 'no Inkstones yet'); });
  t.eq(list.find((x) => x.id === 'hanae_u0').cost, E.library.card.uncommon, 'card uncommon'); t.eq(list.find((x) => x.id === 'hanae_r0').cost, E.library.card.rare, 'card rare'); t.eq(list.find((x) => x.id === 'm_c').cost, E.library.relic.common, 'relic common'); t.eq(list.find((x) => x.id === 'm_b').cost, E.library.relic.boss, 'relic boss'); t.eq(list.find((x) => x.id === 'm_s').cost, E.library.relic.shop, 'relic shop'); t.eq(list.find((x) => x.id === 'm_g3').cost, E.library.gem[3], 'gem tier 3');
  const kinds = list.map((x) => x.kind); t.deep(kinds, kinds.slice().sort((a, b) => ({ card: 0, relic: 1, gem: 2 })[a] - ({ card: 0, relic: 1, gem: 2 })[b]), 'cards, then relics, then gems'); t.eq(J(A.META.libraryList()), J(list), 'stable order');
  A.META.profile.inkstones = E.library.card.uncommon; A.META.profile.unlocked.gem.push('m_g2');
  const again = A.META.libraryList(); t.eq(again.find((x) => x.id === 'hanae_u0').affordable, true, 'affordable at exactly the price'); t.eq(again.find((x) => x.id === 'hanae_r0').affordable, false, 'too dear'); t.eq(again.find((x) => x.id === 'm_g2').unlocked, true, 'owned'); t.eq(again.find((x) => x.id === 'm_g2').affordable, false, 'owned items are not "affordable"');
  const odd = fresh(); odd.DATA.add('cards', { hanae_odd: { name: 'Odd', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx: [], art: { m: 'slash', c: 'rose' }, locked: true } }); t.eq(odd.META.libraryList().find((x) => x.id === 'hanae_odd').cost, E.library.card.rare, 'a rarity with no listed price costs the dearest');
});
t.test('buy: funds, ownership, unknown ids; unlocks feed RUN.newRun and the pools', () => {
  const A = fresh(); A.META.load(); const events = []; A.META.bus.on('unlock', (e) => events.push(e.kind + ':' + e.id));
  t.deep(A.META.buy('card', 'hanae_u0'), { ok: false, reason: 'funds', cost: E.library.card.uncommon }, 'not enough Inkstones'); t.eq(A.META.buy('card', 'hanae_c0').reason, 'unknown', 'a plain card is not for sale'); t.eq(A.META.buy('card', 'ghost').reason, 'unknown', 'no such card'); t.eq(A.META.buy('trial', 'x').reason, 'unknown', 'not a lockable kind');
  A.META.profile.inkstones = 200;
  const r = A.META.buy('card', 'hanae_u0'); t.deep(r, { ok: true, cost: E.library.card.uncommon, inkstones: 200 - E.library.card.uncommon }, 'bought'); t.eq(A.META.inkstones, 200 - E.library.card.uncommon, 'paid'); t.eq(A.META.isUnlocked('card', 'hanae_u0'), true, 'unlocked'); t.deep(events, ['card:hanae_u0'], 'unlock event'); t.eq(A.META.buy('card', 'hanae_u0').reason, 'owned', 'not twice'); t.eq(A.META.inkstones, 200 - E.library.card.uncommon, 'no double charge');
  t.eq(JSON.parse(A._store.rb_profile_v1).unlocked.card[0], 'hanae_u0', 'saved at once'); A.META.buy('relic', 'm_c'); A.META.buy('gem', 'm_g2');
  const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 1, unlocked: A.META.unlockedSet() });
  t.deep(R.unlocked, { card: ['hanae_u0'], relic: ['m_c'], gem: ['m_g2'] }, 'RUN stores what META handed over');
  t.ok(A.DATA.rewardPool('hanae', 'uncommon', R.unlocked).some((c) => c.id === 'hanae_u0'), 'the bought card is in the reward pool'); t.ok(!A.DATA.rewardPool('hanae', 'rare', R.unlocked).some((c) => c.id === 'hanae_r0'), 'unbought locked cards stay out'); t.ok(A.DATA.relicPool('common', R.unlocked).some((x) => x.id === 'm_c'), 'the bought relic can drop'); t.ok(!A.DATA.relicPool('uncommon', R.unlocked).some((x) => x.id === 'm_u'), 'the unbought one cannot'); t.ok(A.DATA.gemPool({ tier: 2 }, R.unlocked).some((g) => g.id === 'm_g2') && !A.DATA.gemPool({ tier: 2 }, R.unlocked).some((g) => g.id === 'm_g2b'), 'gems likewise');
  const fund = fresh(); fund.META.load(); fund.META.profile.inkstones = E.library.gem[3]; t.eq(fund.META.buy('gem', 'm_g3').ok, true, 'exact funds'); t.eq(fund.META.inkstones, 0, 'to zero');
});

// ================================================================================================ Ink Trials
t.test('trialMax: trial N + 1 opens after a win at N, capped at 10, and nothing before the first win', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.trialMax(), 0, 'no wins: only trial 0'); A.META.profile.stats.trialBest = 3; t.eq(A.META.trialMax(), 0, 'trialBest alone is not a win');
  A.META.profile.stats.trialBest = 0; A.META.profile.stats.wins = 1; t.eq(A.META.trialMax(), 1, 'a win at trial 0 opens trial 1');
  A.META.profile.stats.trialBest = 4; t.eq(A.META.trialMax(), 5, 'a win at trial 4 opens 5'); A.META.profile.stats.trialBest = 10; t.eq(A.META.trialMax(), 10, 'capped at 10'); A.META.profile.stats.trialBest = 99; t.eq(A.META.trialMax(), 10, 'always');
  A.META.profile.stats.trialBest = 4;
  t.eq(A.META.isUnlocked('trial', 0), true, 'trial 0 is always open'); t.eq(A.META.isUnlocked('trial', 5), true, 'up to trialMax'); t.eq(A.META.isUnlocked('trial', 6), false, 'not beyond'); t.eq(A.META.isUnlocked('trial', 'trial_5'), true, 'ids work too'); t.eq(A.META.isUnlocked('trial', 'trial_6'), false, 'beyond by id');
});

// ================================================================================================ recordRun
t.test('recordRun pays Inkstones by the documented formula: win, loss, abandon', () => {
  const S = E.inkstones;
  const A = fresh(); A.META.load();
  const R = mkRun(A, { trialSet: 3, stats: { bossKills: 2, boss1Kills: 1, boss2Kills: 1 }, chapter: 3 });
  const score = A.RUN.score(R);
  t.eq(score, 100 * 2 + 60 * 2 + Math.floor(60 / 10) + 2 * 136, 'a known score: ' + score);
  const raw = (win) => S.perChapter * 2 + (win ? S.win : 0) + S.perTrial * 3 + Math.floor(score / S.scoreDiv);
  const win = A.META.recordRun(R, 'win', 100);
  t.eq(win.inkstones, raw(true), 'win: 4 per chapter + 15 + 3 per trial + score / 60'); t.eq(win.inkstones, 4 * 2 + 15 + 3 * 3 + Math.floor(score / 60), 'spelled out'); t.eq(A.META.inkstones, win.inkstones + win.bonus, 'the profile got it, plus achievement rewards'); t.eq(win.total, A.META.inkstones, 'total reported');
  const B = fresh(); B.META.load(); const lose = B.META.recordRun(mkRun(B, { trialSet: 3, stats: { bossKills: 2, boss1Kills: 1, boss2Kills: 1 } }), 'lose', 1); t.eq(lose.inkstones, raw(false), 'loss: no win bonus');
  const C = fresh(); C.META.load(); const ab = C.META.recordRun(mkRun(C, { trialSet: 3, stats: { bossKills: 2, boss1Kills: 1, boss2Kills: 1 } }), 'abandon', 1); t.eq(ab.inkstones, Math.floor(raw(false) * 0.5), 'abandon: half, floored once');
  const D = fresh(); D.META.load(); const dl = D.META.recordRun(mkRun(D, { daily: true, stats: { bossKills: 2 } }), 'win', 1); const dscore = D.RUN.score(mkRun(D, { daily: true, stats: { bossKills: 2 } }));
  t.eq(dl.inkstones, Math.floor((S.perChapter * 2 + S.win + Math.floor(dscore / S.scoreDiv)) * 0.5), 'daily: half rate'); const DA = fresh(); DA.META.load(); const both = DA.META.recordRun(mkRun(DA, { daily: true, stats: { bossKills: 2 } }), 'abandon', 1); t.eq(both.inkstones, Math.floor((S.perChapter * 2 + Math.floor(dscore / S.scoreDiv)) * 0.25), 'daily and abandon multiply, floored once at the end');
  const none = fresh(); none.META.load(); t.eq(none.META.recordRun(mkRun(none, {}), 'lose', 1).inkstones, Math.floor(A.RUN.score(mkRun(none, {})) / 60), 'an early loss still pays the score share');
});
t.test('recordRun merges stats (sums and max keys) and counts runs, wins, deaths, hero wins', () => {
  const A = fresh(); A.META.load();
  A.META.track('kills', 5); A.META.track('maxHit', 18);
  const R = mkRun(A, { heroes: ['hanae', 'suzu'], victory: true, deckSize: 12, curses: 2, stats: { kills: 7, maxHit: 12, maxTurnDamage: 40, turns: 30, bossKills: 3, boss1Kills: 1, boss2Kills: 1, boss3Kills: 1, hexesPainted: 60, goldEarned: 300, relicsFound: 4 } });
  A.META.recordRun(R, 'win', 500);
  const s = A.META.profile.stats;
  t.eq(s.kills, 12, 'kills sum'); t.eq(s.maxHit, 18, 'maxHit keeps the profile best'); t.eq(s.maxTurnDamage, 40, 'maxTurnDamage takes the run best'); t.eq(s.turns, 30, 'turns'); t.eq(s.bossKills, 3, 'boss kills'); t.eq(s.boss3Kills, 1, 'boss3Kills'); t.eq(s.hexesPainted, 60, 'hexes'); t.eq(s.goldEarned, 300, 'gold'); t.eq(s.relicsFound, 4, 'relics');
  t.eq(s.runs, 1, 'runs'); t.eq(s.wins, 1, 'wins'); t.eq(s.deaths, 0, 'deaths'); t.eq(s.winsHanae, 1, 'winsHanae'); t.eq(s.winsSuzu, 1, 'winsSuzu'); t.eq(s.winsKuro, 0, 'the other heroes get nothing'); t.eq(s.winsRaiga, 0, 'raiga');
  t.eq(s.smallDeckWins, 1, 'a 12 card deck is a small deck (15 or fewer)'); t.eq(s.maxDeck, 12 + 2, 'maxDeck is the deck size at the end (12 cards, then 2 curses added: cut to the final size)');
  t.eq(s.curseCards, 2, 'curse cards in the final deck'); t.eq(s.trialBest, 0, 'a trial 0 win leaves trialBest at 0'); t.eq(A.META.trialMax(), 1, 'but opens trial 1');
  const B = fresh(); B.META.load(); B.META.recordRun(mkRun(B, { victory: true, deckSize: 16 }), 'win', 1); t.eq(B.META.stat('smallDeckWins'), 0, '16 cards is not a small deck'); const C = fresh(); C.META.load(); C.META.recordRun(mkRun(C, { deckSize: 5 }), 'lose', 1); t.eq(C.META.stat('smallDeckWins'), 0, 'a loss is not a small deck win'); t.eq(C.META.stat('deaths'), 1, 'deaths'); t.eq(C.META.stat('wins'), 0, 'no win'); t.eq(C.META.stat('winsHanae'), 0, 'no hero win'); t.eq(C.META.stat('runs'), 1, 'runs');
  const D = fresh(); D.META.load(); D.META.recordRun(mkRun(D, {}), 'abandon', 1); t.eq(D.META.stat('runs'), 1, 'an abandoned run is a run'); t.eq(D.META.stat('deaths'), 0, 'but not a death'); t.eq(D.META.stat('wins'), 0, 'nor a win');
  const T = fresh(); T.META.load(); T.META.recordRun(mkRun(T, { victory: true, trialSet: 4 }), 'win', 1); t.eq(T.META.stat('trialBest'), 4, 'trialBest is the highest trial WON'); T.META.recordRun(mkRun(T, { victory: true, trialSet: 2, seed: 2 }), 'win', 2); t.eq(T.META.stat('trialBest'), 4, 'a lower win never lowers it'); T.META.recordRun(mkRun(T, { trialSet: 9, seed: 3 }), 'lose', 3); t.eq(T.META.stat('trialBest'), 4, 'a loss at trial 9 does not count'); t.eq(T.META.trialMax(), 5, 'trial 5 is the next');
});
t.test('recordRun: bestiary kills, history rows, and paying out only once', () => {
  const A = fresh(); A.META.load(); A.META.seen('kappa');
  const R = mkRun(A, { foes: { kappa: 3, oni_brute: 1 }, victory: true, chapter: 2 });
  const res = A.META.recordRun(R, 'win', 4242);
  t.deep(A.META.profile.kills, { kappa: 3, oni_brute: 1 }, 'per enemy kills'); t.eq(A.META.profile.seen.kappa, 1, 'seen stays'); t.eq(A.META.profile.seen.oni_brute, 1, 'a killed enemy has been seen');
  t.eq(A.META.history.length, 1, 'one history row'); const h = A.META.history[0];
  t.deep(Object.keys(h).sort(), ['chapter', 'daily', 'heroes', 'id', 'inkstones', 'outcome', 'score', 'seed', 'trial', 'ts'], 'row fields'); t.eq(h.outcome, 'win', 'outcome'); t.eq(h.chapter, 2, 'chapter'); t.deep(h.heroes, ['hanae', 'kuro'], 'heroes'); t.eq(h.trial, 0, 'trial'); t.eq(h.daily, false, 'daily'); t.eq(h.ts, 4242, 'the timestamp the caller passed'); t.eq(h.score, A.RUN.score(R), 'score'); t.eq(h.inkstones, res.inkstones, 'payout'); t.eq(R.recorded, true, 'the run knows it was recorded');
  const before = canon(A.META.profile); const again = A.META.recordRun(R, 'win', 5000);
  t.deep(again, { inkstones: 0, bonus: 0, total: A.META.inkstones, newAchievements: [], newTrial: null, heroesUnlocked: [] }, 'a second call pays nothing'); t.eq(canon(A.META.profile), before, 'and changes nothing');
  for (let i = 0; i < 25; i++) A.META.recordRun(mkRun(A, { seed: 100 + i }), 'lose', 100 + i);
  t.eq(A.META.history.length, 20, 'history keeps the last 20'); t.eq(A.META.history[0].ts, 124, 'newest first'); t.eq(A.META.history[19].ts, 105, 'oldest last');
  t.eq(JSON.parse(A._store.rb_profile_v1).history.length, 20, 'saved');
  const O = fresh(); O.META.load(); const guess = mkRun(O, { victory: true }); O.META.recordRun(guess, 'sideways', 1); t.eq(O.META.history[0].outcome, 'win', 'a junk outcome falls back to R.victory'); t.eq(O.META.recordRun(null, 'win', 1).inkstones, 0, 'no run, no payout');
});
t.test('recordRun reports new achievements, hero unlocks, the new trial and bonus Inkstones', () => {
  const A = fresh(); A.META.load();
  const R = mkRun(A, { heroes: ['hanae', 'kuro'], victory: true, deckSize: 10, stats: { bossKills: 1, boss1Kills: 1, kills: 12, maxHit: 30 } });
  const seen = []; A.META.bus.on('achievement', (e) => seen.push(e.id)); const unlocks = []; A.META.bus.on('unlock', (e) => unlocks.push(e.kind + ':' + e.id));
  const res = A.META.recordRun(R, 'win', 77);
  t.deep(res.newAchievements.sort(), ['ch1_clear', 'hanae1', 'hit20', 'kills10', 'small1'].sort(), 'everything the merged stats now satisfy'); t.deep(seen.sort(), res.newAchievements.slice().sort(), 'each announced on the bus');
  t.eq(res.bonus, 5, 'achievement rewards (hit20: 5) are reported separately'); t.eq(res.total, A.META.inkstones, 'total'); t.eq(A.META.inkstones, res.inkstones + 5, 'both paid');
  t.deep(res.heroesUnlocked, ['suzu'], 'Suzu is new'); t.deep(unlocks, ['hero:suzu'], 'and announced'); t.eq(res.newTrial, 1, 'the first win opens trial 1'); t.eq(A.META.profile.ach.hit20, 77, 'stamped with now');
  const R2 = mkRun(A, { victory: true, seed: 2, stats: { bossKills: 1, boss1Kills: 1 } }); const r2 = A.META.recordRun(R2, 'win', 88); t.eq(r2.newTrial, null, 'trial max unchanged: no new trial'); t.deep(r2.heroesUnlocked, [], 'no new hero'); t.ok(r2.newAchievements.indexOf('wins2') >= 0, 'the second win fires wins2'); t.ok(r2.newAchievements.indexOf('ch1_clear') < 0, 'and never a repeat');
  const R3 = mkRun(A, { victory: true, seed: 3, trialSet: 1, stats: {} }); t.eq(A.META.recordRun(R3, 'win', 99).newTrial, 2, 'a win at trial 1 opens trial 2'); t.ok(A.META.profile.ach.trial1 !== undefined, 'the trial achievement (trialBest gte 1) fired');
  const mid = fresh(); mid.META.load(); const midRun = mkRun(mid, { stats: { boss1Kills: 1, bossKills: 1 } }); mid.META.check(midRun, 5); const after = mid.META.recordRun(midRun, 'lose', 6); t.ok(after.newAchievements.indexOf('ch1_clear') < 0, 'an achievement unlocked mid-run is not announced again at the end'); t.deep(after.heroesUnlocked, [], 'nor a hero');
});
t.test('daily runs write only dailyRuns, half-rate Inkstones, daily.last and their history row', () => {
  const A = fresh(); A.META.load(); A.META.track('kills', 3);
  const R = mkRun(A, { daily: true, seed: 20260317, victory: true, foes: { kappa: 2 }, deckSize: 9, curses: 1, stats: { kills: 20, bossKills: 1, boss1Kills: 1, hexesPainted: 50, maxHit: 40 } });
  const before = canon(A.META.profile.stats);
  const res = A.META.recordRun(R, 'win', 9);
  const s = A.META.profile.stats;
  t.eq(s.dailyRuns, 1, 'dailyRuns'); t.eq(s.kills, 3, 'no kills'); t.eq(s.runs, 0, 'not a run'); t.eq(s.wins, 0, 'not a win'); t.eq(s.hexesPainted, 0, 'no hexes'); t.eq(s.maxHit, 0, 'no max stats'); t.eq(s.maxDeck, 0, 'no deck'); t.eq(s.curseCards, 0, 'no curses'); t.eq(s.smallDeckWins, 0, 'no small deck win'); t.eq(s.winsHanae, 0, 'no hero win'); t.eq(s.trialBest, 0, 'no trial'); t.deep(A.META.profile.kills, {}, 'no bestiary kills'); t.eq(A.META.trialMax(), 0, 'a daily win does not open trials');
  const changed = Object.keys(s).filter((k) => JSON.parse(before)[k] !== s[k]); t.deep(changed, ['dailyRuns'], 'exactly one stat moved');
  t.eq(A.META.profile.daily.last, 20260317, 'daily.last'); t.eq(A.META.history[0].daily, true, 'the history row is flagged'); t.eq(A.META.history[0].outcome, 'win', 'outcome'); t.ok(res.inkstones > 0, 'Inkstones at half rate');
  t.ok(res.newAchievements.indexOf('daily1') >= 0, 'dailyRuns can unlock its own achievement'); t.ok(res.newAchievements.indexOf('ch1_clear') < 0 && res.newAchievements.indexOf('kills10') < 0, 'but nothing from the run stats');
  t.deep(res.heroesUnlocked, [], 'a daily never opens heroes'); t.eq(A.META.dailyPlayed(new Date(2026, 2, 17)), true, 'dailyPlayed: same day'); t.eq(A.META.dailyPlayed(new Date(2026, 2, 18)), false, 'the next day');
});

// ================================================================================================ the run save
t.test('saveRun, loadRun, hasRun, clearRun: a run round trips through storage', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.hasRun(), false, 'no run yet'); t.eq(A.META.loadRun(), null, 'nothing to load');
  const R = mkRun(A, { seed: 42 }); A.RUN.addCard(R, 'hanae_c0'); R.gold = 123; R.relics.push('m_free'); R.gems.push('m_g1', 'm_g1');
  t.eq(A.META.saveRun(R), true, 'saved'); t.eq(typeof A._store.rb_run_v1, 'string', 'under the documented key'); t.eq(A.META.hasRun(), true, 'hasRun');
  const back = A.META.loadRun(); t.eq(canon(back), canon(R), 'the very same run comes back'); t.eq(A.META.hasRun(), true, 'loading does not delete the save');
  const other = fresh({ store: Object.assign({}, A._store) }); other.META.load(); t.eq(canon(other.META.loadRun()), canon(R), 'and in a fresh page');
  A.META.clearRun(); t.eq(A.META.hasRun(), false, 'cleared'); t.eq(A._store.rb_run_v1, undefined, 'the key is gone'); t.eq(A.META.loadRun(), null, 'nothing to load');
  A.META.saveRun(R); R.done = true; t.eq(A.META.saveRun(R), true, 'saving a finished run succeeds...'); t.eq(A.META.hasRun(), false, '...by removing the save: a finished run cannot be Continued'); t.eq(A._store.rb_run_v1, undefined, 'key removed');
  t.eq(A.META.saveRun(null), false, 'no run');
});
t.test('runInfo: the line the title shows next to Continue', () => {
  const A = fresh(); A.META.load(); t.eq(A.META.runInfo(), null, 'no run, no info');
  const R = mkRun(A, { heroes: ['hanae', 'kuro'], chapter: 2 }); R.ink = 5; A.META.saveRun(R);
  const info = A.META.runInfo(); t.eq(info.text, 'Chapter 2, Ink 5, Hanae and Kuro', 'the documented line'); t.eq(info.chapter, 2, 'chapter'); t.eq(info.ink, 5, 'ink'); t.deep(info.heroes, ['hanae', 'kuro'], 'ids'); t.eq(info.trial, 0, 'trial'); t.eq(info.daily, false, 'daily');
  const D = mkRun(A, { heroes: ['raiga', 'suzu'], daily: true, seed: 20260101 }); D.ink = 1; A.META.saveRun(D); t.eq(A.META.runInfo().text, 'Chapter 1, Ink 1, Raiga and Suzu', 'other party'); t.eq(A.META.runInfo().daily, true, 'daily flag');
});
t.test('a corrupt or foreign run save is set aside and never crashes the title', () => {
  ['{oops', '', '5', 'null', '[]'].forEach((raw) => {
    const A = fresh({ store: { rb_run_v1: raw } }); A.META.load();
    t.eq(A.META.hasRun(), false, `"${raw}": no Continue button`); t.eq(A.META.runInfo(), null, 'no info'); t.eq(A.META.loadRun(), null, 'loadRun returns null');
    t.eq(A._store.rb_run_v1_bad, raw, 'the raw text is kept'); t.eq(A._store.rb_run_v1, undefined, 'and the bad save is removed so it stops reappearing');
  });
  const A = fresh(); A.META.load(); const R = mkRun(A); const o = JSON.parse(J(A.RUN.serialize(R))); o.v = 9; A._store.rb_run_v1 = J(o);
  t.eq(A.META.hasRun(), false, 'another run version is not Continue-able'); t.eq(A.META.loadRun(), null, 'null'); t.eq(A._store.rb_run_v1_bad, J(o), 'kept for a newer build');
  const B = fresh(); B.META.load(); const R2 = mkRun(B); const o2 = JSON.parse(J(B.RUN.serialize(R2))); o2.heroes = 'nope'; B._store.rb_run_v1 = J(o2); t.eq(B.META.hasRun(), false, 'a save without a party'); t.eq(B.META.loadRun(), null, 'is refused');
  const C = fresh(); C.META.load(); const R3 = mkRun(C); C.META.saveRun(R3); C.DATA.cards.hanae_c0 && delete C.DATA.cards.hanae_c0; t.ok(C.META.loadRun(), 'content that no longer exists is dropped by RUN, the run still loads');
});
t.test('settings and profile survive alongside a run save (independent keys)', () => {
  const A = fresh(); A.META.load(); A.META.set('sfxVol', 0.1); A.META.saveRun(mkRun(A)); t.deep(Object.keys(A._store).sort(), ['rb_profile_v1', 'rb_run_v1'], 'the two documented keys and nothing else'); A.META.clearRun(); t.eq(JSON.parse(A._store.rb_profile_v1).settings.sfxVol, 0.1, 'clearing the run leaves the profile');
});

// ================================================================================================ bestiary, story, tutorial, daily, reset
t.test('bestiary and seen', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.seen('kappa'), 1, 'first sighting'); t.eq(A.META.seen('kappa'), 2, 'counts'); t.eq(A.META.seen(5), 0, 'junk id ignored'); t.eq(JSON.parse(A._store.rb_profile_v1).seen.kappa, 1, 'the first sighting is saved at once');
  A.META.profile.kills.kappa = 4;
  const list = A.META.bestiary(); const all = [].concat(DATA.ROSTER[1], DATA.ROSTER[2], DATA.ROSTER[3]);
  t.deep(list.map((x) => x.id), all.map((x) => x.id), 'every enemy of the fixed roster in roster order, seen or not'); t.deep(Object.keys(list[0]).sort(), ['chapter', 'id', 'kills', 'seen', 'tier'], 'fields');
  const k = list.find((x) => x.id === 'kappa'); t.eq(k.seen, 2, 'seen'); t.eq(k.kills, 4, 'kills'); t.eq(k.chapter, 1, 'chapter'); t.eq(k.tier, 'normal', 'tier'); const u = list.find((x) => x.id === 'umibozu'); t.eq(u.seen, 0, 'unseen'); t.eq(u.kills, 0, 'no kills'); t.eq(list.find((x) => x.id === 'boss_editor').tier, 'boss', 'boss tier');
});
t.test('story: lore seen flags and the story list without barks', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.loreSeen('intro'), false, 'unseen'); A.META.markLore('intro'); t.eq(A.META.loreSeen('intro'), true, 'seen'); A.META.markLore('intro'); A.META.markLore(7); t.eq(A.META.loreSeen(7), false, 'junk ignored'); t.eq(JSON.parse(A._store.rb_profile_v1).story.intro, true, 'saved');
  const list = A.META.storyList();
  t.deep(list.map((x) => x.id), ['intro', 'ch1_intro', 'hero_hanae', 'extra_note'], 'registered lore in the canonical order, extras last, barks excluded'); t.ok(list.every((x) => !/^barks_/.test(x.id)), 'no bark lines'); t.deep(list.map((x) => x.seen), [true, false, false, false], 'seen flags'); t.eq(list[0].title, 'Once', 'title for the seen entries');
  t.eq(A.META.loreSeen('barks_hanae'), false, 'barks are not stories');
});
t.test('tutorial flags, daily seed, history and profile getters', () => {
  const A = fresh(); A.META.load();
  t.eq(A.META.tutorial('map'), false, 'off'); A.META.setTutorial('map'); t.eq(A.META.tutorial('map'), true, 'set'); A.META.setTutorial('map', false); t.eq(A.META.tutorial('map'), false, 'cleared'); A.META.setTutorial(5); t.deep(A.META.profile.tutorial, {}, 'junk flag ignored'); A.META.setTutorial('intro'); t.eq(JSON.parse(A._store.rb_profile_v1).tutorial.intro, true, 'saved');
  t.eq(A.META.dailySeed(new Date(2026, 0, 5)), 20260105, 'local date as YYYYMMDD'); t.eq(A.META.dailySeed(new Date(2026, 11, 31)), 20261231, 'year end'); t.eq(A.META.dailyPlayed(new Date(2026, 0, 5)), false, 'not played'); t.eq(A.META.dailySeed(new Date(2026, 0, 5)), U.dateKey(new Date(2026, 0, 5)), 'U.dateKey');
});
t.test('reset wipes the profile and the run, optionally keeping settings', () => {
  const A = fresh(); A.META.load(); A.META.set('musicVol', 0.1); A.META.track('kills', 9); A.META.profile.inkstones = 50; A.META.saveRun(mkRun(A)); A.META.save();
  const kept = A.META.reset({ keepSettings: true }); t.eq(kept.inkstones, 0, 'Inkstones gone'); t.eq(A.META.stat('kills'), 0, 'stats gone'); t.eq(A.META.get('musicVol'), 0.1, 'settings kept'); t.eq(A.META.hasRun(), false, 'run gone'); t.eq(JSON.parse(A._store.rb_profile_v1).inkstones, 0, 'and saved');
  A.META.reset(); t.eq(A.META.get('musicVol'), 0.7, 'a full reset restores defaults'); t.eq(A.META.isUnlocked('hero', 'suzu'), false, 'heroes locked again'); t.deep(A.META.check(), [], 'achievements can be earned again from zero');
});

// ================================================================================================ integration: a career
t.test('a career: play, record, unlock, buy, replay', () => {
  const A = fresh(); A.META.load();
  let stones = 0;
  for (let i = 0; i < 4; i++) {
    const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 300 + i, unlocked: A.META.unlockedSet() });
    R.stats.bossKills = 1 + (i % 3); R.stats.boss1Kills = 1; R.stats.kills = 8; R.stats.hexesPainted = 40; R.victory = i % 2 === 0; R.done = true; R.foes = { kappa: 4 };
    const res = A.META.recordRun(R, R.victory ? 'win' : 'lose', 1000 + i); stones += res.inkstones + res.bonus;
    t.ok(A.META.saveRun(R) === true && !A.META.hasRun(), 'a finished run is not left on disk');
  }
  t.eq(A.META.inkstones, stones, 'Inkstones add up across runs'); t.eq(A.META.stat('runs'), 4, 'four runs'); t.eq(A.META.stat('wins'), 2, 'two wins'); t.eq(A.META.stat('deaths'), 2, 'two deaths'); t.eq(A.META.stat('kills'), 32, 'kills'); t.eq(A.META.profile.kills.kappa, 16, 'bestiary'); t.eq(A.META.history.length, 4, 'history'); t.ok(A.META.isUnlocked('hero', 'suzu'), 'chapter 1 was cleared: Suzu');
  const buy = A.META.libraryList().find((x) => x.affordable);
  if (buy) { t.eq(A.META.buy(buy.kind, buy.id).ok, true, 'bought ' + buy.id); const R = A.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 9, unlocked: A.META.unlockedSet() }); t.ok(R.unlocked[buy.kind].indexOf(buy.id) >= 0, 'the next run knows it'); } else t.ok(A.META.inkstones < 60, 'nothing affordable yet: ' + A.META.inkstones);
  const B = fresh({ store: Object.assign({}, A._store) }); B.META.load(); t.eq(canon(B.META.profile), canon(A.META.profile), 'the whole career survives a reload');
});

// ================================================================================================ contract odds and ends
t.test('the public API is complete', () => {
  ['load', 'save', 'reset', 'get', 'set', 'saveRun', 'loadRun', 'clearRun', 'hasRun', 'track', 'stat', 'check', 'isUnlocked', 'unlockedSet', 'libraryList', 'buy', 'recordRun', 'seen', 'bestiary', 'loreSeen', 'markLore', 'storyList', 'trialMax', 'dailySeed', 'tutorial', 'setTutorial'].forEach((f) => t.eq(typeof G.META[f], 'function', 'META.' + f));
  ['runInfo', 'achievements', 'mergeStats', 'dailyPlayed'].forEach((f) => t.eq(typeof G.META[f], 'function', 'META.' + f + ' (extra)'));
  t.eq(typeof G.META.bus.on, 'function', 'META.bus'); t.ok('profile' in G.META && 'inkstones' in G.META && 'history' in G.META, 'getters');
});
t.test('meta.js: no clock, no randomness, no DOM beyond window.localStorage, keys never renamed', () => {
  const src = fs.readFileSync(path.join(DIR, 'js', 'meta.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  t.ok(!/\bDate\b|performance\.now|Math\.random|\bdocument\b|sessionStorage|\bnavigator\b|setTimeout|requestAnimationFrame/.test(src), 'no clock, randomness, timers or other DOM');
  t.ok(src.indexOf("'rb_profile_v1'") >= 0 && src.indexOf("'rb_run_v1'") >= 0, 'the documented storage keys');
  const only = boot({ only: ['meta'], skip: ['data_*', 'map', 'combat'] }); t.eq(typeof only.META.load, 'function', 'loads without touching storage or the DOM');
});

// END-OF-SUITE
await t.done();
