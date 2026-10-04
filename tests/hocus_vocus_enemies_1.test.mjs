// Chapter 1 roster (js/data_enemies_1.js): the Whispering Bamboo Grove.
//
// What this suite proves, in order:
//   contract   DATA.validate('enemies', {chapter:1}) and DATA.audit('enemies', {chapter:1}) are clean (zero errors, zero warnings,
//              zero audit AND guide lines); the roster is exactly CONTENT_SPEC 4.1 (ids, names, tiers, sizes, boss title); lore, tags
//   bands      HP, per-hit and per-move damage, Block, heal, Thorns, Plating and status magnitudes stay inside CONTENT_SPEC 4.2,
//              computed from the fx ops (no hand-typed numbers)
//   roles      every enemy shows the role CONTENT_SPEC 4.1 gives it, and the chapter covers every mechanic of CONTENT_SPEC 4.3
//   encounters groups reference real chapter 1 enemies, ids are unique, sizes, the min spread, the group budget, elite and boss pools
//   ai         every move, every rule and every phase ai is REACHABLE (a random explorer over every AI condition), phases are ordered
//   fights     an enemy-side fight simulator (below) drives every group, elite and the boss against abstract party profiles: every move
//              executes, phases and summons behave, gold is stolen and returned, fights end, and fight length and damage land in band
//   engine     when js/combat.js and the Hanae and Kuro card files exist, every group is fought through COMBAT.simulate with real starter
//              and developed decks and the greedy bot (fight length, cost, every move used, phases, summon caps, the thief, intent text,
//              trial factors); skipped with a note otherwise
//
// The simulator is deliberately NOT the combat engine: it is a compact, independent reading of DESIGN 4.2 (the round) and 4.5 (enemy
// ops, AI resolution, phases, summons, hooks) with the party abstracted into a damage and Block budget per turn. It exists so this
// file can prove behaviour before combat.js is written and can cross-check it after. `RB_REPORT=1 node tests/hocus_vocus_enemies_1.test.mjs`
// prints the simulator's balance table; `RB_TRACE=moss_guardian@0.4 node ...` prints one simulated fight turn by turn.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus enemies_1');
const g = boot({ only: ['data_enemies_1'] });
const { DATA, U } = g;
const REPORT = !!process.env.RB_REPORT;
t.ok(!g._errors || g._errors.length === 0, 'data_enemies_1 loads without errors: ' + JSON.stringify(g._errors));

const L = DATA.LISTS;
const E = DATA.enemies;
const ROSTER = DATA.ROSTER[1];
const GUIDE = DATA.GUIDE;
const ch1 = Object.values(E).filter((e) => e.chapter === 1);
const tier = (name) => ch1.filter((e) => e.tier === name);
const P1 = DATA.encounters[1];
const groups = P1.normal.concat(P1.elite);
const DEBUFFS = Object.keys(DATA.statuses).filter((s) => DATA.statuses[s].kind === 'debuff');
const JUNK = DATA.FIXED.statusCards;
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');   // built at run time: this file must contain no dash characters itself

// ------------------------------------------------------------------ static helpers over the data
const opsOf = (fx) => { const a = []; DATA.walkOps(fx, (o) => a.push(o)); return a; };
const moveList = (e) => Object.keys(e.moves).map((k) => Object.assign({ key: k }, e.moves[k]));
const moveOps = (m) => opsOf(m.fx);
const allOps = (e) => [].concat(...moveList(e).map(moveOps), opsOf(e.start), ...(e.phases || []).map((p) => opsOf(p.fx)), ...(e.hooks || []).map((h) => opsOf(h.fx)));
const has = (e, pred) => allOps(e).some(pred);
const hasMove = (e, pred) => moveList(e).some((m) => pred(m, moveOps(m)));
const num = (v) => (typeof v === 'number' ? v : NaN);
// per move: biggest single hit, hits, and the raw total if everything lands (a 'both' hit lands on two heroes)
function dmgInfo(m) {
  let perHit = 0, total = 0, hits = 0;
  moveOps(m).filter((o) => o.op === 'dmg').forEach((o) => {
    const h = o.hits === undefined ? 1 : num(o.hits);
    perHit = Math.max(perHit, num(o.n)); hits = Math.max(hits, h);
    total += num(o.n) * h * (o.tgt === 'both' ? 2 : 1);
  });
  return { perHit, hits, total };
}
// DATA.audit's own group metric: seq or weighted average of n * hits per enemy (before Block, a 'both' hit counted once)
function avgDmg(e) {
  const dmg = (m) => moveOps(m).filter((o) => o.op === 'dmg').reduce((s, o) => s + o.n * Math.max(1, o.hits || 1), 0);
  const ai = e.ai;
  if (ai.weighted) { const tot = ai.weighted.reduce((s, x) => s + x[1], 0); return ai.weighted.reduce((s, x) => s + dmg(e.moves[x[0]]) * x[1] / tot, 0); }
  return ai.seq.reduce((s, m) => s + dmg(e.moves[m]), 0) / ai.seq.length;
}
const groupAvg = (grp) => grp.enemies.map((id) => E[id]).filter((e) => e.tier !== 'minion').reduce((s, e) => s + avgDmg(e), 0);
const statusOps = (e, pred) => allOps(e).filter((o) => o.op === 'status' && pred(o));
const heroSide = (o) => o.tgt === undefined || L.enemyHeroTgt.indexOf(o.tgt) >= 0;
const heroDebuff = (o) => heroSide(o) && DATA.isDebuff(o.s);
const selfBuff = (o, s) => o.s === s && (o.tgt === undefined || o.tgt === 'self');

// =====================================================================================================================
// 1. contract
// =====================================================================================================================
t.test('validate and audit are completely clean for chapter 1', () => {
  const v = DATA.validate('enemies', { chapter: 1 });
  t.eq(v.errors.length, 0, 'zero validation errors: ' + v.errors.join('; '));
  t.eq(v.warnings.length, 0, 'zero validation warnings: ' + v.warnings.join('; '));
  const a = DATA.audit('enemies', { chapter: 1 });
  t.eq(a.length, 0, 'zero audit and guide lines: ' + a.join('; '));
});

t.test('the roster is exactly CONTENT_SPEC 4.1: ids, names, tiers, sizes, boss title', () => {
  t.deep(ch1.map((e) => e.id).sort(), ROSTER.map((r) => r.id).sort(), 'the chapter defines exactly its roster and nothing else');
  t.eq(tier('normal').length, 10, '10 normals'); t.eq(tier('elite').length, 3, '3 elites'); t.eq(tier('minion').length, 3, '3 minions'); t.eq(tier('boss').length, 1, '1 boss');
  ROSTER.forEach((r) => {
    const e = E[r.id];
    t.ok(!!e, `${r.id} is defined`);
    if (!e) return;
    t.eq(e.name, r.name, `${r.id} name`); t.eq(e.tier, r.tier, `${r.id} tier`); t.eq(e.size, r.size, `${r.id} size`); t.eq(e.chapter, 1, `${r.id} chapter`);
    t.eq(e.art && e.art.id, r.id, `${r.id} art.id equals the id`);
    if (r.tier === 'boss') t.eq(e.title, (DATA.rosterById[r.id] || r).title, 'the boss title is the roster title');
  });
  t.eq(E.boss_kuzunoha.name, 'Kuzunoha', 'boss name');
});

t.test('every enemy has bestiary lore in voice (1 to 2 sentences) and honest tags', () => {
  const seenLore = new Set();
  ch1.forEach((e) => {
    t.ok(typeof e.lore === 'string' && e.lore.length >= 60 && e.lore.length <= 260, `${e.id} lore length ${e.lore && e.lore.length}`);
    const sentences = (e.lore.match(/[.!?](\s|$)/g) || []).length;
    t.ok(sentences >= 1 && sentences <= 2, `${e.id} lore has ${sentences} sentences (want 1 to 2)`);
    t.ok(!seenLore.has(e.lore), `${e.id} lore is unique`); seenLore.add(e.lore);
    t.ok(/^[A-Z]/.test(e.lore) && /[.!?]$/.test(e.lore), `${e.id} lore is a proper sentence`);
    t.ok(Array.isArray(e.tags) && e.tags.length >= 1 && e.tags.length <= 3 && e.tags.every((x) => L.enemyTags.indexOf(x) >= 0), `${e.id} tags`);
    t.ok(!DASH.test(JSON.stringify(e)), `${e.id} has no em or en dash`);
  });
  t.ok(E.paper_kodama.tags.indexOf('void') >= 0, 'the paper doll carries the Blank (void tag)');
  t.ok(E.hitodama.tags.indexOf('spirit') >= 0 && E.tanuki_bandit.tags.indexOf('beast') >= 0 && E.kappa.tags.indexOf('aquatic') >= 0 && E.crow_tengu.tags.indexOf('avian') >= 0, 'tags fit the creatures');
});

t.test('every move has a readable name, an honest kind and only plain numbers (chapter 1 uses no value expressions)', () => {
  const names = new Set();
  ch1.forEach((e) => moveList(e).forEach((m) => {
    const w = `${e.id}.${m.key}`;
    t.ok(m.name.length >= 3 && m.name.length <= 24, `${w} name "${m.name}" is 3 to 24 characters`);
    t.ok(L.intents.indexOf(m.kind) >= 0, `${w} kind`);
    if (m.say !== undefined) t.ok(m.say.length >= 3 && m.say.length <= 70, `${w} say line length`);
    moveOps(m).forEach((o) => { ['n', 'hits'].forEach((k) => { if (o[k] !== undefined) t.ok(typeof o[k] === 'number' && Number.isInteger(o[k]) && o[k] >= 1, `${w} ${o.op}.${k} is a positive whole number`); }); });
    names.add(e.id + ':' + m.name);
  }));
  // the intent icon must tell the truth about the MOST threatening part
  ch1.forEach((e) => moveList(e).forEach((m) => {
    const ops = moveOps(m).map((o) => o.op), info = dmgInfo(m), w = `${e.id}.${m.key}`;
    if (m.kind === 'multi') t.ok(info.hits >= 2, `${w} is a multi move and has 2+ hits`);
    if (m.kind === 'heavy') t.ok(info.hits === 1 && ops.indexOf('dmg') >= 0, `${w} is a heavy move: exactly one big hit`);
    if (m.kind === 'attack') t.ok(info.hits === 1 && ops.indexOf('dmg') >= 0, `${w} is an attack: a single hit`);
    if (ops.indexOf('dmg') >= 0 && ['attack', 'multi', 'heavy', 'special'].indexOf(m.kind) < 0) t.ok(false, `${w} deals damage under a ${m.kind} icon`);
    if (m.kind === 'defend') t.ok(ops.indexOf('dmg') < 0, `${w} defend deals no damage`);
  }));
});

// =====================================================================================================================
// 2. bands (CONTENT_SPEC 4.2, machine copy DATA.GUIDE)
// =====================================================================================================================
t.test('HP stays inside the chapter 1 band of its tier and the rolled range is narrow enough to read', () => {
  ch1.forEach((e) => {
    const g1 = GUIDE.hp[1][e.tier];
    t.ok(e.hp[0] >= g1[0] && e.hp[1] <= g1[1], `${e.id} hp ${e.hp} inside ${g1}`);
    t.ok(e.hp[1] - e.hp[0] <= (e.tier === 'boss' ? 20 : e.tier === 'elite' ? 12 : 8), `${e.id} hp range ${e.hp[1] - e.hp[0]} is not too wide`);
  });
});

t.test('normals: hits 4 to 9 (multi and both-hero hits may be lighter), heavy 12 to 14, Block 5 to 8, heal 6 to 10', () => {
  tier('normal').forEach((e) => moveList(e).forEach((m) => {
    const w = `${e.id}.${m.key}`, info = dmgInfo(m);
    moveOps(m).filter((o) => o.op === 'dmg').forEach((o) => {
      const light = o.hits > 1 || o.tgt === 'both';
      if (m.kind === 'heavy') t.ok(o.n >= 12 && o.n <= 14, `${w} heavy hit ${o.n} in 12..14`);
      else { t.ok(o.n <= 9, `${w} hit ${o.n} <= 9`); t.ok(o.n >= (light ? 2 : 4), `${w} hit ${o.n} is not toothless`); }
    });
    if (info.total) t.ok(info.total <= 14, `${w} total ${info.total} <= 14`);
    moveOps(m).filter((o) => o.op === 'block').forEach((o) => t.ok(o.n >= 5 && o.n <= 8, `${w} Block ${o.n} in 5..8`));
    moveOps(m).filter((o) => o.op === 'heal').forEach((o) => t.ok(o.n >= 6 && o.n <= 10, `${w} heal ${o.n} in 6..10`));
  }));
});

t.test('elites: single hits 8 to 14, multi hits 3 to 8, heavy 12 to 14, move totals at most 18, Block at most 8', () => {
  tier('elite').forEach((e) => moveList(e).forEach((m) => {
    const w = `${e.id}.${m.key}`, info = dmgInfo(m);
    moveOps(m).filter((o) => o.op === 'dmg').forEach((o) => {
      if (m.kind === 'heavy') t.ok(o.n >= 12 && o.n <= 14, `${w} heavy hit ${o.n} in 12..14`);
      else if (o.hits > 1) t.ok(o.n >= 3 && o.n <= 8, `${w} multi hit ${o.n} in 3..8`);
      else t.ok(o.n >= 8 && o.n <= 14, `${w} hit ${o.n} in 8..14`);
    });
    if (info.total) t.ok(info.total <= 18, `${w} total ${info.total} <= 18`);
    moveOps(m).filter((o) => o.op === 'block').forEach((o) => t.ok(o.n >= 5 && o.n <= 8, `${w} Block ${o.n} in 5..8`));
  }));
  (E.oni_brute.hooks || []).concat(E.tengu_duelist.hooks || []).forEach((h) => opsOf(h.fx).filter((o) => o.op === 'dmg').forEach((o) => t.ok(o.n <= 6, `hook damage ${o.n} stays a riposte, not a second attack`)));
});

t.test('minions: HP 6 to 14, hits 2 to 5, one or two moves, and they are all size s', () => {
  tier('minion').forEach((e) => {
    t.eq(e.size, 's', `${e.id} is small`);
    t.ok(e.hp[0] >= 6 && e.hp[1] <= 14, `${e.id} hp ${e.hp}`);
    t.ok(Object.keys(e.moves).length <= 2, `${e.id} has at most 2 moves`);
    moveList(e).forEach((m) => moveOps(m).filter((o) => o.op === 'dmg').forEach((o) => t.ok(o.n >= 2 && o.n <= 5, `${e.id}.${m.key} hit ${o.n} in 2..5`)));
    t.ok(!has(e, (o) => o.op === 'summon'), `${e.id} does not summon (no chains of minions)`);
  });
});

t.test('boss: hits 9 to 13, heavy 16 to 20, a round is at most 24 (30 in the last form), and the phase swing is real', () => {
  const b = E.boss_kuzunoha;
  const mightAt = (n) => n;   // Might added per hit by the phase fx
  const phaseMight = (b.phases[0].fx.filter((o) => o.op === 'status' && o.s === 'might').reduce((s, o) => s + o.n, 0));
  moveList(b).forEach((m) => {
    const w = `boss.${m.key}`, info = dmgInfo(m);
    moveOps(m).filter((o) => o.op === 'dmg').forEach((o) => {
      if (m.kind === 'heavy') t.ok(o.n >= 16 && o.n <= 20, `${w} heavy ${o.n} in 16..20`);
      else if (o.hits > 1) t.ok(o.n >= 2 && o.n <= 6, `${w} multi hit ${o.n} in 2..6`);
      else t.ok(o.n >= 9 && o.n <= 13, `${w} hit ${o.n} in 9..13`);
    });
    if (!info.total) return;
    // the first form has no Might; the second form has the phase Might on every hit
    const round1 = info.total, round2 = info.total + mightAt(phaseMight) * info.hits * (moveOps(m).filter((o) => o.op === 'dmg' && o.tgt === 'both').length ? 2 : 1);
    t.ok(round1 <= 24, `${w} first form round ${round1} <= 24`);
    t.ok(round2 <= 30, `${w} second form round ${round2} <= 30`);
  });
  moveList(b).filter((m) => m.kind === 'defend').forEach((m) => moveOps(m).filter((o) => o.op === 'block').forEach((o) => t.ok(o.n >= 5 && o.n <= 10, `boss Block ${o.n}`)));
  t.ok(b.phases.length === 1, 'two forms means one phases entry');
  t.ok(phaseMight >= 1 && phaseMight <= 2, 'the second form gains 1 to 2 Might');
  t.ok(dmgInfo(b.moves.nine_tails).total + phaseMight * 9 === 27, 'the Nine-Tail Storm is 27 with Might: nine hits');
});

t.test('status magnitudes on heroes and self buffs follow CONTENT_SPEC 4.2', () => {
  ch1.forEach((e) => allOps(e).filter((o) => o.op === 'status').forEach((o) => {
    const w = `${e.id} ${o.s}`;
    if (heroSide(o) && DATA.isDebuff(o.s)) {
      if (['weak', 'vulnerable', 'frail'].indexOf(o.s) >= 0) t.ok(o.n >= 1 && o.n <= (e.tier === 'boss' ? 3 : 2), `${w} on heroes n ${o.n}`);
      if (o.s === 'poison') t.ok(o.n >= 2 && o.n <= 4, `${w} n ${o.n} in 2..4`);
      if (o.s === 'burn') t.ok(o.n >= 3 && o.n <= 6, `${w} n ${o.n} in 3..6`);
      t.ok(['bind', 'stun'].indexOf(o.s) < 0, `${w}: Bind and Stun are chapter 2 tools`);
    }
    if (o.s === 'ritual') t.ok(o.n === 1 || (e.tier === 'boss' && o.n <= 2), `${w} ritual ${o.n}`);
    if (o.s === 'thorns') t.ok(o.n >= 1 && o.n <= 4, `${w} thorns ${o.n} in 1..4`);
    if (o.s === 'plating') t.ok(o.n >= 1 && o.n <= 5, `${w} plating ${o.n} in 1..5`);
    if (o.s === 'dodge') t.ok(o.n >= 1 && o.n <= 3, `${w} dodge ${o.n}`);
  }));
  // Thorns 2..4 and Plating 3..5 at the START of a fight, everywhere they are a start op
  ch1.forEach((e) => (e.start || []).forEach((o) => {
    if (o.s === 'thorns') t.ok(o.n >= 2 && o.n <= 4, `${e.id} start thorns ${o.n}`);
    if (o.s === 'plating') t.ok(o.n >= 3 && o.n <= 5, `${e.id} start plating ${o.n}`);
  }));
  // enemy debuffs on THEMSELVES with a duration must be n >= 2 to survive the end-of-round tick (heroes get the fresh flag, enemies do not)
  ch1.forEach((e) => allOps(e).filter((o) => o.op === 'status' && DATA.statuses[o.s] && DATA.statuses[o.s].stack === 'dur' && o.tgt === 'self').forEach((o) => t.ok(o.n >= 2, `${e.id} self ${o.s} needs n >= 2`)));
});

// =====================================================================================================================
// 3. roles (CONTENT_SPEC 4.1) and mechanic coverage (CONTENT_SPEC 4.3)
// =====================================================================================================================
const seqOf = (e) => (e.ai.seq || []);
const seqIndex = (e, m) => seqOf(e).indexOf(m);
const kindOf = (e, key) => e.moves[key].kind;
const usesMove = (ai, key) => [].concat(ai.open || [], ai.seq || [], (ai.weighted || []).map((x) => x[0]), (ai.rules || []).map((r) => r.do)).indexOf(key) >= 0;

t.test('kappa: steady hits, then guards; teaches Vulnerable and Block', () => {
  const e = E.kappa;
  t.ok(hasMove(e, (m, ops) => m.kind === 'attack' && ops.some((o) => o.op === 'status' && o.s === 'vulnerable' && heroSide(o))), 'an attack leaves the front hero Vulnerable');
  t.ok(hasMove(e, (m) => m.kind === 'defend'), 'it guards');
  t.deep(seqOf(e).map((k) => kindOf(e, k)), ['attack', 'attack', 'defend'], 'two hits then a guard');
  t.ok(e.ai.rules.some((r) => r.if.hpLt !== undefined && r.if.hpLt <= 0.5 && r.once && kindOf(e, r.do) === 'heal'), 'it refills its dish once at half HP');
});

t.test('tanuki_bandit: steals gold up front, hits, then flees with it', () => {
  const e = E.tanuki_bandit;
  const s = seqOf(e);
  t.ok(s.length === 3 && kindOf(e, s[2]) === 'flee', 'the seq ends in a flee');
  t.ok(moveOps(e.moves[s[0]]).some((o) => o.op === 'stealGold' && o.n >= 15 && o.n <= 25), 'it opens with the snatch: about a fight of gold, telegraphed from turn 1');
  t.ok(moveOps(e.moves[s[1]]).every((o) => o.op !== 'stealGold' && o.op !== 'flee') && dmgInfo(e.moves[s[1]]).perHit >= 6, 'then a plain club thump');
  t.ok(e.hp[0] >= 28 && e.hp[1] <= 36, 'sturdy enough that a starter party needs two focused turns, so the theft is real and the chase is fair');
  t.ok(dmgInfo(e.moves[s[0]]).perHit <= 5, 'the snatch itself hits lightly: the gold is the threat');
});

t.test('kodama: rattles both heroes lightly and calls a Leaf Imp', () => {
  const e = E.kodama;
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'dmg' && o.tgt === 'both' && o.n <= 4)), 'a light hit on both heroes');
  const call = moveList(e).find((m) => moveOps(m).some((o) => o.op === 'summon'));
  t.ok(call && moveOps(call).every((o) => o.enemy === 'leaf_imp' && o.n <= 2), 'it calls leaf_imp');
  t.ok(e.ai.rules.some((r) => r.do === call.key && r.if.minions && r.if.minions.lt <= 2), 'the summon is capped at 2 living minions');
  t.eq(e.size, 's', 'small');
});

t.test('karakasa: hops in for two quick hits, then snaps shut for Block', () => {
  const e = E.karakasa;
  t.ok(hasMove(e, (m, ops) => m.kind === 'multi' && ops.some((o) => o.op === 'dmg' && o.hits === 2)), 'a two hit hop');
  t.ok(hasMove(e, (m) => m.kind === 'defend'), 'it snaps shut for Block');
  t.deep(seqOf(e).slice(0, 2).map((k) => kindOf(e, k)), ['multi', 'defend'], 'the hop comes first and the snap right after it');
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'status' && o.s === 'frail' && heroSide(o))), 'the lick teaches Frail');
});

t.test('hitodama: frail and fast, burns the front hero and leaves scorch cards', () => {
  const e = E.hitodama;
  t.ok(e.hp[1] <= 24, 'frail: among the smallest HP of the chapter');
  t.ok((e.start || []).some((o) => selfBuff(o, 'dodge')), 'fast: it starts with Dodge');
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'status' && o.s === 'burn' && (o.tgt === 'front' || o.tgt === undefined))), 'it burns the front hero');
  t.ok(hasMove(e, (m, ops) => m.kind === 'debuff' && ops.some((o) => o.op === 'add' && o.card === 'status_scorch')), 'it adds scorch cards');
  t.ok(e.immune.indexOf('burn') >= 0, 'a flame does not burn');
});

t.test('oni_cub: gains Might every turn', () => {
  const e = E.oni_cub;
  t.ok((e.start || []).some((o) => selfBuff(o, 'ritual') && o.n === 1), 'Ritual 1 from the first round');
  t.ok(hasMove(e, (m) => m.kind === 'multi'), 'a multi move, where Might hurts most');
});

t.test('crow_tengu: dives on the back row and pecks in flurries', () => {
  const e = E.crow_tengu;
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'dmg' && o.tgt === 'back')), 'a back row dive');
  t.ok(hasMove(e, (m, ops) => m.kind === 'multi' && ops.some((o) => o.op === 'dmg' && o.hits === 3)), 'a three hit flurry');
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'swap')), 'a trickster swap of the heroes');
  t.ok(e.ai.weighted && e.ai.noRepeat >= 1, 'weighted with noRepeat: unpredictable, never the same twice');
});

t.test('bamboo_sprite: arrives in packs, three tiny hits per turn', () => {
  const e = E.bamboo_sprite;
  t.ok(hasMove(e, (m, ops) => m.kind === 'multi' && ops.some((o) => o.op === 'dmg' && o.hits === 3 && o.n <= 3)), 'three tiny hits');
  t.ok(e.size === 's', 'small');
  const packs = groups.filter((x) => x.enemies.filter((id) => id === 'bamboo_sprite').length >= 2);
  t.ok(packs.length >= 2 && packs.some((x) => x.enemies.length === 3), 'a pair and a swarm exist as groups');
});

t.test('mushroom_folk: poisons the front hero and grows Thorns', () => {
  const e = E.mushroom_folk;
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'status' && o.s === 'poison' && (o.tgt === 'front' || o.tgt === undefined))), 'Poison on the front hero');
  const grow = moveList(e).find((m) => m.kind === 'buff' && moveOps(m).some((o) => selfBuff(o, 'thorns')));
  t.ok(grow && e.ai.open && e.ai.open[0] === grow.key, 'it grows its cap first, so the Thorns are up by the party\'s second turn');
  t.ok(e.ai.rules.some((r) => r.do === grow.key), 'and grows it again later');
  t.ok(moveOps(grow).every((o) => o.n >= 2 && o.n <= 3), 'by 2 or 3 at a time');
  t.ok(!(e.start || []).some((o) => o.s === 'thorns'), 'the first turn is free: the Thorns are not there yet');
  t.ok(e.immune.indexOf('poison') >= 0, 'spores do not poison spores');
});

t.test('bamboo_boar: gains Plating, winds up (telegraph), then one heavy gore', () => {
  const e = E.bamboo_boar;
  t.ok((e.start || []).some((o) => selfBuff(o, 'plating')), 'Plating from the start');
  t.deep(seqOf(e).map((k) => kindOf(e, k)), ['buff', 'heavy', 'attack'], 'bristle, then the telegraphed gore, then a barge');
  t.ok(moveOps(e.moves[seqOf(e)[0]]).some((o) => selfBuff(o, 'plating')), 'the bristle adds Plating');
  const gore = moveList(e).find((m) => m.kind === 'heavy');
  t.ok(gore && dmgInfo(gore).hits === 1, 'one heavy gore');
  t.eq(e.size, 'l', 'large');
});

t.test('oni_brute: heavy hits and Weak, and it enrages below half HP', () => {
  const e = E.oni_brute;
  t.ok(hasMove(e, (m) => m.kind === 'heavy'), 'heavy hit');
  t.ok(statusOps(e, (o) => o.s === 'weak' && heroSide(o)).length >= 2, 'Weak on the party and on the front hero');
  t.eq(e.phases.length, 1, 'one enrage phase');
  const p = e.phases[0];
  t.ok(p.at > 0.4 && p.at <= 0.5, 'below half HP');
  t.ok(p.say && p.say.length > 5, 'with a say line');
  t.ok(p.fx.some((o) => selfBuff(o, 'might') && o.n >= 2), 'the enrage swings Might');
  t.ok(p.ai && p.ai.open && kindOf(e, p.ai.open[0]) === 'defend', 'a bellow gives the player a breather turn first');
  t.ok(usesMove(p.ai, 'club_smash') && usesMove(p.ai, 'twin_swing'), 'the enraged cycle keeps the big hits');
});

t.test('tengu_duelist: strikes the back row, gains Dodge, and ripostes', () => {
  const e = E.tengu_duelist;
  t.ok(hasMove(e, (m, ops) => ops.some((o) => o.op === 'dmg' && o.tgt === 'back')), 'back row lunge');
  t.ok(statusOps(e, (o) => selfBuff(o, 'dodge')).length >= 2, 'Dodge from a stance and from the blade dance');
  const hook = (e.hooks || []).find((h) => h.on === 'onHurt');
  t.ok(hook && hook.limit === 1 && opsOf(hook.fx).some((o) => o.op === 'dmg' && o.tgt === 'front'), 'a riposte: when hurt it strikes back once per round');
  t.ok(e.ai.rules.some((r) => r.if.hpLt === 0.5 && r.once), 'a half HP rule');
});

t.test('moss_guardian: Plating and Thorns, slow slams, calls Leaf Imps', () => {
  const e = E.moss_guardian;
  t.ok((e.start || []).some((o) => selfBuff(o, 'plating')) && (e.start || []).some((o) => selfBuff(o, 'thorns')), 'Plating and Thorns at the start');
  t.ok(hasMove(e, (m) => m.kind === 'heavy'), 'a slam');
  const call = moveList(e).find((m) => moveOps(m).some((o) => o.op === 'summon'));
  t.ok(call && moveOps(call).every((o) => o.enemy === 'leaf_imp'), 'it calls leaf_imp');
  t.ok(e.ai.rules.some((r) => r.do === call.key && r.if.minions && r.if.minions.lt === 1), 'it only calls when no imp is left (2 at once, never more)');
  t.ok(seqOf(e).length === 2 && kindOf(e, seqOf(e)[1]) === 'heavy', 'slow: a slam every other turn');
  t.ok(e.immune === undefined || e.immune.indexOf('poison') < 0, 'not immune to Poison: the Blight decks keep an answer');
});

t.test('minions: ember_wisp burns once then fizzles, leaf_imp pokes, paper_kodama clogs the deck', () => {
  const w = E.ember_wisp;
  t.deep(seqOf(w).map((k) => kindOf(w, k)), ['attack', 'flee'], 'ember wisp: one burn then it leaves');
  t.ok(moveOps(w.moves[seqOf(w)[0]]).some((o) => o.op === 'status' && o.s === 'burn'), 'and the burn is real');
  const l = E.leaf_imp;
  t.eq(Object.keys(l.moves).length, 1, 'leaf imp has one weak poke'); t.ok(dmgInfo(l.moves[seqOf(l)[0]]).perHit <= 3, 'weak');
  const p = E.paper_kodama;
  t.ok(hasMove(p, (m, ops) => m.kind === 'debuff' && ops.some((o) => o.op === 'add' && o.card === 'status_blot')), 'paper kodama adds blot cards');
});

t.test('boss_kuzunoha: ink strikes and paper kodama, then all nine tails at once', () => {
  const b = E.boss_kuzunoha;
  t.ok(b.ai.open && b.ai.open.length >= 1 && kindOf(b, b.ai.open[0]) === 'summon', 'the opening is the paper fold');
  t.ok(moveOps(b.moves[b.ai.open[0]]).every((o) => o.enemy === 'paper_kodama' && o.n === 2), 'two paper kodama');
  t.ok(b.ai.rules.length >= 3, 'rule-based special moves');
  t.ok(b.ai.rules.some((r) => r.if.minions && r.if.minions.lt === 1 && kindOf(b, r.do) === 'summon'), 're-fold only when all the kodama are gone (never more than 2)');
  t.ok(b.ai.rules.some((r) => r.if.heroHpLt !== undefined && moveOps(b.moves[r.do]).some((o) => o.tgt === 'lowest')), 'hunts a hero that is nearly down');
  t.ok(b.ai.rules.some((r) => r.if.turnGte >= 12 && r.once), 'punishes stalling');
  t.ok(hasMove(b, (m) => m.kind === 'heavy'), 'a telegraphed heavy stroke in the first form');
  t.ok(hasMove(b, (m, ops) => ops.some((o) => o.op === 'dmg' && o.tgt === 'both')), 'a sweep across both heroes');
  t.ok(hasMove(b, (m, ops) => ops.some((o) => o.op === 'add' && o.card === 'status_blot' && o.n >= 2)), 'blots');
  t.ok(hasMove(b, (m, ops) => ops.some((o) => o.op === 'status' && o.s === 'weak' && o.tgt === 'both')), 'a gaze that Weakens the party');
  // the signature move
  const nine = b.moves.nine_tails;
  t.ok(nine && nine.kind === 'multi' && moveOps(nine).some((o) => o.op === 'dmg' && o.hits === 9 && o.tgt === 'random'), 'the Nine-Tail Storm: nine random hits');
  t.ok(usesMove(b.phases[0].ai, 'nine_tails') && !usesMove(b.ai, 'nine_tails'), 'only the second form has the storm');
  t.ok(b.moves.tails_rise && b.moves.tails_rise.kind === 'defend', 'a telegraph turn (the tails rise) precedes it');
  const s = b.phases[0].ai.seq;
  t.eq(s[(s.indexOf('nine_tails') + s.length - 1) % s.length], 'tails_rise', 'in the cycle the rise is always the turn before the storm');
  t.eq(b.phases[0].ai.open[0], 'tails_rise', 'and the second form OPENS with the rise: a fair warning right after the phase');
  // the phase
  const p = b.phases[0];
  t.ok(p.at === 0.5 && p.say.length > 20, 'phase at half HP with a say line');
  t.ok(p.fx.some((o) => o.op === 'removeStatus' && o.s === 'debuffs' && o.tgt === 'self'), 'the mask splitting washes off debuffs');
  t.ok(p.fx.some((o) => selfBuff(o, 'might') && o.n >= 1), 'a Might swing');
  t.ok(p.fx.some((o) => o.op === 'status' && o.s === 'vulnerable' && o.tgt === 'self' && o.n >= 2), 'and an exposed window (Vulnerable 2 on herself, n 2 to outlast the tick)');
  t.ok(opsOf(p.fx).some((o) => o.op === 'summon' && o.enemy === 'paper_kodama'), 'the split mask becomes kodama');
  t.ok(p.ai.rules.length >= 2 && p.ai.open.length >= 1, 'the second form keeps open and rules');
  t.ok(b.immune.indexOf('stun') >= 0, 'explicit stun immunity');
});

t.test('CONTENT_SPEC 4.3 mechanic coverage, counted here as well as by the audit', () => {
  const field = ch1.filter((e) => e.tier !== 'minion');
  const count = (pred) => ch1.filter(pred).length;
  t.ok(count((e) => e.tier !== 'minion' && has(e, (o) => o.op === 'dmg' && (o.tgt === 'back' || o.tgt === 'both'))) >= 2, 'strikes the back row or all heroes: >= 2');
  t.ok(count((e) => e.tier !== 'minion' && has(e, (o) => o.op === 'dmg' && o.tgt === 'back')) >= 2, 'strikes the BACK row specifically: >= 2 (crow, duelist)');
  t.ok(count((e) => has(e, (o) => o.op === 'dmg' && o.tgt === 'both')) >= 2, 'hits both heroes: kodama and the boss');
  const debuffers = ch1.filter((e) => has(e, (o) => o.op === 'status' && heroDebuff(o)));
  t.ok(debuffers.length >= 5, `debuffs heroes: ${debuffers.map((e) => e.id).join(', ')}`);
  ['vulnerable', 'weak', 'frail', 'poison', 'burn'].forEach((s) => t.ok(ch1.some((e) => has(e, (o) => o.op === 'status' && o.s === s && heroSide(o))), `something applies ${s} to heroes`));
  const summoners = ch1.filter((e) => has(e, (o) => o.op === 'summon'));
  t.ok(summoners.length >= 3, `summoners: ${summoners.map((e) => e.id).join(', ')}`);
  summoners.forEach((e) => opsOf([].concat(...moveList(e).map((m) => m.fx), ...(e.phases || []).map((p) => p.fx))).filter((o) => o.op === 'summon').forEach((o) => {
    t.ok(E[o.enemy] && E[o.enemy].tier === 'minion' && E[o.enemy].chapter === 1, `${e.id} summons a chapter 1 minion (${o.enemy})`);
    t.ok(o.n >= 1 && o.n <= 2, `${e.id} summon n ${o.n}`);
  }));
  t.ok(count((e) => has(e, (o) => o.op === 'status' && (o.s === 'thorns' || o.s === 'plating') && (o.tgt === undefined || o.tgt === 'self'))) >= 3, 'Thorns or Plating: mushroom, boar, guardian');
  const multis = field.filter((e) => hasMove(e, (m) => m.kind === 'multi'));
  t.ok(multis.length >= 5, `multi hitters: ${multis.map((e) => e.id).join(', ')}`);
  const junkers = ch1.filter((e) => has(e, (o) => o.op === 'add'));
  t.ok(junkers.length >= 3, `junk adders: ${junkers.map((e) => e.id).join(', ')}`);
  ch1.forEach((e) => allOps(e).filter((o) => o.op === 'add').forEach((o) => { t.ok(JUNK.indexOf(o.card) >= 0, `${e.id} adds ${o.card}: a fixed status card`); t.ok(o.to === 'draw' || o.to === 'discard' || o.to === undefined, `${e.id} add.to`); t.ok(o.n <= 2, `${e.id} adds at most 2 at a time`); }));
  t.ok(ch1.some((e) => has(e, (o) => o.op === 'stealGold')) && ch1.some((e) => has(e, (o) => o.op === 'flee')), 'the thief and the fleeing wisp');
  t.ok(ch1.some((e) => has(e, (o) => o.op === 'swap')), 'a forced swap exists (the two-row system is attacked, not just used)');
  t.ok(ch1.some((e) => has(e, (o) => o.op === 'heal')) && ch1.some((e) => has(e, (o) => o.op === 'block')), 'heals and Block moves');
  // every elite: a signature mechanic with a rules entry or a phase
  tier('elite').forEach((e) => t.ok((e.ai.rules && e.ai.rules.length) || (e.phases && e.phases.length), `${e.id} has a rule or a phase`));
  // the spectrum of intent icons a new player must learn
  const kinds = new Set(ch1.flatMap((e) => moveList(e).map((m) => m.kind)));
  ['attack', 'multi', 'heavy', 'defend', 'buff', 'debuff', 'summon', 'heal', 'special', 'flee'].forEach((k) => t.ok(kinds.has(k), `the chapter uses the ${k} intent`));
  // the fast, the punishing and the stalling: each idea appears more than once
  t.ok(ch1.filter((e) => has(e, (o) => selfBuff(o, 'ritual') || selfBuff(o, 'might'))).length >= 4, 'Might growth appears on several enemies (cub, sprite, duelist, brute, boss)');
  t.ok(ch1.filter((e) => e.phases || (e.ai.rules || []).some((r) => r.once)).length >= 4, 'threshold rules and phases appear on several enemies');
});

// =====================================================================================================================
// 4. encounters
// =====================================================================================================================
t.test('encounter pools: real enemies, unique ids, sizes, tiers', () => {
  const ids = groups.map((x) => x.id);
  t.eq(new Set(ids).size, ids.length, 'group ids are unique');
  t.ok(P1.normal.length >= 12, `at least 12 normal groups (have ${P1.normal.length})`);
  t.eq(P1.elite.length, 3, 'exactly 3 elite groups');
  t.eq(P1.boss, 'boss_kuzunoha', 'the boss encounter');
  groups.forEach((x) => {
    t.ok(/^ch1_[a-z0-9_]+$/.test(x.id), `${x.id} id shape`);
    t.ok(x.enemies.length >= 1 && x.enemies.length <= 3, `${x.id} size ${x.enemies.length}`);
    t.ok(x.w > 0 && x.min >= 0 && x.min <= 0.8, `${x.id} w and min`);
    x.enemies.forEach((id) => t.ok(E[id] && E[id].chapter === 1 && E[id].tier !== 'boss', `${x.id} references a real chapter 1 non-boss enemy (${id})`));
  });
  P1.normal.forEach((x) => { t.ok(x.enemies.some((id) => E[id].tier === 'normal'), `${x.id} has a normal enemy`); t.ok(x.enemies.every((id) => E[id].tier !== 'elite'), `${x.id} has no elite`); });
  P1.elite.forEach((x) => { t.eq(x.enemies.filter((id) => E[id].tier === 'elite').length, 1, `${x.id} has exactly one elite`); t.ok(x.enemies.every((id) => E[id].tier === 'elite' || E[id].tier === 'minion'), `${x.id} pairs only minions with its elite`); });
  t.deep(P1.elite.map((x) => x.enemies.find((id) => E[id].tier === 'elite')).sort(), ['moss_guardian', 'oni_brute', 'tengu_duelist'], 'each elite has its own group');
});

t.test('min values spread from 0 to 0.8 and difficulty climbs with min', () => {
  const mins = P1.normal.map((x) => x.min);
  t.ok(mins.filter((m) => m <= 0.1).length >= 3, 'at least 3 groups at min <= 0.1');
  t.ok(mins.filter((m) => m >= 0.6).length >= 2, 'at least 2 groups at min >= 0.6');
  t.eq(Math.min(...mins), 0, 'the first groups are available from tile diff 0'); t.eq(Math.max(...mins), 0.8, 'the last group needs 0.8');
  t.ok(new Set(mins).size >= 9, `min values are spread (${new Set(mins).size} distinct)`);
  // an easy tile must never roll a hard group: every group at min <= 0.1 is either a tutorial solo or two light enemies
  P1.normal.filter((x) => x.min <= 0.1).forEach((x) => t.ok(groupAvg(x) <= 9, `${x.id} at min ${x.min} is light (${groupAvg(x).toFixed(1)})`));
  // threat rises with min: the mean of the top third is clearly above the mean of the bottom third
  const sorted = P1.normal.slice().sort((a, b) => a.min - b.min), third = Math.floor(sorted.length / 3);
  const mean = (arr) => arr.reduce((s, x) => s + groupAvg(x), 0) / arr.length;
  t.ok(mean(sorted.slice(-third)) > mean(sorted.slice(0, third)) + 2, 'late groups carry clearly more threat than early ones');
  const hp = (x) => x.enemies.reduce((s, id) => s + (E[id].hp[0] + E[id].hp[1]) / 2, 0);
  t.ok(hp(sorted[sorted.length - 1]) > hp(sorted[0]) * 1.4, 'and more total HP');
  // elites: the slow wall first, the trickster last
  const eliteMin = (id) => P1.elite.find((x) => x.enemies.indexOf(id) >= 0).min;
  t.ok(eliteMin('moss_guardian') <= eliteMin('oni_brute') && eliteMin('oni_brute') <= eliteMin('tengu_duelist'), 'elite min order: guardian, brute, duelist');
});

t.test('the pool a tile rolls from gets harder as the tile gets deeper (weights and min together)', () => {
  const expected = (diff) => { const pool = DATA.eligibleGroups(1, 'normal', diff), w = pool.reduce((a, x) => a + x.w, 0); return { pool, threat: pool.reduce((a, x) => a + x.w * groupAvg(x), 0) / w, hp: pool.reduce((a, x) => a + x.w * x.enemies.reduce((h, id) => h + (E[id].hp[0] + E[id].hp[1]) / 2, 0), 0) / w }; };
  const at = [0, 0.2, 0.5, 0.8, 1].map(expected);
  for (let i = 1; i < at.length; i++) { t.ok(i === 4 ? at[i].threat >= at[i - 1].threat : at[i].threat > at[i - 1].threat, `expected threat rises from diff step ${i - 1} to ${i} (${at[i - 1].threat.toFixed(2)} to ${at[i].threat.toFixed(2)}; every group is in by diff 0.8)`); t.ok(at[i].hp >= at[i - 1].hp, 'and so does expected HP'); }
  t.ok(at[4].threat >= at[0].threat + 2.5, `the deepest tiles are clearly harder than the first (${at[0].threat.toFixed(1)} vs ${at[4].threat.toFixed(1)})`);
  t.ok(at[0].pool.length >= 3, 'tile diff 0 has at least 3 groups to roll from');
  // the easiest groups never crowd out the hard ones at the deepest tiles
  const deep = at[4].pool, wSum = deep.reduce((a, x) => a + x.w, 0), hardW = deep.filter((x) => x.min >= 0.45).reduce((a, x) => a + x.w, 0);
  t.ok(hardW / wSum >= 0.4, `at diff 1 the later groups hold ${(100 * hardW / wSum).toFixed(0)} percent of the weight (want 40 or more)`);
  // elites: every elite is available from its min and the pool never runs out
  [0.25, 0.3, 0.4, 0.9].forEach((d) => t.ok(DATA.eligibleGroups(1, 'elite', d).length >= 1, `an elite group exists at diff ${d}`));
});

t.test('group budget: summed average round damage before Block (audit metric)', () => {
  P1.normal.forEach((x) => {
    const s = groupAvg(x);
    t.ok(s <= GUIDE.budget[1].normal[1], `${x.id} ${s.toFixed(1)} <= ${GUIDE.budget[1].normal[1]}`);
    if (x.enemies.filter((id) => E[id].tier !== 'minion').length >= 2) t.ok(s >= GUIDE.budget[1].normal[0], `${x.id} ${s.toFixed(1)} >= ${GUIDE.budget[1].normal[0]} (pairs and swarms carry the full budget)`);
    else t.ok(s >= 3, `${x.id} solo ${s.toFixed(1)}: a solo with a guard turn cannot reach 8, but it must still threaten`);
  });
  P1.elite.forEach((x) => {
    const s = groupAvg(x);
    t.ok(s <= GUIDE.budget[1].elite[1], `${x.id} ${s.toFixed(1)} <= ${GUIDE.budget[1].elite[1]}`);
    t.ok(s >= 10, `${x.id} ${s.toFixed(1)} >= 10 (its riders, Thorns and phases carry the rest of the 14 to 22)`);
  });
  // no group repeats a summoner (two callers roll against the same minion count and overshoot the cap of 2)
  groups.forEach((x) => t.ok(x.enemies.filter((id) => has(E[id], (o) => o.op === 'summon')).length <= 1, `${x.id} has at most one summoner`));
  // minions never count toward the budget, so an elite group may add at most 1 of them
  P1.elite.forEach((x) => t.ok(x.enemies.filter((id) => E[id].tier === 'minion').length <= 1, `${x.id} at most one bonus minion`));
});

t.test('every enemy is met: normals and minions appear in groups or summons, each normal both alone and in company', () => {
  const inGroups = new Set(groups.flatMap((x) => x.enemies));
  const summoned = new Set(ch1.flatMap((e) => allOps(e).filter((o) => o.op === 'summon').map((o) => o.enemy)));
  tier('normal').concat(tier('elite')).forEach((e) => t.ok(inGroups.has(e.id), `${e.id} appears in a group`));
  tier('minion').forEach((e) => t.ok(inGroups.has(e.id) || summoned.has(e.id), `${e.id} is used`));
  ['leaf_imp', 'paper_kodama'].forEach((id) => t.ok(summoned.has(id), `${id} is summoned`));
  tier('normal').forEach((e) => t.ok(groups.filter((x) => x.enemies.indexOf(e.id) >= 0).length >= 2, `${e.id} appears in at least 2 groups`));
  // the tutorial fights: the very first group can be a kappa and it teaches Block and Vulnerable
  t.ok(P1.normal.some((x) => x.min === 0 && x.enemies.length === 1 && x.enemies[0] === 'kappa'), 'a lone kappa is the gentlest opening');
  t.ok(P1.normal.some((x) => x.enemies.indexOf('tanuki_bandit') >= 0 && x.min <= 0.2), 'the thief shows up early enough to teach "kill it first"');
});

// =====================================================================================================================
// 5. AI: resolution, reachability, ordering (DESIGN 4.5 "AI resolution" and "AI conditions", read here independently of COMBAT)
// =====================================================================================================================
// ctx x = {turn, hpFrac, minions, alone, heroStatus(s), heroDown, allyHpFrac, heroHpFrac}
function condAi(x, c) {
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (k === 'turnEvery') { if ((x.turn - 1) % v[0] !== v[1]) return false; }
    else if (k === 'turnGte') { if (!(x.turn >= v)) return false; }
    else if (k === 'hpLt') { if (!(x.hpFrac < v)) return false; }
    else if (k === 'hpGt') { if (!(x.hpFrac > v)) return false; }
    else if (k === 'alone') { if (!x.alone) return false; }
    else if (k === 'minions') { if (!(x.minions < v.lt)) return false; }
    else if (k === 'heroStatus') { if (!(x.heroStatus(v.s) >= (v.gte === undefined ? 1 : v.gte))) return false; }
    else if (k === 'heroDown') { if (!x.heroDown) return false; }
    else if (k === 'allyHpLt') { if (!(x.allyHpFrac < v)) return false; }
    else if (k === 'heroHpLt') { if (!(x.heroHpFrac < v)) return false; }
    else throw new Error('unknown ai condition ' + k);
  }
  return true;
}
const newAiState = () => ({ openIdx: 0, seqIdx: 0, fired: {}, recent: [] });
function resolveAi(aiDef, st, x, rng) {
  let out;
  if (aiDef.open && st.openIdx < aiDef.open.length) out = { move: aiDef.open[st.openIdx++], how: 'open' };
  if (!out) {
    const rules = aiDef.rules || [];
    for (let i = 0; i < rules.length && !out; i++) {
      const r = rules[i];
      if (r.once && st.fired[i]) continue;
      if (condAi(x, r.if)) { if (r.once) st.fired[i] = true; out = { move: r.do, how: 'rule' + i }; }
    }
  }
  if (!out && aiDef.seq) { out = { move: aiDef.seq[st.seqIdx % aiDef.seq.length], how: 'seq' }; st.seqIdx++; }
  if (!out) {
    let pool = aiDef.weighted;
    const n = aiDef.noRepeat;
    if (n) { const f = pool.filter((p) => !(st.recent.length >= n && st.recent.slice(-n).every((r) => r === p[0]))); if (f.length) pool = f; }
    out = { move: rng.weighted(pool), how: 'weighted' };
  }
  st.recent.push(out.move);
  return out;
}

t.test('AI resolution reads exactly as DESIGN 4.5 says (open first, then rules in order, then seq or weighted)', () => {
  const rng = U.rng(1);
  const ai = { open: ['a'], seq: ['b', 'c'], rules: [{ if: { hpLt: 0.5 }, do: 'r', once: true }, { if: { turnEvery: [3, 2] }, do: 's' }] };
  const st = newAiState();
  const ctx = (o) => Object.assign({ turn: 1, hpFrac: 1, minions: 0, alone: false, heroStatus: () => 0, heroDown: false, allyHpFrac: 1, heroHpFrac: 1 }, o);
  t.eq(resolveAi(ai, st, ctx({ hpFrac: 0.1 }), rng).move, 'a', 'the opener is not pre-empted by rules');
  t.eq(resolveAi(ai, st, ctx({ turn: 2, hpFrac: 0.4 }), rng).move, 'r', 'a rule fires after the opener');
  t.eq(resolveAi(ai, st, ctx({ turn: 3, hpFrac: 0.4 }), rng).move, 's', 'the once rule is skipped afterwards, the next rule fires (turn 3 is offset 2)');
  t.eq(resolveAi(ai, st, ctx({ turn: 4, hpFrac: 0.4 }), rng).move, 'b', 'moves picked by rules did not advance the seq');
  t.eq(resolveAi(ai, st, ctx({ turn: 5 }), rng).move, 'c', 'seq continues');
  t.eq(resolveAi(ai, st, ctx({ turn: 6 }), rng).move, 's', 'turn 6 is offset 2 again: the rule fires and the cursor stays');
  t.eq(resolveAi(ai, st, ctx({ turn: 7 }), rng).move, 'b', 'and the seq wraps');
});

// A random explorer over every AI condition: which moves and which rules can ever be chosen?
function explore(def, aiDef, startTurns, runs) {
  const rng = U.rng(U.hash('explore', def.id, startTurns.join(',')));
  const seen = new Set(), rules = new Set();
  const hp = [1, 0.95, 0.8, 0.6, 0.45, 0.3, 0.2, 0.1];
  for (let r = 0; r < runs; r++) {
    const st = newAiState();
    let turn = rng.pick(startTurns);
    for (let step = 0; step < 60; step++) {
      const sset = new Set(DEBUFFS.filter(() => rng.chance(0.4)));
      const x = { turn, hpFrac: rng.pick(hp), minions: rng.int(0, 3), alone: rng.chance(0.25), heroStatus: (s) => (sset.has(s) ? 1 : 0), heroDown: rng.chance(0.2), allyHpFrac: rng.pick(hp.concat([9])), heroHpFrac: rng.pick(hp) };
      const o = resolveAi(aiDef, st, x, rng);
      seen.add(o.move);
      if (o.how.indexOf('rule') === 0) rules.add(+o.how.slice(4));
      turn++;
    }
  }
  return { seen, rules };
}

t.test('every AI move is reachable and every rule can fire, in the base ai and in each phase ai', () => {
  ch1.forEach((e) => {
    const forms = [{ name: 'base', ai: e.ai, starts: [1] }].concat((e.phases || []).filter((p) => p.ai).map((p, i) => ({ name: 'phase' + (i + 1), ai: p.ai, starts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })));
    const reached = new Set();
    forms.forEach((f) => {
      const r = explore(e, f.ai, f.starts, 250);
      r.seen.forEach((m) => reached.add(m));
      (f.ai.rules || []).forEach((rule, i) => t.ok(r.rules.has(i), `${e.id} ${f.name}: rule ${i} (do ${rule.do}) can fire`));
      [].concat(f.ai.open || [], f.ai.seq || [], (f.ai.weighted || []).map((x) => x[0])).forEach((m) => t.ok(r.seen.has(m), `${e.id} ${f.name}: ${m} is chosen`));
      t.ok(f.ai.seq ? f.ai.seq.length >= 1 : f.ai.weighted.length >= 2, `${e.id} ${f.name} has something to cycle`);
    });
    Object.keys(e.moves).forEach((m) => t.ok(reached.has(m), `${e.id}.${m} is reachable`));
    // no move is referenced by the ai unless it exists (also validated) and no ai entry is a dead duplicate of its neighbour
    t.ok(Object.keys(e.moves).length === new Set(Object.keys(e.moves)).size, `${e.id} move ids unique`);
  });
});

t.test('phases are sorted by descending at, carry say lines, and replace the ai completely', () => {
  ch1.filter((e) => e.phases).forEach((e) => {
    e.phases.forEach((p, i) => {
      t.ok(p.at > 0 && p.at < 1, `${e.id} phase ${i} at ${p.at}`);
      if (i > 0) t.ok(p.at < e.phases[i - 1].at, `${e.id} phases descend`);
      t.ok(typeof p.say === 'string' && p.say.length >= 8 && p.say.length <= 90, `${e.id} phase ${i} say`);
      t.ok(p.fx && p.fx.length >= 1, `${e.id} phase ${i} swings something`);
      t.ok(p.ai && (p.ai.open || p.ai.rules), `${e.id} phase ${i} gives a new ai with an open or rules`);
    });
  });
  t.deep(ch1.filter((e) => e.phases).map((e) => e.id).sort(), ['boss_kuzunoha', 'oni_brute'], 'phases: the brute and the boss');
  // rules that survive a phase must be repeated: the boss keeps its re-fold, hunt and stall rules in the second form
  const b = E.boss_kuzunoha;
  ['paper_fold', 'ink_needle', 'frayed_ink'].forEach((m) => t.ok(usesMove(b.ai, m) && usesMove(b.phases[0].ai, m), `boss keeps ${m} across the phase`));
});

// =====================================================================================================================
// 6. the fight simulator: DESIGN 4.2 (enemy phase, statuses, damage formula) and 4.5 (ops, AI, phases, summons, hooks)
// =====================================================================================================================
const isDur = (s) => DATA.statuses[s] && DATA.statuses[s].stack === 'dur';
const PARTY = [{ id: 'hanae', hp: 76 }, { id: 'kuro', hp: 60 }];
// abstract parties: dpt is raw damage per turn spread over `hits` card hits, blk is Block for the front hero (half for the back hero)
// Calibrated against COMBAT.simulate with real Hanae and Kuro decks (a starter deck deals 15 to 17 per turn, a developed one 20 or more,
// and the greedy bot Blocks what the intents threaten). dpt is damage per turn and blk Block for the front hero; hits is how many attack
// cards land (Thorns and Dodge count per hit). `focus:'smart'` kills a minion that dies to one hit (at most 2 a turn) and then the boss.
const PROFILES = {
  early: { dpt: 16, hits: 2, blk: 6, focus: 'smart' },
  mid: { dpt: 19, hits: 3, blk: 7, focus: 'smart' },
  late: { dpt: 23, hits: 3, blk: 8, focus: 'smart' },
  stall: { dpt: 4, hits: 2, blk: 10, focus: 'smart' },
  crawl: { dpt: 9, hits: 3, blk: 10, focus: 'smart' },
  dummy: { dpt: 1, hits: 1, blk: 12, focus: 'smart' },
};
// the party grows with tile difficulty: a fresh deck at diff 0, a developed one by the boss at diff 1
const profileAt = (diff) => ({ dpt: Math.round(15 + 9 * diff), hits: diff >= 0.5 ? 3 : 2, blk: Math.round(6 + 2 * diff), focus: 'smart' });

function simulate(ids, opt) {
  const rng = U.rng(opt.seed), prng = U.rng(U.hash(opt.seed, 'party'));
  const prof = opt.profile;
  const S = {
    turns: 0, minionHits: 0, phase: 'player', result: null, enemies: [], counters: {}, junk: { status_blot: 0, status_scorch: 0 }, hookCount: {},
    gold: 60, stolen: 0, returned: 0, lost: 0, log: [],
    stats: { moves: {}, phases: {}, dmgTaken: 0, dmgDealt: 0, absorbed: 0, thornsTaken: 0, maxLiving: 0, maxMinions: 0, maxSummonerMinions: 0, kills: 0, fled: 0, junk: 0, hookHits: 0, swaps: 0, maxHit: 0 },
  };
  S.heroes = (opt.heroes || PARTY).map((h, i) => ({ kind: 'hero', id: h.id, hp: h.hp, maxHp: h.hp, block: 0, st: {}, fresh: {}, row: i === 0 ? 'front' : 'back', down: false }));
  const living = () => S.enemies.filter((e) => !e.down);
  const liveHeroes = () => S.heroes.filter((h) => !h.down);
  const front = () => liveHeroes().find((h) => h.row === 'front') || liveHeroes()[0];
  const back = () => liveHeroes().find((h) => h.row === 'back') || liveHeroes()[0];
  const bump = (o, k, n) => { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); };

  function evalV(u, v) {
    if (typeof v === 'number') return v;
    const who = v.who === 'target' ? front() : u;
    let c = 0;
    switch (v.per) {
      case 'turn': c = u.turn; break;
      case 'enemies': c = living().length; break;
      case 'status': c = who.st[v.s] || 0; break;
      case 'hp': c = who.hp; break;
      case 'missingHp': c = who.maxHp - who.hp; break;
      case 'block': c = who.block; break;
      case 'debuffs': c = DEBUFFS.filter((s) => who.st[s] > 0).length; break;
      default: c = 0;
    }
    let val = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * (v.per ? Math.min(c, v.upTo === undefined ? Infinity : v.upTo) : 0);
    if (v.min !== undefined) val = Math.max(val, v.min);
    if (v.cap !== undefined) val = Math.min(val, v.cap);
    return Math.floor(val);
  }

  function spawn(defId, lane) {
    const d = E[defId];
    bump(S.counters, defId);
    const u = { kind: 'enemy', id: defId + '#' + S.counters[defId], def: defId, d, tier: d.tier, lane, hp: 0, maxHp: 0, block: 0, st: {}, fresh: {}, down: false, dead: false, fled: false, phase: 0, firedPhase: {}, turn: 1, intent: null, loot: 0, willFlee: false, newborn: false };
    u.maxHp = u.hp = rng.int(d.hp[0], d.hp[1]);
    u.ai = newAiState(); u.aiDef = d.ai;
    (d.start || []).forEach((op) => runOp(u, op));
    return u;
  }
  function ctxOf(u) {
    const others = living().filter((e) => e !== u), lh = liveHeroes();
    return {
      turn: u.turn, hpFrac: u.hp / u.maxHp, minions: living().filter((e) => e.tier === 'minion').length, alone: others.length === 0,
      heroStatus: (s) => Math.max(0, ...lh.map((h) => h.st[s] || 0)), heroDown: S.heroes.some((h) => h.down),
      allyHpFrac: others.length ? Math.min(...others.map((e) => e.hp / e.maxHp)) : Infinity, heroHpFrac: lh.length ? Math.min(...lh.map((h) => h.hp / h.maxHp)) : 1,
    };
  }
  function rollIntent(u) {
    const r = resolveAi(u.aiDef, u.ai, ctxOf(u), rng);
    if (!u.d.moves[r.move]) throw new Error(`${u.def}: ai chose unknown move ${r.move}`);
    u.intent = r;
  }
  function trackLiving() {
    const lv = living();
    S.stats.maxLiving = Math.max(S.stats.maxLiving, lv.length);
    S.stats.maxMinions = Math.max(S.stats.maxMinions, lv.filter((e) => e.tier === 'minion').length);
  }
  function summon(u, id, n) {
    for (let i = 0; i < n; i++) {
      if (living().length >= 5) return;
      const free = [4, 3, 2, 1, 0].find((l) => !living().some((x) => x.lane === l));
      if (free === undefined) return;
      const m = spawn(id, free);
      S.enemies.push(m); m.turn = 1; rollIntent(m); m.newborn = S.phase === 'enemy';
      bump(S.stats, 'summons');
      const summonerMinions = living().filter((e) => e.tier === 'minion').length;
      S.stats.maxSummonerMinions = Math.max(S.stats.maxSummonerMinions, summonerMinions);
      trackLiving();
    }
  }
  function loseHeroHp(h, n) {
    if (h.down || n <= 0) return 0;
    const loss = Math.min(n, h.hp);
    h.hp -= loss; S.stats.dmgTaken += loss;
    if (h.hp <= 0) heroDown(h);
    return loss;
  }
  function heroDown(h) {
    h.down = true; h.hp = 0; h.block = 0;
    const other = S.heroes.find((x) => x !== h);
    if (other && !other.down) { other.row = 'front'; h.row = 'back'; }   // forced swap: the survivor takes the front
    if (!liveHeroes().length) S.result = S.result || 'lose';
  }
  function hitHero(u, h, n) {
    let raw = n + (u.st.might || 0);
    if ((u.st.weak || 0) > 0) raw = Math.floor(raw * 0.75);
    if ((h.st.vulnerable || 0) > 0) raw = Math.floor(raw * 1.5);
    raw = Math.max(0, raw);
    S.stats.maxHit = Math.max(S.stats.maxHit, raw);
    if ((h.st.dodge || 0) > 0) { h.st.dodge--; return; }
    const absorbed = Math.min(h.block, raw); h.block -= absorbed;
    loseHeroHp(h, raw - absorbed);
    if ((h.st.thorns || 0) > 0 && !u.down) { u.hp -= h.st.thorns; if (u.hp <= 0) kill(u, 'thorns'); }
  }
  function heroTargets(tgt) {
    const lh = liveHeroes();
    if (!lh.length) return [];
    switch (tgt || 'front') {
      case 'front': return [front()];
      case 'back': return [back()];
      case 'both': return lh.slice();
      case 'random': return [lh[rng.int(0, lh.length - 1)]];
      case 'lowest': return [lh.slice().sort((a, b) => a.hp - b.hp || (a.row === 'front' ? -1 : 1))[0]];
      default: throw new Error('bad hero target ' + tgt);
    }
  }
  function enemyTargets(u, tgt) {
    const lv = living();
    switch (tgt || 'self') {
      case 'self': return [u];
      case 'allEnemies': return lv;
      case 'otherEnemy': { const o = lv.filter((e) => e !== u); return o.length ? [o[rng.int(0, o.length - 1)]] : []; }
      case 'lowestEnemy': return [lv.slice().sort((a, b) => a.hp - b.hp || a.lane - b.lane)[0]];
      default: throw new Error('bad enemy target ' + tgt);
    }
  }
  function applyStatus(target, s, n, byEnemy) {
    if (target.kind === 'enemy' && (target.d.immune || []).indexOf(s) >= 0) return;
    target.st[s] = (target.st[s] || 0) + n;
    if (target.st[s] <= 0) delete target.st[s];
    if (target.kind === 'hero' && S.phase === 'enemy' && isDur(s) && byEnemy) target.fresh[s] = true;
  }
  function condEnemy(u, c) {
    const who = (w) => (w === 'target' ? front() : u);
    if (c.status) { const v = (who(c.status.who).st[c.status.s] || 0); if (c.status.gte !== undefined && v < c.status.gte) return false; if (c.status.lte !== undefined && v > c.status.lte) return false; }
    if (c.hpPct) { const w = who(c.hpPct.who), f = w.hp / w.maxHp; if (c.hpPct.lt !== undefined && !(f < c.hpPct.lt)) return false; if (c.hpPct.gt !== undefined && !(f > c.hpPct.gt)) return false; }
    if (c.block) { if (c.block.gte !== undefined && u.block < c.block.gte) return false; if (c.block.lte !== undefined && u.block > c.block.lte) return false; }
    if (c.turn) { if (c.turn.gte !== undefined && u.turn < c.turn.gte) return false; if (c.turn.lte !== undefined && u.turn > c.turn.lte) return false; }
    if (c.enemies) { const n = living().length; if (c.enemies.gte !== undefined && n < c.enemies.gte) return false; if (c.enemies.lte !== undefined && n > c.enemies.lte) return false; }
    return true;
  }
  // one enemy op; `u` is the actor
  function runOp(u, op) {
    if (S.result) return;
    switch (op.op) {
      case 'dmg': {
        const n = evalV(u, op.n), hits = op.hits === undefined ? 1 : evalV(u, op.hits);
        for (let i = 0; i < hits && !S.result; i++) heroTargets(op.tgt).forEach((h) => { if (!S.result && !h.down) hitHero(u, h, n); });
        break;
      }
      case 'block': { const n = evalV(u, op.n); enemyTargets(u, op.tgt).forEach((e) => { e.block += Math.floor(n * ((e.st.frail || 0) > 0 ? 0.75 : 1)); }); break; }
      case 'heal': { const n = evalV(u, op.n); enemyTargets(u, op.tgt).forEach((e) => { e.hp = Math.min(e.maxHp, e.hp + n); }); break; }
      case 'status': {
        const n = evalV(u, op.n);
        const enemySide = ['self', 'allEnemies', 'otherEnemy', 'lowestEnemy'].indexOf(op.tgt) >= 0 || (op.tgt === undefined && !DATA.isDebuff(op.s));
        (enemySide ? enemyTargets(u, op.tgt) : heroTargets(op.tgt)).forEach((x) => applyStatus(x, op.s, n, true));
        break;
      }
      case 'removeStatus': {
        const enemySide = ['self', 'allEnemies', 'otherEnemy', 'lowestEnemy'].indexOf(op.tgt) >= 0 || (op.tgt === undefined && (op.s === 'debuffs' || DATA.isDebuff(op.s)));
        (enemySide ? enemyTargets(u, op.tgt) : heroTargets(op.tgt || 'front')).forEach((x) => {
          Object.keys(x.st).forEach((k) => {
            const kind = DATA.statuses[k].kind;
            const hit = op.s === 'debuffs' ? kind === 'debuff' : op.s === 'buffs' ? kind === 'buff' : k === op.s;
            if (!hit) return;
            if (op.n !== undefined && op.s !== 'debuffs' && op.s !== 'buffs') { x.st[k] -= evalV(u, op.n); if (x.st[k] <= 0) delete x.st[k]; } else delete x.st[k];
          });
        });
        break;
      }
      case 'add': { const n = op.n === undefined ? 1 : evalV(u, op.n); S.junk[op.card] += n; bump(S.stats, 'junk', n); break; }
      case 'summon': summon(u, op.enemy, op.n === undefined ? 1 : op.n); break;
      case 'swap': {
        if (S.heroes.some((h) => (h.st.bind || 0) > 0)) break;
        const lh = liveHeroes();
        if (lh.length === 2) { lh[0].row = lh[0].row === 'front' ? 'back' : 'front'; lh[1].row = lh[1].row === 'front' ? 'back' : 'front'; bump(S.stats, 'swaps'); }
        break;
      }
      case 'cond': { const branch = condEnemy(u, op.if) ? op.then : op.else; (branch || []).forEach((o) => runOp(u, o)); break; }
      case 'stealGold': { const take = Math.min(evalV(u, op.n), S.gold - S.stolen); if (take > 0) { u.loot += take; S.stolen += take; } bump(S.stats, 'stealMoves'); break; }
      case 'flee': u.willFlee = true; break;
      default: throw new Error('unhandled enemy op ' + op.op);
    }
  }
  function checkWin() { if (!S.result && !living().length) S.result = 'win'; }
  function hookRun(u, on, filter) {
    (u.d.hooks || []).forEach((h, i) => {
      if (h.on !== on) return;
      if (h.filter && h.filter.type !== undefined && h.filter.type !== filter) return;
      const key = u.id + '|' + on + '|' + i;
      if (h.limit !== undefined && (S.hookCount[key] || 0) >= h.limit) return;
      if (h.once && S.hookCount[key]) return;
      bump(S.hookCount, key);
      const before = S.stats.dmgTaken;
      h.fx.forEach((o) => runOp(u, o));
      S.stats.hookHits += S.stats.dmgTaken - before;
      bump(S.stats, 'hook_' + on);
    });
  }
  function kill(e, by) {
    if (e.down) return;
    e.down = true; e.dead = true; e.hp = Math.min(e.hp, 0);
    bump(S.stats, 'kills');
    if (e.loot) { S.returned += e.loot; S.stolen -= e.loot; e.loot = 0; }
    hookRun(e, 'onDeath');
    living().forEach((o) => hookRun(o, 'onAllyDeath'));
    checkWin();
  }
  function checkPhases(u) {
    (u.d.phases || []).forEach((p, i) => {
      if (u.down || u.firedPhase[i] || !(u.hp / u.maxHp < p.at)) return;
      u.firedPhase[i] = true; u.phase++;
      bump(S.stats.phases, u.def + '#' + (i + 1));
      S.log.push({ type: 'enemy_phase', enemy: u.id, index: u.phase, at: p.at, say: p.say });
      (p.fx || []).forEach((o) => runOp(u, o));
      if (p.ai) { u.ai = newAiState(); u.aiDef = p.ai; rollIntent(u); }
    });
  }
  function hitEnemy(e, raw, hero) {
    if (e.down) return;
    if ((e.st.vulnerable || 0) > 0) raw = Math.floor(raw * 1.5);
    if ((e.st.dodge || 0) > 0) { e.st.dodge--; return; }
    const absorbed = Math.min(e.block, raw); e.block -= absorbed; S.stats.absorbed += absorbed;
    const loss = Math.min(raw - absorbed, e.hp);
    e.hp -= loss; S.stats.dmgDealt += loss;
    if ((e.st.thorns || 0) > 0 && hero && !hero.down) { const l = loseHeroHp(hero, e.st.thorns); S.stats.thornsTaken += l; }
    if (e.hp <= 0) { kill(e, 'card'); return; }
    if (loss > 0) { hookRun(e, 'onHurt'); checkPhases(e); }
  }
  function pickTarget() {
    const alive = living();
    if (!alive.length) return null;
    const thief = alive.find((e) => e.loot > 0);
    if (thief) return thief;
    if (prof.focus === 'smart') {
      const per = Math.round(prof.dpt / prof.hits);
      const cheap = alive.find((e) => e.tier === 'minion' && e.hp + e.block <= per);
      if (cheap && S.minionHits < 2) { S.minionHits++; return cheap; }
      const b = alive.find((e) => e.tier === 'boss');
      if (b) return b;
    }
    return alive.slice().sort((a, b) => (a.hp + a.block + (a.st.dodge || 0) * 6) - (b.hp + b.block + (b.st.dodge || 0) * 6))[0];
  }

  // ---- phases of the round
  function playerPhase() {
    S.phase = 'player'; S.turns++; S.hookCount = {}; S.minionHits = 0;
    S.heroes.forEach((h) => { if (!h.down) h.block = 0; });
    liveHeroes().forEach((h) => { if ((h.st.poison || 0) > 0) { loseHeroHp(h, h.st.poison); h.st.poison--; if (!h.st.poison) delete h.st.poison; } });
    if (S.result) return;
    let proc = Math.min(2, S.junk.status_blot + S.junk.status_scorch);
    const scorch = Math.min(S.junk.status_scorch, proc);
    S.junk.status_scorch -= scorch; proc -= scorch; S.junk.status_blot -= Math.min(S.junk.status_blot, proc); proc += scorch;
    for (let i = 0; i < scorch && !S.result; i++) loseHeroHp(front(), 2);
    if (S.result) return;
    // one free swap: bring the healthier hero forward when the front hero is in trouble
    const f = front(), b = back();
    if (f && b && f !== b && f.hp / f.maxHp < 0.3 && b.hp / b.maxHp > 0.5 && !S.heroes.some((h) => (h.st.bind || 0) > 0)) { f.row = 'back'; b.row = 'front'; }
    // Block first (a Riposte or a Thorns tax is paid after it), then the attacks
    liveHeroes().forEach((h) => {
      if ((h.st.stun || 0) > 0) return;
      const amt = Math.round(h === front() ? prof.blk : prof.blk * 0.5);
      h.block += Math.floor(amt * ((h.st.frail || 0) > 0 ? 0.75 : 1));
    });
    const per = Math.max(1, Math.round(prof.dpt / prof.hits));
    for (let i = 0; i < prof.hits && !S.result; i++) {
      const hero = S.heroes[i % 2];
      if (hero.down || (hero.st.stun || 0) > 0) continue;
      if (prng() < 0.2 * proc) continue;
      const tgt = pickTarget();
      if (!tgt) break;
      hitEnemy(tgt, (hero.st.weak || 0) > 0 ? Math.floor(per * 0.75) : per, hero);
    }
  }
  function enemyPhase() {
    S.phase = 'enemy'; S.hookCount = S.hookCount || {};
    S.heroes.forEach((h) => { h.dmgTaken = 0; });
    S.enemies.forEach((e) => { e.block = 0; });
    const order = living().sort((a, b) => a.lane - b.lane);
    order.forEach((e) => {
      if (e.down) return;
      if (e.st.plating) e.block += e.st.plating;
      if (e.st.ritual) e.st.might = (e.st.might || 0) + e.st.ritual;
      if (e.st.regen) { e.hp = Math.min(e.maxHp, e.hp + e.st.regen); e.st.regen--; if (!e.st.regen) delete e.st.regen; }
      if (e.st.poison) { e.hp -= e.st.poison; e.st.poison--; if (!e.st.poison) delete e.st.poison; if (e.hp <= 0) kill(e, 'poison'); else checkPhases(e); }
    });
    order.forEach((e) => {
      if (e.down || S.result) return;
      if ((e.st.stun || 0) > 0) { e.st.stun--; if (!e.st.stun) delete e.st.stun; return; }
      const key = e.def + '.' + e.intent.move;
      bump(S.stats.moves, key);
      const mv = e.d.moves[e.intent.move];
      mv.fx.forEach((o) => runOp(e, o));
      if (e.willFlee && !S.result) { e.down = true; e.fled = true; e.willFlee = false; if (e.loot) { S.lost += e.loot; e.loot = 0; } bump(S.stats, 'fled'); checkWin(); }
    });
    if (S.result) return;
    // end of round: burn, then dur statuses tick down (fresh ones skip once), enemy stun waits to be consumed
    liveHeroes().forEach((h) => { if (h.st.burn) { loseHeroHp(h, h.st.burn); h.st.burn = Math.floor(h.st.burn / 2); if (!h.st.burn) delete h.st.burn; } });
    if (S.result) return;
    S.heroes.concat(S.enemies.filter((e) => !e.down)).forEach((u) => {
      Object.keys(u.st).forEach((s) => {
        if (!isDur(s) || (u.kind === 'enemy' && s === 'stun')) return;
        if (u.fresh[s]) return;
        u.st[s]--; if (u.st[s] <= 0) delete u.st[s];
      });
      u.fresh = {};
    });
    // new intents; units summoned this phase keep the intent they got at once
    living().forEach((e) => { if (e.newborn) { e.newborn = false; return; } e.turn++; rollIntent(e); });
  }

  // ---- go
  const n = ids.length;
  ids.forEach((id, i) => S.enemies.push(spawn(id, 5 - n + i)));
  S.enemies.forEach((e) => rollIntent(e));
  trackLiving();
  const maxTurns = opt.maxTurns || 60;
  while (!S.result && S.turns < maxTurns) {
    playerPhase();
    if (opt.trace) console.log(`T${S.turns} after player: ` + S.enemies.map((e) => `${e.def}${e.down ? '(x)' : ''} ${e.hp}/${e.maxHp} b${e.block} [${Object.keys(e.st).map((k) => k + e.st[k]).join(',')}] next:${e.intent && e.intent.move}`).join(' | ') + ' || heroes ' + S.heroes.map((h) => `${h.id} ${h.hp} b${h.block}`).join(', '));
    if (S.result) break;
    enemyPhase();
    if (opt.trace) console.log(`   after enemy: heroes ` + S.heroes.map((h) => `${h.id} ${h.hp}`).join(', '));
  }
  if (!S.result) S.result = 'timeout';
  S.hpLost = S.stats.dmgTaken;
  S.partyHp = S.heroes.reduce((s, h) => s + h.maxHp, 0);
  return S;
}

const runMany = (ids, profile, seeds, extra) => { const out = []; for (let s = 1; s <= seeds; s++) out.push(simulate(ids, Object.assign({ seed: U.hash('e1', ids.join('+'), s), profile }, extra || {}))); return out; };
const mean = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
const winsOnly = (runs) => runs.filter((r) => r.result === 'win');

// The report the numbers were tuned against (RB_REPORT=1)
if (process.env.RB_TRACE) { const [ids, diff] = process.env.RB_TRACE.split('@'); simulate(ids.split(','), { seed: 3, profile: profileAt(+diff || 0.3), trace: true }); }
if (REPORT) {
  const row = (label, ids, prof, seeds) => {
    const runs = runMany(ids, PROFILES[prof], seeds);
    const w = winsOnly(runs);
    console.log(`${label.padEnd(24)} ${prof.padEnd(5)} win ${(100 * w.length / runs.length).toFixed(0).padStart(3)}%  turns ${mean(runs, (r) => r.turns).toFixed(1).padStart(4)}  hpLost ${mean(runs, (r) => r.hpLost).toFixed(0).padStart(3)} (${(100 * mean(runs, (r) => r.hpLost / r.partyHp)).toFixed(0)}%)  junk ${mean(runs, (r) => r.stats.junk).toFixed(1)}  audit ${ids.map((id) => avgDmg(E[id]).toFixed(1)).join('+')}`);
  };
  const rowAt = (x, diff, seeds) => {
    const prof = profileAt(diff), runs = runMany(x.enemies, prof, seeds), w = winsOnly(runs);
    console.log(`${x.id.padEnd(22)} diff ${diff.toFixed(2)} dpt ${String(prof.dpt).padStart(2)} win ${(100 * w.length / runs.length).toFixed(0).padStart(3)}%  turns ${mean(runs, (r) => r.turns).toFixed(1).padStart(4)}  hpLost ${mean(runs, (r) => r.hpLost).toFixed(0).padStart(3)} (${(100 * mean(runs, (r) => r.hpLost / r.partyHp)).toFixed(0)}%)  junk ${mean(runs, (r) => r.stats.junk).toFixed(1)}  audit ${x.enemies.map((id) => avgDmg(E[id]).toFixed(1)).join('+')}`);
  };
  P1.normal.forEach((x) => { rowAt(x, x.min, 80); });
  P1.elite.forEach((x) => { rowAt(x, x.min, 80); rowAt(x, Math.min(1, x.min + 0.3), 80); });
  rowAt({ id: 'boss_kuzunoha', enemies: ['boss_kuzunoha'] }, 1, 80);
  [14, 18, 26].forEach((d) => { const runs = runMany(['boss_kuzunoha'], { dpt: d, hits: 3, blk: 8, focus: 'smart' }, 80), w = winsOnly(runs); console.log(`boss sensitivity dpt ${d}: win ${(100 * w.length / runs.length).toFixed(0)}% turns ${mean(runs, (r) => r.turns).toFixed(1)} hpLost ${mean(runs, (r) => r.hpLost).toFixed(0)}`); });
  [10, 14, 18].forEach((d) => { ['oni_brute', 'tengu_duelist', 'moss_guardian'].forEach((id) => { const runs = runMany([id], { dpt: d, hits: 2, blk: 6, focus: 'smart' }, 80); console.log(`elite ${id} dpt ${d}: turns ${mean(runs, (r) => r.turns).toFixed(1)} hpLost ${mean(runs, (r) => r.hpLost).toFixed(0)} win ${(100 * winsOnly(runs).length / runs.length).toFixed(0)}%`); }); });
  P1.normal.forEach((x) => { row(x.id, x.enemies, 'early', 60); });
}

t.test('the simulator itself follows the rules it claims (self-checks on hand made fights)', () => {
  // a lone leaf imp against a passive party: 3 damage, once per round, front hero only
  const r = simulate(['leaf_imp'], { seed: 1, profile: { dpt: 0, hits: 1, blk: 0, focus: 'lowest' }, maxTurns: 4, heroes: [{ id: 'hanae', hp: 76 }, { id: 'kuro', hp: 60 }] });
  t.eq(r.stats.moves['leaf_imp.leaf_poke'], 4, 'the imp poked once per enemy phase (4 turns)');
  t.eq(r.stats.dmgTaken, 12, '3 damage each, no Block, no Might');
  t.eq(r.result, 'timeout', 'a party that never attacks never wins');
  // Ritual and Might: the cub's first horn butt is 5 + 1
  const c = simulate(['oni_cub'], { seed: 2, profile: { dpt: 0, hits: 1, blk: 0, focus: 'lowest' }, maxTurns: 3 });
  t.eq(c.stats.dmgTaken, (5 + 1) + 2 * (3 + 2) + (5 + 3), 'cub: horn butt with Might 1, tantrum with Might 2, horn butt with Might 3');
  // a hit against Block loses nothing
  const b = simulate(['leaf_imp'], { seed: 3, profile: { dpt: 0, hits: 1, blk: 20, focus: 'lowest' }, maxTurns: 3 });
  t.eq(b.stats.dmgTaken, 0, 'enough Block: no damage');
});

t.test('every enemy executes every one of its moves in some fight, and no fight throws or loops', () => {
  const done = {};
  const account = (runs) => runs.forEach((r) => Object.keys(r.stats.moves).forEach((k) => { done[k] = (done[k] || 0) + r.stats.moves[k]; }));
  const tank = { heroes: [{ id: 'hanae', hp: 900 }, { id: 'kuro', hp: 900 }], maxTurns: 90 };
  const lists = groups.map((x) => x.enemies).concat([['boss_kuzunoha'], ['boss_kuzunoha']], ch1.map((e) => [e.id]));
  lists.forEach((ids, i) => {
    ['early', 'mid', 'stall', 'crawl'].forEach((p) => {
      const runs = runMany(ids, PROFILES[p], 6, i === lists.length - 1 - ch1.length ? { heroes: tank.heroes, maxTurns: 90 } : tank);
      runs.forEach((r) => { t.ok(r.result === 'win' || r.result === 'lose' || r.result === 'timeout', `${ids.join('+')} ${p} ended`); t.ok(Number.isFinite(r.hpLost) && r.hpLost >= 0, `${ids.join('+')} ${p} hp lost is a number`); });
      account(runs);
    });
  });
  // the boss from the very first turns (crawl = a party that hurts slowly) so the late rules of the first form run too
  account(runMany(['boss_kuzunoha'], { dpt: 3, hits: 2, blk: 14, focus: 'boss' }, 4, { heroes: tank.heroes, maxTurns: 90 }));
  ch1.forEach((e) => Object.keys(e.moves).forEach((m) => t.ok(done[e.id + '.' + m] > 0, `${e.id}.${m} executed`)));
});

t.test('fights terminate: no fight against a party that attacks at all runs to the turn cap', () => {
  groups.forEach((x) => ['early', 'mid', 'late'].forEach((p) => {
    const runs = runMany(x.enemies, PROFILES[p], 12, { heroes: [{ id: 'hanae', hp: 400 }, { id: 'kuro', hp: 400 }], maxTurns: 60 });
    runs.forEach((r) => t.ok(r.result === 'win', `${x.id} ${p}: result ${r.result} after ${r.turns} turns`));
  }));
  runMany(['boss_kuzunoha'], PROFILES.mid, 12, { heroes: [{ id: 'hanae', hp: 900 }, { id: 'kuro', hp: 900 }], maxTurns: 60 }).forEach((r) => t.ok(r.result === 'win', `boss mid: ${r.result} after ${r.turns}`));
});

t.test('summons respect their caps and the line never exceeds 5', () => {
  const tank = { heroes: [{ id: 'hanae', hp: 900 }, { id: 'kuro', hp: 900 }], maxTurns: 80 };
  const cap = (ids, prof, max, label) => runMany(ids, PROFILES[prof], 25, tank).forEach((r) => { t.ok(r.stats.maxLiving <= 5, `${label}: line ${r.stats.maxLiving} <= 5`); t.ok(r.stats.maxMinions <= max, `${label} ${prof}: ${r.stats.maxMinions} living minions <= ${max}`); });
  ['stall', 'mid', 'crawl'].forEach((p) => {
    cap(['kodama'], p, 2, 'kodama'); cap(['kodama', 'kappa'], p, 2, 'kodama+kappa'); cap(['bamboo_sprite', 'bamboo_sprite', 'kodama'], p, 2, 'swarm');
    cap(['moss_guardian'], p, 2, 'guardian'); cap(['boss_kuzunoha'], p, 2, 'boss');
    cap(['hitodama', 'ember_wisp', 'ember_wisp'], p, 2, 'wisps');
  });
  // the kodama does call: a stalled fight sees several imps over time
  t.ok(mean(runMany(['kodama'], PROFILES.dummy, 10, tank), (r) => r.stats.summons || 0) >= 2, 'a lone kodama keeps calling imps in a long fight');
  t.ok(mean(runMany(['boss_kuzunoha'], { dpt: 14, hits: 2, blk: 10, focus: 'smart' }, 10, tank), (r) => r.stats.summons || 0) >= 4, 'the boss folds kodama repeatedly');
});

t.test('the thief: steals once, flees with the gold, and killing it first returns the gold', () => {
  const tank = { heroes: [{ id: 'hanae', hp: 500 }, { id: 'kuro', hp: 500 }], maxTurns: 40 };
  const slow = runMany(['tanuki_bandit'], PROFILES.stall, 12, tank);
  slow.forEach((r) => { t.eq(r.stats.stealMoves, 1, 'one theft'); t.eq(r.lost, 20, 'the loot is lost when it flees'); t.eq(r.returned, 0, 'nothing returned'); t.eq(r.stats.fled, 1, 'and it fled'); });
  runMany(['tanuki_bandit'], { dpt: 26, hits: 2, blk: 4, focus: 'lowest' }, 12, tank).forEach((r) => t.ok(r.returned === 0 && r.stolen === 0 || r.stats.kills === 1, 'a fast kill before the theft costs nothing'));
  // hit exactly during the flee turn: the thief is the priority target and dies with the gold
  const mid = runMany(['tanuki_bandit'], { dpt: 10, hits: 2, blk: 4, focus: 'smart' }, 30, tank);
  const caught = mid.filter((r) => r.returned > 0);
  t.ok(caught.length >= 1, 'a party that arrives one turn late still recovers the gold');
  caught.forEach((r) => { t.eq(r.returned, 20, 'the whole 20 is returned'); t.eq(r.stolen, 0, 'nothing stays stolen'); t.eq(r.lost, 0, 'nothing lost'); });
  t.ok(mid.every((r) => r.result === 'win'), 'and the fight is won either way (fled or dead)');
  // stealGold never takes more than the run has
  const poor = simulate(['tanuki_bandit'], { seed: 5, profile: PROFILES.stall, heroes: tank.heroes, maxTurns: 10 });
  t.ok(poor.stolen + poor.lost <= 60, 'never more than the run holds');
});

t.test('phases: the brute enrages, the duelist dances, the boss splits its mask, all in most fights at the right HP', () => {
  const tank = { heroes: [{ id: 'hanae', hp: 900 }, { id: 'kuro', hp: 900 }], maxTurns: 60 };
  const brute = runMany(['oni_brute'], PROFILES.mid, 30, tank);
  t.ok(brute.every((r) => r.stats.phases['oni_brute#1'] === 1), 'the brute enrages exactly once in every fight');
  t.ok(brute.every((r) => r.stats.moves['oni_brute.enraged_bellow'] === 1 || r.stats.moves['oni_brute.enraged_bellow'] === undefined), 'and bellows at most once');
  t.ok(mean(brute, (r) => (r.stats.moves['oni_brute.enraged_bellow'] || 0)) > 0.8, 'the bellow actually plays');
  const duel = runMany(['tengu_duelist'], PROFILES.mid, 30, tank);
  t.ok(mean(duel, (r) => r.stats.moves['tengu_duelist.blade_dance'] || 0) > 0.7, 'the blade dance fires in nearly every fight');
  t.ok(duel.every((r) => (r.stats.moves['tengu_duelist.blade_dance'] || 0) <= 1), 'once only');
  const boss = runMany(['boss_kuzunoha'], PROFILES.late, 30, { heroes: tank.heroes, maxTurns: 60 });
  t.ok(boss.every((r) => r.stats.phases['boss_kuzunoha#1'] === 1), 'the boss changes form exactly once');
  t.ok(boss.every((r) => r.log.filter((l) => l.type === 'enemy_phase').length === 1 && r.log[0].index === 1 && r.log[0].say.length > 20), 'one enemy_phase with its say line');
  t.ok(mean(boss, (r) => r.stats.moves['boss_kuzunoha.nine_tails'] || 0) >= 1, 'a fight to the end includes at least one Nine-Tail Storm');
  t.ok(boss.every((r) => (r.stats.moves['boss_kuzunoha.paper_fold'] || 0) >= 1), 'and the opening paper fold');
  t.ok(boss.every((r) => (r.stats.moves['boss_kuzunoha.tails_rise'] || 0) >= 1), 'and the rise before the storm');
  // the rise comes before the first storm in every fight (a fair warning)
  t.ok(boss.every((r) => (r.stats.moves['boss_kuzunoha.tails_rise'] || 0) >= (r.stats.moves['boss_kuzunoha.nine_tails'] || 0)), 'never a storm without a rise first');
});

t.test('status rules in play: Vulnerable really makes the next claw bigger, burn ignores Block, poison ticks', () => {
  const passive = { dpt: 0, hits: 1, blk: 0, focus: 'lowest' };
  // kappa: mud slap 5 (front gets Vulnerable 1, fresh), claw 8 * 1.5 = 12, then the guard turn
  const k = simulate(['kappa'], { seed: 7, profile: passive, maxTurns: 3 });
  t.eq(k.stats.dmgTaken, 5 + 12, 'muddy slap then a claw that lands at x1.5');
  // hitodama burn: ember touch 5 + burn 3 (3 at end of round), the scatter turn adds no damage, burn then halves
  const hs = new Set(); for (let i = 1; i <= 24; i++) hs.add(simulate(['hitodama'], { seed: i, profile: passive, maxTurns: 1 }).stats.dmgTaken);
  t.deep([...hs].sort((a, b) => a - b), [0, 8], 'hitodama turn 1 is either the scatter (0) or Ember Touch: 5 damage plus the 3 Burn that lands at the end of the round');
  const w = simulate(['ember_wisp'], { seed: 1, profile: { dpt: 0, hits: 1, blk: 50, focus: 'lowest' }, maxTurns: 2 });
  t.eq(w.stats.dmgTaken, 3, 'even a wall of Block does not stop burn: 3 at the end of the round');
  const m = simulate(['mushroom_folk'], { seed: 3, profile: passive, maxTurns: 3, heroes: [{ id: 'hanae', hp: 76 }, { id: 'kuro', hp: 60 }] });
  t.ok(m.stats.dmgTaken > 4 + 3, 'spore puff plus poison ticks add up (the poison keeps ticking after the puff)');
});

t.test('Thorns and Plating do what the lore says', () => {
  const tank = { heroes: [{ id: 'hanae', hp: 900 }, { id: 'kuro', hp: 900 }], maxTurns: 60 };
  const cap = runMany(['mushroom_folk'], PROFILES.mid, 30, tank);
  t.ok(mean(cap, (r) => r.stats.thornsTaken) >= 3, `attacking a thorny cap costs the party HP (${mean(cap, (r) => r.stats.thornsTaken).toFixed(1)})`);
  const boar = runMany(['bamboo_boar'], PROFILES.mid, 30, tank);
  t.ok(mean(boar, (r) => r.stats.absorbed) >= 6, `the boar's Plating soaks up damage (${mean(boar, (r) => r.stats.absorbed).toFixed(1)})`);
  const guard = runMany(['moss_guardian'], PROFILES.mid, 30, tank);
  t.ok(mean(guard, (r) => r.stats.thornsTaken) >= 8, `the guardian punishes card spam with Thorns (${mean(guard, (r) => r.stats.thornsTaken).toFixed(1)})`);
  t.ok(mean(guard, (r) => r.stats.absorbed) >= 9, `and its Plating soaks up a hit or two every turn (${mean(guard, (r) => r.stats.absorbed).toFixed(1)})`);
  // a Thorns hit is never Blocked: a wall of Block does not save the attacker
  const wall = runMany(['mushroom_folk'], { dpt: 16, hits: 2, blk: 60, focus: 'smart' }, 20, tank);
  t.ok(mean(wall, (r) => r.stats.thornsTaken) >= 3, 'Thorns ignore Block');
});

t.test('fight length and cost land in band (normal 3 to 5 turns, elite 5 to 7, boss 8 to 12) for a party that grows with the map', () => {
  const N = 60;
  const stat = (x, diff) => { const runs = runMany(x.enemies, profileAt(diff), N); return { turns: mean(runs, (r) => r.turns), hp: mean(runs, (r) => r.hpLost), wins: winsOnly(runs).length / runs.length }; };
  const normal = P1.normal.map((x) => Object.assign({ x }, stat(x, x.min)));
  const pooled = normal.reduce((s, m) => s + m.turns, 0) / normal.length;
  t.ok(pooled >= 3 && pooled <= 5, `normal groups average ${pooled.toFixed(2)} turns (want 3 to 5)`);
  normal.forEach((m) => { t.ok(m.turns >= 2 && m.turns <= 6, `${m.x.id}: ${m.turns.toFixed(2)} turns in 2..6`); t.ok(m.hp <= 30, `${m.x.id}: costs ${m.hp.toFixed(0)} HP <= 30`); t.eq(m.wins, 1, `${m.x.id} is always won by a party of its own strength`); });
  const cost = normal.reduce((s, m) => s + m.hp, 0) / normal.length;
  t.ok(cost >= 4 && cost <= 16, `a normal fight costs ${cost.toFixed(1)} HP on average (4 to 16 of a 136 HP party)`);
  P1.elite.forEach((x) => {
    const m = stat(x, x.min);
    t.ok(m.turns >= 5 && m.turns <= 8, `${x.id}: ${m.turns.toFixed(2)} turns in 5..8 (the independent simulator is a little harsher than the engine)`);
    t.ok(m.hp >= 15 && m.hp <= 60, `${x.id}: costs ${m.hp.toFixed(0)} HP in 15..60`);
    t.eq(m.wins, 1, `${x.id} is always won by a party of its own strength`);
  });
  const boss = stat({ enemies: ['boss_kuzunoha'] }, 1);
  t.ok(boss.turns >= 8 && boss.turns <= 12.5, `boss: ${boss.turns.toFixed(2)} turns in 8..12.5 (spec: 8 to 12)`);
  t.ok(boss.hp >= 35 && boss.hp <= 75, `boss: costs ${boss.hp.toFixed(0)} HP in 35..75`);
  t.ok(boss.wins >= 0.98, 'a developed deck beats the boss');
  // sensitivity: a stronger deck shortens the fight, a much weaker one is in real trouble but the fight still ends
  const at = (d) => runMany(['boss_kuzunoha'], { dpt: d, hits: 3, blk: 8, focus: 'smart' }, N);
  t.ok(mean(at(18), (r) => r.turns) > boss.turns, 'a weaker party takes longer');
  t.ok(winsOnly(at(18)).length / N >= 0.95, 'dpt 18 still beats the boss');
  t.ok(mean(at(26), (r) => r.turns) >= 7, 'even a strong party needs 7+ turns: the boss is not a formality');
  t.ok(mean(at(26), (r) => r.turns) < boss.turns, 'a stronger party finishes sooner');
  t.ok(at(14).every((r) => r.result === 'win' || r.result === 'lose'), 'a weak party wins or loses, never stalls');
});

t.test('the difficulty ramp: harder groups cost more HP and the early groups are survivable by a starter party', () => {
  const N = 40;
  const cost = (x) => mean(runMany(x.enemies, PROFILES.early, N), (r) => r.hpLost);
  const sorted = P1.normal.slice().sort((a, b) => a.min - b.min), third = Math.floor(sorted.length / 3);
  const early = sorted.slice(0, third), late = sorted.slice(-third);
  const avg = (arr) => arr.reduce((s, x) => s + cost(x), 0) / arr.length;
  t.ok(avg(late) > avg(early) * 1.25, `late groups cost more (${avg(late).toFixed(1)} vs ${avg(early).toFixed(1)})`);
  early.forEach((x) => { const runs = runMany(x.enemies, PROFILES.early, N); t.ok(winsOnly(runs).length === runs.length, `${x.id} is never lost by a starter party`); t.ok(mean(runs, (r) => r.hpLost) <= 26, `${x.id} costs a starter party <= 26 HP (${mean(runs, (r) => r.hpLost).toFixed(1)})`); });
  // no single group threatens a wipe: a starter party at full HP keeps at least half of it on average across the whole pool
  sorted.forEach((x) => { const runs = runMany(x.enemies, PROFILES.early, N); t.ok(mean(runs, (r) => r.hpLost / r.partyHp) <= 0.32, `${x.id}: a starter party loses <= 32% of its HP`); });
});

t.test('threat identities show up in numbers: the cub snowballs, sprites reward AoE, the kodama is worth killing first', () => {
  const N = 60, tank = { heroes: [{ id: 'hanae', hp: 900 }, { id: 'kuro', hp: 900 }], maxTurns: 60 };
  const slowCub = mean(runMany(['oni_cub'], { dpt: 6, hits: 2, blk: 0, focus: 'lowest' }, N, tank), (r) => r.hpLost / r.turns);
  const fastCub = mean(runMany(['oni_cub'], { dpt: 20, hits: 3, blk: 0, focus: 'lowest' }, N, tank), (r) => r.hpLost / r.turns);
  t.ok(slowCub > fastCub * 1.5, `a slow kill costs far more per turn (${slowCub.toFixed(1)} vs ${fastCub.toFixed(1)})`);
  const crow = runMany(['crow_tengu'], PROFILES.dummy, 20, { heroes: tank.heroes, maxTurns: 40 });
  t.ok(mean(crow, (r) => r.stats.swaps) > 3, 'the crow keeps swapping the heroes in a long fight');
  const calls = mean(runMany(['kodama'], PROFILES.dummy, 20, tank), (r) => r.stats.moves['kodama.call_leaf_imp'] || 0);
  t.ok(calls >= 2, 'the kodama calls imps repeatedly if left alone');
  const duel = runMany(['tengu_duelist'], PROFILES.mid, 30, tank);
  t.ok(mean(duel, (r) => r.stats.hook_onHurt || 0) >= 3, 'the duelist ripostes in most rounds the party hits it');
  t.ok(mean(duel, (r) => r.stats.hook_onHurt || 0) <= 9, 'but never more than once a round');
});

t.test('content is plain JSON data, the simulator is deterministic, and every HP roll stays in its range', () => {
  ch1.forEach((e) => t.deep(JSON.parse(JSON.stringify(e)), e, `${e.id} survives a JSON round trip (no functions, no undefined)`));
  const a = simulate(['boss_kuzunoha'], { seed: 99, profile: PROFILES.late }), b = simulate(['boss_kuzunoha'], { seed: 99, profile: PROFILES.late });
  t.deep([a.turns, a.hpLost, a.stats], [b.turns, b.hpLost, b.stats], 'same seed, same fight');
  const c = simulate(['boss_kuzunoha'], { seed: 100, profile: PROFILES.late });
  t.ok(a.stats.dmgDealt !== c.stats.dmgDealt || a.turns !== c.turns || a.hpLost !== c.hpLost, 'a different seed is a different fight');
  ch1.forEach((e) => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) { const S = simulate([e.id], { seed: i + 1, profile: PROFILES.dummy, maxTurns: 1 }); seen.add(S.enemies[0].maxHp); }
    t.ok(Math.min(...seen) >= e.hp[0] && Math.max(...seen) <= e.hp[1], `${e.id} rolls inside ${e.hp}`);
    t.ok(seen.has(e.hp[0]) && seen.has(e.hp[1]), `${e.id} rolls both ends of ${e.hp}`);
  });
});

// =====================================================================================================================
// 7. the real engine (when js/combat.js and the Hanae and Kuro card files exist): every group through COMBAT.simulate
// =====================================================================================================================
// The independent simulator above proves the data is self-consistent; this section proves it against the engine the game ships.
// Two real decks: `starter` (the ten starter cards of Hanae and Kuro) and `decent` (the starters with three of five upgraded per
// hero, plus two cheap common attacks and two cheap common skills per hero, chosen by id so the deck never depends on a hand edit).
// The bot is COMBAT.greedyPolicy, so these are the very numbers the balance wave will start from. Coverage runs use a `chip` policy:
// Block with every skill, one attack a turn at the weakest enemy, heroes with 999 HP, so every enemy gets to use its whole move set.
const engineFile = path.join(DIR, 'js', 'combat.js');
const HAVE_ENGINE = fs.existsSync(engineFile);
const skip = (why) => t.test('engine cross-check skipped: ' + why, () => t.ok(true, why));
if (!HAVE_ENGINE) skip('js/combat.js does not exist yet');
else {
  let ge = null, bootErr = null;
  try { ge = boot({ only: ['util', 'data', 'data_text', 'combat', 'data_enemies_1'], continue: true }); } catch (e) { bootErr = e; }
  const engineOk = ge && ge.COMBAT && (!ge._errors || !ge._errors.some((x) => /combat|data_text|data_enemies_1/.test(x.file)));
  const HEROES = ['hanae', 'kuro'];
  const haveCards = engineOk && HEROES.every((h) => ge.DATA.heroes[h].starter.every((id) => ge.DATA.cards[id]) && Object.values(ge.DATA.cards).filter((c) => c.hero === h).length >= 30);
  if (!engineOk) skip('combat.js is present but does not load yet: ' + String(bootErr || JSON.stringify(ge && ge._errors)));
  else if (!haveCards) skip('the Hanae and Kuro card files are not complete yet');
  else {
    const { COMBAT, DATA: D2, U: U2 } = ge;
    // The junk the enemies add (CONTENT_SPEC 2). Defined here only while data_cards_shared.js has not written them, exactly as specified,
    // so the engine numbers below include the clutter (an unknown card id is silently ignored by COMBAT and would flatter the boss fight).
    const junk = (id, name, extra) => { if (!D2.cards[id]) D2.add('cards', { [id]: Object.assign({ id, name, hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable', 'ethereal'], art: { m: 'void' } }, extra || {}) }); };
    junk('status_blot', 'Blot'); junk('status_scorch', 'Scorch', { art: { m: 'fire' }, hand: { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] } });
    const inst = (id, up, uid) => ({ uid, id, up: up ? 1 : 0, gems: (D2.cards[id].slots || []).map(() => null) });
    const starterDeck = () => { let u = 1; const d = []; HEROES.forEach((h) => D2.heroes[h].starter.forEach((id) => d.push(inst(id, false, u++)))); return d; };
    const decentDeck = () => {
      let u = 1; const d = [];
      HEROES.forEach((h) => {
        D2.heroes[h].starter.forEach((id, i) => d.push(inst(id, i % 2 === 0, u++)));
        const commons = Object.values(D2.cards).filter((c) => c.hero === h && c.rarity === 'common' && typeof c.cost === 'number' && c.cost <= 1).sort((a, b) => (a.id < b.id ? -1 : 1));
        commons.filter((c) => c.type === 'attack').slice(0, 2).concat(commons.filter((c) => c.type === 'skill').slice(0, 2)).forEach((c) => d.push(inst(c.id, false, u++)));
      });
      return d;
    };
    const tierOf = (ids) => (ids.some((x) => E[x].tier === 'boss') ? 'boss' : ids.some((x) => E[x].tier === 'elite') ? 'elite' : 'normal');
    const heroesAt = (hp) => HEROES.map((h) => ({ id: h, hp: hp === undefined ? D2.heroes[h].maxHp : Math.min(hp, D2.heroes[h].maxHp * 20), maxHp: hp === undefined ? D2.heroes[h].maxHp : hp }));
    const play = (ids, deck, seed, o) => {
      o = o || {};
      return COMBAT.simulate({ heroes: o.heroes || heroesAt(), frontIdx: 0, deck: deck(), enemies: ids, tier: o.tier || tierOf(ids), chapter: 1, seed, mods: D2.foldMods([]), relics: [], gold: o.gold === undefined ? 60 : o.gold, maxTurns: o.maxTurns || 60 }, o.policy);
    };
    const lostOf = (s) => s.heroes.reduce((a, h) => a + (h.maxHp - h.hp), 0);
    const many = (ids, deck, n, o) => { const out = []; for (let i = 1; i <= n; i++) out.push(play(ids, deck, U2.hash('eng1', ids.join('+'), i), o)); return out; };
    const avg = (arr, f) => arr.reduce((a, x) => a + f(x), 0) / arr.length;
    const winRate = (runs) => runs.filter((r) => r.result === 'win').length / runs.length;
    function chipPolicy() {
      const st = { turn: -1, attacks: 0 };
      return (C) => {
        if (C.pending) return { type: 'pick', uids: C.pending.uids.slice(0, C.pending.optional ? 0 : C.pending.n) };
        if (C.phase !== 'player') return null;
        if (C.turn !== st.turn) { st.turn = C.turn; st.attacks = 0; }
        for (const c of C.hand) if (D2.cards[c.id].type === 'skill' && !C.needsTarget(c.uid) && C.canPlay(c.uid).ok) return { type: 'play', uid: c.uid };
        if (st.attacks < 1) {
          for (const c of C.hand) {
            if (D2.cards[c.id].type !== 'attack') continue;
            const ts = C.legalTargets(c.uid).slice().sort((a, b) => (C.unit(a).hp + C.unit(a).block) - (C.unit(b).hp + C.unit(b).block));
            if (C.canPlay(c.uid, ts[0]).ok) { st.attacks++; return { type: 'play', uid: c.uid, target: ts[0] }; }
          }
        }
        return { type: 'end' };
      };
    }
    const chip = (ids, n, o) => many(ids, decentDeck, n, Object.assign({ heroes: heroesAt(999), maxTurns: 70, policy: chipPolicy() }, o || {}));
    const eventsOf = (s) => s.C.events;

    t.test('engine: every group is won by the starter deck and the decent deck, and finishes without a cap', () => {
      groups.forEach((x) => ['starter', 'decent'].forEach((d) => {
        const runs = many(x.enemies, d === 'starter' ? starterDeck : decentDeck, 12);
        runs.forEach((r) => { t.ok(!r.capped, `${x.id} ${d} did not hit the turn cap`); t.ok(r.result === 'win' || r.result === 'lose', `${x.id} ${d} ended`); });
        t.ok(winRate(runs) >= (P1.elite.indexOf(x) >= 0 ? 0.9 : 1), `${x.id} ${d} win rate ${winRate(runs)}`);
      }));
      const boss = many(['boss_kuzunoha'], starterDeck, 12);
      t.ok(winRate(boss) >= 0.75, `the boss against starter decks alone: ${winRate(boss)}`);
    });

    t.test('engine: fight length lands in band for a decent deck (targets: normal groups 3 to 5 turns, elites 5 to 7, boss 8 to 12; the rails are a little wider so card tuning elsewhere does not break this suite)', () => {
      const N = 40;
      const normal = P1.normal.map((x) => { const r = many(x.enemies, decentDeck, N); return { x, turns: avg(r, (s) => s.turns), lost: avg(r, lostOf), win: winRate(r) }; });
      const pooled = normal.reduce((a, m) => a + m.turns, 0) / normal.length;
      t.ok(pooled >= 2.5 && pooled <= 5.2, `normal groups average ${pooled.toFixed(2)} turns (want 3 to 5; solos are shorter, pairs and swarms longer)`);
      normal.forEach((m) => {
        const solo = m.x.enemies.filter((id) => E[id].tier !== 'minion').length === 1;
        t.ok(m.turns >= (solo ? 1.5 : 2) && m.turns <= 6, `${m.x.id}: ${m.turns.toFixed(2)} turns`);
        t.ok(m.lost <= 35, `${m.x.id}: costs ${m.lost.toFixed(0)} HP <= 35`);
        t.eq(m.win, 1, `${m.x.id} always won`);
      });
      const cost = normal.reduce((a, m) => a + m.lost, 0) / normal.length;
      t.ok(cost >= 3 && cost <= 22, `a normal fight costs ${cost.toFixed(1)} HP on average`);
      // difficulty rises with min: the top third of groups costs clearly more than the bottom third
      const byMin = normal.slice().sort((a, b) => a.x.min - b.x.min), third = Math.floor(byMin.length / 3);
      t.ok(avg(byMin.slice(-third), (m) => m.lost) > avg(byMin.slice(0, third), (m) => m.lost) * 1.5, 'late groups cost clearly more HP than early ones');
      t.ok(avg(byMin.slice(-third), (m) => m.turns) > avg(byMin.slice(0, third), (m) => m.turns), 'and last longer');
      P1.elite.forEach((x) => {
        const r = many(x.enemies, decentDeck, N), turns = avg(r, (s) => s.turns), lost = avg(r, lostOf);
        t.ok(turns >= 4.2 && turns <= 8.2, `${x.id}: ${turns.toFixed(2)} turns in 4.2..8.2 (target 5 to 7)`);
        t.ok(lost >= 10 && lost <= 70, `${x.id}: costs ${lost.toFixed(0)} HP in 10..70`);
        t.ok(winRate(r) >= 0.95, `${x.id} is beaten by a decent deck`);
        const st = avg(many(x.enemies, starterDeck, N), (s) => s.turns);
        t.ok(st >= turns - 0.2, `${x.id}: the starter deck is not faster than the decent deck (${st.toFixed(2)} vs ${turns.toFixed(2)})`);
      });
      const b = many(['boss_kuzunoha'], decentDeck, N), bt = avg(b, (s) => s.turns), bl = avg(b, lostOf);
      t.ok(bt >= 7.5 && bt <= 13, `boss: ${bt.toFixed(2)} turns in 7.5..13 (target 8 to 12)`);
      t.ok(bl >= 35 && bl <= 100, `boss: costs ${bl.toFixed(0)} HP in 35..100`);
      t.ok(winRate(b) >= 0.95, 'a decent deck beats the boss');
    });

    t.test('engine: every enemy uses every one of its moves, phases fire once, and every intent is honest', () => {
      const seen = {}, phases = {}, summonsBy = {};
      const note = (s) => eventsOf(s).forEach((e) => {
        if (e.type === 'enemy_act') { const def = e.enemy.split('#')[0]; (seen[def] = seen[def] || {})[e.move] = true; t.ok(L.intents.indexOf(e.kind) >= 0 && e.kind === E[def].moves[e.move].kind, `${e.enemy}.${e.move} act kind ${e.kind}`); }
        if (e.type === 'enemy_phase') { const def = e.enemy.split('#')[0]; (phases[def] = phases[def] || []).push(e); }
        if (e.type === 'intent') {
          const def = e.enemy.split('#')[0], m = E[def].moves[e.intent.move];
          t.ok(m && e.intent.kind === m.kind, `${e.enemy} intent kind ${e.intent.kind} matches move ${e.intent.move}`);
          t.ok(typeof e.intent.text === 'string' && e.intent.text.length > 0, `${e.enemy} intent ${e.intent.move} has text`);
        }
        if (e.type === 'summon') { const by = e.enemy.def; summonsBy[by] = (summonsBy[by] || 0) + 1; }
      });
      // one chip run per group plus every enemy alone, several seeds so weighted enemies show all their moves
      const lists = groups.map((x) => x.enemies).concat(ch1.map((e) => [e.id]), [['boss_kuzunoha']]);
      lists.forEach((ids) => chip(ids, 4).forEach(note));
      // heroes already hurt: the boss hunts the weakest (heroHpLt rule)
      many(['boss_kuzunoha'], decentDeck, 3, { heroes: [{ id: 'hanae', hp: 15, maxHp: 76 }, { id: 'kuro', hp: 15, maxHp: 60 }], policy: chipPolicy() }).forEach(note);
      ch1.forEach((e) => Object.keys(e.moves).forEach((m) => t.ok(seen[e.id] && seen[e.id][m], `engine: ${e.id}.${m} was used in a fight`)));
      t.ok((phases.oni_brute || []).length >= 4 && (phases.boss_kuzunoha || []).length >= 4, 'the brute and the boss changed form in the runs');
      (phases.oni_brute || []).concat(phases.boss_kuzunoha || []).forEach((p) => { t.eq(p.index, 1, 'phase index 1'); t.ok(p.say && p.say.length > 8, 'phase say'); });
      t.ok(summonsBy.paper_kodama >= 4 && summonsBy.leaf_imp >= 4, 'paper kodama and leaf imps were summoned (by the boss, the kodama and the guardian)');
    });

    t.test('engine: summons stay at 2 living minions per summoner and the line at 5', () => {
      const check = (ids, label) => chip(ids, 4).forEach((s) => {
        const alive = new Set(); let peak = 0, line = ids.length;
        eventsOf(s).forEach((e) => {
          if (e.type === 'summon') { alive.add(e.enemy.id); line++; }
          if (e.type === 'death' && alive.has(e.unit.id)) alive.delete(e.unit.id);
          if (e.type === 'flee') alive.delete(e.unit.id);
          peak = Math.max(peak, alive.size);
        });
        t.ok(peak <= 2, `${label}: ${peak} living summons <= 2`);
        t.ok(s.C.enemies.filter((e) => !e.down).length <= 5, `${label}: line <= 5`);
      });
      check(['kodama'], 'kodama'); check(['kodama', 'kappa'], 'kodama+kappa'); check(['moss_guardian'], 'guardian'); check(['boss_kuzunoha'], 'boss');
      check(['bamboo_sprite', 'bamboo_sprite', 'kodama'], 'swarm');
    });

    t.test('engine: the thief steals 20, keeps it when it flees, returns it when killed, and steals nothing from an empty purse', () => {
      const solo = many(['tanuki_bandit'], starterDeck, 30), pair = many(['tanuki_bandit', 'kodama'], starterDeck, 30);
      [solo, pair].forEach((runs) => runs.forEach((r) => t.ok(r.gold === 0 || r.gold === -20, `net gold ${r.gold} is 0 or -20`)));
      t.ok(solo.every((r) => eventsOf(r).some((e) => e.type === 'gold' && e.n === -20)), 'the theft happens in every solo fight (it opens with the snatch)');
      t.ok(solo.filter((r) => r.gold === 0).length >= 20, 'and a focused party gets the gold back');
      t.ok(pair.filter((r) => r.gold === -20).length >= 3 && pair.filter((r) => r.gold === 0).length >= 3, 'in company the thief sometimes escapes with it and sometimes does not');
      many(['tanuki_bandit'], starterDeck, 6, { gold: 0 }).forEach((r) => t.ok(!eventsOf(r).some((e) => e.type === 'gold'), 'no gold, no theft'));
      many(['tanuki_bandit'], decentDeck, 6, { gold: 8 }).forEach((r) => t.ok(r.gold >= -8, 'it never takes more than the party holds'));
      const slow = chip(['tanuki_bandit'], 3, { tier: 'normal' });
      slow.forEach((r) => { t.eq(r.gold, -20, 'a party that lets it run loses 20'); t.ok(eventsOf(r).some((e) => e.type === 'flee'), 'and it fled'); });
    });

    t.test('engine: intent text names every rider (steals, swaps, summons, adds, burn) so nothing is a surprise', () => {
      const texts = {};
      lists2().forEach((s) => eventsOf(s).forEach((e) => { if (e.type === 'intent') texts[e.intent.move + '@' + e.enemy.split('#')[0]] = e.intent.text; }));
      function lists2() { return groups.map((x) => x.enemies).concat([['boss_kuzunoha']]).flatMap((ids) => chip(ids, 3)); }
      const has2 = (k, re) => t.ok(re.test(texts[k] || ''), `${k}: "${texts[k]}" matches ${re}`);
      const I = (src) => new RegExp(src, 'i');
      has2('snatch_and_grab@tanuki_bandit', I('steals 20 gold')); has2('switcheroo@crow_tengu', I('swaps your rows')); has2('dive_bomb@crow_tengu', I('back hero'));
      has2('call_leaf_imp@kodama', I('summons')); has2('rattle@kodama', I('both heroes')); has2('ember_touch@hitodama', I('burn')); has2('scorch_scatter@hitodama', I('adds'));
      has2('mud_slap@kappa', I('vulnerable')); has2('hop_hop@karakasa', /x2/); has2('tongue_lick@karakasa', I('frail')); has2('spore_puff@mushroom_folk', I('poison'));
      has2('nine_tails@boss_kuzunoha', /x9/); has2('tail_sweep@boss_kuzunoha', I('both heroes')); has2('ink_bleed@boss_kuzunoha', I('adds 2')); has2('mask_gaze@boss_kuzunoha', I('weak'));
      has2('paper_fold@boss_kuzunoha', I('summons 2')); has2('shell_guard@kappa', I('block')); has2('refill_dish@kappa', I('heals')); has2('dash_off@tanuki_bandit', I('flees'));
    });

    t.test('engine: start ops are in force from turn 1, and immunities refuse the statuses they name', () => {
      const mk = (ids, extraCards) => {
        const deck = decentDeck(); (extraCards || []).forEach((id, i) => deck.push(inst(id, false, 900 + i)));
        const C = COMBAT.create({ heroes: heroesAt(), frontIdx: 0, deck, enemies: ids, tier: tierOf(ids), chapter: 1, seed: 3, mods: D2.foldMods([]), relics: [], gold: 60 });
        C.start(); return C;
      };
      const st = (id) => mk([id]).enemies[0].st;
      t.eq(st('hitodama').dodge, 1, 'hitodama starts with Dodge 1'); t.eq(st('oni_cub').ritual, 1, 'the cub starts with Ritual 1');
      t.eq(st('bamboo_boar').plating, 3, 'the boar starts with Plating 3'); t.deep([st('moss_guardian').plating, st('moss_guardian').thorns], [3, 2], 'the guardian starts with Plating 3 and Thorns 2');
      t.eq(st('mushroom_folk').thorns, undefined, 'the mushroom has no Thorns until it grows its cap');
      // find a real Kuro card that applies a status to one enemy and play it on the immune creature
      const applier = (s2) => Object.values(D2.cards).find((c) => c.hero === 'kuro' && c.type !== 'power' && typeof c.cost === 'number' && c.cost <= 1 && D2.cardOps(c.id).some((o) => o.op === 'status' && o.s === s2 && (o.tgt === undefined || o.tgt === 'enemy')));
      [['burn', 'hitodama'], ['burn', 'ember_wisp'], ['poison', 'mushroom_folk']].forEach(([status, target]) => {
        const card = applier(status);
        if (!card) { t.ok(true, `no cheap Kuro card applies ${status}: skipped`); return; }
        const C = mk([target], [card.id]);
        const c = C.hand.find((x) => x.uid === 900) || (() => { const k = C.draw.findIndex((x) => x.uid === 900); const [m] = C.draw.splice(k, 1); C.hand.push(m); return m; })();
        C.energy = 3;
        const ts = C.legalTargets(c.uid), evs = C.play(c.uid, ts[0]);
        t.ok(evs.some((e) => e.type === 'immune' && e.s === status), `${target} is immune to ${status} (${card.id})`);
        t.ok(!(C.enemies[0].st[status] > 0), `and carries no ${status}`);
      });
    });

    t.test('engine: Ink Trial factors scale these enemies (HP rounds, damage floors per hit) without breaking any move', () => {
      const scaled = (ids, mods) => COMBAT.simulate({ heroes: heroesAt(999), frontIdx: 0, deck: decentDeck(), enemies: ids, tier: tierOf(ids), chapter: 1, seed: 5, mods: Object.assign(D2.foldMods([]), mods), relics: [], gold: 60, maxTurns: 40 }, chipPolicy());
      const hp0 = scaled(['boss_kuzunoha'], {}).C.enemies[0].maxHp, hp1 = scaled(['boss_kuzunoha'], { bossHp: 1.5 }).C.enemies[0].maxHp;
      t.eq(hp1, Math.round(hp0 / 1 * 1.5), 'bossHp 1.5 multiplies the rolled HP');
      const minion = scaled(['kodama'], { enemyHp: 2 }).C.enemies[0].maxHp; t.ok(minion >= 40 && minion <= 48, 'enemyHp 2 doubles a normal');
      const raws = (mods) => eventsOf(scaled(['bamboo_sprite', 'bamboo_sprite'], mods)).filter((e) => e.type === 'hit' && e.src && e.src.kind === 'enemy' && e.dst.kind === 'hero').map((e) => e.raw);
      t.ok(raws({}).every((r) => r === 2 || r === 3), 'sprite hits are 2 (3 once whetted)');
      t.ok(raws({ enemyDmg: 0.5 }).length > 0 && raws({ enemyDmg: 0.5 }).every((r) => r <= 2), 'enemyDmg 0.5 halves them');
      t.ok(Math.max(...raws({ enemyDmg: 1.5 })) >= 3, 'enemyDmg 1.5 raises a 2 to 3');
      ['kappa', 'moss_guardian', 'boss_kuzunoha'].forEach((id) => { const s2 = scaled([id], { enemyHp: 1.4, eliteHp: 1.4, bossHp: 1.4, enemyDmg: 1.4 }); t.ok(s2.result === 'win' || s2.result === 'lose' || s2.capped, `${id} still plays out under a harsh trial`); });
    });

    t.test('engine: the boss fight reads as designed (opening fold, blot pressure, one form change, at least one Nine-Tail Storm before the end)', () => {
      const runs = many(['boss_kuzunoha'], decentDeck, 12);
      runs.forEach((r) => {
        const acts = eventsOf(r).filter((e) => e.type === 'enemy_act').map((e) => e.move);
        t.eq(acts[0], 'paper_fold', 'the very first action is the paper fold');
        t.eq(eventsOf(r).filter((e) => e.type === 'enemy_phase').length, 1, 'exactly one form change');
        const riseAt = acts.indexOf('tails_rise'), stormAt = acts.indexOf('nine_tails');
        t.ok(riseAt >= 0, 'the tails rise in every fight that reaches the second form');
        if (stormAt >= 0) t.ok(riseAt < stormAt, 'and they rise before the storm');
        t.ok(acts.indexOf('great_stroke') === -1 || acts.indexOf('great_stroke') < riseAt || riseAt < 0, 'the heavy stroke belongs to the first form');
      });
      t.ok(runs.filter((r) => eventsOf(r).some((e) => e.type === 'enemy_act' && e.move === 'nine_tails')).length >= 6, 'most fights see the storm');
      // the storm is nine hits: count hit events of one storm action
      const r = runs.find((x) => eventsOf(x).some((e) => e.type === 'enemy_act' && e.move === 'nine_tails'));
      if (r) {
        const evs = eventsOf(r), at = evs.findIndex((e) => e.type === 'enemy_act' && e.move === 'nine_tails');
        let hits = 0; for (let i = at + 1; i < evs.length && evs[i].type !== 'enemy_act' && evs[i].type !== 'turn_end'; i++) if (evs[i].type === 'hit' || evs[i].type === 'dodge') hits++;
        t.eq(hits, 9, 'the Nine-Tail Storm lands nine hits');
        t.ok(evs.slice(at).some((e) => e.type === 'hit' && e.src && e.src.id.indexOf('boss_kuzunoha') === 0 && e.raw === 3), 'each hit is 2 plus the second form Might: 3');
      }
    });
  }
}

t.done();
