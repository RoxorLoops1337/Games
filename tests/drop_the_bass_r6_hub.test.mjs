// Drop the Bass round 6, hub and meta side (pure, no browser): the modal queue (fake clock), monthly seasons, ten more daily quests, the diagnostics
// ring buffer and report text.
import assert from 'node:assert/strict';
import * as M from '../drop_the_bass/js/meta.js';
import { QUESTS, SEASONS, SEASON_GOALS, SEASON_KEEPSAKE_BONUS, OUTFITS, SKIN_PRICES } from '../drop_the_bass/js/data_meta.js';
import * as Q from '../drop_the_bass/js/ui_core.js';
import * as D from '../drop_the_bass/js/diag.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// ================================================================== 1. modal queue with a fake clock
{
  let now = 0, seq = 0; const timers = new Map(); let screen = 'hub', modalOpen = false;
  Q.setModalEnv({
    now: () => now, screen: () => screen, modalOpen: () => modalOpen,
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { f, at: now + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  const advance = (ms) => {   // run timers in time order up to now + ms
    const end = now + ms;
    for (;;) {
      let best = null;
      for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best[1].at)) best = [id, t];
      if (!best) break;
      timers.delete(best[0]); now = Math.max(now, best[1].at); best[1].f();
    }
    now = end;
  };
  const log = [];
  // a fake modal: opens, stays open until closed by the test
  const closers = {};
  const fake = (id) => (done) => { log.push('open:' + id + '@' + now); modalOpen = true; closers[id] = () => { modalOpen = false; log.push('close:' + id + '@' + now); done(); }; };
  Q.resetModalQueue();
  // everything fires at once, in the "wrong" order
  Q.queueModal('hint:a', Q.MODAL_PRIO.hint, fake('hint'));
  Q.queueModal('whatsnew', Q.MODAL_PRIO.whatsnew, fake('whatsnew'));
  Q.queueModal('daily', Q.MODAL_PRIO.daily, fake('daily'));
  Q.queueModal('welcome', Q.MODAL_PRIO.welcome, fake('welcome'));
  Q.queueModal('friend_invite', Q.MODAL_PRIO.invite, fake('invite'), { screens: ['title', 'hub'] });
  ok(Q.queueModal('welcome', 1, fake('welcome2')) === false, 'the same id is not queued twice');
  advance(100);
  eq(Q.modalQueueState().active, 'friend_invite', 'the friend invite goes first');
  eq(log.length, 1, 'only one modal is open at a time');
  advance(5000);
  eq(log.length, 1, 'nothing else opens while it is open');
  const order = ['invite', 'welcome', 'daily', 'whatsnew', 'hint'];
  for (let i = 0; i < order.length; i++) {
    ok(typeof closers[order[i]] === 'function', order[i] + ' opened in priority order');
    const t0 = now; closers[order[i]]();
    if (i < order.length - 1) {
      advance(Q.MODAL_GAP_MS - 50);
      ok(!log.includes('open:' + order[i + 1].replace('invite', 'invite') + '@' + now) && Q.modalQueueState().active === null, 'a short gap between two modals');
      advance(200);
      eq(Q.modalQueueState().active, ({ welcome: 'welcome', daily: 'daily', whatsnew: 'whatsnew', hint: 'hint:a' })[order[i + 1]], 'closing starts the next one: ' + order[i + 1]);
      ok(now - t0 >= Q.MODAL_GAP_MS, 'gap >= MODAL_GAP_MS');
    }
  }
  advance(2000);
  eq(Q.modalQueueState(), { queued: [], active: null }, 'the queue drains completely');
  const opens = log.filter((x) => x.startsWith('open:')).map((x) => x.split(':')[1].split('@')[0]);
  eq(opens, ['invite', 'welcome', 'daily', 'whatsnew', 'hint'], 'order: friend invite, welcome, daily gig, what\'s new, hints');
  // no overlap: every open is preceded by the previous close
  let openNow = 0; let overlap = false;
  for (const l of log) { if (l.startsWith('open:')) { openNow++; if (openNow > 1) overlap = true; } else openNow--; }
  ok(!overlap, 'no two modals were ever open together');

  // nothing opens during a battle or a cutscene; it opens when the hub is back
  Q.resetModalQueue(); log.length = 0;
  screen = 'battle';
  Q.queueModal('welcome', Q.MODAL_PRIO.welcome, fake('welcome'));
  advance(10000); eq(log.length, 0, 'nothing opens during a battle');
  screen = 'cut'; advance(5000); eq(log.length, 0, 'nothing opens during a cutscene');
  screen = 'title'; advance(2000); eq(log.length, 0, 'the hub-only items wait on the title screen');
  Q.queueModal('friend_invite', Q.MODAL_PRIO.invite, fake('invite'), { screens: ['title', 'hub'] });
  advance(500); eq(Q.modalQueueState().active, 'friend_invite', 'a friend invite may open on the title screen');
  closers.invite(); screen = 'hub'; advance(1000);
  eq(Q.modalQueueState().active, 'welcome', 'the welcome sheet follows on the hub');
  closers.welcome(); advance(1000);

  // a foreign modal (Settings) holds the queue; `over` ignores it
  Q.resetModalQueue(); log.length = 0; modalOpen = true;
  Q.queueModal('whatsnew', Q.MODAL_PRIO.whatsnew, fake('whatsnew'));
  advance(3000); eq(log.length, 0, 'a modal opened by the player holds the queue');
  modalOpen = false; advance(1000); eq(Q.modalQueueState().active, 'whatsnew', 'and it goes on when that modal closes');
  closers.whatsnew(); advance(1000);
  modalOpen = true; Q.queueModal('hint:setlist', Q.MODAL_PRIO.hint, fake('hint_s'), { over: true }); advance(1000);
  eq(Q.modalQueueState().active, 'hint:setlist', 'over: true opens above another modal (the Setlist hint)');
  closers.hint_s(); advance(1000);

  // watchdog: the screen was rebuilt and the modal vanished without calling done
  Q.resetModalQueue(); log.length = 0; modalOpen = false;
  Q.queueModal('a', 10, (done) => { log.push('open:a'); modalOpen = true; });
  Q.queueModal('b', 20, fake('b'));
  advance(500); eq(Q.modalQueueState().active, 'a', 'a opened');
  modalOpen = false;   // torn down by a re-render, done() never called
  advance(3000); eq(Q.modalQueueState().active, 'b', 'a vanished modal does not block the queue for good');
  closers.b(); advance(1000);
  // an open() that throws or shows nothing and calls done at once never blocks
  Q.resetModalQueue(); log.length = 0; modalOpen = false;
  Q.queueModal('boom', 10, () => { throw new Error('x'); });
  Q.queueModal('skip', 20, (done) => done());
  Q.queueModal('c', 30, fake('c'));
  advance(3000); eq(Q.modalQueueState().active, 'c', 'a throwing or skipped item passes the turn on');
  closers.c(); advance(1000);
  // delay option
  Q.resetModalQueue(); log.length = 0; modalOpen = false;
  Q.queueModal('late', 10, fake('late'), { delay: 1400 });
  advance(1000); eq(log.length, 0, 'delay holds the item'); advance(500); eq(log.length, 1, 'delay passed, it opens');
  closers.late(); advance(1000);
  Q.resetModalQueue(); Q.setModalEnv({ now: () => Date.now(), screen: () => 'hub', setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (i) => clearTimeout(i), modalOpen: () => false });
}

// ================================================================== 3. seasons
{
  eq(Object.keys(SEASONS).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'a season for each of the 12 months');
  const ids = Object.values(SEASONS).map((s) => s.id);
  ok(new Set(ids).size === 12 && ids.every((x) => /^[a-z0-9_]+$/.test(x)), 'season ids are unique lowercase_snake');
  for (const [mo, s] of Object.entries(SEASONS)) {
    ok(s.name && s.desc && /^#[0-9a-f]{6}$/i.test(s.accent) && s.theme && !new RegExp(String.fromCharCode(8212)).test(s.name + s.desc), 'season ' + mo + ' has name, description, accent, theme');
    const k = s.keepsake;
    ok(k && (k.kind === 'skin' ? SKIN_PRICES[k.id] !== undefined : (OUTFITS.roxor[k.id] && OUTFITS.jasmin[k.id])), 'season ' + mo + ' keepsake is an existing outfit or skin');
  }
  eq(SEASON_GOALS.map((g) => g.id), ['kills', 'merges', 'wins'], 'three season goals: kills, merges, wins');
  const at = (y, m, d = 10, h = 12) => new Date(y, m - 1, d, h).getTime();
  const p = M.newProfile(at(2026, 11));
  eq(M.seasonOf(at(2026, 11)).id, 'autumn_harvest', 'November is the Autumn Harvest Jam');
  eq(M.seasonOf(at(2027, 1)).id, 'winter_gig', 'January is the Winter Gig');
  // countdown to the end of the month
  eq(M.seasonMsLeft(at(2026, 11, 30, 23) + 30 * 60000), 30 * 60000, 'countdown ends at the first of the next month (local time)');
  ok(M.seasonMsLeft(at(2026, 12, 31, 12)) === 12 * 3600000, 'December rolls into January');
  // progress counts kills, merges and wins during the season
  const now = at(2026, 11, 3);
  const run = (o) => Object.assign({ mode: 'story', world: 'garage', encore: 0, won: false, kills: 100, merges: 10, deploys: 20, cleared: 5, bossKills: 0, bestCombo: 3, leaks: 0, stars: 0, relics: [], modifiers: [] }, o);
  const rng = { chance: () => false, pick: (a) => a[0], next: () => 0.5, shuffle: (a) => a.slice(), weighted: (a) => a[0], int: () => 0 };
  M.applyRunResult(p, run({ kills: 1000, merges: 150, won: true, stars: 3 }), rng, now);
  eq(p.season.progress, { kills: 1000, merges: 150, wins: 1 }, 'a won run adds kills, merges and a win');
  eq(p.season.id, 'autumn_harvest', 'profile.season carries the id'); eq(p.season.month, '2026-11', 'and the month');
  let st = M.seasonState(p, now);
  eq(st.ready, 0, 'nothing is ready yet'); ok(!st.goals[0].done, 'kills not done');
  ok(M.readyBadges(p, now).season === 0, 'no season badge yet');
  M.applyRunResult(p, run({ kills: 1600, merges: 300, won: true }), rng, now);
  M.applyRunResult(p, run({ kills: 10, merges: 1, won: true }), rng, now + 1000);
  p.season.progress.wins = 8;
  st = M.seasonState(p, now);
  ok(st.goals.every((g) => g.done) && st.ready === 3, 'all three goals done');
  const dBefore = p.diamonds, rBefore = p.records;
  ok(M.readyBadges(p, now).season === 3 && M.readyBadges(p, now).goals >= 3, 'the Goals badge counts them');
  // welcome back summary mentions unclaimed season rewards
  p.tutorial.done = true;
  const sum = M.welcomeSummary(p, now + 14 * 3600000, now);
  ok(sum.season && sum.season.ready === 3 && sum.season.name === 'Autumn Harvest Jam', 'the welcome summary lists unclaimed season rewards');
  ok(sum.ready === M.readyBadges(p, now + 14 * 3600000).goals - (M.loginStatus(p, now + 14 * 3600000).claimable ? 1 : 0) - 3, 'and does not count them twice');
  let r = M.claimSeasonGoal(p, 'kills', now, rng);
  ok(r.ok && !r.keepsake && p.records === rBefore + SEASON_GOALS[0].reward.records, 'claiming a goal pays its reward');
  ok(!M.claimSeasonGoal(p, 'kills', now, rng).ok, 'a goal is claimed once');
  M.claimSeasonGoal(p, 'merges', now, rng);
  ok(p.diamonds === dBefore + SEASON_GOALS[1].reward.diamonds, 'diamonds paid');
  const skinsBefore = p.skins.owned.length, outfitsBefore = p.outfits.owned.roxor.length;
  r = M.claimSeasonGoal(p, 'wins', now, rng);
  ok(r.ok && r.keepsake && r.keepsake.kind === 'skin' && r.keepsake.id === 'skin_chalk' && !r.keepsake.bonus, 'the third claim grants the keepsake');
  ok(p.skins.owned.includes('skin_chalk') && p.skins.owned.length === skinsBefore + 1 && p.outfits.owned.roxor.length === outfitsBefore, 'the skin is owned');
  ok(p.season.claimed.keepsake && !M.claimSeasonGoal(p, 'wins', now, rng).ok, 'the keepsake is granted once');
  ok(M.seasonState(p, now).allClaimed && M.seasonState(p, now).keepsakeGot, 'state shows everything claimed');
  // the month changes: everything resets, the old keepsake stays owned
  ok(M.ensureSeason(p, at(2026, 12, 1, 0)), 'a new month resets the season');
  eq(p.season.progress, { kills: 0, merges: 0, wins: 0 }, 'progress back to zero'); eq(p.season.claimed, {}, 'claims reset'); eq(p.season.id, 'snowy_encore', 'December is Snowy Encore');
  ok(p.skins.owned.includes('skin_chalk'), 'the keepsake of last month stays owned');
  ok(!M.ensureSeason(p, at(2026, 12, 15)), 'the same month does not reset');
  // same month next year resets too
  M.addSeasonProgress(p, { kills: 5, merges: 1, won: false }, at(2026, 12, 2));
  ok(M.ensureSeason(p, at(2027, 12, 2)) && p.season.progress.kills === 0, 'December of the next year starts fresh');
  // an outfit keepsake gives both heroes the outfit; owning it already pays the bonus instead
  const q = M.newProfile(at(2026, 6)); const june = at(2026, 6, 5);
  M.ensureSeason(q, june); q.season.progress = { kills: 99999, merges: 99999, wins: 99 };
  for (const g of ['kills', 'merges']) M.claimSeasonGoal(q, g, june, rng);
  r = M.claimSeasonGoal(q, 'wins', june, rng);
  ok(r.keepsake.kind === 'outfit' && r.keepsake.id === 'beach' && q.outfits.owned.roxor.includes('beach') && q.outfits.owned.jasmin.includes('beach'), 'an outfit keepsake is granted to both heroes');
  const w = M.newProfile(at(2026, 6)); w.outfits.owned.roxor.push('beach'); w.outfits.owned.jasmin.push('beach'); M.ensureSeason(w, june); w.season.progress = { kills: 99999, merges: 99999, wins: 99 };
  for (const g of ['kills', 'merges']) M.claimSeasonGoal(w, g, june, rng);
  const dw = w.diamonds; r = M.claimSeasonGoal(w, 'wins', june, rng);
  ok(r.keepsake.bonus && w.diamonds === dw + SEASON_GOALS[2].reward.diamonds + SEASON_KEEPSAKE_BONUS.diamonds, 'an owned keepsake pays the bonus instead');
  // migration: an old save has no season; a damaged one is cleaned; both survive a round trip
  const old = JSON.parse(JSON.stringify(M.newProfile(at(2026, 1)))); delete old.season;
  const m1 = M.migrate(old, at(2026, 1)); ok(m1.season && m1.season.id === '' && m1.season.progress.kills === 0, 'an old save migrates to an empty season');
  const bad = JSON.parse(JSON.stringify(M.newProfile(at(2026, 1)))); bad.season = { id: 5, month: 'x', progress: { kills: -4, merges: 'a', wins: 3.7 }, claimed: 7 };
  eq(M.migrate(bad, at(2026, 1)).season, { id: '', month: '', progress: { kills: 0, merges: 0, wins: 0 }, claimed: {} }, 'a damaged season is replaced');
  const good = M.migrate(JSON.parse(JSON.stringify(p)), now); eq(good.season, p.season, 'a good season survives migrate');
  const exp = M.importCode(M.exportCode(p), now); ok(exp && exp.season && exp.season.id === p.season.id, 'export and import keep the season');
}

// ================================================================== 4. daily quests
{
  const ids = QUESTS.map((q) => q.id);
  ok(QUESTS.length >= 24 && new Set(ids).size === ids.length, 'round 6 added ten quests, ids unique (' + QUESTS.length + ')');
  eq(ids.slice(0, 14), ['q_kills', 'q_kills2', 'q_merge', 'q_merge2', 'q_deploy', 'q_runs', 'q_win', 'q_boss', 'q_waves', 'q_hero', 'q_combo', 'q_beat', 'q_remix', 'q_lvl5'], 'the first fourteen are untouched');
  ok(QUESTS.slice(14).every((q) => q.text && q.goal > 0 && (q.reward.records || q.reward.diamonds) && !new RegExp(String.fromCharCode(8212)).test(q.text)), 'new quests have text, a goal and a reward');
  // balance: records per quest 100..260, diamonds 5..10
  ok(QUESTS.slice(14).every((q) => (!q.reward.records || (q.reward.records >= 100 && q.reward.records <= 260)) && (!q.reward.diamonds || (q.reward.diamonds >= 5 && q.reward.diamonds <= 10))), 'rewards sit in the range of the existing ones');
  // the picker: three quests with three different stats, same result for the same day, every quest shows up over a year
  const seen = new Set();
  for (let d = 0; d < 365; d++) {
    const now = Date.UTC(2026, 0, 1) + d * 86400000 + 3600000;
    const a = M.newProfile(now), b = M.newProfile(now);
    M.ensureDaily(a, now); M.ensureDaily(b, now);
    eq(a.daily.quests.map((x) => x.id), b.daily.quests.map((x) => x.id), 'same day, same quests');
    eq(a.daily.quests.length, 3, 'three quests a day');
    const stats = a.daily.quests.map((x) => M.questDef(x.id).stat);
    ok(new Set(stats).size === 3 && new Set(a.daily.quests.map((x) => x.id)).size === 3, 'three distinct quests on three distinct stats');
    a.daily.quests.forEach((x) => seen.add(x.id));
  }
  ok(QUESTS.every((q) => seen.has(q.id)), 'every quest, old and new, comes up during a year');
  // progress hooks
  const p = M.newProfile(0); const rng = { chance: () => false, pick: (a) => a[0], next: () => 0.5, shuffle: (a) => a.slice(), weighted: (a) => a[0], int: () => 0 };
  const base = { mode: 'story', world: 'garage', encore: 0, won: true, kills: 10, merges: 2, deploys: 5, cleared: 5, bossKills: 0, bestCombo: 3, leaks: 0, stars: 1, relics: ['a', 'b', 'c'], duets: 2, coinsEarned: 1800, modifiers: ['x'] };
  M.applyRunResult(p, base, rng, 1000);
  const dp = p.daily.prog;
  eq([dp.duets, dp.relics, dp.coins, dp.flawless, dp.modWins], [2, 3, 1800, 1, 1], 'a run feeds duets, relics, coins, flawless and modifier wins');
  M.applyRunResult(p, Object.assign({}, base, { mode: 'endless', won: false, cleared: 14, leaks: 3, modifiers: [] }), rng, 1000);
  eq([dp.flawless, dp.modWins, dp.endlessWave, dp.dailies || 0], [1, 1, 14, 0], 'a lost run adds no win quests; endless sets the best wave');
  M.applyRunResult(p, Object.assign({}, base, { mode: 'daily' }), rng, 1000);
  eq(dp.dailies, 1, 'the Daily Challenge counts');
  p.diamonds = 9999; p.records = 99999; const c0 = dp.crates || 0;
  M.openCrateFree(p, 'garage', rng); eq(dp.crates, c0 + 1, 'opening a crate counts');
  p.daily.day = -1; M.ensureDaily(p, Date.UTC(2026, 5, 1)); ok(Object.keys(p.daily.prog).length === 0, 'a new day clears the counters');
  const w = M.spinWheel(p, Date.UTC(2026, 5, 1), rng); ok(w.ok && p.daily.prog.spins === 1, 'a wheel spin counts');
}

// ================================================================== 5. diagnostics
{
  const mem = () => { const o = {}; return { getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: (k) => { delete o[k]; }, _o: o }; };
  const st = mem();
  ok(D.DIAG_KEY === 'drop_the_bass_diag', 'the storage key');
  eq(D.readDiag(st), [], 'empty at the start');
  for (let i = 0; i < 45; i++) D.recordError(st, { message: 'boom ' + i, source: 'https://x.test/drop_the_bass/js/battle.js?v=3', line: 100 + i }, { lang: 'de', screen: 'battle' }, 1000 + i);
  let list = D.readDiag(st);
  eq(list.length, 20, 'the ring keeps the last 20');
  eq(list[0].msg, 'boom 25', 'oldest dropped first'); eq(list[19].msg, 'boom 44', 'newest last');
  eq([list[19].src, list[19].line, list[19].lang, list[19].screen, list[19].t], ['battle.js', 144, 'de', 'battle', 1044], 'file name only (no path or query), line, language, screen, time');
  // size cap
  for (let i = 0; i < 30; i++) D.recordError(st, { message: 'x'.repeat(5000) + i, source: 's.js', line: i }, { lang: 'en', screen: 'hub' }, 5000 + i);
  ok(st._o[D.DIAG_KEY].length <= D.DIAG_BYTES, 'the stored text is size capped (' + st._o[D.DIAG_KEY].length + ' bytes)');
  ok(D.readDiag(st).every((e) => e.msg.length <= D.DIAG_MSG), 'messages are cut to ' + D.DIAG_MSG);
  // repeats count up instead of flooding
  const st2 = mem();
  for (let i = 0; i < 100; i++) D.recordError(st2, { message: 'loop', source: 'a.js', line: 1 }, {}, i);
  list = D.readDiag(st2); ok(list.length === 1 && list[0].n === 100, 'the same error in a row is counted, not repeated');
  // never throws, even with broken storage or junk
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
  ok(D.recordError(broken, { message: 'a' }, {}) === false && D.readDiag(broken).length === 0 && D.clearDiag(broken) === false, 'broken storage never throws');
  ok(D.recordError(st2, null, null) !== undefined && D.recordError(st2, { message: { toString() { throw new Error('x'); } } }, {}) !== undefined, 'junk input never throws');
  st2.setItem(D.DIAG_KEY, '{not json'); eq(D.readDiag(st2), [], 'a damaged value reads as empty');
  // handlers: a thrown error and a rejection reach the buffer
  const listeners = {}; const win = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
  const st3 = mem(); let screen = 'hub';
  const off = D.installDiag(win, st3, () => ({ lang: 'nl', screen }));
  let thrown; try { null.boom; } catch (e) { thrown = e; }
  listeners.error({ message: thrown.message, filename: 'http://h.test/drop_the_bass/js/ui_hub.js?x=1', lineno: 77, error: thrown });
  screen = 'battle';
  listeners.unhandledrejection({ reason: new Error('async bad') });
  listeners.error({ target: { tagName: 'IMG' } });   // a failed image load is not recorded
  list = D.readDiag(st3);
  eq(list.length, 2, 'an error and a rejection were recorded, a resource error was not');
  eq([list[0].src, list[0].line, list[0].lang, list[0].screen], ['ui_hub.js', 77, 'nl', 'hub'], 'error entry: file, line, language, screen');
  ok(/async bad/.test(list[1].msg) && list[1].screen === 'battle', 'rejection entry');
  ok(/Cannot read properties of null/.test(list[0].msg), 'the real message was kept');
  // a real thrown error through a real EventTarget
  { const et = new EventTarget(); const s4 = mem(); D.installDiag(et, s4, () => ({ lang: 'en', screen: 'title' })); const ev = new Event('error'); ev.message = 'real'; ev.filename = 'a/b/c.js'; ev.lineno = 9; et.dispatchEvent(ev); eq(D.readDiag(s4)[0].src, 'c.js', 'works with a real event target'); }
  off(); ok(!listeners.error && !listeners.unhandledrejection, 'uninstall removes the handlers');
  ok(D.installDiag(null, st3)() === undefined, 'a missing window never throws');
  // report text
  const rep = D.diagReport({ version: 2, lang: 'de', langPref: 'auto', screen: 'hub', width: 390, height: 844, dpr: 2, ua: 'TestUA/1.0', online: false, saveBytes: 12345, fame: 12, fameTitle: 'Club Regular', heroLv: { roxor: 3, jasmin: 4 }, errors: list });
  for (const bit of ['game version 2', 'Language: de (setting: auto)', 'Viewport: 390x844 at 2x pixel ratio', 'Online: no', 'Save size: 12345 bytes', 'Fame: 12 (Club Regular)', 'hero levels: 3 / 4', 'TestUA/1.0', 'Last errors (2)', 'ui_hub.js:77']) ok(rep.includes(bit), 'report has: ' + bit);
  ok(!new RegExp(String.fromCharCode(8212)).test(rep) && rep.split('\n').length < 20, 'compact and without em dashes');
  ok(D.diagReport({}).includes('none'), 'an empty report still works');
  D.clearDiag(st3); eq(D.readDiag(st3), [], 'clear empties the buffer');
}

console.log('drop_the_bass r6 hub: ' + n + ' checks passed');
