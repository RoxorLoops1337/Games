// Drop the Bass: profile, studio, gear, crates, quests, rewards. All pure functions on a plain object.
import assert from 'node:assert/strict';
import * as M from '../drop_the_bass/js/meta.js';
import { makeRng } from '../drop_the_bass/js/rng.js';
import { Run } from '../drop_the_bass/js/sim.js';
import { DAILY_MODS as DM } from '../drop_the_bass/js/data_run.js';
import { applyFx, freshMods } from '../drop_the_bass/js/data_run.js';
import { fameTitle, FAME_TITLES, WEEKLY_GIGS, WEEKLY_WAVES, FAME_MAX } from '../drop_the_bass/js/data_meta.js';
import { STUDIO, GEAR, CRATES, ACHIEVEMENTS, SLOTS, PITY, AUTOMERGE_PRICE, QUESTS } from '../drop_the_bass/js/data_meta.js';
import { WORLDS, TURRETS, RARITY_ORDER } from '../drop_the_bass/js/data_core.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const NOW = Date.UTC(2026, 9, 24, 12);
const fresh = () => M.newProfile(NOW);
const rng = () => makeRng(42);

// ---- save round trip, migration and damaged saves
{
  const p = fresh(); p.records = 777; p.studio.amp = 3; M.makeGear(p, 'head_cap', 'rare');
  const back = M.parseSave(M.serialize(p), NOW); ok(back.records === 777 && back.studio.amp === 3 && back.gear.items.length === 1, 'round trip');
  const code = M.exportCode(p); const imp = M.importCode(code, NOW); ok(imp && imp.records === 777, 'export import');
  ok(M.importCode('not base64 at all !!', NOW) === null, 'bad code'); ok(M.parseSave('{broken', NOW) === null, 'damaged save');
  const old = { records: 5, prog: { garage: { cleared: true } }, gear: { items: [{ uid: 1, tpl: 'nope', rarity: 'common', lvl: 1 }, { uid: 2, tpl: 'head_cap', rarity: 'common', lvl: 1 }], equipped: { head: 99 } } };
  const m = M.migrate(old, NOW); ok(m.records === 5 && m.prog.garage.cleared && m.prog.busk && m.gear.items.length === 1 && m.gear.equipped.head === null, 'migrate fills and cleans');
  ok(M.migrate(null, NOW).records > 0, 'migrate null');
}

// ---- seven worlds: new profiles and old five world saves
{
  const p = fresh();
  ok(WORLDS.every((w) => p.prog[w.id] && p.prog[w.id].cleared === false), 'new profile has prog for every world');
  ok(p.prog.beach && p.prog.moon, 'new profile has beach and moon');
  const five = {}; for (const id of ['garage', 'busk', 'club', 'festival', 'arena']) five[id] = { cleared: true, stars: [3, 1, 0, 0, 0, 0], bestEndless: 7, bestWave: 20 };
  const m = M.migrate({ records: 9, prog: five }, NOW);
  ok(m.prog.arena.cleared && m.prog.arena.stars[0] === 3 && m.prog.arena.bestEndless === 7, 'old save keeps arena cleared');
  ok(m.prog.beach && m.prog.moon && !m.prog.beach.cleared && !m.prog.moon.cleared, 'old save gets the two new worlds, uncleared');
  ok(m.prog.beach.stars.length === 6, 'new world stars array is complete');
  ok(M.worldUnlocked(m, 'beach') && !M.worldUnlocked(m, 'moon'), 'beach unlocks after arena, moon stays locked');
  m.prog.beach.cleared = true; ok(M.worldUnlocked(m, 'moon'), 'moon unlocks after beach');
  const fresh2 = M.migrate({ records: 1, prog: { garage: { cleared: true } } }, NOW);
  ok(!M.worldUnlocked(fresh2, 'beach') && !M.worldUnlocked(fresh2, 'moon'), 'beach and moon are locked without arena');
}

// ---- studio
{
  const p = fresh(); p.records = 10; ok(!M.buyStudio(p, 'amp').ok, 'cannot afford'); p.records = 1e7;
  for (const id of Object.keys(STUDIO)) { for (let i = 0; i < STUDIO[id].max; i++) ok(M.buyStudio(p, id).ok, 'buy ' + id); ok(M.buyStudio(p, id).reason === 'max', 'max ' + id); }
  ok(M.loadoutSize(p) === 12 && p.loadout.length === 12, 'every turret is in the drop pool');
  const setup = M.computeRunSetup(p); const m = freshMods(); applyFx(m, setup.baseFx);
  ok(m.dmg > 2 && m.rate > 1.5 && m.stageHp === 10 && m.startCoins === 15 * 15 + 180, 'studio feeds the run');
  const r = new Run({ world: 'garage', baseFx: setup.baseFx, seed: 1 }); ok(r.stageMax === 30 && r.coins === 120 + 225 + 180, 'run applies studio');
}

// ---- heroes, turret unlocks, loadout
{
  const p = fresh(); p.records = 1e6; for (let i = 0; i < 12; i++) M.upgradeHero(p, 'roxor'); ok(p.heroLv.roxor === 10, 'hero cap');
  ok(M.canUnlockTurret(p, 'mic').reason === 'owned' && p.turretsUnlocked.mic && p.loadout.includes('mic'), 'all turrets start unlocked');
  const old = M.migrate({ loadout: ['kick', 'snare'] }, 0); ok(old.loadout.length === 12, 'old small pools grow to every turret');
  ok(p.loadout.length <= M.loadoutSize(p), 'loadout within size');
  ok(M.toggleLoadout(p, 'mic') && !p.loadout.includes('mic'), 'toggle off'); ok(M.setLoadout(p, ['kick', 'kick', 'zzz']) && p.loadout.length === 1, 'setLoadout sanitises');
  ok(!M.toggleLoadout(p, 'kick'), 'cannot empty the loadout');
}

// ---- gear, sets, merge, scrap, upgrade
{
  const p = fresh(); p.records = 1e6;
  const a = M.makeGear(p, 'head_mohawk', 'common'); M.equipGear(p, a.uid);
  const b = M.makeGear(p, 'mic_green', 'common'); M.equipGear(p, b.uid);
  ok(M.setCounts(p).mohawk === 2 && M.setBonuses(p).length === 1, 'set bonus at two'); const t1 = M.gearTotals(p); ok(t1.dmg > 0.06, 'totals include set');
  const lv0 = M.gearStatLines(a)[0].value; ok(M.upgradeGear(p, a.uid).ok && M.gearStatLines(a)[0].value > lv0, 'upgrade raises stats');
  for (let i = 0; i < 20; i++) M.upgradeGear(p, a.uid); ok(a.lvl === 10, 'level cap');
  const epic = M.makeGear(p, 'head_cap', 'epic'); ok(M.gearStatLines(epic).length === 2 && M.gearStatLines(a).length === 1, 'sub stat from epic');
  const x = [1, 2, 3].map(() => M.makeGear(p, 'feet_boots', 'common')); ok(M.mergeableGear(p).length === 1, 'detects triple');
  M.equipGear(p, x[0].uid); const r = M.mergeGear(p, x.map((g) => g.uid)); ok(r.ok && r.item.rarity === 'rare' && p.gear.equipped.feet === r.item.uid, 'merge keeps the equip'); ok(!x.some((g) => p.gear.items.includes(g)), 'inputs consumed');
  ok(!M.canMergeGear(p, [r.item.uid, r.item.uid, r.item.uid]), 'no duplicates in merge'); ok(!M.mergeGear(p, [1, 2]).ok, 'needs three');
  const mythic = [1, 2, 3].map(() => M.makeGear(p, 'mic_old', 'mythic')); ok(!M.canMergeGear(p, mythic.map((g) => g.uid)), 'mythic is the top');
  const before = p.records; const sc = M.scrapGear(p, epic.uid); ok(sc.ok && p.records > before && !M.gearById(p, epic.uid), 'scrap');
  const fx = M.computeRunSetup(p).baseFx; ok(fx.length > 0, 'gear makes fx');
  const m = freshMods(); applyFx(m, fx); ok(m.dmg > 1, 'gear raises damage');
}

// ---- crates, odds, pity
{
  const p = fresh(); p.diamonds = 1e5; p.records = 1e6; const rg = rng();
  for (const id of Object.keys(CRATES)) { const r = M.buyCrate(p, id, rg); ok(r.ok && r.items.length === CRATES[id].items, 'crate ' + id); }
  ok(!M.buyCrate(fresh(), 'platinum', rg).ok, 'cannot afford');
  const plat = M.buyCrate(p, 'platinum', rg); ok(plat.items.some((g) => RARITY_ORDER.indexOf(g.rarity) >= 2), 'platinum guarantees epic');
  // pity: a crate that can only roll commons still yields an epic within the window
  const q = fresh(); const odds = { common: 100, rare: 0, epic: 0, legendary: 0, mythic: 0 }; const got = [];
  for (let i = 0; i < PITY.legendaryEvery + 2; i++) got.push(M.rollGearItem(q, odds, rg).rarity);
  ok(got.slice(0, PITY.epicEvery).some((r) => r === 'epic'), 'epic pity'); ok(got.includes('legendary'), 'legendary pity');
  const table = M.crateOddsTable('studio'); ok(Math.abs(table.reduce((a, o) => a + o.pct, 0) - 100) < 1e-6, 'odds table sums');
  // rough distribution check on the garage crate
  const big = fresh(); const rr = makeRng(9); const c = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  for (let i = 0; i < 4000; i++) c[M.rollRarity(CRATES.garage.odds, rr)]++; ok(c.common > c.rare && c.rare > c.epic && c.epic > c.legendary, 'garage distribution shape');
  ok(c.mythic === 0, 'no mythic in garage crates');
}

// ---- fame
{
  const p = fresh(); const ups = M.addFans(p, 100000, rng()); ok(p.fame > 10 && ups.length === p.fame - 1, 'fame levels up'); ok(p.diamonds > 100, 'fame pays diamonds');
  ok(ups.some((u) => u.loot.length > 0), 'milestone fame levels give crates');
  const q = fresh(); M.addFans(q, 5, rng()); ok(q.fame === 1 && q.fans === 5, 'small gain');
}

// ---- progress and unlocks via run results
{
  const p = fresh(); const r = rng();
  ok(M.worldUnlocked(p, 'garage') && !M.worldUnlocked(p, 'busk'), 'only the first world is open');
  const win = { won: true, world: 'garage', encore: 0, mode: 'story', cleared: 20, wave: 20, kills: 500, leaks: 0, merges: 80, deploys: 60, bossKills: 2, bossTypes: ['compressor'], bestCombo: 33, coinsEarned: 5000, stars: 3, heroUses: 9, perfects: 12, remixes: 8, maxLevel: 6, relics: ['a', 'b'], gems: 2, duets: 1 };
  const out = M.applyRunResult(p, win, r, NOW);
  ok(out.firstClear && out.unlockedWorld === 'busk' && M.worldUnlocked(p, 'busk'), 'clear unlocks next'); ok(M.totalStars(p) === 3 && p.prog.garage.stars[0] === 3, 'stars recorded');
  ok(out.records > 300 && out.fans > 100 && out.diamonds >= 25 + 15 + 8 + 2, 'rewards'); ok(out.loot.length >= 1, 'win drops loot'); ok(M.endlessUnlocked(p), 'endless opens');
  ok(p.stats.kills === 500 && p.stats.maxLevel === 6 && p.stats.flawless === 1 && p.stats.bosses === 2, 'stats'); ok(p.bossesSeen.compressor, 'boss seen');
  const out2 = M.applyRunResult(p, win, r, NOW); ok(!out2.firstClear && out2.diamonds < out.diamonds, 'no double first clear bonus');
  ok(M.encoreUnlocked(p, 'garage', 1) && !M.encoreUnlocked(p, 'garage', 2), 'encore chain');
  const hard = Object.assign({}, win, { encore: 1, stars: 2 }); const o3 = M.applyRunResult(p, hard, r, NOW); ok(p.prog.garage.stars[1] === 2 && o3.records > out2.records, 'encore pays more');
  const lose = { won: false, world: 'busk', encore: 0, mode: 'story', cleared: 3, wave: 4, kills: 40, leaks: 20, merges: 5, deploys: 10, bossKills: 0, bossTypes: [], bestCombo: 4, coinsEarned: 200, stars: 0 };
  const o4 = M.applyRunResult(p, lose, r, NOW); ok(o4.records > 0 && !p.prog.busk.cleared && p.prog.busk.bestWave === 3, 'a loss still pays a little');
  const endless = { won: false, world: 'garage', encore: 0, mode: 'endless', cleared: 31, wave: 32, kills: 900, leaks: 5, merges: 100, deploys: 90, bossKills: 3, bossTypes: [], bestCombo: 20, coinsEarned: 9000, stars: 0 };
  const o5 = M.applyRunResult(p, endless, r, NOW); ok(o5.newBestEndless && p.prog.garage.bestEndless === 31 && p.stats.endless === 31, 'endless best');
  const tut = Object.assign({}, win, { mode: 'tutorial', world: 'garage' }); const q = fresh(); M.applyRunResult(q, tut, r, NOW); ok(!q.prog.garage.cleared, 'tutorial does not clear the stage');
}

// ---- daily: quests, login streak, challenge
{
  const p = fresh(); ok(M.ensureDaily(p, NOW) && p.daily.quests.length === 3, 'three quests'); ok(!M.ensureDaily(p, NOW), 'same day keeps them');
  const stats = p.daily.quests.map((s) => QUESTS.find((q) => q.id === s.id).stat); ok(new Set(stats).size === 3, 'distinct quest stats');
  const q0 = QUESTS.find((q) => q.id === p.daily.quests[0].id); p.daily.prog[q0.stat] = q0.goal; const rec = p.records, dia = p.diamonds;
  ok(M.claimQuest(p, q0.id).ok && (p.records > rec || p.diamonds > dia), 'claim quest'); ok(!M.claimQuest(p, q0.id).ok, 'claim once');
  const q1 = p.daily.quests[1].id; ok(M.rerollQuest(p, q1, rng()).ok && !M.rerollQuest(p, p.daily.quests[2].id, rng()).ok, 'one reroll a day');
  ok(M.ensureDaily(p, NOW + 86400000 * 1.5) && p.daily.prog && Object.keys(p.daily.prog).length === 0, 'next day resets');
  const l = fresh(); let st = M.loginStatus(l, NOW); ok(st.claimable && st.streak === 1, 'first login'); ok(M.claimLogin(l, NOW, rng()).ok && !M.claimLogin(l, NOW, rng()).ok, 'claim once a day');
  const d2 = M.loginStatus(l, NOW + 86400000); ok(d2.claimable && d2.streak === 2, 'streak continues'); M.claimLogin(l, NOW + 86400000, rng());
  const d4 = M.loginStatus(l, NOW + 86400000 * 4); ok(d4.streak === 1, 'streak breaks after a gap');
  for (let i = 0; i < 7; i++) M.claimLogin(l, NOW + 86400000 * (10 + i), rng()); ok(l.stats.streak >= 7, 'seven day streak tracked');
  const c1 = M.dailyChallenge(p, NOW), c2 = M.dailyChallenge(p, NOW); ok(c1.mod === c2.mod && c1.seed === c2.seed && c1.waves === 15, 'challenge is stable for the day');
  const mods = new Set(); for (let d = 0; d < 40; d++) mods.add(M.dailyChallenge(p, NOW + d * 86400000).mod); ok(mods.size >= 5, 'challenge varies');
  const first = M.applyRunResult(p, { won: true, world: 'garage', encore: 0, mode: 'daily', cleared: 15, wave: 15, kills: 300, leaks: 0, merges: 50, deploys: 40, bossKills: 1, bossTypes: [], bestCombo: 10, coinsEarned: 1000, stars: 3 }, rng(), NOW);
  ok(first.challenge.first && first.diamonds > 5 && M.dailyChallenge(p, NOW).done, 'daily first clear pays'); const again = M.applyRunResult(p, { won: true, world: 'garage', encore: 0, mode: 'daily', cleared: 15, wave: 15, kills: 300, leaks: 0, merges: 50, deploys: 40, bossKills: 1, bossTypes: [], bestCombo: 10, coinsEarned: 1000, stars: 3 }, rng(), NOW);
  ok(!again.challenge.first && again.diamonds === 0, 'daily pays once');
}

// ---- achievements, milestones, offline
{
  const p = fresh(); p.stats.kills = 1200; const claimable = M.claimableAchievements(p).map((a) => a.id); ok(claimable.includes('a_kills1') && claimable.includes('a_kills2') && !claimable.includes('a_kills3'), 'achievement thresholds');
  const d0 = p.diamonds; ok(M.claimAchievement(p, 'a_kills1').ok && p.diamonds > d0 && !M.claimAchievement(p, 'a_kills1').ok, 'claim once'); ok(!M.claimAchievement(p, 'a_kills3').ok, 'not done');
  for (const a of ACHIEVEMENTS) ok(M.achievementState(p, a).value >= 0, 'state ' + a.id);
  const q = fresh(); q.prog.garage.stars[0] = 3; q.prog.busk.stars[0] = 3; ok(M.claimStarMilestone(q, 3, rng()).ok && !M.claimStarMilestone(q, 3, rng()).ok && !M.claimStarMilestone(q, 10, rng()).ok, 'star chests');
  const o = fresh(); o.lastSeen = NOW - 3600000 * 3; ok(M.offlineRecords(o, NOW) === Math.floor(3 * M.offlineRate(o)), 'offline earnings'); o.lastSeen = NOW - 3600000 * 500; ok(M.offlineRecords(o, NOW) === Math.floor(M.offlineCapHours(o) * M.offlineRate(o)), 'offline cap');
  const v = M.claimOffline(o, NOW); ok(v > 0 && M.offlineRecords(o, NOW) === 0, 'claim resets');
  const s = fresh(); s.diamonds = AUTOMERGE_PRICE; ok(M.buyAutoMerge(s).ok && s.autoMerge && !M.buyAutoMerge(s).ok, 'auto merge'); s.diamonds = 500; ok(M.buyOutfit(s, 'roxor', 'onesie').ok && s.outfits.worn.roxor === 'onesie' && s.diamonds === 380, 'outfit');
  ok(M.buyOutfit(s, 'roxor', 'default').ok && s.outfits.worn.roxor === 'default', 'switch outfit back for free');
  ok(M.readyBadges(fresh(), NOW).goals >= 1, 'badge for the daily reward');
}
// ---- boosters, wheel, codex stats
{
  const p = fresh(); p.diamonds = 100; M.toggleBooster(p, 'cash'); M.toggleBooster(p, 'hype'); ok(M.boosterTotal(p) === 20, 'booster total');
  const b = M.useBoosters(p); ok(b.ok && b.hype && p.diamonds === 80 && b.fx.length > 0 && M.boosterTotal(p) === 0, 'boosters are paid once and cleared');
  M.toggleBooster(p, 'tough'); p.diamonds = 1; ok(!M.useBoosters(p).ok && p.diamonds === 1, 'cannot afford boosters');
  const w = fresh(); ok(M.wheelState(w, NOW).free, 'free spin'); const r = M.spinWheel(w, NOW, makeRng(3)); ok(r.ok && r.index >= 0 && !M.wheelState(w, NOW).free && w.stats.spins === 1, 'spin');
  w.diamonds = 0; ok(!M.spinWheel(w, NOW, makeRng(3)).ok, 'paid spin needs diamonds'); w.diamonds = 100; ok(M.spinWheel(w, NOW, makeRng(4)).ok && w.diamonds === 85, 'paid spin');
  ok(M.wheelState(w, NOW + 86400000).free, 'free spin again tomorrow');
  const seen = {}; const rr = makeRng(11); for (let i = 0; i < 300; i++) { const q = fresh(); const x = M.spinWheel(q, NOW, rr); seen[x.seg.id] = 1; } ok(Object.keys(seen).length >= 6, 'wheel pays many things');
  const c = fresh(); c.seen.enemies = { fuzz: 1, zip: 1, mini: 1 }; ok(M.statValueOf(c, 'seenEnemies') === 2, 'hidden enemies do not count'); c.bossesSeen.playback = true; c.seen.bosses.reverb = 1; ok(M.statValueOf(c, 'seenBosses') === 2, 'bosses seen'); ok(M.statValueOf(c, 'turretsOwned') === 12, 'turrets owned');
  const rush = fresh(); const o = M.applyRunResult(rush, { won: true, world: 'garage', encore: 0, mode: 'rush', cleared: 10, wave: 10, kills: 100, leaks: 0, merges: 10, deploys: 30, bossKills: 10, bossTypes: [], bestCombo: 9, coinsEarned: 500, stars: 3 }, makeRng(1), NOW); ok(rush.stats.rushBest === 10 && o.diamonds >= 55 && !rush.prog.garage.cleared, 'boss rush pays and does not clear the stage');
}

// ---- save robustness: validate-then-commit, backup, recovery, damaged saves
const mockStore = (o = {}) => { const m = new Map(Object.entries(o)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (o.__full) throw new Error('quota'); m.set(k, String(v)); }, removeItem: (k) => m.delete(k), _m: m }; };
{
  const st = mockStore(); const p = fresh(); p.records = 4321; p.studio.amp = 4; p.stats.runs = 12; p.fame = 5;
  const c = M.commitSave(st, p); ok(c.ok && st.getItem(M.SAVE_KEY) && st.getItem(M.SAVE_BAK_KEY), 'commit writes the main save and the backup');
  ok(M.SAVE_BAK_KEY === 'drop_the_bass_save_v1_bak' && M.SAVE_KEY === 'drop_the_bass_save_v1', 'key names (old key untouched, new bak key)');
  let L = M.loadSave(st, NOW); ok(L.source === 'main' && !L.recovered && L.profile.records === 4321 && L.hadSave, 'load main');
  // resume is left out of the backup
  const q = fresh(); q.resume = { cfg: {}, snap: { big: 1 } }; M.commitSave(st, q); ok(JSON.parse(st.getItem(M.SAVE_BAK_KEY)).resume === null && JSON.parse(st.getItem(M.SAVE_KEY)).resume !== null, 'backup has no run snapshot');
  M.commitSave(st, p);
  // corrupt JSON, truncated JSON, wrong types, empty object: each recovers from the backup
  for (const [label, bad] of [['garbage', 'not json at all {{{'], ['truncated', st.getItem(M.SAVE_KEY).slice(0, 400)], ['array', '[1,2,3]'], ['null', 'null'], ['string', '"hello"'], ['empty object', '{}'], ['number', '42'], ['no stats', '{"records":5}'], ['blank', '   ']]) {
    const s2 = mockStore(); M.commitSave(s2, p); s2.setItem(M.SAVE_KEY, bad);
    L = M.loadSave(s2, NOW); ok(L.recovered && L.source === 'backup' && L.profile.records === 4321 && L.profile.studio.amp === 4, 'recovers from backup: ' + label);
    ok(s2.getItem(M.SAVE_CORRUPT_KEY) === bad, 'damaged main save is kept for rescue: ' + label);
  }
  const s3 = mockStore(); M.commitSave(s3, p); s3._m.delete(M.SAVE_KEY); L = M.loadSave(s3, NOW); ok(L.recovered && L.profile.records === 4321, 'missing main save recovers from backup');
  const s4 = mockStore({ [M.SAVE_KEY]: '{oops' }); L = M.loadSave(s4, NOW); ok(!L.recovered && L.corrupt && !L.hadSave && L.source === 'new' && L.profile.records === 250, 'corrupt with no backup starts fresh and says so');
  L = M.loadSave(mockStore(), NOW); ok(!L.recovered && !L.corrupt && !L.hadSave, 'first launch');
  const s5 = mockStore({ [M.SAVE_KEY]: '{oops', [M.SAVE_BAK_KEY]: '{also bad' }); L = M.loadSave(s5, NOW); ok(L.source === 'new' && L.corrupt, 'both damaged');
  ok(M.loadSave({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, NOW).source === 'new', 'blocked storage does not throw');
  // wrong types inside an otherwise valid save are sanitised
  const wt = M.parseSave(JSON.stringify({ stats: {}, prog: {}, records: 'lots', diamonds: null, fame: 9999, fans: -5, studio: [1, 2], heroLv: { roxor: 'x', jasmin: 99 }, settings: 5, loadout: 'kick', gear: { items: 'no', uid: 'a' }, friends: 'bob', pendingCrates: ['zzz', 'garage', 7], name: { a: 1 } }), NOW);
  ok(wt && wt.records === 0 && wt.diamonds === 0 && wt.fame === 50 && wt.fans === 0 && Object.keys(wt.studio).length === 0, 'wrong number types fall back safely');
  ok(wt.heroLv.roxor === 1 && wt.heroLv.jasmin === 10 && wt.settings.difficulty === 'normal' && wt.loadout.length === 12 && wt.gear.items.length === 0 && wt.friends.length === 0 && wt.pendingCrates.join() === 'garage' && wt.name === '', 'wrong containers fall back safely');
  const nan = M.parseSave('{"stats":{"kills":"x","runs":null},"records":1e999,"prog":{"garage":{"stars":"no","cleared":1}}}', NOW); ok(nan.stats.kills === 0 && Number.isFinite(nan.records) && nan.prog.garage.stars.length === 6 && nan.prog.garage.cleared === true, 'NaN, Infinity and strings are repaired');
  // commit refuses a poisoned profile and leaves the last good save alone
  const good = mockStore(); M.commitSave(good, p); const before = good.getItem(M.SAVE_KEY);
  const poison = fresh(); poison.records = NaN; ok(!M.commitSave(good, poison).ok && good.getItem(M.SAVE_KEY) === before, 'NaN records are not committed');
  const circ = fresh(); circ.self = circ; ok(M.commitSave(good, circ).reason === 'serialize' && good.getItem(M.SAVE_KEY) === before, 'unserialisable profile is not committed');
  const bad2 = fresh(); bad2.settings = null; ok(!M.commitSave(good, bad2).ok, 'broken shape is not committed');
  M.repairProfile(poison, NOW); ok(Number.isFinite(poison.records) && M.commitSave(good, poison, { force: true }).ok, 'repairProfile makes it committable');
  // a reset-looking profile does not wipe a far more advanced backup unless forced
  const adv = mockStore(); const big = fresh(); big.stats.runs = 80; big.fame = 20; big.records = 99999; M.commitSave(adv, big);
  const wiped = fresh(); const r1 = M.commitSave(adv, wiped); ok(r1.ok && r1.keptBackup && JSON.parse(adv.getItem(M.SAVE_BAK_KEY)).records === 99999, 'backup survives an accidental fresh profile');
  M.commitSave(adv, wiped, { force: true }); ok(JSON.parse(adv.getItem(M.SAVE_BAK_KEY)).records === 250, 'force replaces the backup (reset or import)');
  const full = mockStore({ __full: true }); ok(M.commitSave(full, fresh()).reason === 'storage', 'a full disk is reported, not thrown');
}

// ---- save code export and import
{
  const p = fresh(); p.records = 5555; p.name = 'Dan'; p.friends = ['Jas']; p.resume = { cfg: {}, snap: {} }; p.studio.crit = 3;
  const code = M.exportCode(p); ok(code.startsWith('DTB1.') && !/\s/.test(code), 'code has a version prefix');
  const back = M.importCode(code, NOW); ok(back && back.records === 5555 && back.friends[0] === 'Jas' && back.studio.crit === 3 && back.resume === null, 'code round trip drops the run snapshot');
  ok(M.importCode('  ' + code.slice(0, 40) + '\n' + code.slice(40) + '  ', NOW).records === 5555, 'whitespace and line breaks are tolerated');
  ok(M.importCode('"' + code + '"', NOW).records === 5555, 'quotes are tolerated');
  ok(M.importCode(code.slice(0, code.length - 30), NOW) === null, 'truncated code is rejected');
  ok(M.importCode(code.replace('DTB1.', 'DTB1.A'), NOW) === null, 'edited code fails the checksum');
  ok(M.importCode('DTB1.' + code.split('.')[1], NOW) === null, 'code without checksum is rejected');
  const legacy = Buffer.from(JSON.stringify({ stats: {}, prog: {}, records: 77 }), 'utf8').toString('base64'); ok(M.importCode(legacy, NOW).records === 77, 'old raw base64 codes still import');
  ok(M.importCode('', NOW) === null && M.importCode(null, NOW) === null && M.importCode(12, NOW) === null && M.importCode(Buffer.from('{"a":1}').toString('base64'), NOW) === null && M.importCode(Buffer.from('[]').toString('base64'), NOW) === null, 'empty, wrong type and non-save codes are rejected');
  const odd = fresh(); odd.name = 'Zoe'; ok(M.importCode(M.exportCode(odd), NOW).name === 'Zoe', 'plain names survive');
}

// ---- resume sanity
{
  const mk = () => { const r = new Run({ world: 'garage', mode: 'story', seed: 3 }); r.coins = 5000; r.t = 100; for (let i = 0; i < 4; i++) r.deploy(null, { onBeat: false }); r.startWave(true); for (let i = 0; i < 200; i++) r.advance(1 / 30); r.cfg = { mode: 'story', world: 'garage', encore: 0, seed: 3 }; return r; };
  const run = mk();
  const res = () => JSON.parse(JSON.stringify({ cfg: run.cfg, snap: run.snapshot(), world: run.world.id, wave: run.wave, mode: run.mode, t: 1 }));
  ok(M.checkResume(res()).ok, 'a real snapshot passes');
  const sum = M.resumeSummary(res()); ok(sum.stage === 'Garage' || typeof sum.stage === 'string', 'summary has a stage'); ok(sum.turrets === 4 && sum.wave === 1, 'summary counts turrets and wave');
  const restored = Run.restore(res().snap); ok(restored.turrets.length === 4, 'and restores');
  const mut = (fn) => { const r = res(); fn(r); return M.checkResume(r); };
  ok(!mut((r) => { r.snap.turrets[0].born = r.snap.t + 50; }).ok, 'turret born after the run clock is rejected');
  ok(!mut((r) => { r.snap.coins = NaN; r.snap = JSON.parse(JSON.stringify(r.snap, (k, v) => (v !== v ? null : v))); }).ok, 'NaN (null after JSON) coins rejected');
  ok(!mut((r) => { r.snap.t = -5; }).ok && !mut((r) => { r.snap.stageHp = -1; }).ok && !mut((r) => { r.snap.stageMax = 0; }).ok, 'impossible numbers rejected');
  ok(!mut((r) => { delete r.snap.turrets; }).ok && !mut((r) => { delete r.snap.enemies; }).ok && !mut((r) => { r.snap.turrets = 'x'; }).ok, 'missing lists rejected');
  ok(!mut((r) => { r.snap.turrets[0].type = 'nope'; }).ok && !mut((r) => { r.snap.turrets[0].level = 9; }).ok && !mut((r) => { r.snap.turrets[1].slot = r.snap.turrets[0].slot; }).ok, 'bad turrets rejected');
  ok(!mut((r) => { r.snap.enemies[0].hp = 'a'; }).ok && !mut((r) => { r.snap.enemies[0].x = null; }).ok, 'bad enemies rejected');
  ok(!mut((r) => { r.snap.phase = 'dead'; }).ok && !mut((r) => { r.cfg = null; }).ok && !mut((r) => { r.cfg.world = 'nowhere'; }).ok && !mut((r) => { r.snap = null; }).ok && !mut((r) => { r.snap.opts = {}; }).ok, 'missing setup rejected');
  ok(!M.checkResume(null).ok && !M.checkResume('x').ok && !M.checkResume([]).ok && !M.checkResume({}).ok, 'garbage resume rejected');
  ok(!mut((r) => { r.snap.rngState = undefined; }).ok, 'missing rng state rejected');
}

// ---- difficulty, fame titles, friends in the profile
{
  const p = fresh(); ok(p.settings.difficulty === 'normal' && M.difficultyOf(p) === 'normal', 'default difficulty is normal');
  p.settings.difficulty = 'hard'; ok(M.difficultyOf(p) === 'hard' && M.computeRunSetup(p).difficulty === 'hard', 'difficulty reaches the run setup');
  p.settings.difficulty = 'nightmare'; ok(M.difficultyOf(p) === 'normal', 'unknown difficulty falls back to normal');
  ok(M.migrate({ settings: { difficulty: 'zzz' } }, NOW).settings.difficulty === 'normal' && M.migrate({ settings: { difficulty: 'easy' } }, NOW).settings.difficulty === 'easy', 'difficulty is sanitised on load');
  for (const id of M.DIFFICULTY_IDS) { const d = M.difficultyInfo(id); ok(d.id === id && d.name.length > 0 && d.desc.length > 0, 'difficulty info ' + id); }
  ok(M.difficultyInfo('bogus').id === 'normal', 'difficulty info fallback');
  ok(fameTitle(1) === 'Garage Band' && fameTitle(10) === 'Local Legend' && fameTitle(FAME_MAX) === 'Bass Legend' && fameTitle(0) === 'Garage Band', 'fame titles');
  ok(FAME_TITLES.every((t, i) => i === 0 || t[0] > FAME_TITLES[i - 1][0]) && FAME_TITLES[0][0] === 1 && !FAME_TITLES.some((t) => t[1].includes(String.fromCharCode(8212))), 'fame titles ascend');
  const f = fresh(); ok(M.addFriend(f, 'Jas').ok && f.friends.length === 1 && !M.addFriend(f, 'jas').ok, 'profile friends'); M.removeFriend(f, 'JAS'); ok(f.friends.length === 0, 'remove friend');
  f.name = 'Me'; ok(M.addFriend(f, 'me').reason === 'self', 'cannot befriend yourself');
}

// ---- weekly gig
{
  const wk = M.isoWeek(Date.UTC(2026, 10, 1, 12)); ok(wk.id === '2026-W44' && wk.week === 44, 'iso week of 1 Nov 2026');
  ok(M.isoWeek(Date.UTC(2026, 10, 2, 0, 0, 1)).id === '2026-W45' && M.isoWeek(Date.UTC(2026, 9, 26)).id === '2026-W44', 'weeks start on Monday (UTC)');
  const p = fresh(), a = M.weeklyGig(p, Date.UTC(2026, 10, 3)), b = M.weeklyGig(fresh(), Date.UTC(2026, 10, 8, 23));
  ok(a.seed === b.seed && a.mod === b.mod && a.world === b.world && a.waves === WEEKLY_WAVES && a.waves === 25, 'everyone gets the same weekly run all week');
  ok(M.weeklyGig(p, Date.UTC(2026, 10, 9)).seed !== a.seed, 'next week has another seed');
  const seenGig = new Set(); let prev = null;
  for (let w = 0; w < 30; w++) { const g = M.weeklyGig(p, Date.UTC(2026, 0, 5) + w * 7 * 86400000); seenGig.add(g.gig.id); ok(g.id !== (prev && prev.id) && (!prev || prev.gig.id !== g.gig.id), 'neighbouring weeks differ ' + w); prev = g; }
  ok(seenGig.size === WEEKLY_GIGS.length, 'every gig comes round');
  for (const g of WEEKLY_GIGS) {
    ok(Object.keys(DM).includes(g.mod), 'gig mod exists ' + g.id);
    const setup = M.computeRunSetup(fresh());
    const run = new Run({ world: g.world, mode: 'daily', daily: g.mod, wavesTotal: 25, seed: 5, loadout: setup.loadout, baseFx: setup.baseFx.concat(g.extra), heroLv: setup.heroLv });
    run.coins = 3000; for (let i = 0; i < 200; i++) { run.autoPlayStep({ early: true }); run.advance(1 / 20); if (run.phase === 'won' || run.phase === 'lost') break; }
    ok(run.wavesTotal === 25 && Number.isFinite(run.coins) && run.wave >= 1, 'weekly run plays: ' + g.id);
  }
  // rewards: first claim pays big, later plays pay half and no diamonds, one claim per week
  const r1 = fresh(), res = { won: true, world: 'club', encore: 0, mode: 'daily', weekly: true, weekId: '2026-W44', cleared: 25, wave: 25, kills: 400, leaks: 0, merges: 50, deploys: 90, bossKills: 2, bossTypes: [], bestCombo: 20, coinsEarned: 9000, stars: 3 };
  const d0 = r1.diamonds; const o1 = M.applyRunResult(r1, res, makeRng(2), NOW);
  ok(o1.challenge && o1.challenge.first && o1.challenge.weekly && o1.diamonds >= 70 && r1.diamonds >= d0 + 70 && r1.pendingCrates.includes('studio') && r1.weekly.done && r1.weekly.best === 25 && r1.stats.weeklies === 1, 'first weekly claim pays big');
  ok(r1.daily.challengeDay === -1 && r1.stats.dailies === 0, 'weekly does not eat the daily claim');
  const dm = r1.diamonds, pc = r1.pendingCrates.length; const o2 = M.applyRunResult(r1, Object.assign({}, res, { cleared: 12, won: false }), makeRng(3), NOW);
  ok(!o2.challenge.first && o2.diamonds === 0 && r1.diamonds === dm && r1.pendingCrates.length === pc && r1.weekly.best === 25, 'second play the same week pays no weekly bonus');
  const o3 = M.applyRunResult(r1, Object.assign({}, res, { weekId: '2026-W45' }), makeRng(4), NOW); ok(o3.challenge.first && r1.weekly.id === '2026-W45', 'a new week can be claimed again');
  const lose = fresh(); const o4 = M.applyRunResult(lose, Object.assign({}, res, { won: false, cleared: 3 }), makeRng(5), NOW); ok(o4.challenge.first && !(lose.pendingCrates || []).length, 'a short loss still claims the week but earns no crate');
  ok(M.weeklyGig(r1, Date.UTC(2026, 10, 3)).done === true && M.weeklyGig(r1, Date.UTC(2026, 10, 10)).done === false, 'done flag follows the week');
}
console.log('drop_the_bass meta: ' + n + ' checks passed');
