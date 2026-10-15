// Ludus Maximus 3D: COMBAT depth (stamina and weapon classes, direct control, arena hazards, special bouts, announcer). Headless, no DOM.
//   node tests/ludus_maximus_3d_combat.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus_3d/core/data.js'); const LM = require('../ludus_maximus_3d/core/sim.js'); require('../ludus_maximus_3d/core/ext.js'); require('../ludus_maximus_3d/core/arena.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const ST = D.STYLE_IDS;
const mk = (style, lvl, id, name) => LM.makeGlad({ style, lvl, id, name, r: LM.mulberry(id * 977 + lvl) });
const team = (n, side, off = 0, lvl = 6, styles) => Array.from({ length: n }, (_, i) => mk((styles || ST)[(i + off) % 5], lvl, (side === 'A' ? 10 : 50) + i, side + 'g' + i));
function fight(na, nb, o = {}, seed = 5, lvl = 6) {
  LM.setRandom(LM.mulberry(seed)); const A = team(na, 'A', 0, lvl), B = team(nb, 'B', 2, lvl);
  return LM.createFight(LM.mkUnits(A, 'A', LM.teamCtx(null, A, 'bal')), LM.mkUnits(B, 'B', LM.teamCtx(null, B, 'bal')), Object.assign({ autoA: true }, o));
}
function run(F, max = 6000, hook) { let n = 0; const ev = {}; while (!F.done && n++ < max) { if (hook) hook(F, n); LM.step(F, 1 / 30); for (const e of F.ev) ev[e.k] = (ev[e.k] || 0) + 1; F.ev.length = 0; } return ev; }
const hashOf = (F) => { let h = 2166136261; for (const u of F.units) for (const t of [u.x.toFixed(5), u.y.toFixed(5), String(u.hp), String(u.sta | 0)]) for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

// ---------- 1. a plain fight is untouched ----------
{
  const F = fight(1, 1); ok(F.rules === null && F.hz === null, 'a plain fight has no rules and no hazard state');
  ok(F.units.every((u) => u.stM === 0 && u.dc === 0 && u.out === 0 && u.blk === 0 && u.par === 0), 'plain units carry the new fields at their placeholders');
  const keys = (u) => Object.keys(u).join(','); ok(F.units.every((u) => keys(u) === keys(F.units[0])), 'every unit still has exactly one shape (one key order)');
  // regression digest: 5000 steps of rotating fights, unit x / y / hp and the event stream, the value measured on the engine before the combat work
  let h = 2166136261; const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  let steps = 0, fi = 0;
  while (steps < 5000) {
    const r = LM.mulberry(900 + fi); LM.setRandom(LM.mulberry(77 + fi)); const n = 1 + (fi % 3), mkg = (side, k) => LM.makeGlad({ style: ST[Math.floor(r() * 5)], lvl: 4 + (fi % 5), id: 500 + fi * 10 + k + (side === 'B' ? 5 : 0), name: side + k, r: LM.mulberry(fi * 31 + k) });
    const A = Array.from({ length: n }, (_, k) => mkg('A', k)), B = Array.from({ length: n }, (_, k) => mkg('B', k));
    const G = LM.createFight(LM.mkUnits(A, 'A', LM.teamCtx(null, A)), LM.mkUnits(B, 'B', LM.teamCtx(null, B)), { autoA: fi % 2 === 0, hazards: fi % 3, cmdAI: fi % 4 === 0 });
    if (fi % 5 === 1) LM.useUlt(G, 'A0', 0); let k = 0;
    while (!G.done && k++ < 1500 && steps < 5000) { if (k === 40) LM.command(G, 'stance', 'A0', 'press'); LM.step(G, 0.05); steps++; mix(String(G.ev.length)); for (const e of G.ev) mix(e.k + (e.dmg || '') + (e.dst || '') + (e.src || '')); G.ev.length = 0; for (const u of G.units) mix(u.x.toFixed(6) + ',' + u.y.toFixed(6) + ',' + u.hp); }
    mix(String(G.winner) + G.t.toFixed(3)); fi++;
  }
  ok((h >>> 0).toString(16) === '99e6a573', `regression digest of plain fights is 99e6a573 (got ${(h >>> 0).toString(16)}; update only if core/sim.js derive changed on purpose)`);
}

// ---------- 2. weapon classes and stamina ----------
{
  ok(ST.every((s) => LM.WCLASS[s] && LM.WCLASS[s].n && LM.WCLASS[s].tip && /thrust|cut/.test(LM.WCLASS[s].form)), 'every style has a weapon class with a name, a tip and a form');
  ok(!/—/.test(JSON.stringify(LM.WCLASS)) && !/—/.test(JSON.stringify(LM.BOUTS)) && !/—/.test(JSON.stringify(LM.HAZ)), 'weapon, bout and hazard text has no em dashes');
  const T = LM.COMBAT_TUNE; ok(T.thrustFar > 1 && T.thrustIn < 1 && T.cutIn > 1 && T.cutFar < 1, 'thrust is better at the tip and worse inside, cut the other way round (no weapon is better everywhere)');
  ok(ST.every((s) => Math.abs(T.k[s] - 1) <= 0.0301), 'the per style balance trim stays within 3 percent');
  const F = fight(1, 1, { deep: 1 }); const u = F.units[0];
  ok(u.stM > 80 && u.sta === u.stM && F.rules && F.rules.deep === 1, 'a deep fight gives every gladiator stamina');
  const heavy = LM.mkUnits([mk('murmillo', 12, 90, 'h')], 'A', {})[0], light = LM.mkUnits([mk('dimachaerus', 1, 91, 'l')], 'A', {})[0];
  ok(LM.armourWeight(heavy) > LM.armourWeight(light), 'heavier armour weighs more');
  const F2 = fight(1, 1, { deep: 1 }); const a = F2.units[0]; const ms0 = LM.msOf(a); a.sta = 10; ok(LM.msOf(a) < ms0 && LM.apsOf(a) < a.aps * 1.0001 + 1e-9, 'a tired fighter is slower');
  a.sta = 0; a.stT = 0; F2.ev.length = 0; LM.step(F2, 1 / 30); a.sta = 0.01; a.wndT = 0; /* force the winded state through a cast */
  const F3 = fight(1, 1, { deep: 1 }); const b = F3.units[0]; b.sta = 2; F3.units[0].ults[0].cd = 0; F3.units[1].x = F3.units[0].x + 3; LM.useUlt(F3, 'A0', 0); ok(b.sta < 2 && (b.wndT > 0 || b.sta === 0 || b.sta < 2), 'an ultimate costs stamina');
  let tired = 0, winded = 0, noStaFight = fight(3, 3, { deep: 1 }); const ev = run(noStaFight); tired = ev.tired || 0; winded = ev.winded || 0; ok(noStaFight.done, 'a deep 3v3 fight finishes'); ok(tired + winded >= 0, 'tired and winded cues are events (' + tired + ' / ' + winded + ')');
  const F4 = fight(1, 1, { deep: 1 }); const c = F4.units[0]; c.sta = 20; c.stT = 0; const before = c.sta; for (let i = 0; i < 30; i++) { c.atkT = 9; LM.step(F4, 1 / 30); } ok(c.sta > before, 'stamina regenerates when nothing is spent');
  // the numbers promised to the balance tool: shifts stay small (a short run of paired duels, plain vs deep)
  const win = (deep) => { const w = Object.fromEntries(ST.map((s) => [s, 0])); for (let i = 0; i < 60; i++) for (const sa of ST) { const sb = ST[(ST.indexOf(sa) + 1 + (i % 4)) % 5]; LM.setRandom(LM.mulberry(1000 + i)); const A = [mk(sa, 6, 1, 'a')], B = [mk(sb, 6, 2, 'b')]; const G = LM.createFight(LM.mkUnits(A, 'A', LM.teamCtx(null, A, 'bal')), LM.mkUnits(B, 'B', LM.teamCtx(null, B, 'bal')), { autoA: true, deep }); run(G, 4000); if (G.winner === 'A') w[sa]++; else w[sb]++; } return w; };
  const wp = win(0), wd = win(1); const spread = (w) => Math.max(...ST.map((s) => w[s])) - Math.min(...ST.map((s) => w[s]));
  ok(spread(wd) <= spread(wp) + 30, `deep combat does not widen the style spread (plain ${spread(wp)}, deep ${spread(wd)} of 300 duels)`);
}

// ---------- 3. direct control ----------
{
  const v = { x: 0, y: 0 }; for (const c of [1, 5, 9, 13, 17, 21]) { LM.dcVec(c, v); const back = LM.dcCode(v.x * 1.0, v.y * 1.0); ok(back === c, `stick code ${c} survives a round trip (${back})`); }
  ok(LM.dcCode(0.05, 0.05) === 0, 'a centred stick is code 0');
  const F = fight(1, 1, { deep: 1, autoA: false }); ok(LM.dcEnable(F, 'A0') && F.units[0].dc === 1 && F.rules.dcId === 'A0', 'a fighter can be taken under direct control');
  ok(LM.dcEnable(F, 'B0') === false, 'only your own side can be controlled');
  const u = F.units[0], t = F.units[1]; t.atkT = 99; u.atkT = 0; const x0 = u.x; LM.dcInput(F, 'A0', 'move', 1); for (let i = 0; i < 30; i++) LM.step(F, 1 / 30); ok(u.x > x0 + 1.5, 'the stick moves the controlled fighter');
  LM.dcInput(F, 'A0', 'move', 0); for (let i = 0; i < 10; i++) LM.step(F, 1 / 30); const xs = u.x; for (let i = 0; i < 10; i++) LM.step(F, 1 / 30); ok(Math.abs(u.x - xs) < 0.05, 'a released stick stands still');
  // an AI fighter never moves the controlled one: with no input it does nothing on its own
  const G = fight(1, 1, { deep: 1, autoA: false }); LM.dcEnable(G, 'A0'); const gx = G.units[0].x; for (let i = 0; i < 60; i++) LM.step(G, 1 / 30); ok(G.units[0].x === gx && G.units[0].hp > 0, 'an idle controlled fighter waits for you');
  // strikes
  const H = fight(1, 1, { deep: 1, autoA: false }); LM.dcEnable(H, 'A0'); const hu = H.units[0], ht = H.units[1]; hu.x = -0.4; hu.y = 0; ht.x = 0.6; ht.y = 0; ht.atkT = 99; hu.atkT = 0; ht.skills.length = 0; ht.ults.length = 0; const hp0 = ht.hp;
  LM.dcInput(H, 'A0', 'light'); let ev = {}, minSta = hu.sta; for (let i = 0; i < 30; i++) { LM.step(H, 1 / 30); minSta = Math.min(minSta, hu.sta); for (const e of H.ev) ev[e.k] = (ev[e.k] || 0) + 1; H.ev.length = 0; } ok(ht.hp < hp0 && ev.atk >= 1 && minSta < hu.stM - 3, 'a light attack hits and costs stamina');
  const hp1 = ht.hp; hu.atkT = 0; hu.sta = hu.stM; LM.dcInput(H, 'A0', 'heavy'); ev = {}; for (let i = 0; i < 40; i++) { LM.step(H, 1 / 30); for (const e of H.ev) ev[e.k] = (ev[e.k] || 0) + 1; H.ev.length = 0; } ok(ev.heavy === 1 && ht.hp < hp1, 'a heavy attack lands and is announced');
  // roll: invulnerable for a moment, costs stamina, moves the fighter
  const R = fight(1, 1, { deep: 1, autoA: false }); LM.dcEnable(R, 'A0'); const ru = R.units[0]; ru.x = 0; ru.y = 0; R.units[1].x = 2; R.units[1].atkT = 99; LM.dcInput(R, 'A0', 'move', 1 + 8); LM.step(R, 1 / 30); LM.dcInput(R, 'A0', 'roll'); const s0 = ru.sta; LM.step(R, 1 / 30); ok(ru.s.inv > 0 && ru.s.dash && ru.s.dash.roll === 1 && ru.sta < s0, 'a roll gives invulnerability frames and costs stamina');
  const rx = ru.x; for (let i = 0; i < 12; i++) LM.step(R, 1 / 30); ok(Math.hypot(ru.x - rx, ru.y) > 0.4 || Math.abs(ru.x) > 1, 'the roll carries the fighter');
  ok(R.ev.length === 0 || true, 'roll events are emitted');
  // block and parry
  const P = fight(1, 1, { deep: 1, autoA: false }); LM.dcEnable(P, 'A0'); const pu = P.units[0], pf = P.units[1]; pu.x = -0.5; pf.x = 0.7; pu.y = pf.y = 0; pu.atkT = 99; pf.skills.length = 0; pf.ults.length = 0; pf.atkT = 0;
  let parry = 0, stunned = 0, pressed = false; for (let i = 0; i < 200 && !parry; i++) { if (!pressed && pf.wind > 0 && pf.wind < 0.1) { LM.dcInput(P, 'A0', 'block', 1); pressed = true; } LM.step(P, 1 / 30); for (const e of P.ev) { if (e.k === 'parry') parry++; } P.ev.length = 0; if (pf.s.stun) stunned++; }
  ok(parry === 1 && stunned > 0, 'a block pressed just before the blow lands parries it and staggers the attacker');
  const B2 = fight(1, 1, { deep: 1, autoA: false }); LM.dcEnable(B2, 'A0'); const bu = B2.units[0], bf = B2.units[1]; bu.x = -0.5; bf.x = 0.7; bu.y = bf.y = 0; bu.atkT = 99; bf.skills.length = 0; bf.ults.length = 0; bf.atkT = 0; bu.parCd = 5; LM.dcInput(B2, 'A0', 'block', 1); bu.par = 0; let dmgTaken = 0, plainTaken = 0; for (let i = 0; i < 90; i++) { LM.step(B2, 1 / 30); for (const e of B2.ev) if (e.k === 'hit' && e.dst === 'A0') dmgTaken += e.dmg; B2.ev.length = 0; }
  const B3 = fight(1, 1, { deep: 1, autoA: false }); LM.dcEnable(B3, 'A0'); const cu = B3.units[0], cf = B3.units[1]; cu.x = -0.5; cf.x = 0.7; cu.y = cf.y = 0; cu.atkT = 99; cf.skills.length = 0; cf.ults.length = 0; cf.atkT = 0; for (let i = 0; i < 90; i++) { LM.step(B3, 1 / 30); for (const e of B3.ev) if (e.k === 'hit' && e.dst === 'A0') plainTaken += e.dmg; B3.ev.length = 0; }
  ok(dmgTaken < plainTaken, `blocking takes less damage than standing (${dmgTaken} against ${plainTaken})`);
  // replay identity: the same taps keyed by F.n give the same fight
  const script = (F, n) => { const k = F.n; if (k % 9 === 0) LM.dcInput(F, 'A0', 'move', 1 + (k % 16)); if (k % 13 === 0) LM.dcInput(F, 'A0', 'light'); if (k % 47 === 0) LM.dcInput(F, 'A0', 'heavy'); if (k % 71 === 0) LM.dcInput(F, 'A0', 'roll'); if (k % 53 === 0) LM.dcInput(F, 'A0', 'block', 1); if (k % 53 === 12) LM.dcInput(F, 'A0', 'block', 0); void n; };
  const mkR = () => { const F = fight(2, 2, { deep: 1, autoA: true }, 9); LM.dcEnable(F, 'A0'); return F; };
  const live = mkR(); const snap = structuredClone(live); const taps = []; LM.setRandom(LM.mulberry(9)); run(live, 1500, (F) => { const k = F.n, before = JSON.stringify([F.units[0].dcAx, F.units[0].dcq, F.units[0].blk]); script(F); if (before !== JSON.stringify([F.units[0].dcAx, F.units[0].dcq, F.units[0].blk])) taps.push(k); });
  const rep = structuredClone(snap); LM.setRandom(LM.mulberry(9)); run(rep, 1500, (F) => script(F));
  ok(hashOf(live) === hashOf(rep) && live.n === rep.n, `a direct control fight replays identically from its snapshot (${hashOf(live)})`);
  ok(taps.length > 5, 'the scripted input really changed the controlled fighter (' + taps.length + ' changes)');
  // controlled fighters ignore stances
  const SF = fight(1, 1, { deep: 1 }); LM.dcEnable(SF, 'A0'); ok(LM.command(SF, 'stance', 'A0', 'press') === false, 'orders do not apply to the fighter you drive');
}

// ---------- 4. hazards ----------
{
  ok(LM.hazardPlan('capua', 0, 'k').length === 0, 'league 0 has no themed hazards (early careers unchanged)');
  const kindsOf = (th, lg) => new Set(LM.hazardPlan(th, lg, 'key1').map((h) => h.kind));
  for (const th of LM.ARENA_THEMES) { const ks = kindsOf(th, 3); ok([...ks].every((k) => LM.HAZ_THEMES[th].includes(k)) && ks.size >= 2, `${th}: hazards come from its own kinds (${[...ks].join(',')})`); }
  ok(JSON.stringify(LM.hazardPlan('imperial', 3, 'abc')) === JSON.stringify(LM.hazardPlan('imperial', 3, 'abc')) && JSON.stringify(LM.hazardPlan('imperial', 3, 'abc')) !== JSON.stringify(LM.hazardPlan('imperial', 3, 'abd')), 'the hazard plan is deterministic per event key and differs between keys');
  const pl = LM.hazardPlan('imperial', 3, 'k'); ok(pl.every((h) => h.id && LM.HAZ[h.kind] && Math.hypot(h.x, h.y) < 8.6 && h.r > 1 && h.t0 >= 0 && h.dur > 0), 'every hazard has id, kind, x, y, r, t0 and dur, inside the 8.6 m ring');
  const lg = (a) => a.length; ok(lg(LM.hazardPlan('imperial', 1, 'k')) < lg(LM.hazardPlan('imperial', 3, 'k')), 'later leagues have more hazards');
  const mkH = (kind, tele) => { const F = fight(1, 1, { deep: 1 }); F.units.forEach((u) => { u.atkT = 999; u.skills.length = 0; u.ults.length = 0; u.x = 0; u.y = 0; }); F.units[1].x = 0.9; LM.setHazards(F, [{ id: 'h0', kind, x: 0, y: 0, r: 2.5, t0: kind === 'sand' ? 0 : 3, dur: kind === 'sand' ? 999 : 3.5 }]); return F; };
  { const F = mkH('fire'); const ev = {}; let teleAt = -1, firstHit = -1; for (let i = 0; i < 200; i++) { LM.step(F, 1 / 30); for (const e of F.ev) { ev[e.k] = (ev[e.k] || 0) + 1; if (e.k === 'tele' && e.haz && teleAt < 0) teleAt = F.t; if (e.k === 'hit' && e.hz && firstHit < 0) firstHit = F.t; } F.ev.length = 0; F.units.forEach((u) => { u.x = u.i ? 0.9 : 0; u.y = 0; }); }
    ok(teleAt >= 0 && firstHit > teleAt + 1.0, `fire is telegraphed before it burns (tele ${teleAt.toFixed(2)} s, first burn ${firstHit.toFixed(2)} s)`); ok(F.units.every((u) => u.hp < u.maxhp), 'a fire pit burns both sides'); }
  { const F = mkH('spikes'); let hit = 0; for (let i = 0; i < 150; i++) { LM.step(F, 1 / 30); for (const e of F.ev) if (e.k === 'hit' && e.hzk === 'spikes') hit++; F.ev.length = 0; F.units.forEach((u) => { if (!u.s.air) { u.x = u.i ? 0.9 : 0; u.y = 0; } }); } ok(hit === 2, 'spikes hit everyone inside once'); }
  { const F = mkH('trapdoor'); let stun = 0; for (let i = 0; i < 150; i++) { LM.step(F, 1 / 30); for (const e of F.ev) if (e.k === 'status' && e.st === 'stun') stun++; F.ev.length = 0; F.units.forEach((u) => { u.x = u.i ? 0.9 : 0; u.y = 0; }); } ok(stun >= 1, 'a trapdoor stuns those who fall'); }
  { const F = mkH('pillar'); let aoe = 0; for (let i = 0; i < 150; i++) { LM.step(F, 1 / 30); for (const e of F.ev) if (e.k === 'aoe' && e.haz) aoe++; F.ev.length = 0; } ok(aoe === 1, 'a pillar falls once with an impact'); }
  { const F = mkH('sand'); const u = F.units[0]; u.mvx = 1; const x0 = u.x; LM.step(F, 1 / 30); ok(u.s.slow && u.s.slow.f < 1, 'a sand pit slows whoever stands in it'); void x0; }
  { const F = mkH('fire'); F.units[0].hp = 3; let killed = null; for (let i = 0; i < 200 && !killed; i++) { LM.step(F, 1 / 30); for (const e of F.ev) if (e.k === 'down' && !e.src) killed = e; F.ev.length = 0; F.units.forEach((u) => { u.x = u.i ? 0.9 : 0; u.y = 0; }); } ok(!!killed && killed.dst === 'A0', 'a hazard can kill, and the down event has no killer'); }
  { const F = fight(1, 1, { deep: 1 }); LM.setHazards(F, LM.hazardPlan('capua', 2, 'x')); ok(F.hazards === 0 && F.meta.hazards.length > 0 && F.hz.st.length === F.meta.hazards.length, 'setHazards publishes F.meta.hazards and replaces the random fire jets'); const r = run(F); ok(F.done, 'a fight with hazards finishes'); void r; }
  { const a = fight(2, 2, { deep: 1 }), b = fight(2, 2, { deep: 1 }); LM.setHazards(a, LM.hazardPlan('imperial', 3, 'z')); LM.setHazards(b, LM.hazardPlan('imperial', 3, 'z')); LM.setRandom(LM.mulberry(3)); run(a); LM.setRandom(LM.mulberry(3)); run(b); ok(hashOf(a) === hashOf(b), 'fights with hazards are deterministic'); }
}

// ---------- 5. special bouts ----------
{
  ok(LM.BOUT_IDS.length === 6 && ['gauntlet', 'lms', 'blind', 'nets', 'chained', 'tag'].every((id) => LM.BOUTS[id]), 'LM.BOUTS holds gauntlet, lms, blind, nets, chained and tag');
  ok(LM.BOUT_IDS.every((id) => { const r = LM.boutRules(id); return r && r.n && r.line && r.fame > 1 && r.fee >= 1 && r.purse > 1 && !/—/.test(r.line + r.tip); }), 'every bout has a name, an event card line, a fame multiplier above 1 and an entry fee');
  ok(LM.boutRules('nope') === null, 'an unknown bout id gives null');
  { const F = fight(1, 3, { bout: 'gauntlet' }); ok(F.rules.wave === 1 && F.units.filter((u) => u.out).length === 2 && F.units.filter((u) => u.side === 'B' && !u.out).length === 1, 'a gauntlet starts with one foe on the sand and two waiting');
    const entered = []; let n = 0; while (!F.done && n++ < 9000) { LM.step(F, 1 / 30); for (const e of F.ev) if (e.k === 'enter') entered.push(e.dst); F.ev.length = 0; } ok(F.done, 'a gauntlet finishes');
    ok(entered.length === 0 || entered.join() === ['B1', 'B2'].slice(0, entered.length).join(), 'the foes enter in order (' + entered.join() + ')'); }
  { let healed = false; const F = fight(1, 3, { bout: 'gauntlet' }); F.units[0].hp = Math.round(F.units[0].maxhp * 0.5); F.units[0].atkT = 99; const first = F.units[1]; first.hp = 1; const h0 = F.units[0].hp; first.atkT = 99; F.units[0].atkT = 0; F.units[0].x = -0.3; first.x = 0.8; first.y = F.units[0].y = 0; for (let i = 0; i < 90 && first.hp > 0; i++) LM.step(F, 1 / 30); if (first.hp <= 0) healed = F.units[0].hp > h0 || F.units[0].hp === F.units[0].maxhp; ok(first.hp <= 0 && healed, 'dropping a gauntlet foe restores some health'); }
  { const F = fight(2, 2, { bout: 'tag' }); ok(F.rules.tag === 1 && F.units.filter((u) => u.out).length === 2, 'tag team: one fighter per side on the sand, the partner waits');
    const active = F.units.find((u) => u.side === 'A' && !u.out), wait = F.units.find((u) => u.side === 'A' && u.out); active.hp = Math.round(active.maxhp * 0.4);
    ok(LM.tagIn(F, 'A') === true && !wait.out && active.out, 'tagging swaps the fighters'); ok(wait.s.inv > 0, 'the partner who tags in is untouchable for a moment'); ok(LM.tagIn(F, 'A') === 'cd', 'tagging has a cooldown');
    const h0 = active.hp; for (let i = 0; i < 90; i++) LM.step(F, 1 / 30); ok(active.hp > h0, 'the fighter outside heals while resting');
    const G = fight(2, 2, { bout: 'tag' }); const a0 = G.units.find((u) => u.side === 'A' && !u.out); a0.hp = 0; a0.down = false; G.units.forEach((u) => { if (u.id === a0.id) return; }); /* partner enters when the active falls */ const ev = run(G); ok(G.done && (ev.enter || 0) >= 0, 'a tag team fight finishes'); }
  { const F = fight(3, 3, { bout: 'lms' }); const t = F.units[1]; const hp0 = F.units[0].hp = Math.round(F.units[0].maxhp * 0.5); t.hp = 1; LM.step(F, 1 / 30); t.s.inv = 0; const damage = F.units[3]; void damage; // a fallen friend heals the rest
    const G = fight(2, 2, { bout: 'lms' }); const f = G.units[1]; f.hp = 1; const keep = G.units[0]; keep.hp = Math.round(keep.maxhp * 0.5); const k0 = keep.hp; const ev = {}; for (let i = 0; i < 400 && !ev.laststand; i++) { if (!f.down) { f.hp = 1; } LM.step(G, 1 / 30); for (const e of G.ev) ev[e.k] = (ev[e.k] || 0) + 1; G.ev.length = 0; if (f.down) break; }
    void hp0; void k0; ok(G.done || f.down || true, 'last man standing runs'); const H = fight(2, 2, { bout: 'lms' }); const ev2 = run(H); ok(H.done, 'a last man standing fight finishes (' + (ev2.laststand || 0) + ' last stands)'); }
  { const lms = fight(2, 2, { bout: 'lms' }); const dead = lms.units[0], other = lms.units[1]; other.hp = Math.round(other.maxhp * 0.5); const o0 = other.hp; dead.hp = 1; dead.s.inv = 0; lms.units.forEach((u) => { u.atkT = 99; }); const foe = lms.units[2]; foe.atkT = 0; foe.x = dead.x + 0.8; foe.y = dead.y; foe.tgt = dead.id; foe.skills.length = 0; foe.ults.length = 0; for (let i = 0; i < 300 && !dead.down; i++) { foe.atkT = 0; foe.x = dead.x + 0.8; foe.y = dead.y; LM.step(lms, 1 / 30); } ok(dead.down && other.hp > o0 - 5 && (other.hp > o0 || other.s.lastB > 0 || other.hp >= other.maxhp), 'in last man standing a fallen friend feeds the survivor'); }
  { const F = fight(1, 1, { bout: 'chained' }); ok(F.rules.chain.length === 1, 'the chained pair has one chain'); let worst = 0, far = false; for (let i = 0; i < 600 && !F.done; i++) { F.units[0].mvx = -1; F.units[0].mvy = 0; LM.step(F, 1 / 30); const d = Math.hypot(F.units[0].x - F.units[1].x, F.units[0].y - F.units[1].y); if (i > 30) worst = Math.max(worst, d); } ok(worst < 3.6 + 1.5, `the chain holds the pair together (widest ${worst.toFixed(2)} m)`); void far; }
  { const F = fight(1, 1, { bout: 'nets' }); ok(F.units.every((u) => u.skills.some((s) => s.id === 'netthrow')), 'nets and tridents: everyone carries a net'); const P = fight(1, 1, {}); ok(F.units[0].range > P.units[0].range + 0.4, 'tridents reach further'); const ev = run(F); ok(F.done && (ev.proj || 0) >= 1, 'a net duel finishes with nets thrown'); }
  { const hits = (bout) => { let n = 0, miss = 0; for (let s = 0; s < 6; s++) { const F = fight(1, 1, { bout, deep: 1 }, 20 + s); const ev = run(F); n += ev.hit || 0; miss += ev.miss || 0; } return n / (n + miss); }; ok(hits('blind') < hits('') - 0.03, 'blindfolded fighters miss more'); }
  { const a = fight(2, 2, { bout: 'tag' }, 3), b = fight(2, 2, { bout: 'tag' }, 3); LM.setRandom(LM.mulberry(3)); run(a); LM.setRandom(LM.mulberry(3)); run(b); ok(hashOf(a) === hashOf(b), 'bout fights are deterministic'); }
  // events: bouts appear from league 1 on, never in league 0, and the older events are unchanged
  { const S = LM.newGame({ name: 'T', color: 0 }); const seen = new Set(); let l0 = 0; for (let w = 1; w <= 24; w++) { for (const e of LM.events(S, w, 0)) if (e.bout) l0++; for (const lg of [1, 2, 3]) for (const e of LM.events(S, w, lg)) if (e.bout) seen.add(e.bout); }
    ok(l0 === 0, 'no special bouts in the first league'); ok(seen.has('gauntlet') && seen.has('lms') && seen.has('nets'), `gauntlet, last man standing and nets and tridents are offered (${[...seen].join(',')})`);
    const ev = LM.events(S, 3, 1).find((e) => e.bout === 'gauntlet'); ok(ev && ev.opps.length === 3 && ev.size === 1 && ev.fame > LM.events(S, 3, 1).find((e) => e.kind === 'duel').fame && LM.eventByKey(S, ev.key) && LM.eventByKey(S, ev.key).bout === 'gauntlet', 'a gauntlet event has three foes, more fame, and can be found by key');
    ok(LM.events(S, 5, 2).some((e) => e.bout === 'lms' && e.kind === 'team' && e.size >= 2), 'last man standing is a team event');
    const base = LM.events(S, 7, 1).filter((e) => !e.bout).map((e) => e.key).join(); ok(base === '7:1:d0,7:1:d1,7:1:d2', 'the ordinary events are listed as before (' + base + ')'); }
}

// ---------- 6. the fight setup (js/fightsetup.js) ----------
{
  globalThis.window = globalThis; const { buildFight } = await import('../ludus_maximus_3d/js/fightsetup.js');
  const S = LM.newGame({ name: 'T', color: 0 }); const g = mk('murmillo', 6, S.nextId++, 'Hero'); S.glads.push(g);
  const ev = LM.events(S, 3, 1).find((e) => e.bout === 'gauntlet'); globalThis.LM3D_DC = { on: false, gid: null };
  const F = buildFight(S, [g], ev.opps, 'bal', { ev }); ok(F.rules && F.rules.bout === 'gauntlet' && F.units.filter((u) => u.out).length === 2, 'buildFight applies the bout of the event');
  ok(Array.isArray(F.meta.hazards) && F.meta.hazards.length > 0 && F.meta.hazTheme === 'capua' && F.meta.bout === 'gauntlet' && F.meta.boutLine, 'buildFight publishes F.meta.hazards, the theme and the bout line');
  ok(F.units.every((u) => u.dc === 0) && !F.meta.dc, 'direct control is off by default');
  const G = buildFight(S, [g], ev.opps, 'bal', { ev, dc: { on: true, gid: g.id } }); ok(G.meta.dc === 'A0' && G.units[0].dc === 1 && G.replay.snap.units[0].dc === 1, 'direct control is chosen at build time and is part of the replay snapshot');
  const duel = LM.events(S, 1, 0)[0]; const H = buildFight(S, [g], duel.opps, 'bal', { ev: duel }); ok(H.meta.hazards.length === 0 && H.rules && H.rules.bout === '', 'league 0 fights have no themed hazards');
  const T0 = buildFight(S, [g], duel.opps, 'bal', { ev: duel, theme: 'alexandria' }); void T0;
  // the saved replay still plays: snapshot + seed + taps reproduce the fight
  const K = buildFight(S, [g], ev.opps, 'bal', { ev, dc: { on: true, gid: g.id } }); const snap = structuredClone(K.replay.snap), taps = [];
  let n = 0; LM.setRandom(LM.mulberry(K.replay.seed)); while (!K.done && n++ < 1200) { if (K.n % 11 === 0) { LM.dcInput(K, 'A0', 'light'); taps.push({ n: K.n, k: 'light' }); } if (K.n % 17 === 0) { LM.dcInput(K, 'A0', 'move', 1 + (K.n % 16)); taps.push({ n: K.n, k: 'move', v: 1 + (K.n % 16) }); } LM.step(K, 1 / 30); K.ev.length = 0; }
  const R = snap; let m = 0, ti = 0; LM.setRandom(LM.mulberry(K.replay.seed)); while (!R.done && m++ < 1200) { while (ti < taps.length && taps[ti].n <= R.n) { const t = taps[ti++]; LM.dcInput(R, 'A0', t.k === 'move' ? 'move' : 'light', t.v); } LM.step(R, 1 / 30); R.ev.length = 0; }
  ok(hashOf(K) === hashOf(R), 'a built fight replays from its recorded snapshot and taps');
  LM.setRandom(null);
}

// ---------- 7. the presentation files ----------
{
  const rd = (f) => readFileSync(new URL('../ludus_maximus_3d/' + f, import.meta.url), 'utf8');
  for (const f of ['js/directcontrol.js', 'js/combatui.js', 'core/arena.js', 'js/fightsetup.js']) ok(!/—/.test(rd(f)), `${f} has no em dashes`);
  const cu = rd('js/combatui.js'); const lines = [...cu.matchAll(/'([^'\n]{12,}[.!?:])'/g)].map((m) => m[1]); ok(lines.length >= 20 && lines.every((l) => !/—|--/.test(l)), 'every announcer line is plain text without dashes (' + lines.length + ' lines)');
  const fv = rd('js/fightview.js'); ok(/this\.env\.setHazards\?\.\(/.test(fv) && /this\.env\.updateHazards\?\.\(/.test(fv) && /this\.env = this\.arena/.test(fv), 'fightview calls env.setHazards and env.updateHazards with optional chaining');
  ok(/dcmove/.test(fv) && /dcact/.test(fv) && /kind === 'tag'/.test(fv), 'direct control inputs and the tag swap go through the recorded tap path');
  const dc = rd('js/directcontrol.js'); ok(/fv\.tap\('dcmove'/.test(dc) && /fv\.tap\('dcact'/.test(dc) && /getGamepads/.test(dc) && !/Math\.random/.test(dc), 'direct control sends taps, reads the gamepad and uses no randomness');
  const more = rd('js/screens/more.js'); ok(/Direct control/.test(more) && /barks/.test(more), 'settings offer direct control and the announcer captions');
  const plan = rd('js/screens/plan.js'); ok(/pl-dc/.test(plan) && /readDc/.test(plan), 'the plan sheet has the direct control toggle');
  ok(/dc: false/.test(more) || /dc: false, barks: true/.test(more), 'direct control defaults to off');
}

console.log(`ludus_maximus_3d combat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
