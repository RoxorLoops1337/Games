// Suite for Encore Island's BUILD feature (js/f_gear.js): gear, smelter recipes, songs.
import { harness } from './no_room_for_heroes_lib.mjs';
import { loadEI } from './encore_island_lib.mjs';

const t = harness('encore_island_gear');
const EI = loadEI();
const feat = EI.FEATS.find(f => f.id === 'gear');
t.ok(feat && feat.keep === true && feat.api, 'gear feature registered with keep:true');
const A = feat.api;
for (const id of ['gear', 'songs', 'recipes']) t.ok((EI.TABS.heroes || []).some(x => x.id === id), 'heroes tab ' + id);

EI.initGame && EI.initGame();
let S = EI.S;
S.started = true; while (S.lands.length < 3) EI.addLand();
const st = () => EI.S.feat.gear;
t.ok(st() && Array.isArray(st().inv) && st().eq && st().scrap === 0 && st().eqs.length === 3, 'state defaults');

// ---- deterministic rolls ----
const mk = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
const a1 = A.rollItem('mic', 2, 5, mk(7)), a2 = A.rollItem('mic', 2, 5, mk(7));
t.ok(JSON.stringify(a1) === JSON.stringify(a2), 'seeded roll is deterministic');
t.ok(a1.p.length >= 2 && a1.p.length <= 3, 'epic has 2-3 perks');
t.ok(A.rollItem(0, 3, 5, mk(3)).p.length === 3, 'legendary has 3 perks');
const forced = A.rollItem('charm', 1, 4, mk(9), 'vamp');
t.ok(forced.p.some(p => p[0] === 'vamp'), 'forced perk present');
const perkKeys = a1.p.map(p => p[0]); t.ok(new Set(perkKeys).size === perkKeys.length && !perkKeys.includes('dmg'), 'perks unique and not the main stat');
// rarity weights shift with land
const cnt = (L) => { const r = mk(11), c = [0, 0, 0, 0]; for (let i = 0; i < 4000; i++) c[A.rollRarity(L, r, 0, 1)]++; return c; };
t.ok(cnt(25)[3] > cnt(1)[3] && cnt(25)[0] < cnt(1)[0], 'later lands drop rarer gear');
t.ok(A.rollRarity(1, mk(1), 1, 1) >= 1, 'min rarity respected');

// ---- mods ----
const dmg0 = EI.pDmg(), coin0 = EI.coinMul(), cap0 = EI.cap();
const mic = A.rollItem('mic', 1, 3, mk(5)); A.giveItem(mic, undefined, undefined, true);
t.ok(st().inv.length === 1 && mic.id > 0, 'item in bag');
A.equip(mic.id); t.ok(st().eq.mic === mic && st().inv.length === 0, 'equipped');
t.ok(EI.pDmg() > dmg0 * 1.05, 'equipped mic raises pDmg');
const ch = A.rollItem('charm', 3, 10, mk(5), 'cap'); A.giveItem(ch, undefined, undefined, true); A.equip(ch.id);
t.ok(EI.coinMul() > coin0 && EI.cap() >= cap0 + 2, 'charm raises coins and carry slots');
const sm = A.sums(); t.ok(sm.coin > 0 && sm.cap >= 2, 'sums cached');
const before = EI.pDmg(); mic.up = 5; A.markDirty(); t.ok(EI.pDmg() > before, 'upgrade level raises main stat');
mic.up = 0; A.markDirty();

// ---- upgrade / salvage costs ----
const c1 = A.upCost(mic); mic.up = 4; const c5 = A.upCost(mic); mic.up = 0;
t.ok(c5.coins > c1.coins * 3 && c5.scrap > c1.scrap, 'upgrade costs grow steeply');
S.wallet = 0; st().scrap = 0; t.ok(A.upgrade(mic) === false && mic.up === 0, 'cannot upgrade when broke');
S.wallet = 1e9; st().scrap = 1e6; t.ok(A.upgrade(mic) && mic.up === 1, 'upgrade spends and levels');
for (let i = 0; i < 12; i++) A.upgrade(mic); t.ok(mic.up === 10, 'upgrade caps at +10');
const sh = A.rollItem('shoe', 2, 6, mk(2)); A.giveItem(sh, undefined, undefined, true);
const sc0 = st().scrap; const sv = A.salvage(sh.id); t.ok(sv > 0 && st().scrap === sc0 + sv && st().inv.length === 0, 'salvage gives scrap');

// ---- full bag auto-salvage ----
const cap = A.bagCap(); t.ok(cap >= 16, 'bag cap 16+');
for (let i = 0; i < cap + 4; i++) A.giveItem(A.rollItem(i % 4, 0, 1, mk(100 + i)), undefined, undefined, true);
t.ok(st().inv.length === cap, 'bag never exceeds cap');
const legend = A.rollItem('mic', 3, 9, mk(4)); const sc1 = st().scrap; A.giveItem(legend, undefined, undefined, true);
t.ok(st().inv.includes(legend) && st().scrap > sc1 && st().inv.length === cap, 'full bag auto-salvages the weakest, keeps the new legendary');
st().inv.length = 0;

// ---- drops via events ----
const n0 = st().found;
for (let i = 0; i < 400; i++) EI.fEmit('kill', { x: 0, y: 0, k: 1, boss: false });
t.ok(st().found > n0 && st().found - n0 < 40, 'creatures drop gear rarely (' + (st().found - n0) + '/400)');
const n1 = st().found; EI.fEmit('boss', { x: 0, y: 0, k: 1, boss: true });
const newest = st().inv.concat(Object.values(st().eq)).filter(Boolean).sort((a, b) => b.id - a.id)[0];
t.ok(st().found === n1 + 1 && newest.r >= 1, 'headliner guarantees Rare+');
const n2 = st().found; EI.fEmit('bossDrop', { variant: 'golden', k: 2, x: 0, y: 0 }); t.ok(st().found > n2, 'variant headliner drops extra');
const n3 = st().found; EI.fEmit('bossDrop', { variant: null, k: 2, x: 0, y: 0 }); t.ok(st().found === n3, 'plain bossDrop does not double up');
let chestHits = 0; for (let i = 0; i < 200; i++) { const f = st().found + st().cards; EI.fEmit('chest', { x: 0, y: 0 }); if (st().found + st().cards > f) chestHits++; } t.ok(chestHits > 20, 'chests sometimes drop gear or songs');
let secH = 0; for (let i = 0; i < 40; i++) { const f = st().found; EI.fEmit('secret', { x: 0, y: 0 }); if (st().found > f) secH++; } t.ok(secH > 15, 'secrets usually drop gear');

// ---- lifesteal ----
st().inv.length = 0; const vamp = A.rollItem('shoe', 1, 2, mk(1), 'vamp'); A.giveItem(vamp, undefined, undefined, true); A.equip(vamp.id);
S.player.hp = S.player.maxHp * 0.5; const h0 = S.player.hp; EI.fEmit('kill', { x: 0, y: 0, k: 1, boss: false }); t.ok(S.player.hp > h0, 'lifesteal heals on kill');

// ---- recipes ----
S.stats.kills = 0; S.stats.bosses = 0; S.stats.chests = 0; st().rec = {}; A.checkRecipes();
t.ok(!st().rec.metro, 'recipe locked at 0 kills'); S.stats.kills = 100; A.checkRecipes(); t.ok(st().rec.metro === 1, 'recipe unlocks at 100 kills');
S.wallet = 0; st().scrap = 0; st().beats = 0; t.ok(A.craft('metro', 0, 0) === null, 'craft refused when broke');
S.wallet = 1e12; st().scrap = 1e4; st().beats = 1e3; const cs = st().scrap, cb = st().beats;
const crafted = A.craft('metro', 0, 1); t.ok(crafted && crafted.r >= 2 && crafted.s === 'mic' && crafted.p.some(p => p[0] === 'groove'), 'craft gives chosen slot, min rarity and guaranteed perk');
t.ok(st().scrap < cs && st().beats < cb, 'craft spends scrap and beats');
t.ok(A.craft('fang', 0, 0) === null, 'locked recipe cannot be crafted');

// ---- songs ----
st().songs = {}; st().eqs = [null, null, null];
const gs = A.giveSong('heart'); t.ok(gs === 'heart' && st().songs.heart === 1 && st().eqs.includes('heart'), 'first song card is owned and auto-equipped');
A.giveSong('heart'); A.giveSong('heart'); t.ok(st().songs.heart === 3, 'duplicate cards level a song');
for (let i = 0; i < 6; i++) A.giveSong('heart'); t.ok(st().songs.heart === 5, 'song level caps at 5');
t.ok(A.songNeed(5) < A.songNeed(1), 'higher level charges faster');
A.giveSong('thunder'); A.giveSong('cash'); t.ok(st().eqs.every(Boolean), 'three songs equipped');
A.equipSong('cash', 0); t.ok(st().eqs[0] === 'cash' && st().eqs.filter(x => x === 'cash').length === 1, 'equipSong moves without duplicating');
st().eqs = ['heart', 'thunder', 'cash']; st().charge = 0; st().nx = 0;
// cast on the beat: S.t = 0 is exactly on a beat
S.t = 0; S.player.hp = 10; const need = A.songNeed(5);
for (let i = 0; i < need; i++) EI.fEmit('kill', { x: 0, y: 0, k: 1, boss: false });
t.ok(A.pending, 'song queued after N perfect kills');
const hpBefore = S.player.hp; EI.tick(0.016); t.ok(S.player.hp > hpBefore && !A.pending && st().charge === 0, 'Heart Beat healed and charge reset');
t.ok(st().nx === 1, 'next song in the cycle is slot 2');
// off-beat kills do not charge
S.t = 60 / S.bpm / 4; const c0 = st().charge; EI.fEmit('kill', { x: 0, y: 0, k: 1, boss: false }); t.ok(st().charge === c0, 'off-beat kill does not charge');
// every song casts without throwing and has its effect
S.t = 0;
const en = { k: 1, x: S.player.x + 50, y: S.player.y, hp: 1e9, max: 1e9, r: 15, hurt: 0, boss: false, spd: 40 }; S.enemies.push(en);
st().songs.thunder = 2; A.castSong(1); t.ok(en.hp < 1e9, 'Thunder Clap hurts nearby creatures');
for (const s of A.SONGS) { st().eqs[0] = s.id; st().songs[s.id] = st().songs[s.id] || 1; let ok = true; try { A.castSong(0); EI.tick(0.05); EI.draw(); } catch (e) { ok = false; console.log(e); } t.ok(ok, 'cast ' + s.id); }
S.enemies.length = 0;
S.hold = false; st().eqs[0] = 'rock'; A.castSong(0); S.player.invuln = 0; EI.tick(0.05); S.hold = false; t.ok(S.player.invuln > 0 && A.T.shield > 2.5, 'Rock Solid shields');
st().eqs[0] = 'lullaby'; const en2 = { k: 1, x: 0, y: 0, hp: 5, max: 5, r: 15, hurt: 0, boss: false, spd: 40 }; S.enemies.push(en2); A.castSong(0); t.ok(en2.slowT > 3, 'Lullaby slows creatures'); S.enemies.length = 0;
// daily buy
S.gems = 100; const cards = st().cards;
// ---- tabs draw, no throw ----
for (const tab of ['gear', 'songs', 'recipes']) {
  let ok = true; try { EI.openSheet('heroes', tab); A.select({ id: (st().inv[0] || {}).id }); for (let i = 0; i < 3; i++) EI.draw(); A.select({ eq: true, s: 'mic' }); EI.draw(); EI.closeSheet(); } catch (e) { ok = false; console.log(e); }
  t.ok(ok, 'tab ' + tab + ' draws');
}
S.hold = false;
{ let ok = true; try { for (let i = 0; i < 20 * 60; i++) EI.tick(1 / 60); EI.draw(); } catch (e) { ok = false; console.log(e); } t.ok(ok, 'ticks 20s with gear/songs, no throw'); }

// ---- save / load round trip ----
st().inv.length = 0; A.giveItem(A.rollItem('outfit', 3, 8, mk(21)), undefined, undefined, true); st().scrap = 777; st().beats = 33;
const snap = JSON.parse(JSON.stringify(EI.serialize()));
t.ok(snap.feat && snap.feat.gear && snap.feat.gear.scrap === 777, 'serialize includes gear state');
const eqJ = JSON.stringify(st().eq), songsJ = JSON.stringify(st().songs);
EI.initGame && EI.initGame(); EI.applySave(snap); S = EI.S;
t.ok(st().scrap === 777 && st().beats === 33 && JSON.stringify(st().eq) === eqJ && JSON.stringify(st().songs) === songsJ, 'state restored after applySave');
t.ok(EI.pDmg() > 0 && A.sums().dmg >= 0, 'mods work after load');
const dmgLoaded = EI.pDmg();

// ---- Encore Tour persistence ----
const invN = st().inv.length, eqj = JSON.stringify(st().eq), scrap = st().scrap, eqs = JSON.stringify(st().eqs);
EI.prestige();
t.ok(st().inv.length === invN && JSON.stringify(st().eq) === eqj && st().scrap === scrap && JSON.stringify(st().eqs) === eqs, 'gear, scrap and loadout survive the Encore Tour');
t.ok(EI.pDmg() > 0 && A.sums().hp >= 0, 'mods still apply after the tour');
{ let ok = true; try { for (let i = 0; i < 300; i++) EI.tick(1 / 30); EI.openSheet('heroes', 'gear'); EI.draw(); } catch (e) { ok = false; console.log(e); } t.ok(ok, 'no throw after tour'); }
t.done();
