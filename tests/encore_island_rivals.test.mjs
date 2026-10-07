// Encore Island — rival bands, Acts + tour vows, ghost duels.
import { harness } from './no_room_for_heroes_lib.mjs';
import { loadEI } from './encore_island_lib.mjs';
const t = harness('encore_island_rivals');
const EI = loadEI();
const F = (id) => EI.FEATS.find(f => f.id === id);
t.ok(F('rivals') && F('acts') && F('ghosts'), 'features registered');
t.ok(F('rivals').keep === false && F('acts').keep === true && F('ghosts').keep === true, 'keep flags');
const R = F('rivals').api, A = F('acts').api, G = F('ghosts').api;
const start = () => { EI.initGame(false); EI.S.started = true; EI.S.feat.tutorial = { off: true, seen: {} }; EI.S.hold = false; while (EI.S.lands.length < 4) EI.addLand(); EI.S.player.maxHp = 1e9; EI.S.player.hp = 1e9; };
const run = (sec) => { for (let i = 0; i < sec * 20; i++) { EI.S.player.hp = EI.S.player.maxHp; EI.tick(0.05); } };
start();
let S = EI.S;
// ---- state defaults + invasion lifecycle
let st = S.feat.rivals;
t.ok(st.taken && st.cool && st.visit && st.battle === null && st.cd >= 480 && st.cd <= 720, 'rival defaults: first invasion in 8-12 min');
t.ok(!EI.S.feat.rivals.taken[1] && R.landTaken(1) === false, 'nothing taken yet');
S.player.x = EI.STAGE.x; S.player.y = EI.STAGE.y; S.enemies.length = 0;
st.cd = 5; run(8);
const taken = R.rvTakenList();
t.ok(taken.length === 1, 'invasion happens after countdown (taken=' + taken + ')');
const k = taken[0];
t.ok(R.landTaken(k) === true && st.taken[k].band >= 0, 'landTaken(k) true');
t.ok(k >= 1 && S.lands[k - 1], 'taken land exists');
// least recently visited: visit all but one
EI.S.feat.rivals.taken = {}; st = S.feat.rivals; st.visit = { 1: 100, 2: 90, 3: 80, 4: 5 };
S.t = 1000; for (const z of S.lands) z.born = 0;
t.ok(R.rvInvade() && st.taken[4], 'invades the least recently visited land (4)');
t.ok(st.cd >= 480 && st.cd <= 720, 'cooldown reset to 8-12 min');
// fallen towers
S.lands[3].towers.push({ type: 'archer', x: S.lands[3].g.x, y: S.lands[3].g.y, cd: 0, fire: 0 });
S.enemies.length = 0; EI.spawnEnemy(S.lands[3]); const buffed = S.enemies[0];
const hp0 = Math.ceil(EI.foeHp(4) * (buffed.arch === 'tank' ? 1.8 : buffed.arch === 'fast' ? 0.7 : buffed.arch === 'spitter' ? 0.85 : 1) * (buffed.gold ? 2 : 1));
t.ok(buffed.rvBuff && buffed.max >= Math.floor(hp0 * 1.39), 'foes in a taken land get +40% hp (' + buffed.max + ' vs ' + hp0 + ')');
EI.spawnEnemy(S.lands[0]); const normal = S.enemies[S.enemies.length - 1];
t.ok(!normal.rvBuff, 'other lands unaffected');
S.player.x = EI.STAGE.x; S.player.y = EI.STAGE.y; S.enemies.length = 0;
run(2); t.ok(S.lands[3].towers[0].cd > 0, 'towers in taken land are held back');
// challenge pauses
S.feat.challenge = { active: true }; t.ok(R.landTaken(4) === false, 'landTaken false while a Challenge run is active'); t.ok(!R.rvEligible(), 'not eligible during challenge'); S.feat.challenge.active = false;
// ---- stage battle: win
const pad = R.rvPadSpot(4);
t.ok(EI.landAt(pad.x, pad.y, S.lands.length) === 4 && EI.walkable(pad.x, pad.y, S.lands.length), 'pad is on land 4 and walkable');
S.player.x = pad.x; S.player.y = pad.y; S.enemies.length = 0; run(2);
t.ok(st.battle && st.battle.ents.length === 3, 'stepping on the pad starts the battle');
t.ok(S.enemies.filter(e => e.rival && e.boss).length === 3 && st.battle.t <= 90, 'three rival bosses');
t.ok(S.enemies.every(e => !e.rival || (e.rival.b >= 0 && e.k === 4)), 'rival fields set');
const A0 = S.feat.acts, g0 = S.gems, w0 = S.pallet;
for (const e of st.battle.ents.slice()) EI.hurtEnemy(e, e.hp + 1, false);
run(0.2);
t.ok(!st.battle && !st.taken[4], 'defeating all three frees the land');
t.ok(A0.rw === 1 && S.gems > g0 && S.pallet > w0 && A0.frags === 1 && Object.keys(A0.posters).length === 1, 'win rewards + poster + fragment');
t.ok(R.landTaken(4) === false, 'landTaken cleared');
// ---- battle: lose by timer, lose by death
R.rvInvade(3, 1); S.player.x = R.rvPadSpot(3).x; S.player.y = R.rvPadSpot(3).y; S.enemies.length = 0; st.cool = {}; run(2);
t.ok(st.battle, 'battle 2 started');
st.battle.t = 0.05; run(0.3);
t.ok(!st.battle && st.taken[3] && A0.rl === 1 && st.cool[3] > 0, 'timeout = loss, rival stays, short rest');
t.ok(S.enemies.every(e => !e.rival), 'rivals leave after a loss');
st.cool = {}; S.player.x = R.rvPadSpot(3).x; S.player.y = R.rvPadSpot(3).y; run(2); t.ok(st.battle, 'rechallenge works');
S.player.hp = -1; S.player.maxHp = 100; EI.S.player.invuln = 0; // die
EI.fEmit('die'); t.ok(!st.battle && A0.rl === 2, 'dying ends the battle as a loss');
// boss alive blocks battle
st.cool = {}; S.enemies.length = 0; EI.spawnEnemy(S.lands[1], { boss: true }); S.player.x = R.rvPadSpot(3).x; S.player.y = R.rvPadSpot(3).y; S.player.maxHp = 1e9; S.player.hp = 1e9; run(2);
t.ok(!st.battle, 'no stage battle while a normal boss is alive');
S.enemies.length = 0;
// ---- persistence
const saved = JSON.parse(JSON.stringify(EI.serialize()));
t.ok(saved.feat.rivals.taken[3] && saved.feat.acts && saved.feat.ghosts, 'feature state serialised');
EI.initGame(false); EI.applySave(saved); S = EI.S;
t.ok(S.feat.rivals.taken[3] && S.feat.rivals.battle === null && S.feat.acts.rl === 2, 'taken lands + counters survive load; battle resets');
// ---- acts
start(); S = EI.S; st = S.feat.acts;
t.ok(A.actNow() === 1 && st.act === 1, 'act 1 at start');
S.lands.length >= 1; EI.spawnEnemy(S.lands[0]); const e1 = S.enemies[S.enemies.length - 1];
S.prestiges = 2; run(0.2); t.ok(st.act === 3, 'act follows tours (' + st.act + ')');
t.ok(EI.BIOMES[0].name.startsWith('Remix '), 'biomes renamed for act 3: ' + EI.BIOMES[0].name);
S.enemies.length = 0; EI.spawnEnemy(S.lands[0]); const e3 = S.enemies[0]; const base = Math.ceil(EI.foeHp(1) * ({ tank: 1.8, fast: 0.7, spitter: 0.85, melee: 1 })[e3.arch] * (e3.gold ? 2 : 1));
t.ok(e3.max >= Math.floor(base * 1.24) && e3.actTint, 'act 3 foes +24% hp and tinted (' + e3.max + ' vs ' + base + ')');
S.prestiges = 0; run(0.1); t.ok(EI.BIOMES[0].name === 'Blossom Bay', 'names restore at act 1');
// ---- vows + crown bonus through a real tour
start(); S = EI.S; st = S.feat.acts; S.crowns = 0;
t.ok(A.acLock(['hard', 'blitz', 'bogus']) === 2 && st.vows.pending.length === 2, 'lock-in accepts known vows only');
while (S.lands.length < 8) EI.addLand();
const gain1 = EI.crownsToGain(); EI.prestige(); S = EI.S; st = S.feat.acts;
t.ok(S.crowns === gain1 && st.vows.active.join() === 'hard,blitz' && st.vows.pending.length === 0, 'first tour: vows become active, no bonus yet (' + S.crowns + ')');
t.ok(A.actNow() === 2, 'act 2 after first tour');
// hard mode applies
S.enemies.length = 0; EI.spawnEnemy(S.lands[0]); const eh = S.enemies[0], bh = Math.ceil(EI.foeHp(1) * ({ tank: 1.8, fast: 0.7, spitter: 0.85, melee: 1 })[eh.arch] * (eh.gold ? 2 : 1));
t.ok(eh.max >= Math.floor(bh * 1.12 * 1.5 * 0.99), 'hard vow + act scaling on spawn (' + eh.max + ' vs ' + bh + ')');
// fragile + no-pets
S.feat.acts.vows.active = ['fragile', 'nopets'];
const hpF = EI.S.player.maxHp; S.pets.bunny = 1; S.activePet = 'bunny'; run(0.1);
t.ok(S.activePet === null && st.petStash === 'bunny', 'no-pets vow stashes the pet');
S.feat.acts.vows.active = []; run(0.1); t.ok(S.activePet === 'bunny', 'pet restored when vow ends');
S.feat.acts.vows.active = ['hard', 'blitz'];
while (S.lands.length < 9) EI.addLand();
const gain2 = EI.crownsToGain(), c0 = S.crowns, expect = Math.max(1, Math.floor(gain2 * 0.65));
EI.prestige(); S = EI.S; st = S.feat.acts;
t.ok(S.crowns === c0 + gain2 + expect && st.lastBonus === expect, 'second tour pays vow bonus ' + expect + ' (crowns ' + S.crowns + ' from ' + c0 + '+' + gain2 + ')');
t.ok(st.vows.active.length === 0 && A.actNow() === 3, 'vows consumed, act 3');
t.ok(A.acBonus(10, ['hard']) === 3 && A.acBonus(1, ['hard']) === 1 && A.acBonus(5, []) === 0, 'bonus maths');
// vow mods
S.feat.acts.vows.active = []; run(0.1); const hpA = S.player.maxHp; S.feat.acts.vows.active = ['fragile']; S.player.maxHp = 1; run(0.1); const hpB = S.player.maxHp;
t.ok(hpA > 0 && Math.abs(hpB / hpA - 0.6) < 0.02, 'fragile cuts max hp by 40% (' + hpA + ' -> ' + hpB + ')');
S.feat.acts.vows.active = ['blitz']; const z = S.lands[0]; z.altar = { x: 0, y: -9999, cd: 40 }; run(5); t.ok(z.altar.cd < 40 - 5 * 1.5, 'blitz halves boss cooldown (' + z.altar.cd + ')');
// ---- ghost codes
start(); S = EI.S;
const snap = G.ghostSnapshot(); const code = G.ghostEncode(snap); const dec = G.ghostDecode(code);
t.ok(code.startsWith('EI1.') && code.length < 200, 'code is short: ' + code.length);
t.ok(dec && dec.n === snap.n && dec.l === snap.l && dec.k === snap.k && Math.abs(dec.d / snap.d - 1) < 1e-4 && Math.abs(dec.h / snap.h - 1) < 1e-4 && dec.s === snap.s, 'round trip');
const bad = [null, undefined, 5, {}, '', 'x', 'EI1.', 'EI1.abc.def', 'EI1.' + 'A'.repeat(700), code.slice(0, -1), code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'), code.replace('EI1.', 'EI2.'), 'EI1.' + 'e30.' + '000000', code + '\n junk', '<script>', 'EI1.%%%.123456'];
t.ok(bad.every(b => G.ghostDecode(b) === null), 'garbage rejected without throwing');
// forged but checksum-valid values are clamped / rejected
const forge = (arr) => { const json = JSON.stringify(arr); return 'EI1.' + Buffer.from(json).toString('base64url') + '.' + (() => { let h = 2166136261; for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('000000' + (h & 0xffffff).toString(16)).slice(-6); })(); };
const f1 = G.ghostDecode(forge([1, 'Hax<b>or', 99999999, 1e99, 1e99, -4, -1, 5000, 1e9, 1e99, 'nonsense', 99999, 5]));
t.ok(f1 && f1.l === 9999 && f1.d <= 1e24 && f1.h <= 1e18 && f1.r >= 0.1 && f1.c === 0 && f1.k === 99 && f1.s === 'jasmin' && f1.q <= 1 && !/[<>]/.test(f1.n), 'forged numbers capped');
t.ok(G.ghostDecode(forge([1, 'A', 'x', 1, 1, 1, 1, 1, 1, 1, 'jasmin', 1, 1])) === null && G.ghostDecode(forge([1, 'A', 1])) === null && G.ghostDecode(forge({ a: 1 })) === null, 'wrong shapes rejected');
t.ok(G.ghostImport('nope').ok === false, 'import rejects garbage');
const imp = G.ghostImport(code); t.ok(imp.ok && S.feat.ghosts.imports.length === 1, 'import works'); t.ok(G.ghostImport(code).dup, 'duplicate import detected');
t.ok(G.ghList().length === 6, 'list = 5 npcs + 1 imported');
// ---- duel determinism + outcomes
const me = G.ghostSnapshot(), r1 = G.ghSim(me, G.ghNpc(2)), r2 = G.ghSim(me, G.ghNpc(2));
t.ok(JSON.stringify(r1) === JSON.stringify(r2) && r1.ev.length > 5, 'duel is deterministic (' + r1.ev.length + ' events, ' + r1.dur.toFixed(1) + 's)');
t.ok(G.ghSim(me, G.ghNpc(0)).win === true && G.ghSim(me, G.ghNpc(4)).win === false, 'weak ghost loses, strong ghost wins');
t.ok(r1.ev.some(e => e.ty === 'crit' || e.ty === 'dodge' || e.ty === 'ult'), 'crits/dodges/ults appear');
// duel play-through + daily reward once
S.gems = 0; const gw = G.ghNpc(0); t.ok(G.ghStartDuel(gw) && S.hold === true, 'duel starts, world held');
for (let i = 0; i < 400; i++) G.ghDuelAdvance(0.05);
const d = G.ghDuel(); t.ok(d.over && d.res.win && d.reward.gems >= 1 && S.gems === d.reward.gems, 'win rewarded');
t.ok(S.feat.ghosts.defeated.npc0 === true && S.feat.ghosts.wins === 1, 'ghost marked defeated');
G.ghCloseDuel(); t.ok(G.ghDuel() === null && S.hold === false, 'duel closed, hold released');
const gems1 = S.gems; G.ghStartDuel(G.ghNpc(0)); G.ghFinish(); t.ok(S.gems === gems1 && G.ghDuel().reward.already, 'no second reward the same day'); G.ghCloseDuel();
G.ghStartDuel(G.ghNpc(4)); G.ghFinish(); t.ok(!G.ghDuel().res.win && G.ghDuel().reward.gems === 0, 'loss: no reward, no penalty'); G.ghCloseDuel();
// persistence of ghosts
const sv = JSON.parse(JSON.stringify(EI.serialize())); EI.initGame(false); EI.applySave(sv); S = EI.S;
t.ok(S.feat.ghosts.defeated.npc0 && S.feat.ghosts.imports.length === 1 && S.feat.ghosts.rewarded.npc0, 'ghost state persists');
// ghosts survive a tour; rivals reset
start(); S = EI.S; while (S.lands.length < 6) EI.addLand(); S.feat.ghosts.name = 'Echo'; S.feat.rivals.taken[2] = { band: 0, since: 0 }; S.feat.acts.rw = 3;
EI.prestige(); S = EI.S; t.ok(S.feat.ghosts.name === 'Echo' && S.feat.acts.rw === 3 && !S.feat.rivals.taken[2], 'tour keeps ghosts/acts, resets rival invasions');
// ---- draws: every tab, taken land, battle HUD, duel panel, no throw
start(); S = EI.S; S.lands.forEach(z => { z.towers.length = 0; });
let thrown = null;
try {
  R.rvInvade(2, 2); S.player.x = R.rvPadSpot(2).x; S.player.y = R.rvPadSpot(2).y; run(3); EI.draw(0.016);
  EI.openSheet('goals', 'rivals'); EI.draw(0.016); EI.openSheet('perks', 'tour'); EI.draw(0.016); EI.openSheet('more', 'ghosts'); EI.draw(0.016);
  EI.S.sheet = null; S.prestiges = 2; EI.draw(0.016); A.acLock(['hard']);
  G.ghStartDuel(G.ghNpc(2)); for (let i = 0; i < 30; i++) { G.ghDuelAdvance(0.1); EI.draw(0.016); } G.ghFinish(); EI.draw(0.016); G.ghCloseDuel();
  for (const ph of [0, 1, 2, 3, 4]) { EI.openSheet('perks', 'tour'); EI.draw(0.016); }
  run(20); EI.draw(0.016);
} catch (e) { thrown = e; }
t.ok(!thrown, 'ticking + drawing every tab never throws ' + (thrown && thrown.stack));
t.ok(EI.S.feat.rivals.battle === null || EI.S.feat.rivals.battle.ents.length === 3, 'battle state sane');
t.done();
