// Drop the Bass: profile, studio, gear, crates, quests, rewards. All pure functions on a plain object.
import assert from 'node:assert/strict';
import * as M from '../drop_the_bass/js/meta.js';
import { makeRng } from '../drop_the_bass/js/rng.js';
import { Run } from '../drop_the_bass/js/sim.js';
import { applyFx, freshMods } from '../drop_the_bass/js/data_run.js';
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
console.log('drop_the_bass meta: ' + n + ' checks passed');
