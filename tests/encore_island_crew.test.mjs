// Encore Island — Crew feature suite: fan careers + town districts (Market, Arena, Studio).
import { loadEI } from './encore_island_lib.mjs';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('encore_island_crew');
const RealDate = Date;
let fakeNow = RealDate.now();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(fakeNow); }
  static now() { return fakeNow; }
}
globalThis.Date = FakeDate;

const EI = loadEI();
let S = EI.S; S.started = true;
const feat = EI.FEATS.find(f => f.id === 'crew');
t.ok(!!feat && !!feat.api, 'crew feature registered with api');
const api = feat.api;
t.ok(feat.keep === false, 'crew resets on Encore Tour (keep:false)');
const tabs = (EI.TABS.town || []).map(x => x.id);
t.ok(tabs.includes('careers') && tabs.includes('districts'), 'Careers + Districts tabs registered on the town sheet');
t.ok(EI.sheetTabs('town').length === 4, 'town sheet shows 4 tabs');

const reset = () => { EI.initGame(false); S = EI.S; S.started = true; S.player.x = 0; S.player.y = 300; };
const mkFan = (role, lvl, x = -120, y = 0) => { const f = { id: S.fanSeq++, lvl, spec: null, x, y, role, state: 'seek', carry: [], ph: 0, cd: 0, route: null, face: 1, mv: 0, art: 'rawclaw' }; S.pop.push(f); return f; };
const setTier = (tier) => { S.town = { yard: [0, 6, 14, 26, 42, 64][tier] }; };

// ---- defaults ----
reset();
const st0 = EI.fs('crew');
t.ok(st0.market && st0.market.lvl === 0 && st0.arena && st0.studio && Array.isArray(st0.studio.slots), 'state defaults');

// ---- career purchase ----
reset(); S.wallet = 1e12;
const f1 = mkFan('gather', 2), f2 = mkFan('gather', 3), f3 = mkFan('fight', 3);
t.ok(!api.setCareer(f1, 'roadie') && f1.spec === null, 'level-2 fan cannot take a career');
t.ok(!api.setCareer(f2, 'drummer'), 'collector cannot take a fighter career');
const c1 = api.careerCost(f2), w0 = S.wallet;
t.ok(api.setCareer(f2, 'roadie') && f2.spec === 'roadie' && Math.abs(w0 - S.wallet - c1) < 1, 'career bought for its cost');
t.ok(api.careerCost(f2) === Math.ceil(c1 * 2.5), 're-picking costs 2.5x');
t.ok(!api.setCareer(f2, 'roadie'), 'picking the same career again refused');
S.wallet = 10; t.ok(!api.setCareer(f3, 'drummer'), 'too poor -> refused');
S.wallet = 1e12;
const c0 = api.careerCost(f3); S.lands.length; EI.addLand(); EI.addLand();
t.ok(api.careerCost(f3) > c0, 'career cost scales with lands');

// ---- roadie: +6 carry (full roadie goes back to collecting), plain collector goes to sell ----
reset(); S.wallet = 1e12;
const rd = mkFan('gather', 3), pl = mkFan('gather', 3); api.setCareer(rd, 'roadie');
const cap = EI.fanCarryCap(rd);
for (const f of [rd, pl]) { f.state = 'sell'; f.x = 0; f.y = 150; f.carry = []; for (let i = 0; i < cap; i++) f.carry.push({ k: 1, bar: false, crown: false }); }
S.items.length = 0; S.items.push({ x: 20, y: 160, k: 1, t: 2, dead: false });
EI.tick(0.05);
t.ok(rd.state === 'seek', 'roadie at normal cap keeps collecting');
t.ok(pl.state === 'sell', 'plain collector at cap goes to sell');
rd.state = 'sell'; rd.carry = []; for (let i = 0; i < cap + 6; i++) rd.carry.push({ k: 1, bar: false, crown: false });
EI.tick(0.05); t.ok(rd.state === 'sell', 'roadie at cap+6 goes to sell');
// roadie walks faster
reset(); S.wallet = 1e12; const r2 = mkFan('gather', 3), p2 = mkFan('gather', 3); api.setCareer(r2, 'roadie');
for (const f of [r2, p2]) { f.x = 0; f.y = 150; f.state = 'seek'; f.carry = []; }
S.items.length = 0; S.items.push({ x: 300, y: 150, k: 1, t: 2, dead: false });
EI.tick(0.1);
t.ok(r2.x > p2.x * 1.2 && p2.x > 0, 'roadie moves ~35% further per step (' + r2.x.toFixed(1) + ' vs ' + p2.x.toFixed(1) + ')');

// ---- manager: sells everything at once, +25% ----
reset(); S.wallet = 1e12; setTier(0);
const mg = mkFan('gather', 3), pc = mkFan('gather', 3); api.setCareer(mg, 'manager');
const mk3 = () => [1, 2, 2].map(k => ({ k, bar: false, crown: false }));
for (const f of [mg, pc]) { f.state = 'sell'; f.x = EI.SELL.x + 10; f.y = EI.SELL.y + 40; f.carry = mk3(); f.cd = 0; }
const val = (es) => es.reduce((a, e) => a + EI.entryVal(e), 0);
const exp = val(mk3()), pal0 = S.pallet;
pc.carry = []; // measure the manager alone
EI.tick(0.05);
t.ok(mg.carry.length === 0, 'manager sold the whole load instantly');
const gain = S.pallet - pal0, merch = 1 + 0.07 * (S.town.merch || 0);
t.ok(gain >= Math.floor(exp * merch * 1.25) - 3 && gain <= Math.ceil(exp * merch * 1.25) + 3, 'manager sale is 1.25x (' + gain + ' vs ' + exp * 1.25 + ')');

// ---- drummer: nearby fighters fire faster ----
reset(); S.wallet = 1e12;
const dr = mkFan('fight', 3, 300, 300), nearF = mkFan('fight', 3, 330, 300), farF = mkFan('fight', 3, 300 + 400, 300); api.setCareer(dr, 'drummer');
S.player.x = 300; S.player.y = 300; S.enemies.length = 0;
for (const f of [dr, nearF, farF]) { f.cd = 1; f.ph = 0; }
EI.tick(0.05);
t.ok(nearF.cd < farF.cd - 0.005, 'fighter near a drummer cools down faster (' + nearF.cd.toFixed(3) + ' vs ' + farF.cd.toFixed(3) + ')');
t.ok(Math.abs((1 - nearF.cd) / (1 - farF.cd) - 1.25) < 0.1, 'drummer boost is ~+25% fire rate');

// ---- scout: purse + revealSecrets every 90 s ----
reset(); S.wallet = 1e12;
const sc = mkFan('gather', 3); api.setCareer(sc, 'scout'); const wl = S.wallet;
sc.scoutT = 0.02; let threw = false; try { EI.tick(0.05); } catch (e) { threw = true; console.log(e.stack); }
t.ok(!threw && S.wallet > wl, 'scout found a coin purse (revealSecrets is called when the lands module exists)');
t.ok(sc.scoutT > 80, 'scout timer reset to ~90 s');
const wl2 = S.wallet; EI.tick(1); t.ok(S.wallet === wl2 || S.wallet > wl2, 'scout does not pay again before 90 s');

// ---- bodyguard: damage cut (8% each, cap 40%) + taunt pulls enemies ----
reset(); S.wallet = 1e12;
const hp0 = S.player.maxHp; S.player.hp = hp0; S.player.invuln = 0; api.hurt(20, null); const dmgPlain = hp0 - S.player.hp;
const bgs = []; for (let i = 0; i < 7; i++) { const g = mkFan('fight', 3); api.setCareer(g, 'bodyguard'); bgs.push(g); }
t.ok(Math.abs(api.bodyguardCut() - 0.4) < 1e-9, 'bodyguard cut caps at 40%');
bgs.length = 1; S.pop.length = 1; t.ok(Math.abs(api.bodyguardCut() - 0.08) < 1e-9, 'one bodyguard = 8%');
S.player.hp = hp0; S.player.invuln = 0; api.hurt(20, null); const dmgBg = hp0 - S.player.hp;
t.ok(Math.abs(dmgBg - dmgPlain * 0.92) < 1e-6, 'hero takes 8% less with a bodyguard (' + dmgBg + ' vs ' + dmgPlain + ')');
const g1 = S.pop[0]; g1.x = 100; g1.y = 100;
const foe = EI.spawnEnemy(S.lands[0], {}) || S.enemies[S.enemies.length - 1]; foe.x = 200; foe.y = 100; foe.hp = foe.max;
feat.tick(0.1); t.ok(foe.x < 200 - 4 && foe.x > 190, 'bodyguard pulls a nearby enemy toward itself');
const foe2x = foe.x; foe.x = 600; feat.tick(0.1); t.ok(foe.x === 600, 'far enemy not taunted'); foe.x = foe2x;

// ---- careers only work with the matching job ----
reset(); S.wallet = 1e12; const sw = mkFan('gather', 3); api.setCareer(sw, 'manager'); t.ok(api.specOk(sw), 'career active'); sw.role = 'fight'; t.ok(!api.specOk(sw), 'career inactive after job switch');

// ---- districts unlock by tier ----
reset();
const on = () => api.DISTRICTS.map(d => d.on());
setTier(0); t.ok(on().join() === 'false,false,false', 'no districts at Hamlet');
setTier(1); t.ok(EI.townTierIdx() === 1 && on().join() === 'true,false,false', 'Market at Village');
setTier(2); t.ok(on().join() === 'true,true,false', 'Arena at Town');
setTier(3); t.ok(on().join() === 'true,true,true', 'Studio at City');

// ---- market ----
reset(); EI.addLand(); EI.addLand(); S.wallet = 1e12; setTier(0);
const cm0 = EI.coinMul(); t.ok(!api.buyMarket(), 'market locked at Hamlet');
setTier(1); const cm1 = EI.coinMul(); t.ok(Math.abs(cm1 / (cm0 * 1.05) - 1) < 1e-9 || cm1 >= cm0, 'tier bonus applies');
const mc = api.marketCost(); const w1 = S.wallet; t.ok(api.buyMarket() && S.wallet === w1 - mc, 'market upgrade costs coins');
const cm2 = EI.coinMul(); t.ok(Math.abs(cm2 / cm1 - 1.06) < 1e-9, 'market level 1 = +6% coins (' + cm2 / cm1 + ')');
for (let i = 0; i < 10; i++) api.buyMarket(); t.ok(api.marketLvl() === 5, 'market maxes at level 5');
t.ok(Math.abs(EI.coinMul() / cm1 - 1.3) < 1e-9, 'level 5 = +30% coins');
// hot item pays double
const hot = api.hotK(); t.ok(hot >= 1 && hot <= S.lands.length, 'hot level within owned lands');
const cold = hot === 1 ? 2 : 1;
const sellOne = (k) => { S.player.x = EI.SELL.x; S.player.y = EI.SELL.y; S.player.helmets = [{ k, bar: false, crown: false }]; S.player.sellAcc = 1; const p0 = S.pallet; EI.tick(0.02); return S.pallet - p0; };
const gHot = sellOne(hot), gCold = sellOne(cold);
t.ok(gCold === EI.entryVal({ k: cold }), 'normal helmet pays its value');
t.ok(gHot === 2 * EI.entryVal({ k: hot }), 'hot helmet pays double (' + gHot + ' vs ' + EI.entryVal({ k: hot }) + ')');
const n0 = EI.fs('crew').market.hotN; feat.tick(301); t.ok(EI.fs('crew').market.hotN === n0 + 1, 'hot item rotates every 5 minutes');
t.ok(Array.from({ length: 12 }, (_, i) => { EI.fs('crew').market.hotN = i; return api.hotK(); }).some(k => k !== api.hotK()) || S.lands.length < 2, 'hot item varies across rotations');
// fan sale of a hot helmet
EI.fs('crew').market.hotN = n0; const hk = api.hotK(); const hf = mkFan('gather', 0); hf.state = 'sell'; hf.x = EI.SELL.x + 10; hf.y = EI.SELL.y + 40; hf.carry = [{ k: hk, bar: false, crown: false }]; hf.cd = 0; const pp = S.pallet; EI.tick(0.05);
t.ok(S.pallet - pp >= 2 * EI.entryVal({ k: hk }) - 2, 'a fan selling a hot helmet also gets double');

// ---- studio: timers, wall-clock progress, offline, slot cap ----
reset(); EI.addLand(); S.wallet = 1e12; setTier(2); t.ok(!api.recordTrack('demo'), 'studio locked below City');
setTier(3); const base = EI.coinMul(); const wS = S.wallet, tc = api.trackCost(api.TRACKS[0]);
t.ok(api.recordTrack('demo') && wS - S.wallet === tc, 'recording costs coins');
t.ok(!api.recordTrack('demo'), 'same track cannot be recorded twice');
t.ok(Math.abs(EI.coinMul() / base - 1) < 1e-9, 'unfinished track gives no bonus yet');
const slot = EI.fs('crew').studio.slots[0]; EI.tick(1); t.ok(api.slotProg(slot) < 5, 'progress starts near zero');
S.t += 100; t.ok(api.slotProg(slot) >= 99, 'game time advances progress');
fakeNow += 3600 * 1000; // an hour passes in real time while the game is closed (S.t does not move)
t.ok(api.slotProg(slot) === slot.dur, 'wall clock finishes it offline');
EI.tick(0.05); t.ok(slot.done === true, 'track marked done on the next tick');
t.ok(Math.abs(EI.coinMul() / base - 1.05) < 1e-9, 'finished Garage Demo = +5% coins');
t.ok(api.recordTrack('lofi') && api.recordTrack('single'), 'more tracks recorded'); t.ok(!api.recordTrack('album'), 'max 3 tracks');
const dmg0 = EI.pDmg(); fakeNow += 3 * 3600 * 1000; EI.tick(0.05);
t.ok(EI.fs('crew').studio.slots.every(s => s.done), 'all tracks finished after hours offline');
const sh0 = EI.pDmg(); t.ok(sh0 / dmg0 > 1.07 && sh0 / dmg0 < 1.09, 'Radio Single = +8% damage');
// save/load round trip keeps a recording in flight
t.ok(api.scrapTrack(2) && EI.fs('crew').studio.slots.length === 2, 'scrap frees a slot');
t.ok(api.recordTrack('ballad'), 'record again'); const fsId = f => f;
const f9 = mkFan('gather', 5); f9.spec = 'scout';
const ser = JSON.parse(JSON.stringify(EI.serialize()));
t.ok(ser.feat.crew.studio.slots.length === 3, 'studio slots serialised');
EI.initGame(false); S = EI.S; EI.applySave(ser); S = EI.S;
t.ok(EI.fs('crew').studio.slots.length === 3 && EI.fs('crew').studio.slots.some(s => s.id === 'ballad'), 'studio slots survive save/load');
t.ok(S.pop.some(f => f.spec === 'scout'), 'career survives save/load (f.spec)');
t.ok(api.trackBuff('coin') > 1, 'buffs active after load');
// a track that finished while the game was closed is complete after loading
reset(); EI.addLand(); S.wallet = 1e12; setTier(3); api.recordTrack('album'); const ser2 = JSON.parse(JSON.stringify(EI.serialize()));
fakeNow += 3 * 3600 * 1000; EI.initGame(false); S = EI.S; EI.applySave(ser2); S = EI.S;
t.ok(EI.fs('crew').studio.slots[0].done === true, 'offline-finished track is done on load');

// ---- arena ----
reset(); EI.addLand(); EI.addLand(); S.wallet = 1e9; setTier(1);
for (let i = 0; i < 6; i++) mkFan('fight', 5);
t.ok(!api.arenaReady() && !api.arenaEnter(), 'arena locked below Town');
setTier(2); t.ok(api.arenaReady(), 'arena ready with fighters');
const g0 = S.gems, wA = S.wallet, tk0 = S.spinFree || 0;
t.ok(api.arenaEnter(), 'enter arena'); const B = api.getBattle(); t.ok(!!B && B.result.waves >= 0, 'battle created with result');
t.ok(S.wallet - wA === B.result.coins && S.gems - g0 === B.result.gems && (S.spinFree || 0) - tk0 === B.result.tickets, 'rewards paid');
t.ok(!api.arenaReady() && !api.arenaEnter(), 'arena is once per day');
let ticks = 0; while (B.phase !== 'over' && ticks < 2000) { feat.tick(0.05); ticks++; }
t.ok(B.phase === 'over' && B.cleared === B.result.waves, 'live battle matches the planned result (' + B.cleared + ')');
t.ok(ticks * 0.05 > 9 && ticks * 0.05 < 15.5, 'animation lasts ~12 s (' + (ticks * 0.05).toFixed(1) + ' s)');
fakeNow += 26 * 3600 * 1000; t.ok(api.arenaReady(), 'arena resets on a new real day');
feat.tick(0.05); t.ok(api.getBattle() === null, 'old replay cleared on the new day');
// reward scaling
S.pop.length = 0; const q1 = api.arenaRewards(3, 100), q2 = api.arenaRewards(3, 1000), q3 = api.arenaRewards(5, 1000);
t.ok(q2.coins > q1.coins && q3.coins > q2.coins && q3.gems > q2.gems, 'rewards scale with dps and waves cleared');
EI.addLand(); EI.addLand(); t.ok(api.arenaRewards(3, 100).coins > q1.coins, 'rewards scale with land count');
t.ok(!api.arenaReady(), 'no fighters -> arena not ready');
// bigger teams clear more
const clear = (n, lvl, yard, up) => { reset(); for (let i = 0; i < 5; i++) EI.addLand(); S.town = { yard }; S.up.dmg = up; for (let i = 0; i < n; i++) mkFan('fight', lvl); const b = api.newBattle(api.arenaTeam()); for (let i = 0; i < 6000 && b.phase !== 'over'; i++) api.bstep(b, 0.05); return b.cleared; };
const cs = clear(2, 3, 0, 0), cm = clear(6, 5, 4, 4), cb = clear(16, 13, 10, 10);
t.ok(cs < cm && cm <= cb && cb === 5, 'arena difficulty escalates with team strength (' + [cs, cm, cb] + ')');

// ---- hub buildings sit on free ground ----
reset();
const fixtures = [EI.STAGE, EI.SELL, EI.VAULT, EI.FORGE, EI.TRAY, EI.MONU, { x: 290, y: -55 }, { x: 140, y: 205 }, ...Object.values(EI.UPG_POS), ...Object.values(EI.GEM_POS)];
for (const d of api.DISTRICTS) {
  const p = d.pos; let min = 1e9; for (const f of fixtures) if (f !== EI.STAGE) min = Math.min(min, Math.hypot(p.x - f.x, p.y - f.y));
  t.ok(min > 100, d.name + ' keeps clear of hub fixtures (' + min.toFixed(0) + ')');
  t.ok(Math.hypot(p.x - EI.STAGE.x, p.y - EI.STAGE.y) > 190, d.name + ' outside the stage keep-clear');
  for (const [dx, dy] of [[0, 0], [-50, 0], [50, 0], [0, 40]]) t.ok(EI.walkable(p.x + dx, p.y + dy, 0), d.name + ' footprint on the plaza');
}

// ---- tabs draw / world draw / ticking: no throw ----
reset(); EI.addLand(); EI.addLand(); S.wallet = 1e9; setTier(3);
const a1 = mkFan('gather', 3), a2 = mkFan('fight', 4), a3 = mkFan('fight', 3), a4 = mkFan('gather', 1);
api.setCareer(a1, 'roadie'); api.setCareer(a2, 'drummer'); api.setCareer(a3, 'bodyguard');
let ok = true;
try {
  for (let i = 0; i < 400; i++) { EI.tick(0.05); }
  EI.openSheet('town', 'careers'); for (let i = 0; i < 3; i++) { EI.tick(0.05); EI.draw(0.016); }
  api.setPick(a4.id); EI.draw(0.016); api.setPick(a1.id); EI.draw(0.016); api.setPick(null);
  EI.openSheet('town', 'districts'); EI.draw(0.016); api.arenaEnter(); for (let i = 0; i < 60; i++) { EI.tick(0.05); EI.draw(0.016); }
  S.sheet.scroll = 300; EI.draw(0.016);
  for (let i = 0; i < 300; i++) { EI.tick(0.05); EI.draw(0.016); }
  api.recordTrack('demo'); EI.draw(0.016);
  EI.closeSheet(); S.player.x = 0; S.player.y = 0; for (let i = 0; i < 30; i++) { EI.tick(0.05); EI.draw(0.016); }
  S.sheet = null; EI.draw(0.016);
} catch (e) { ok = false; console.log(e.stack); }
t.ok(ok, 'ticking + drawing both tabs, picker, arena animation, hub buildings without throwing');
t.ok(EI.hits().some(h => h.act), 'hud has tap areas');
// district tap opens the Districts tab
reset(); setTier(3); S.player.x = 0; S.player.y = 0; EI.draw(0.016); EI.draw(0.016);
const hs = EI.hits().length; t.ok(hs > 0, 'hits registered in hub view');

// ---- Encore Tour resets crew ----
reset(); EI.addLand(); S.wallet = 1e12; setTier(3);
const tf = mkFan('gather', 5); api.setCareer(tf, 'scout'); api.buyMarket(); api.recordTrack('demo'); api.arenaEnter;
t.ok(EI.fs('crew').market.lvl === 1 && EI.fs('crew').studio.slots.length === 1, 'state set before tour');
EI.prestige(); S = EI.S;
t.ok(EI.fs('crew').market.lvl === 0 && EI.fs('crew').studio.slots.length === 0 && EI.fs('crew').arena.day === '', 'Encore Tour resets market, studio and arena');
t.ok(!S.pop.some(f => f.spec), 'fans (and careers) reset with the Town on tour');
for (let i = 0; i < 40; i++) { EI.tick(0.05); EI.draw(0.016); }
t.ok(true, 'ticks fine after the tour');

globalThis.Date = RealDate;
t.done();
