// Ludus Maximus 3D: FIGHTERS depth (origins, quirks, bonds, talents, mastery, titles, career arc, look). Headless, no DOM.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus_3d/core/data.js');
const LM = require('../ludus_maximus_3d/core/sim.js');
require('../ludus_maximus_3d/core/ext.js');
require('../ludus_maximus_3d/core/arena.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const seeded = (s) => { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
LM.setRandom(seeded(7));
const mk = (seed, n = 3, o = {}) => { const S = LM.newGame({ name: 'F' + seed, color: 0 }); S.seed = seed; for (let i = 0; i < n; i++) { const g = LM.makeGlad(Object.assign({ id: S.nextId++, style: D.STYLE_IDS[i % 5], lvl: 5 }, o)); S.glads.push(g); LM.fEnsure(S, g); } return S; };

// 1. origins, quirks, bio: deterministic, two non-conflicting quirks, no rnd draws
{
  const S = mk('a'); const g = S.glads[0];
  ok(LM.fighters && LM.fighters.ver >= 2, 'module loaded');
  ok(g.org && LM.fighters.ORIGINS[g.org] && g.q.length === 2 && g.q[0] !== g.q[1], 'origin and two distinct quirks');
  ok(!LM.fighters.QUIRKS[g.q[0]].no.includes(g.q[1]), 'quirks do not conflict');
  const r0 = LM.rnd ? 0 : 0; const before = JSON.stringify([g.org, g.q, g.age]);
  const h = JSON.parse(JSON.stringify(g)); delete h.org; delete h.q; delete h.age; delete h.ag0; LM.fEnsure(S, h);
  ok(JSON.stringify([h.org, h.q, h.age]) === before, 'lazy backfill is deterministic');
  let a = 0; const keep = LM.rand; let draws = 0; LM.setRandom(() => { draws++; return 0.5; }); const z = JSON.parse(JSON.stringify(g)); delete z.org; delete z.q; delete z.age; LM.fEnsure(S, z); LM.fBio(z); LM.fTitles(S, z); LM.setRandom(seeded(7));
  ok(draws === 0, 'ensure / bio / titles never draw from the random stream');
  const bio = LM.fBio(g); ok(bio.includes(g.name) && !bio.includes('—') && bio.length > 60, 'bio mentions the name, no em dash');
  const orgs = new Set(), qs = new Set(); for (let i = 1; i < 120; i++) { const x = { id: i, skin: '#abc' + (i % 7), hair: '#1' + (i % 5), style: D.STYLE_IDS[i % 5], lvl: 3 }; LM.fEnsure(null, x); orgs.add(x.org); x.q.forEach((q) => qs.add(q)); }
  ok(orgs.size >= 8 && qs.size >= 12, `variety: ${orgs.size} origins, ${qs.size} quirks`);
  for (const q of Object.values(LM.fighters.QUIRKS)) ok(q.pro && q.con && q.line.includes('{n}'), 'every quirk states a pro, a con and a line');
  for (const o of Object.values(LM.fighters.ORIGINS)) for (const k in o.mods) ok(Math.abs(o.mods[k]) <= 0.025, 'origin shades are tiny');
}
// 2. old saves: fighters without the fields load and get them
{
  const S = mk('b'); S.glads.forEach((g) => { delete g.org; delete g.q; delete g.age; delete g.ag0; delete g.tk; delete g.wm; delete g.ll; delete g.lk; }); delete S.fr; delete S.trainers;
  const N = LM.migrate(JSON.parse(JSON.stringify(S)));
  ok(N.glads.every((g) => g.org && g.q && g.q.length === 2 && g.age >= 19), 'migrate backfills every fighter');
  ok(typeof N.fr === 'object' && Array.isArray(N.trainers), 'migrate adds S.fr and S.trainers');
  const f = LM.derive(N.glads[0], {}); ok(isFinite(f.hp) && f.hp > 0 && isFinite(f.atk), 'derive stays finite after migration');
}
// 3. shades are small and capped
{
  const S = mk('c', 1, { lvl: 20 }); const g = S.glads[0]; const base = LM.derive(Object.assign({}, g, { org: null, q: null, age: 0, tk: null, wm: null }), { noperf: true });
  g.age = 27; g.q = ['reckless', 'proud']; g.org = 'gaul';
  for (const b of LM.fTree(g.style)) { for (const n of b.nodes) { for (let i = 0; i < n.max; i++) { g.lvl = 40; g.tk[n.id] = i + 1; } } }
  g.wm.sword = 999; g.wm.spear = 999; g.wm.dual = 999; const d = LM.derive(g, { noperf: true });
  ok(d.atk / base.atk < 1.2, `all-in shades stay under +20% damage (${(d.atk / base.atk).toFixed(3)})`);
  ok(LM.fPoints(20) === 12 && LM.fPoints(1) === 0 && LM.fPoints(5) === 4, 'talent points: 1 a level, 12 at the cap');
}
// 4. talents: points, prerequisites, respec
{
  const S = mk('d', 1, { lvl: 6 }); const g = S.glads[0]; S.gold = 500;
  ok(LM.fFree(g) === 5, 'level 6 has 5 points');
  ok(LM.fTalent(S, g, 'a2') !== '', 'tier 2 is locked behind two ranks of tier 1');
  ok(LM.fTalent(S, g, 'a1') === '' && LM.fTalent(S, g, 'a1') === '' && LM.fTalent(S, g, 'a1') === '', 'three ranks of a tier 1 node');
  ok(LM.fTalent(S, g, 'a1') !== '', 'a 4th rank is refused');
  ok(LM.fTalent(S, g, 'a2') === '' && LM.fFree(g) === 1, 'tier 2 opens after two ranks');
  const m = LM.fTalentMods(g).m; ok(Object.keys(m).length > 0, 'talent mods exist');
  const cost = LM.fRespecCost(g); ok(cost > 0 && LM.fRespec(S, g) === '' && LM.fSpent(g) === 0 && S.gold === 500 - cost, 'respec costs gold and refunds every point');
  for (const st of D.STYLE_IDS) { const tr = LM.fTree(st); ok(tr.length === 3 && tr.every((b) => b.nodes.length === 2 && b.nodes[1].cap && b.nodes[1].cap.fx), `${st}: three branches of two tiers, each with a signature capstone`); }
  // capstone adds a fight effect
  const g2 = S.glads[0]; g2.lvl = 20; g2.tk = {}; const tr = LM.fTree(g2.style)[0]; for (let i = 0; i < 3; i++) LM.fTalent(S, g2, tr.nodes[0].id); for (let i = 0; i < 2; i++) LM.fTalent(S, g2, tr.nodes[1].id);
  const d2 = LM.derive(g2, {}); const k = Object.keys(tr.nodes[1].cap.fx)[0]; ok((d2.fx[k] || 0) >= 1, 'maxed tier 2 grants its signature effect');
}
// 5. mastery tiers by use, shared per weapon across a style change
{
  const S = mk('e', 1, { style: 'murmillo' }); const g = S.glads[0];
  ok(LM.fMastery(g).n === 'Novice', 'starts as a novice'); g.wm.sword = 20; ok(LM.fMastery(g).tier === 2 && LM.fMastery(g).perk === 'Steady Grip' || LM.fMastery(g).perk === 'Edge Sense', 'tier 2 names a perk');
  g.wm.sword = 60; ok(LM.fMastery(g).n === 'Master' && LM.fMastery(g).perk === 'Master of the Sword', 'master at 60');
  g.style = 'thraex'; ok(LM.fMastery(g).n === 'Master', 'thraex shares the sword track'); g.style = 'retiarius'; ok(LM.fMastery(g).n === 'Novice', 'spear is a different track');
}
// 6. settle: morale shades, mastery, counters, titles
{
  const S = mk('f', 2); const [a, b] = S.glads; a.q = ['proud', 'patient']; b.q = ['stoic', 'wary']; a.mo = 70; b.mo = 70;
  const ev = { title: 'T', kind: 'duel', league: 0, purse: 100, fame: 20, opps: [{ lvl: 3 }], week: 1 };
  const moA = a.mo, moB = b.mo; const rep = LM.settle(S, ev, [a, b], { win: false, odds: 0.5, hype: 10 });
  ok(a.mo < moA - 8, `proud loses extra morale on defeat (${moA} -> ${a.mo})`); ok(b.mo > moB - 8 && b.mo >= moB - 4.5, `stoic loses less (${moB} -> ${b.mo})`);
  ok(a.wm.sword >= 1 || a.wm.spear >= 1 || a.wm.dual >= 1, 'weapon mastery grows by use');
  ok(LM.fRelOf(S, a.id, b.id).n === 1, 'the pair counts one fight together');
  b.rec.w = 8; b.rec.l = 0; LM.fTitles(S, b); ok(b.tt.includes('undefeated') && b.rn === 'undefeated', 'a title is earned and worn');
  ok(LM.fighters.plate(b).includes('Undefeated'), 'nameplate suffix'); ok(LM.fSetTitle(b, 'butcher') !== '' && LM.fSetTitle(b, '') === '' && !b.rn, 'only earned titles can be worn');
}
// 7. relationships: sworn, shades in the team context with roles, grudge and spar, falls
{
  const S = mk('g', 3); const [a, b, c] = S.glads; S.gold = 200; LM.addBond(S, a.id, b.id, 50);
  ok(LM.fSwear(S, a, b) === '' && LM.fKinds(S, a.id, b.id).includes('sworn') && S.gold === 170, 'swear brotherhood costs 30 gold');
  ok(LM.fSwear(S, a, b) !== '', 'cannot swear twice'); ok(LM.fSwear(S, a, c) !== '', 'needs bond 45');
  const base = LM.teamCtx(S, [a, b], 'bal'); ok(base.fb && base.fb[a.id] && base.fb[a.id].atk >= 0.03 - 1e-9, 'brothers get +3% in the team ctx');
  const plan = { form: 'line', roles: { [a.id]: 'vanguard', [b.id]: 'hunter' }, prio: null, show: 0 }; const pc = LM.teamCtx(S, [a, b], plan);
  ok(pc.fb[a.id].atk > base.fb[a.id].atk, 'complementary roles raise the brotherhood shade');
  ok(!LM.teamCtx(S, [a], 'bal').fb, 'a lone fighter gets no team shades'); ok(!LM.teamCtx(null, [a, b], 'bal').fb, 'opponent teams (S = null) get none');
  const d1 = LM.derive(a, { noperf: true }), d2 = LM.derive(a, { noperf: true, fb: base.fb }); ok(d2.atk > d1.atk, 'derive reads ctx.fb');
  for (const id of Object.keys(pc.fb)) for (const k in pc.fb[id]) ok(Math.abs(pc.fb[id][k]) <= 0.06 + 1e-9, 'team shades are capped at 6%');
  // grudge + spar
  const r = LM.fighters; S.fr[[a.id, c.id].sort((x, y) => x - y).join('-')] = { bro: 0, fond: 0, jeal: 0, gr: 40, n: 0 };
  ok(LM.fKinds(S, a.id, c.id).includes('grudge'), 'grudge shows as a kind'); const tc = LM.teamCtx(S, [a, c], 'bal'); ok(tc.fb[a.id].atk < 0, 'a deep grudge costs damage on a shared team');
  a.en = c.en = 100; const sp = LM.fSparBout(S, a, c); ok(sp.win && sp.lose && !LM.fKinds(S, a.id, c.id).includes('grudge'), 'a sparring bout ends the grudge');
  const sp2 = LM.fSparBout(S, a, c); const sp3 = (() => { const S2 = mk('g', 3); return S2.glads.length; })(); ok(sp2.win, 'a second bout still resolves');
  // deterministic spar
  const S3 = mk('h', 2), S4 = JSON.parse(JSON.stringify(S3)); S3.glads.forEach((g) => { g.en = 100; }); S4.glads.forEach((g) => { g.en = 100; });
  ok(LM.fSparBout(S3, S3.glads[0], S3.glads[1]).win.id === LM.fSparBout(S4, S4.glads[0], S4.glads[1]).win.id, 'sparring is deterministic for the same seed and week');
  // fall
  const S5 = mk('i', 3); const [x, y, z] = S5.glads; LM.addBond(S5, x.id, y.id, 80); S5.fr = {}; S5.fr[[x.id, y.id].sort((p, q) => p - q).join('-')] = { bro: 1, fond: 0, jeal: 0, gr: 0, n: 3 }; y.mo = 70; z.mo = 70;
  const res = LM.fall(S5, x, { kind: 'event' }); ok(y.mo <= 70 - 12, `a sworn brother loses 12 morale at least (${y.mo})`); ok(Object.keys(S5.fr).length === 0, 'relations of the fallen are cleared'); ok(res && res.kin && res.kin.some((k) => k.id === y.id), 'the fall report names who grieves');
}
// 8. week pass: aging, relationships over time, never throws, bounded
{
  const S = mk('j', 5); const t0 = JSON.stringify(S.glads.map((g) => g.age)); let notes = 0;
  for (let w = 0; w < 150; w++) { S.week++; S.glads.forEach((g) => { g.en = 100; g.inj = 0; g.mo = 70; }); const rep = { notes: [] }; LM.fWeek(S, rep); notes += rep.notes.length; for (let i = 0; i < S.glads.length; i++) for (let j = i + 1; j < S.glads.length; j++) if (w % 3 === 0) LM.addBond(S, S.glads[i].id, S.glads[j].id, 4); S.glads.forEach((g) => { g.ll = g.ll || []; ok(g.ll.length <= 24, 'life log is bounded'); }); }
  ok(JSON.stringify(S.glads.map((g) => g.age)) !== t0 && S.glads.every((g) => g.age >= 19 + 12), 'fighters grow older with the weeks');
  const web = LM.fWeb(S); ok(web.sworn.length + web.friend.length > 0, 'time and bonds produce friends or sworn brothers'); ok(notes < 150, 'the weekly pass does not spam notes');
  ok(S.glads.every((g) => g.ll.length > 0), 'every fighter has a life log');
  ok(LM.fStage({ age: 25 }).id === 'prime' && LM.fStage({ age: 37 }).id === 'waning' && LM.fStage({ age: 44 }).id === 'old', 'age stages');
}
// 9. retirement: rudis, trainer, last fight
{
  const S = mk('k', 3, { lvl: 10 }); const [a, b, c] = S.glads; S.gold = 1000; const fee = 150 + 10 * 40;
  const o = LM.fRetireOpts(S, a); ok(o.length === 3 && o.every((x) => x.d && x.n), 'three retirement options');
  const g0 = S.gold; const r1 = LM.fRetire(S, a, 'rudis'); ok(r1.ok && S.gold === g0 - fee && !S.glads.includes(a) && S.freed.some((f) => f.name === a.name) && S.stats.freed === 1, 'rudis: fee paid, freed, recorded');
  const r2 = LM.fRetire(S, b, 'trainer'); ok(r2.ok && S.trainers.length === 1 && S.legends.some((l) => l.name === b.name), 'trainer: a legend and a permanent trainer');
  const up0 = LM.upkeep(S); ok(up0 >= 12, 'a trainer costs 12 gold upkeep');
  const pup = LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl: 2 }); S.glads.push(pup); LM.fEnsure(S, pup); pup.lvl = 2; pup.xp = 0; const rep = { notes: [] }; S.week += 1; LM.fWeek(S, rep); ok(pup.xp > 0 || pup.lvl > 2, 'the trainer coaches a pupil each week');
  const r3 = LM.fRetire(S, c, 'last'); ok(r3.ok && typeof c.swan === 'number', 'last fight is marked');
  const d1 = LM.derive(c, { noperf: true }); delete c.swan; const d0 = LM.derive(c, { noperf: true }); ok(d1.atk > d0.atk * 1.07 && d1.hp > d0.hp * 1.05, 'last fight adds +8% damage and +6% HP');
  c.swan = S.week; LM.settle(S, { title: 'T', kind: 'duel', league: 0, purse: 10, fame: 5, opps: [{ lvl: 3 }], week: 1 }, [c], { win: true, hype: 5 }); ok(c.swan === 'done', 'after the fight the last-fight flag is done'); S.week++; LM.fWeek(S, { notes: [] }); ok(!S.glads.includes(c) && S.legends.some((l) => l.name === c.name), 'then they retire to the Hall of Legends');
  const young = mk('l', 1, { lvl: 3 }).glads[0]; ok(LM.fRetire(mk('l', 1, { lvl: 3 }), young, 'trainer').err, 'low level cannot become a trainer');
}
// 10. look
{
  const S = mk('m', 1); const g = S.glads[0]; S.gold = 100;
  ok(LM.fLookCost(g, { hair: 'long' }) === 0, 'the first look is free'); ok(LM.fLookApply(S, g, { hair: 'braid', hairCol: '#8a5a2b', dye: '#2c4a8c', crest: '#f6b82d', tat: 'woad', face: 1, beard: 2 }) === '' && g.look.tat === 'woad' && g.look.face === 1, 'look applied');
  ok(LM.fLookCost(g, { hair: 'crop' }) === 10 && LM.fLookApply(S, g, { hair: 'crop', hairCol: 'javascript:1', tat: 'evil' }) === '' && !g.look.hairCol && !g.look.tat && S.gold === 90, 'later changes cost 10 gold and bad input is dropped');
  ok(LM.fLook({}).hair === null, 'a fighter without a look reads as null parts');
}
// 11. an end to end career: the sim still plays with the module on
{
  const S = mk('n', 3); S.glads.forEach((g) => { g.act = 'rest'; }); let thrown = 0;
  for (let w = 0; w < 60; w++) { try { LM.weekFinish ? LM.weekFinish(S) : LM.weekTrain(S); } catch (e) { thrown++; console.error(e.stack); break; } }
  ok(!thrown, 'sixty weeks run without an error'); ok(S.glads.every((g) => g.org && isFinite(g.mo)), 'state stays valid');
}
console.log(`ludus_maximus_3d_fighters: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
