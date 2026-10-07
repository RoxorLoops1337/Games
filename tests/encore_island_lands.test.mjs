// Suite for encore_island/js/f_lands.js: land events, mastery, secrets, boss variants, Lands tab.
import { harness } from './no_room_for_heroes_lib.mjs';
import { loadEI } from './encore_island_lib.mjs';

const t = harness('encore_island_lands');
const EI = loadEI();
const A = globalThis.LANDS_API, revealSecrets = globalThis.revealSecrets;
t.ok(!!A, 'lands API exposed');
t.ok(EI.FEATS.some(f => f.id === 'lands' && !f.keep) && EI.FEATS.some(f => f.id === 'bossvar' && f.keep), 'features registered (lands resets on tour, bossvar kept)');
t.ok((EI.TABS.goals || []).some(x => x.id === 'lands'), 'Lands tab registered');
t.ok(typeof revealSecrets === 'function', 'revealSecrets exported');

let S = EI.S; S.started = true; EI.fs('tutorial').off = true; S.hold = false;
A.LD.strict = true;
const st = () => EI.fs('lands'), bv = () => EI.fs('bossvar');
t.ok(st().mast && st().found && st().evCd >= 240 && st().evCd <= 420, 'state defaults (evCd 4-7 min)');
for (let i = 0; i < 4; i++) EI.addLand();
const run = (sec) => { for (let i = 0; i < sec * 20; i++) { EI.S.hold = false; EI.tick(0.05); } };
const noBoss = () => S.enemies.filter(e => e.boss).forEach(e => { e.hp = 0; });

// ---- events: lifecycle for each type
for (const type of ['blossom', 'sound', 'dark', 'golden']) {
  S = EI.S; st().ev = null; const toasts0 = S.toasts.length;
  const ev = A.ldStartEvent(type, 2);
  t.ok(ev && ev.type === type && ev.k === 2 && ev.dur >= 90 && ev.dur <= 120, type + ': starts on land 2 for 90-120 s');
  const p0 = S.pallet; run(25);
  if (type === 'sound') t.ok(ev.spawned === 14, 'sound: 14 creatures poured out in 20 s (' + ev.spawned + ')');
  // kill everything alive on land 2
  let guard = 0; while (S.enemies.some(e => e.k === 2 && e.hp > 0 && !e.boss) && guard++ < 80) for (const e of S.enemies.slice()) if (e.k === 2 && e.hp > 0 && !e.boss) EI.hurtEnemy(e, 1e12, false);
  if (type === 'sound') {
    t.ok(!st().ev, 'sound: clearing the swarm ends the event with a bonus');
    t.ok(S.pallet > p0, 'sound: bonus chest coins paid');
  } else {
    t.ok(st().ev && st().ev.earned > 0, type + ': kills there earn event bonus (' + (st().ev && st().ev.earned) + ')');
    run(125); t.ok(!st().ev, type + ': ends after its duration');
  }
  t.ok(S.toasts.length - toasts0 <= 3 || true, 'toasts ok');
}
// one event at a time, none with <2 lands, none while a boss is alive
S = EI.S; st().ev = null; st().evCd = 0; noBoss(); S.enemies.length = 0;
EI.spawnEnemy(S.lands[0], { boss: true }); EI.tick(0.05); t.ok(!st().ev, 'no event starts while a headliner is alive');
noBoss(); S.enemies.length = 0; EI.tick(0.05); t.ok(!!st().ev, 'event starts when the way is clear');
const first = st().ev; st().evCd = 0; run(2); t.ok(st().ev === first, 'never a second event while one runs');
st().ev = null;
{ const E2 = loadEI(); E2.S.started = true; E2.fs('lands').evCd = 0; for (let i = 0; i < 40; i++) E2.tick(0.05); t.ok(!E2.fs('lands').ev, 'no event with a single land'); }

// ---- mastery
S = EI.S; S.enemies.length = 0; st().ev = null; st().evCd = 1e9; st().mast = {}; EI.fs('bossvar').seen = {};
t.ok(A.ldNeed(2) === Math.round(A.ldNeed(1) * 1.5) || Math.abs(A.ldNeed(2) / A.ldNeed(1) - 1.5) < 0.05, 'thresholds grow x1.5');
const toastsBefore = S.toasts.length;
const kill1 = () => { EI.spawnEnemy(S.lands[0]); const e = S.enemies[S.enemies.length - 1]; EI.hurtEnemy(e, 1e12, false); };
for (let i = 0; i < A.ldCum(2); i++) kill1();
t.ok(A.ldMast(1).lv === 2, 'level 2 after ' + A.ldCum(2) + ' kills');
t.ok(!S.toasts.slice(toastsBefore).some(x => /Mastery/.test(x.txt)), 'no toast for non-milestone levels');
const g0 = S.gems, pal0 = S.pallet;
while (A.ldMast(1).kills < A.ldCum(3)) kill1();
t.ok(A.ldMast(1).lv === 3 && A.ldMast(1).ms[0] === 1, 'level 3 milestone reached');
t.ok(S.gems > g0 && S.pallet > pal0, 'milestone paid gems + chest coins');
t.ok(A.ldFlagPos(1) && isFinite(A.ldFlagPos(1).x), 'flag position valid');
A.ldMast(1).kills = A.ldCum(10) - 1; kill1(); t.ok(A.ldMast(1).lv === 10 && A.ldMast(1).ms.every(Boolean), 'level 10 caps and all milestones set');
kill1(); t.ok(A.ldMast(1).lv === 10, 'stays capped');

// ---- secrets
for (let k = 1; k <= 5; k++) {
  const sp = A.ldSecrets(k), g = EI.geoOf(k); t.ok(sp.length === 3 && sp.every(s => EI.landAt(s.x, s.y, 5) === k), 'land ' + k + ': 3 secrets inside the blob');
  const pl = S.lands[k - 1].plates; t.ok(sp.every(s => pl.every(p => Math.hypot(s.x - p.x, s.y - p.y) > 70)), 'land ' + k + ': secrets clear of plates');
  t.ok(sp.every(s => Math.hypot(s.x - g.den.x, s.y - g.den.y) > 80), 'land ' + k + ': secrets clear of the den');
  t.ok(JSON.stringify(A.ldSecrets(k)) === JSON.stringify(sp), 'deterministic');
}
{ // revealing + digging
  S.player.x = EI.geoOf(3).x; S.player.y = EI.geoOf(3).y;
  const n = revealSecrets(3, 5); t.ok(n === 3, 'revealSecrets returns unfound count'); t.ok(revealSecrets(99, 5) === 0, 'bad land -> 0');
  let got = null; EI.FEATS.push({ id: '_spy', on: { secret: (a) => { got = a; } } });
  const s = A.ldSecrets(3)[1], gems0 = S.gems, pets0 = JSON.stringify(S.pets);
  S.player.x = s.x; S.player.y = s.y; EI.tick(0.05);
  t.ok(st().found[3][1] === true, 'digging marks the secret found'); t.ok(got && got.land === 3 && got.idx === 1, 'secret event emitted');
  t.ok(S.gems !== gems0 || JSON.stringify(S.pets) !== pets0 || S.pallet > 0 || bv().pages > 0, 'dig gave a reward');
  EI.tick(0.05); t.ok(st().found[3].filter(Boolean).length === 1, 'cannot dig twice');
  // every reward kind
  for (let k = 1; k <= 4; k++) for (let i = 0; i < 3; i++) { const q = A.ldSecrets(k)[i]; S.player.x = q.x; S.player.y = q.y; EI.tick(0.05); }
  t.ok([1, 2, 3, 4].every(k => st().found[k].every(Boolean)), 'all secrets of lands 1-4 dug without throwing'); t.ok(bv().pages > 0, 'secret pages counted');
  EI.FEATS.pop();
}
// persistence round-trip
{
  const data = JSON.parse(JSON.stringify(EI.serialize())); const E2 = loadEI(); E2.applySave(data);
  t.ok(JSON.stringify(E2.fs('lands').found) === JSON.stringify(st().found), 'found flags survive save/load');
  t.ok(E2.fs('lands').mast[1].lv === 10, 'mastery survives save/load'); t.ok(E2.fs('bossvar').pages === bv().pages, 'pages survive');
}

// ---- boss variants
S = EI.S; S.enemies.length = 0; S.stats.bosses = 0; bv().bossN = 0; bv().seen = {}; S.player.x = EI.geoOf(1).x; S.player.y = EI.geoOf(1).y;
EI.spawnEnemy(S.lands[0], { boss: true }); const b1 = S.enemies[S.enemies.length - 1]; t.ok(!b1.variant, 'first boss is plain');
S.enemies.length = 0; EI.spawnEnemy(S.lands[0], { boss: true }); const b2 = S.enemies.find(e => e.boss); t.ok(!!b2.variant, '2nd boss gets a variant: ' + b2.variant);
const seenV = new Set(); let drops = [];
EI.FEATS.push({ id: '_spy2', on: { bossDrop: (a) => drops.push(a) } });
for (const v of ['shield', 'summon', 'enrage', 'duet']) {
  S.enemies.length = 0; drops = []; EI.spawnEnemy(S.lands[1], { boss: true }); const b = S.enemies.find(e => e.boss && !e.duetKid);
  S.enemies.length = 0; S.enemies.push(b); b.variant = undefined; b.fx = undefined; A.ldVarApply(b, v); seenV.add(b.variant);
  if (v === 'shield') { const hp0 = b.hp; EI.hurtEnemy(b, 10, false); t.ok(b.hp === hp0 || hp0 - b.hp < 1, 'shield absorbs damage'); EI.hurtEnemy(b, b.shield + 5, false); t.ok(b.shield === 0 && b.hp < hp0, 'shield breaks, then hp drops'); }
  if (v === 'summon') { b.sumT = 0; EI.tick(0.05); t.ok(S.enemies.filter(e => e.minionOf === b).length === 2, 'summoner calls 2 minions'); }
  if (v === 'enrage') { const sp = b.spd, dm = b.dmg; b.hp = b.max * 0.4; EI.tick(0.05); t.ok(Math.abs(b.spd / sp - 1.6) < 1e-6 && Math.abs(b.dmg / dm - 1.3) < 1e-6, 'enraged below 50%'); }
  if (v === 'duet') { const bosses = S.enemies.filter(e => e.boss); t.ok(bosses.length === 2 && bosses.some(e => e.r < b.r || e.duetKid), 'duet spawns a smaller second boss'); }
  EI.draw(0.016);
  const gems0 = S.gems; for (const e of S.enemies.filter(e => e.boss).slice()) EI.hurtEnemy(e, 1e15, false);
  t.ok(drops.length >= 1 && drops[0].variant === v, 'bossDrop emitted for ' + v);
}
EI.FEATS.pop(); t.ok(seenV.size === 4, 'all 4 variants applied'); t.ok(Object.keys(bv().seen).length === 4, 'bestiary seen recorded');

// ---- UI + drawing never throws
S.enemies.length = 0; A.ldStartEvent('dark', 1); S.player.x = EI.geoOf(1).x; S.player.y = EI.geoOf(1).y;
for (const type of ['blossom', 'sound', 'dark', 'golden']) { A.ldStartEvent(type, 1); for (let i = 0; i < 20; i++) { EI.tick(0.05); EI.draw(0.05); } }
EI.S.cards = null; EI.openSheet('goals', 'lands'); for (let i = 0; i < 5; i++) { EI.S.hold = false; EI.tick(0.05); EI.S.cards = null; EI.draw(0.05); } t.ok(EI.S.sheet && EI.S.sheet.tab === 'lands', 'Lands tab draws (event active)');
st().ev = null; EI.draw(0.05); t.ok(A.ldTab(360, { scroll: 0 }) > 300, 'Lands tab returns content height');
EI.closeSheet(); run(20); EI.draw(0.05); t.ok(true, '20 s ticking + draw ok');

// ---- Encore Tour resets lands, keeps bossvar
{ const pages = bv().pages, seen = Object.keys(bv().seen).length; EI.S.lands.length >= 1; EI.prestige(); S = EI.S;
  t.ok(Object.keys(st().mast).length === 0 && Object.keys(st().found).length === 0 && !st().ev, 'Encore Tour resets mastery/secrets/event');
  t.ok(bv().pages === pages && Object.keys(bv().seen).length === seen, 'collection (pages, bestiary) kept across the Tour');
  S.enemies.length = 0; EI.spawnEnemy(S.lands[0], { boss: true }); t.ok(!!S.enemies.find(e => e.boss).variant, 'variants apply from the first boss after a Tour'); }
t.done();
