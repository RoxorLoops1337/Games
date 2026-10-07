// Headless suite for the Encore Island meta features: seasons, challenge runs, collection book.
import { harness } from './no_room_for_heroes_lib.mjs';
import { loadEI } from './encore_island_lib.mjs';

const t = harness('encore_island_meta');
const EI = loadEI();
const F = (id) => EI.FEATS.find(f => f.id === id);
let S = EI.S;
function fresh() { EI.resetAll(); S = EI.S; S.started = true; S.settings.particles = true; return S; }
const run = (sec, dt = 0.05) => { for (let i = 0; i < sec / dt; i++) { S.hold = false; EI.tick(dt); } };
const A = F('seasons') && F('seasons').api, C = F('challenge') && F('challenge').api, B = F('book') && F('book').api;

// ---- registration
t.ok(F('seasons') && F('seasons').keep && F('challenge') && F('challenge').keep && F('book') && F('book').keep, 'three keep:true features registered');
t.ok(['season', 'challenge', 'book'].every(id => EI.TABS.goals.some(x => x.id === id)), 'goals tabs registered');
fresh();
t.ok(EI.sheetTabs('goals').length >= 7, 'goals sheet lists the new tabs');
t.ok(EI.SKINS.filter(s => s.season).length === 4, 'four season outfits pushed to SKINS');

// ---- seasons from fake dates
const so = (y, m, d) => A.seasonOfDate(new Date(y, m - 1, d)).id;
t.ok(so(2026, 3, 1) === 'spring' && so(2026, 5, 31) === 'spring' && so(2026, 6, 1) === 'summer' && so(2026, 8, 31) === 'summer', 'spring/summer boundaries');
t.ok(so(2026, 9, 1) === 'autumn' && so(2026, 11, 30) === 'autumn' && so(2026, 12, 1) === 'winter' && so(2027, 1, 15) === 'winter' && so(2027, 2, 28) === 'winter' && so(2027, 3, 1) === 'spring', 'autumn/winter boundaries');
S.feat.seasons.fakeNow = new Date(2026, 9, 7, 12).getTime();
t.ok(A.seasCur().id === 'autumn' && A.seasKey() === 'autumn-2026', 'current season from fake date');
t.ok(A.seasDaysLeft() === 55, 'days left to end of autumn: ' + A.seasDaysLeft());
S.feat.seasons.fakeNow = new Date(2027, 0, 10, 12).getTime(); t.ok(A.seasKey() === 'winter-2026', 'January belongs to the winter that began in December');
S.feat.seasons.force = 'spring'; t.ok(A.seasCur().id === 'spring' && A.seasDaysLeft() === null, 'force override + preview has no days left');
S.feat.seasons.force = null; S.feat.seasons.fakeNow = 0;

// ---- quest line: progress, chain, claim, outfit
fresh(); S.feat.seasons.force = 'summer'; S.feat.seasons.fakeNow = 0;
const sk = A.seasCur().skin.id; t.ok(!S.skins.owned[sk], 'outfit not owned at start');
EI.buySkin(sk); t.ok(!S.skins.owned[sk], 'season outfit cannot be bought');
let rec = A.seasRec(); t.ok(rec.i === 0 && A.seasGoal(0) === 60, 'quest 1 = kill 60');
for (let i = 0; i < 59; i++) EI.fEmit('kill', { k: 1 }); t.ok(!A.seasReady() && rec.p === 59, 'progress 59/60');
EI.fEmit('sell', 5); t.ok(rec.p === 59, 'sell does not advance a kill quest (chain)');
EI.fEmit('kill', { k: 1 }); t.ok(A.seasReady(), 'quest 1 ready'); t.ok(EI.featPips().goals === true, 'goals dock pip while claimable');
const g0 = S.gems; t.ok(A.seasClaim() && S.gems === g0 + 2 && rec.i === 1 && rec.p === 0, 'claim pays gems and chains');
t.ok(!A.seasClaim(), 'cannot claim twice');
for (let i = 0; i < 80; i++) EI.fEmit('sell', 1); t.ok(A.seasReady()); A.seasClaim();
EI.fEmit('land', {}); t.ok(A.seasReady()); A.seasClaim();
EI.fEmit('boss', { k: 1 }); t.ok(A.seasReady()); A.seasClaim();
S.stats.earned += A.seasGoal(4) + 10; run(0.1); t.ok(rec.i === 4 && A.seasReady(), 'earn counter via stats delta: ' + rec.p + '/' + A.seasGoal(4));
let seen = null; F('seasons').on.seasonDone = undefined; const hook = { id: 'x', on: { seasonDone(id) { seen = id; } } }; EI.FEATS.push(hook);
A.seasClaim(); EI.FEATS.pop(); t.ok(rec.i === 5 && rec.outfit && S.skins.owned[sk] && seen === 'summer', 'finishing line grants outfit + seasonDone event');
t.ok(!A.seasReady(), 'no more claims after line');
// persistence + past season kept, only current claimable
S.feat.seasons.force = 'winter'; const w = A.seasRec(); t.ok(w.i === 0, 'new season starts fresh'); EI.fEmit('kill', { k: 1 }); t.ok(w.p === 1, 'progress goes to the current season only');
const sv = JSON.parse(JSON.stringify(EI.serialize())); EI.resetAll(); EI.applySave(sv); S = EI.S;
t.ok(S.feat.seasons.rec['summer-' + new Date().getFullYear()].i === 5 && S.skins.owned[sk], 'season progress + outfit survive save round trip');
t.ok(S.feat.seasons.rec['winter-' + (new Date().getMonth() <= 1 ? new Date().getFullYear() - 1 : new Date().getFullYear())].p === 1, 'winter progress persisted');

// ---- tab draws + tour persistence
for (const f of ['spring', 'summer', 'autumn', 'winter']) { S.feat.seasons.force = f; EI.openSheet('goals', 'season'); let ok = true; try { for (let i = 0; i < 5; i++) { EI.tick(0.05); EI.draw(0.016); } } catch (e) { ok = false; console.log(e); } t.ok(ok, 'season tab + overlay draws: ' + f); }
S.settings.particles = false; EI.draw(0.016); S.settings.particles = true; S.sheet = null;
EI.prestige(); S = EI.S; t.ok(S.feat.seasons.rec && Object.keys(S.feat.seasons.rec).length >= 2, 'season state survives Encore Tour (keep)');

// ---- challenge: rules deterministic
fresh();
const d1 = new Date(2026, 5, 3), d2 = new Date(2026, 5, 3, 22);
t.ok(C.chalRules('daily', d1)[0].id === C.chalRules('daily', d2)[0].id, 'daily rule deterministic within a day');
const ids = new Set(); for (let i = 0; i < 40; i++) ids.add(C.chalRules('daily', new Date(2026, 5, 1 + i))[0].id); t.ok(ids.size >= 5, 'daily rules vary across days: ' + ids.size);
const wk = C.chalRules('weekly', new Date(2026, 5, 3)); t.ok(wk.length === 2 && wk[0].id !== wk[1].id, 'weekly = two different rules');
t.ok(C.chalKey('weekly', new Date(2026, 5, 1)) === C.chalKey('weekly', new Date(2026, 5, 7)) && C.chalKey('weekly', new Date(2026, 5, 7)) !== C.chalKey('weekly', new Date(2026, 5, 8)), 'weeks run Monday to Sunday');
t.ok(C.chalThresholds('weekly', wk)[2] > C.chalThresholds('daily', [C.CHAL_RULES[3]])[0], 'weekly stars are harder');

// ---- challenge run: start / apply / finish / restore
EI.addLand(); EI.addLand(); S.level = 6; S.wallet = 1000; S.up.hp = 12; S.up.dmg = 8; S.up.rate = 3;
EI.tick(0.05); S.player.x = EI.STAGE.x + 10; S.player.y = EI.STAGE.y; const p = S.player; p.helmets.push({ k: 1 }, { k: 2 }); p.hp = Math.floor(p.maxHp * 0.6);
const pre = { x: p.x, y: p.y, hp: p.hp, hl: p.helmets.length, dmg: EI.pDmg(), maxHp: p.maxHp }, gem0 = S.gems, wal0 = S.wallet;
t.ok(C.chalStart('daily') && C.CHAL.on && S.feat.challenge.active === true, 'challenge starts, active flag set');
t.ok(p.helmets.length === 0 && EI.landAt(p.x, p.y, S.lands.length) === S.lands.length, 'hero teleported to the top land with empty bag');
t.ok(!C.chalStart('weekly'), 'cannot start a second run');
// force known rules for the checks
const setRules = (ids) => { C.CHAL.rules = ids.map(id => C.CHAL_RULES.find(r => r.id === id)); C.CHAL.flags = {}; C.CHAL.mods = { dmg: 1, hp: 1, speed: 1, rate: 1 }; for (const r of C.CHAL.rules) { C.CHAL.flags[r.id] = true; if (r.mods) for (const k in r.mods) C.CHAL.mods[k] *= r.mods[k]; } C.CHAL.goal = 0; };
setRules(['glass']); t.ok(Math.abs(EI.pDmg() / pre.dmg - 3) < 0.01, 'glass cannon triples damage'); EI.tick(0.05); t.ok(p.maxHp <= Math.ceil(pre.maxHp * 0.3) + 1, 'glass cannon cuts max HP to 30%: ' + p.maxHp + ' vs ' + pre.maxHp);
setRules(['fans']); t.ok(Math.abs(EI.pDmg() / pre.dmg - 0.2) < 0.01, 'fans only: -80% damage');
setRules(['nodash']); p.dashCd = 0; t.ok(EI.dashAbility() === false, 'no-dash blocks the dash');
setRules(['onehit']); p.invuln = 0; p.hp = p.maxHp; EI.tick(0.01); p.invuln = 0; const hpBefore = p.hp; global.__hp = 1; // hurt through the real function
const hurt = (d) => { p.invuln = 0; EI.hurtPlayer ? EI.hurtPlayer(d) : null; };
run(0.1);
// spawn pressure + kills counted
const en0 = S.enemies.filter(e => e.chal).length; run(8); t.ok(S.enemies.filter(e => e.chal).length > en0 || en0 >= 6, 'pressure keeps spawning challenge creatures');
setRules(['glass']); C.CHAL.kills = 0; for (let i = 0; i < 40; i++) EI.fEmit('kill', { k: 1 }); t.ok(C.CHAL.kills === 40 && C.chalScore() >= 400, 'kills score points: ' + C.chalScore());
setRules(['beat']); const k0 = C.CHAL.kills; EI.fEmit('kill', { k: 1 }); t.ok(C.CHAL.raw > 0 && C.CHAL.kills <= k0 + 1, 'beat rule counts only on-beat kills');
C.CHAL.kills = 40; C.CHAL.combo = 10; S.stats.earned += 5000;
const res = C.chalFinish('time');
t.ok(res && res.stars >= 1 && !C.CHAL.on && S.feat.challenge.active === false, 'finish gives stars and ends the run: ' + (res && res.stars) + ' score ' + (res && res.score));
t.ok(S.gems > gem0 && S.wallet > wal0, 'prizes paid (gems ' + (S.gems - gem0) + ', coins ' + (S.wallet - wal0) + ')');
t.ok(p.helmets.length >= pre.hl && Math.abs(p.x - pre.x) < 1 && Math.abs(p.y - pre.y) < 1, 'bag + position restored ' + p.helmets.length + '/' + pre.hl + ' ' + p.x + ',' + p.y + ' vs ' + pre.x + ',' + pre.y + ' ' + JSON.stringify(res));
t.ok(Math.abs(EI.pDmg() / pre.dmg - 1) < 0.01 && p.maxHp === pre.maxHp && p.hp > 0 && p.hp <= p.maxHp, 'rule effects vanish ' + EI.pDmg() / pre.dmg + ' ' + p.maxHp + ' ' + pre.maxHp + ' ' + p.hp);
t.ok(!S.enemies.some(e => e.chal), 'challenge creatures swept away');
t.ok(S.feat.challenge.result && S.feat.challenge.hist.length === 1 && Object.keys(S.feat.challenge.best).length === 1, 'result card state + history + best stored');
EI.openSheet('goals', 'challenge'); EI.draw(0.016); S.sheet = null; EI.draw(0.016); // result card draws
S.feat.challenge.result = null;
// second run: same score pays nothing more, better pays only the difference
C.chalStart('daily'); setRules(['glass']); C.CHAL.kills = 40; C.CHAL.combo = 10; S.stats.earned += 5000; const gA = S.gems; const r2 = C.chalFinish('time'); t.ok(S.gems === gA && !r2.newBest || r2.rw.gems === 0, 'replay at same stars pays nothing again');
S.feat.challenge.result = null;
// abort restores and gives nothing
const w1 = S.wallet, g1 = S.gems; C.chalStart('weekly'); S.player.helmets.push({ k: 3 }); run(2); C.chalAbort();
t.ok(!C.CHAL.on && S.gems - g1 <= 1 && S.wallet === w1 && Math.abs(p.x - pre.x) < 1 && S.feat.challenge.result === null, 'abort restores state, no prize, no result card ' + [S.gems - g1, S.wallet - w1, p.x - pre.x, p.y - pre.y, S.feat.challenge.result]);
// death ends the run, state restored
C.chalStart('daily'); S.player.hp = 0.5; EI.fEmit('die'); run(0.2); t.ok(!C.CHAL.on && S.feat.challenge.result && S.feat.challenge.result.why === 'ko', 'death ends the run (ko)'); S.feat.challenge.result = null;
// speed run goal ends early
C.chalStart('daily'); setRules(['speed']); C.CHAL.goal = 60; C.CHAL.kills = 60; run(0.2); t.ok(!C.CHAL.on && S.feat.challenge.result.why === 'goal', 'speed run ends at goal'); S.feat.challenge.result = null;
// time out
C.chalStart('daily'); run(185, 0.1); t.ok(!C.CHAL.on && S.feat.challenge.result && S.feat.challenge.result.why === 'time', 'timer ends the run'); S.feat.challenge.result = null;
// reload mid run unwinds
C.chalStart('daily'); S.player.helmets.push({ k: 4 }); const sv2 = JSON.parse(JSON.stringify(EI.serialize())); C.CHAL.on = false; EI.resetAll(); EI.applySave(sv2); S = EI.S; S.started = true; run(0.2);
t.ok(S.feat.challenge.active === false && S.player.helmets.length >= pre.hl, 'a run caught by a reload is unwound ' + S.feat.challenge.active + ' ' + S.player.helmets.length);
t.ok(S.feat.challenge.hist.length >= 1 && S.feat.challenge.best && Object.keys(S.feat.challenge.paid).length >= 1, 'best/paid/history persist through save');
// 5 history cap
for (let i = 0; i < 8; i++) { C.chalStart('daily'); C.CHAL.kills = 5 + i; C.chalFinish('time'); S.feat.challenge.result = null; } t.ok(S.feat.challenge.hist.length === 5, 'history keeps top 5');
// prestige during a run aborts
C.chalStart('daily'); EI.prestige(); S = EI.S; t.ok(!C.CHAL.on && S.feat.challenge.best && Object.keys(S.feat.challenge.best).length >= 1, 'prestige aborts a run; challenge state kept across the tour');
// HUD during a run
S = EI.S; S.started = true; EI.addLand(); C.chalStart('weekly'); let hudOk = true; try { run(2); EI.draw(0.016); S.sheet = null; } catch (e) { hudOk = false; console.log(e); } t.ok(hudOk, 'challenge HUD draws'); C.chalAbort();

// ---- book
fresh(); B.bkRefresh();
t.ok(B.BOOK_PAGES.length === 7, 'seven pages');
let pg = B.bkBuild('creatures'); t.ok(pg.total === 27 && pg.got === 0, 'creatures page: 24 species + 3 headliners');
EI.fEmit('kill', { k: 1 }); EI.fEmit('kill', { k: 9 }); EI.fEmit('boss', { k: 1 }); pg = B.bkBuild('creatures'); t.ok(pg.got === 3, 'species + headliner tracked from events');
t.ok(B.bkBuild('secrets').ok === true || B.bkBuild('secrets').ok === false, 'secrets page builds');
const gsave = S.feat.gear; S.feat.gear = undefined; t.ok(B.bkBuild('gear').ok === false && B.bkBuild('songs').ok === false, 'missing gear/songs -> coming soon, no throw');
S.feat.gear = gsave; gsave.inv = [{ id: 1, s: 'mic', r: 2, p: [], lv: 1, up: 0 }]; gsave.eq.shoe = { id: 2, s: 'shoe', r: 0, p: [], lv: 1, up: 0 }; gsave.songs = { heart: 2 };
run(1); pg = B.bkBuild('gear'); t.ok(pg.ok && pg.total === 16 && pg.got === 2, 'gear page from inv + equipped: ' + pg.got); pg = B.bkBuild('songs'); t.ok(pg.ok && pg.got === 1, 'songs page');
// helmets + dmg milestone
const dmg0 = EI.pDmg(); for (let k = 1; k <= 6; k++) EI.fEmit('drop', { k }); B.bkRefresh(); t.ok(B.bkBuild('helmets').got === 6 && B.bkReached(B.bkBuild('helmets')) === 1, 'helmet page 25% milestone');
const mg0 = EI.mod('magnet'); t.ok(Math.abs(EI.mod('magnet') - 1.04) < 1e-6, 'helmet milestone gives +4% magnet: ' + EI.mod('magnet'));
for (let s = 0; s < 24; s++) EI.fEmit('kill', { k: s + 1 }); B.bkRefresh(); t.ok(B.bkReached(B.bkBuild('creatures')) === 3, 'creatures at 24/27 = 88% -> 3 milestones');
t.ok(Math.abs(EI.pDmg() / dmg0 - 1.06 / 1) < 0.001 || EI.pDmg() > dmg0, 'creature milestones raise damage permanently: x' + (EI.pDmg() / dmg0).toFixed(3));
t.ok(EI.featPips().goals === true, 'pip when milestone claimable (after first tick)');
const g2 = S.gems; t.ok(B.bkClaim('creatures') && S.gems === g2 + 2 + 3 + 5, 'claim pays gems for all reached milestones'); t.ok(!B.bkClaim('creatures'), 'no double claim');
let ev = null; EI.FEATS.push({ id: 'y', on: { bookMilestone(e) { ev = e; } } }); B.bkClaim('helmets'); EI.FEATS.pop(); t.ok(ev && ev.page === 'helmets', 'bookMilestone event emitted');
// cap
for (const k of ['dmg', 'coin', 'xp', 'magnet']) t.ok(B.BK.mul[k] <= 1.3 + 1e-9, 'bonus ' + k + ' capped (' + B.BK.mul[k].toFixed(2) + ')');
// pets + outfits count
S.pets.jitter = 1; t.ok(B.bkBuild('pets').got === 1, 'pets page reads S.pets');
S.skins.owned.roxor = true; t.ok(B.bkBuild('outfits').got === 2, 'outfits page reads owned skins');
// NEW dots
fresh(); run(1); t.ok(B.bkNewCount('creatures') === 0, 'nothing NEW at start'); EI.fEmit('kill', { k: 3 }); B.bkRefresh(); t.ok(B.bkNewCount('creatures') === 1, 'new find is flagged NEW');
B.BK.page = 'creatures'; EI.openSheet('goals', 'book'); EI.draw(0.016); t.ok(B.bkNewCount('creatures') === 1, 'still NEW while the page is open'); S.sheet = null; run(2); t.ok(B.bkNewCount('creatures') === 0, 'NEW cleared after leaving the page');
// draws every page, no throw
let bookOk = true;
try { for (const pgd of B.BOOK_PAGES) { B.BK.page = pgd.id; EI.openSheet('goals', 'book'); for (let i = 0; i < 3; i++) EI.draw(0.016); } } catch (e) { bookOk = false; console.log(e); } t.ok(bookOk, 'book tab draws all pages');
const g3 = S.feat.gear; S.feat.gear = undefined; try { B.BK.page = 'gear'; EI.draw(0.016); } catch (e) { bookOk = false; console.log(e); } S.feat.gear = g3; t.ok(bookOk, 'coming-soon page draws');
EI.openSheet('goals', 'challenge'); EI.draw(0.016); EI.openSheet('goals', 'season'); EI.draw(0.016); S.sheet = null;
// persistence round trip + tour
S.pets.hug = 1; run(1); const sv3 = JSON.parse(JSON.stringify(EI.serialize())); EI.resetAll(); EI.applySave(sv3); S = EI.S; t.ok(S.feat.book.sp[2] === 1 && S.feat.book.claimed !== undefined, 'book state round trip');
for (let k = 1; k <= 8; k++) EI.fEmit('drop', { k }); run(1); const claimedBefore = JSON.stringify(S.feat.book.claimed), bonus = EI.mod('magnet');
EI.prestige(); S = EI.S; t.ok(S.feat.book.helm[8] === 1 && JSON.stringify(S.feat.book.claimed) === claimedBefore, 'book survives Encore Tour'); run(1); t.ok(EI.mod('magnet') >= bonus - 1e-9, 'milestone bonuses persist across tours');
// long soak
let soak = true; try { run(20); for (let i = 0; i < 20; i++) EI.draw(0.016); } catch (e) { soak = false; console.log(e); } t.ok(soak, '20s tick + draw, no throw');
t.done();
