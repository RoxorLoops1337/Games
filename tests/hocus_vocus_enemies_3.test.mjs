// Chapter 3 roster suite (hocus_vocus/js/data_enemies_3.js): the Crimson Sky Citadel.
//
//   node tests/hocus_vocus_enemies_3.test.mjs                         run the suite
//   RB_ENEMIES3_REPORT=1 node tests/hocus_vocus_enemies_3.test.mjs    also print the balance tables (every group, elite and the boss)
//   RB_ENEMIES3_TRACE=boss_editor node ...                           print one real fight turn by turn (comma list of enemy ids, optional :level)
//   RB_ENEMIES3_NOENGINE=1 node ...                                  run only the static layers (what the suite does while combat.js is not written yet)
//
// Layers of checking, cheapest first:
//   1. structure   the fixed roster; DATA.validate and DATA.audit are clean (errors, warnings, audit AND guide lines: zero); plain data; copy limits
//   2. bands       HP and damage per tier from the CONTENT_SPEC 4.2 table, computed from the fx ops (V caps, `both` counts twice, Might from
//                  start and phase ops); boss round totals; status magnitudes; group budgets (the audit's average AND an effective average)
//   3. coverage    every mechanic CONTENT_SPEC 4.3 asks for, plus the role each roster line promises, checked on the ops themselves
//   4. AI          every move reachable (state enumeration over every condition), no shadowed rule, summon cap gating, phases ordered,
//                  encounter pools well formed
//   5. engine      REAL COMBAT fights (COMBAT.simulate with the default greedy bot) against synthetic hero decks: every fight ends, bands
//                  hold, every move fires, phases and summons behave, and every designed piece of counter-play works for real
//                  (the komainu's Thorns window, the wraith's Rub Through reading Block, Rank Strike reading the crowd, the stamp that a Stun cancels,
//                  Bind then Stun then Verdict, the Charge clock, and the boss: Proofread then Red Pen, Clean Slate, Unwrite reading its minions)
//
// The synthetic decks live in this file: hanae and kuro from DATA.heroes with their real rows, cards built from the CONTENT_SPEC 3 power
// guidance and grown through the chapter with upgrades and gems (three power levels, plus a boss deck that carries a boss relic worth +1 Energy
// and a curse as its drawback, because a run that reaches the chapter 3 boss owns two boss relics). Their power is part of the contract and is
// measured here (a training dummy that never hits back). The suite boots WITHOUT any peer content file (cards, relics, gems, events, chapter 1
// and 2 enemies) so nobody else's balance work can move these numbers. The six junk cards enemies add are defined here exactly as CONTENT_SPEC
// section 2 says, because data_cards_shared.js is not loaded. If the balance wave retunes decks or HP, read these bands first.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus enemies_3');
const REPORT = !!process.env.RB_ENEMIES3_REPORT;
const TRACE = process.env.RB_ENEMIES3_TRACE;
const CH = 3;
const HAVE_ENGINE = !process.env.RB_ENEMIES3_NOENGINE && fs.existsSync(path.join(DIR, 'js', 'combat.js')) && fs.existsSync(path.join(DIR, 'js', 'data_text.js'));

const PEERS = ['data_cards_*', 'data_enemies_1', 'data_enemies_2', 'data_relics', 'data_gems', 'data_events', 'data_meta'];
const { DATA, U, COMBAT } = boot({ only: ['data_enemies_3'].concat(HAVE_ENGINE ? ['data_text', 'combat'] : []), skip: PEERS });
const L = DATA.LISTS, G = DATA.GUIDE;
const E = (id) => DATA.enemies[id];
const ids = DATA.enemyIds(CH);
const tierIds = (tier) => ids.filter((id) => E(id).tier === tier);
const normals = tierIds('normal'), elites = tierIds('elite'), minions = tierIds('minion'), boss = 'boss_editor';
const groups = { normal: DATA.encounters[CH].normal, elite: DATA.encounters[CH].elite };
const allGroups = groups.normal.concat(groups.elite);
const roster = DATA.ROSTER[CH];
const STATUS_CARDS = DATA.FIXED.statusCards;
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;

// ---------------------------------------------------------------------------------------------------------------------
// op analysis helpers
// ---------------------------------------------------------------------------------------------------------------------
const flat = (fx) => { const out = []; DATA.walkOps(fx, (o) => out.push(o)); return out; };
const movesOf = (e) => Object.keys(e.moves).map((k) => ({ id: k, ...e.moves[k] }));
const allAis = (e) => [e.ai].concat((e.phases || []).map((p) => p.ai).filter(Boolean));
const opsOfEnemy = (e) => [].concat(...movesOf(e).map((m) => flat(m.fx)), flat(e.start), ...(e.phases || []).map((p) => flat(p.fx)), ...(e.hooks || []).map((h) => flat(h.fx)));
const dmgOps = (m) => flat(m.fx).filter((o) => o.op === 'dmg');
const HERO_TGT = ['front', 'back', 'both', 'random', 'lowest'];
const onHeroes = (o) => (o.tgt === undefined ? o.op === 'status' && DATA.isDebuff(o.s) : HERO_TGT.indexOf(o.tgt) >= 0);
// the largest number a V can reach (an uncapped V counts as unbounded, which the band tests then reject)
const vMax = (v) => {
  if (typeof v === 'number') return v;
  if (v.cap !== undefined) return v.cap;
  if (v.per === undefined) return v.base || 0;
  if (v.upTo !== undefined) return (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * v.upTo;
  return Infinity;
};
const hitsOf = (o) => (o.hits === undefined ? 1 : o.hits);
const hitMax = (m) => Math.max(0, ...dmgOps(m).map((o) => vMax(o.n)));
// worst case damage of one action to the party: every hit at its cap, `both` counted twice, plus Might per hit
const actionMax = (m, might = 0) => dmgOps(m).reduce((s, o) => s + (vMax(o.n) + might) * hitsOf(o) * (o.tgt === 'both' ? 2 : 1), 0);
const mightIn = (ops) => flat(ops).filter((o) => o.op === 'status' && o.s === 'might' && (o.tgt === undefined || o.tgt === 'self')).reduce((s, o) => s + o.n, 0);
// the audit's own average (base values over the seq or weighted list): the number the group budget is measured with
const n1 = (v) => (typeof v === 'number' ? v : v.base || 0);
const auditAvg = (e) => {
  const dmg = (m) => dmgOps(m).reduce((s, o) => s + n1(o.n) * Math.max(1, n1(o.hits === undefined ? 1 : o.hits)), 0);
  const ai = e.ai;
  if (ai.weighted) { const tot = ai.weighted.reduce((s, x) => s + x[1], 0); return ai.weighted.reduce((s, x) => s + dmg(e.moves[x[0]]) * x[1] / tot, 0); }
  return ai.seq.reduce((s, m) => s + dmg(e.moves[m]), 0) / ai.seq.length;
};
// an EFFECTIVE average: what a move really deals in a given group, `both` counted twice. `crowd` is the number of living enemies (Rank Strike),
// `block` the front hero's Block (Rub Through), `plating` the golem's Plating (Origami Slam), `missing` a hero's missing HP (Final Verdict)
function valueOf(v, env) {
  if (typeof v === 'number') return v;
  let c = 0;
  if (v.per === 'enemies') c = env.crowd;
  else if (v.per === 'block') c = env.block;
  else if (v.per === 'status' && v.s === 'plating') c = env.plating;
  else if (v.per === 'status' && v.s === 'charge') c = env.charge;
  else if (v.per === 'missingHp') c = env.missing;
  else if (v.per === 'turn') c = env.turn;
  let x = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * (v.upTo !== undefined ? Math.min(c, v.upTo) : c);
  if (v.min !== undefined) x = Math.max(x, v.min);
  if (v.cap !== undefined) x = Math.min(x, v.cap);
  return Math.floor(x);
}
const effAvg = (e, crowd) => {
  const env = { crowd, block: 8, plating: 9, charge: 5, missing: 20, turn: 3 };
  const dmg = (m) => dmgOps(m).reduce((s, o) => s + valueOf(o.n, env) * Math.max(1, hitsOf(o)) * (o.tgt === 'both' ? 2 : 1), 0);
  const ai = e.ai;
  if (ai.weighted) { const tot = ai.weighted.reduce((s, x) => s + x[1], 0); return ai.weighted.reduce((s, x) => s + dmg(e.moves[x[0]]) * x[1] / tot, 0); }
  return ai.seq.reduce((s, m) => s + dmg(e.moves[m]), 0) / ai.seq.length;
};
const groupEnemies = (g) => g.enemies.map(E);
const isSummoner = (e) => opsOfEnemy(e).some((o) => o.op === 'summon');

// ---------------------------------------------------------------------------------------------------------------------
// AI conditions (DESIGN 4.5 "AI conditions"), for the reachability check
// ---------------------------------------------------------------------------------------------------------------------
const aiCond = (c, w) => {
  if (c.hpLt !== undefined && !(w.hpFrac < c.hpLt)) return false;
  if (c.hpGt !== undefined && !(w.hpFrac > c.hpGt)) return false;
  if (c.turnGte !== undefined && !(w.turn >= c.turnGte)) return false;
  if (c.turnEvery !== undefined && (w.turn - 1) % c.turnEvery[0] !== c.turnEvery[1]) return false;
  if (c.alone && w.others !== 0) return false;
  if (c.minions !== undefined && !(w.minions < c.minions.lt)) return false;
  if (c.heroStatus !== undefined && !(w.heroSt(c.heroStatus.s) >= (c.heroStatus.gte === undefined ? 1 : c.heroStatus.gte))) return false;
  if (c.heroDown && !w.heroDown) return false;
  if (c.allyHpLt !== undefined && !(w.allyMin < c.allyHpLt)) return false;
  if (c.heroHpLt !== undefined && !(w.heroMin < c.heroHpLt)) return false;
  return true;
};
// Enumerate abstract worlds and report which moves an AI object can choose, and whether each rule can fire unshadowed. A hero status is either
// absent or plentiful (5), which satisfies every threshold this chapter uses.
function reach(ai) {
  const rules = ai.rules || [];
  const keys = [...new Set(rules.filter((r) => r.if.heroStatus).map((r) => r.if.heroStatus.s))];
  const used = new Set(ai.open || []);
  const ruleFires = rules.map(() => false);
  let fallThrough = false;
  const combos = keys.map(() => [0, 5]).reduce((acc, lv) => { const out = []; acc.forEach((a) => lv.forEach((v) => out.push(a.concat(v)))); return out; }, [[]]);
  for (let turn = 1; turn <= 16; turn++) for (const hpFrac of [1, 0.85, 0.7, 0.55, 0.45, 0.3, 0.15, 0.05]) for (const others of [0, 1, 2]) for (const mins of [0, 1, 2]) {
    for (const heroDown of [false, true]) for (const allyMin of [1, 0.6, 0.3]) for (const heroMin of [1, 0.3, 0.1]) for (const combo of combos) {
      const w = { turn, hpFrac, others, minions: mins, heroDown, allyMin, heroMin, heroSt: (s) => combo[keys.indexOf(s)] || 0 };
      const i = rules.findIndex((r) => aiCond(r.if, w));
      if (i >= 0) { used.add(rules[i].do); ruleFires[i] = true; } else fallThrough = true;
    }
  }
  if (fallThrough) { (ai.seq || []).forEach((m) => used.add(m)); (ai.weighted || []).forEach((x) => used.add(x[0])); }
  return { used, ruleFires, fallThrough };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. structure
// ---------------------------------------------------------------------------------------------------------------------
t.test('the fixed roster is defined exactly: ids, names, tiers, sizes, chapter, art ids', () => {
  t.eq(roster.length, 17, 'chapter 3 roster has 17 entries');
  t.deep(ids.slice().sort(), roster.map((r) => r.id).sort(), 'defined ids equal the roster ids (no more, no fewer)');
  roster.forEach((r) => {
    const e = E(r.id);
    t.ok(!!e, `${r.id} is defined`);
    if (!e) return;
    t.eq(e.name, r.name, `${r.id} name`); t.eq(e.tier, r.tier, `${r.id} tier`); t.eq(e.size, r.size, `${r.id} size`); t.eq(e.chapter, CH, `${r.id} chapter`);
    t.eq(e.art.id, r.id, `${r.id} art id`);
    if (r.tier === 'minion') t.eq(e.size, 's', `${r.id} minions are size s`);
  });
  t.deep([normals.length, elites.length, minions.length, tierIds('boss').length], [10, 3, 3, 1], 'tier mix 10 normal, 3 elite, 3 minion, 1 boss');
  t.eq(E(boss).title, DATA.rosterById.boss_editor.title, 'boss title');
  t.eq(E(boss).name, DATA.rosterById.boss_editor.name, 'boss name');
  t.eq(DATA.FIXED.bosses[CH], boss, 'the chapter boss id is the fixed one');
});

t.test('DATA.validate and DATA.audit are clean for chapter 3 (errors, warnings, audit lines, guide lines)', () => {
  const v = DATA.validate('enemies', { chapter: CH });
  t.eq(v.errors.length, 0, 'validate errors: ' + v.errors.join(' | '));
  t.eq(v.warnings.length, 0, 'validate warnings: ' + v.warnings.join(' | '));
  const a = DATA.audit('enemies', { chapter: CH });
  t.eq(a.filter((x) => x.indexOf('audit') === 0).length, 0, 'audit lines: ' + a.join(' | '));
  t.eq(a.filter((x) => x.indexOf('guide') === 0).length, 0, 'guide lines: ' + a.join(' | '));
});

t.test('content is plain data: JSON round trip, no functions, no dashes, no forbidden fields', () => {
  ids.forEach((id) => {
    const e = E(id);
    t.deep(JSON.parse(JSON.stringify(e)), e, `${id} survives a JSON round trip (plain data)`);
    t.ok(!DASH.test(JSON.stringify(e)), `${id} has no em or en dash`);
    t.deep(Object.keys(e).filter((k) => ['id', 'name', 'title', 'chapter', 'tier', 'size', 'hp', 'moves', 'ai', 'start', 'phases', 'hooks', 'immune', 'art', 'lore', 'tags'].indexOf(k) < 0), [], `${id} has only schema fields`);
  });
  allGroups.forEach((g) => t.ok(!DASH.test(JSON.stringify(g)), `${g.id} has no dash`));
});

t.test('lore and copy: bestiary voice, length limits, tags, move names and barks', () => {
  const sentences = (s) => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  ids.forEach((id) => {
    const e = E(id);
    t.ok(typeof e.lore === 'string' && e.lore.length >= 60 && e.lore.length <= 260, `${id} lore is 60 to 260 characters (${e.lore.length})`);
    t.ok(sentences(e.lore) >= 1 && sentences(e.lore) <= 2, `${id} lore is one or two sentences (${sentences(e.lore)})`);
    t.ok(e.tags.length >= 1 && e.tags.length <= 3 && e.tags.every((x) => L.enemyTags.indexOf(x) >= 0) && new Set(e.tags).size === e.tags.length, `${id} tags are valid and unique`);
    const names = movesOf(e).map((m) => m.name);
    t.eq(new Set(names).size, names.length, `${id} move names are unique`);
    movesOf(e).forEach((m) => {
      t.ok(m.name.length >= 3 && m.name.length <= 28 && m.name.split(' ').length <= 5, `${id}.${m.id} name "${m.name}" is short`);
      if (m.say !== undefined) t.ok(m.say.length >= 3 && m.say.length <= 64, `${id}.${m.id} say is a short bark (${m.say.length})`);
    });
    (e.phases || []).forEach((p, i) => t.ok(typeof p.say === 'string' && p.say.length >= 8 && p.say.length <= 90, `${id} phase ${i + 1} say line`));
  });
  // a move name means one thing: it may repeat across enemies only where the mechanic is the very same (the wraith teaches the boss's Smother)
  const owner = {};
  ids.forEach((id) => movesOf(E(id)).forEach((m) => { (owner[m.name] = owner[m.name] || []).push(id); }));
  Object.keys(owner).filter((n) => owner[n].length > 1).forEach((n) => t.ok(n === 'Smother' && owner[n].join() === 'eraser_wraith,boss_editor', `the move name "${n}" is shared by ${owner[n].join(', ')}`));
  const lores = ids.map((id) => E(id).lore);
  t.eq(new Set(lores).size, lores.length, 'no two enemies share a lore line');
  t.ok(ids.every((id) => { const e = E(id); return e.hp[1] - e.hp[0] >= 2 && e.hp[1] - e.hp[0] <= 20; }), 'HP ranges are real ranges (a spread of 2 to 20)');
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. bands (CONTENT_SPEC 4.2, machine copy DATA.GUIDE)
// ---------------------------------------------------------------------------------------------------------------------
t.test('HP bands per tier, and taller sprites are tougher', () => {
  ids.forEach((id) => {
    const e = E(id), g = G.hp[CH][e.tier];
    t.ok(e.hp[0] >= g[0] && e.hp[1] <= g[1], `${id} hp ${e.hp} inside ${g}`);
  });
  const avgHp = (tier, size) => mean(ids.filter((id) => E(id).tier === tier && E(id).size === size), (id) => (E(id).hp[0] + E(id).hp[1]) / 2);
  t.ok(avgHp('normal', 'l') > avgHp('normal', 'm') + 10, 'large normals are clearly tougher than medium normals');
  t.ok(mean(elites, (id) => E(id).hp[0]) > Math.max(...normals.map((id) => E(id).hp[1])), 'every elite out-lasts every normal');
  t.ok(E(boss).hp[0] > 3 * Math.max(...elites.map((id) => E(id).hp[1])) - 60, 'the boss is several elites deep');
  t.ok(E(boss).hp[0] >= G.hp[CH].boss[0] && E(boss).hp[1] <= G.hp[CH].boss[1], 'boss HP is the chapter total across three phases');
});

t.test('damage bands: minion, normal, elite and boss hits (V caps, both counts twice)', () => {
  ids.forEach((id) => {
    const e = E(id);
    movesOf(e).forEach((m) => {
      const ops = dmgOps(m);
      if (!ops.length) return;
      ops.forEach((o) => t.ok(vMax(o.n) < Infinity, `${id}.${m.id}: every V has a cap`));
      const perHit = hitMax(m);
      const heavy = m.kind === 'heavy';
      if (e.tier === 'minion') t.ok(perHit <= G.hit[CH].minion[1] && perHit >= 3, `${id}.${m.id} minion hit ${perHit} inside 3..${G.hit[CH].minion[1]}`);
      if (e.tier === 'normal') {
        if (heavy) t.ok(perHit >= 18 && perHit <= G.heavy[CH].normal[1], `${id}.${m.id} heavy ${perHit} inside 18..${G.heavy[CH].normal[1]}`);
        else t.ok(perHit <= G.hit[CH].normal[1], `${id}.${m.id} hit ${perHit} <= ${G.hit[CH].normal[1]}`);
      }
      if (e.tier === 'elite') {
        if (heavy) t.ok(perHit >= 18 && perHit <= 30, `${id}.${m.id} elite heavy ${perHit} inside 18..30`);
        else t.ok(perHit <= G.hit[CH].elite[1], `${id}.${m.id} elite hit ${perHit} <= ${G.hit[CH].elite[1]}`);
      }
      if (e.tier === 'boss') {
        if (heavy) t.ok(actionMax(m) >= 26 && perHit <= G.heavy[CH].boss[1], `${id}.${m.id} boss heavy ${perHit} (one action ${actionMax(m)}) inside ${G.heavy[CH].boss}`);
        else t.ok(perHit <= G.hit[CH].boss[1], `${id}.${m.id} boss hit ${perHit} <= ${G.hit[CH].boss[1]}`);
      }
    });
  });
  // the first hit of a hard-hitting move sits inside the ordinary hit band of its tier (no toothless "attacks")
  normals.forEach((id) => t.ok(Math.max(...movesOf(E(id)).filter((m) => m.kind !== 'heavy').map(hitMax).concat(0)) >= 10 || movesOf(E(id)).some((m) => m.kind === 'multi' && actionMax(m) >= 12), `${id} has a real attack (hit >= 10 or a multi of 12 or more)`));
});

// which AI phase uses a move: 0 opening form, 1, 2 (a move counts for every AI object that can choose it)
const phasesUsing = (e, move) => allAis(e).map((ai, i) => ({ i, ai })).filter(({ ai }) => (ai.open || []).indexOf(move) >= 0 || (ai.seq || []).indexOf(move) >= 0 || (ai.weighted || []).some((x) => x[0] === move) || (ai.rules || []).some((r) => r.do === move)).map((x) => x.i);
t.test('boss round totals: <= 40 in the first two forms, <= 46 in the last (Might and both-hits included)', () => {
  const e = E(boss);
  // cumulative Might: form 1 has the start Might, form 2 adds phase 1, form 3 adds phase 2 as well
  const cum = [mightIn(e.start), mightIn(e.start) + mightIn(e.phases[0].fx), mightIn(e.start) + mightIn(e.phases[0].fx) + mightIn(e.phases[1].fx)];
  movesOf(e).forEach((m) => {
    const used = phasesUsing(e, m.id);
    t.ok(used.length > 0, `${m.id} is used by some form`);
    used.forEach((ph) => {
      const cap = ph === 2 ? G.round[CH][1] : G.round[CH][0];
      const worst = actionMax(m, cum[ph]);
      t.ok(worst <= cap, `${m.id} in form ${ph + 1}: worst action ${worst} <= ${cap} (Might ${cum[ph]})`);
    });
  });
  t.ok(auditAvg(e) <= G.round[CH][1], `average boss round (audit) ${auditAvg(e).toFixed(1)} is inside the rail`);
});

t.test('status magnitudes on heroes and enemies stay inside CONTENT_SPEC 4.2', () => {
  ids.forEach((id) => {
    const e = E(id);
    const cap = e.tier === 'boss' ? 3 : 2;
    opsOfEnemy(e).filter((o) => o.op === 'status' && onHeroes(o)).forEach((o) => {
      if (['weak', 'vulnerable', 'frail'].indexOf(o.s) >= 0) t.ok(o.n >= 1 && o.n <= cap, `${id}: ${o.s} ${o.n} on heroes is 1..${cap}`);
      if (o.s === 'bind') t.ok(o.n >= 1 && o.n <= 2, `${id}: bind ${o.n} is 1..2`);
      if (o.s === 'stun') t.eq(o.n, 1, `${id}: stun is exactly 1`);
      t.ok(['weak', 'vulnerable', 'frail', 'bind', 'stun'].indexOf(o.s) >= 0, `${id}: only the CONTENT_SPEC debuffs are put on heroes (${o.s})`);
    });
    flat(e.start).filter((o) => o.op === 'status' && (o.tgt === undefined || o.tgt === 'self')).forEach((o) => {
      if (o.s === 'plating') t.ok(o.n >= 6 && o.n <= 10, `${id}: start Plating ${o.n} is 6..10`);
      if (o.s === 'thorns') t.ok(o.n >= 4 && o.n <= 8, `${id}: start Thorns ${o.n} is 4..8`);
    });
    opsOfEnemy(e).filter((o) => o.op === 'status' && o.s === 'thorns' && (o.tgt === undefined || o.tgt === 'self')).forEach((o) => t.ok(o.n >= 4 && o.n <= 8, `${id}: Thorns ${o.n} is 4..8`));
    opsOfEnemy(e).filter((o) => o.op === 'status' && o.s === 'plating' && (o.tgt === undefined || o.tgt === 'self') && o.n > 0).forEach((o) => t.ok(o.n <= 10, `${id}: Plating step ${o.n} is at most 10`));
    opsOfEnemy(e).filter((o) => o.op === 'status' && o.s === 'ritual').forEach((o) => t.ok(o.n >= 1 && o.n <= 3, `${id}: Ritual ${o.n} is 1..3`));
    movesOf(e).filter((m) => m.kind === 'defend' && flat(m.fx).some((o) => o.op === 'block' && (o.tgt === undefined || o.tgt === 'self'))).forEach((m) => {
      const b = flat(m.fx).filter((o) => o.op === 'block' && (o.tgt === undefined || o.tgt === 'self')).reduce((s, o) => s + o.n, 0);
      if (e.tier === 'minion') t.ok(b >= 6 && b <= 12, `${id}.${m.id} minion Block ${b}`);
      else t.ok(b >= 12 && b <= 20, `${id}.${m.id} Block move ${b} is 12..20`);
    });
    movesOf(e).forEach((m) => flat(m.fx).filter((o) => o.op === 'block' && o.tgt === 'allEnemies').forEach((o) => t.ok(o.n <= 12, `${id}.${m.id}: a Block for every enemy is at most 12 (${o.n})`)));
  });
});

t.test('intent kinds are honest and specific', () => {
  ids.forEach((id) => movesOf(E(id)).forEach((m) => {
    const ops = flat(m.fx).map((o) => o.op);
    const w = `${id}.${m.id}`;
    if (m.kind === 'attack' || m.kind === 'multi' || m.kind === 'heavy') t.ok(ops.indexOf('dmg') >= 0, `${w} ${m.kind} has a dmg op`);
    if (m.kind === 'multi') t.ok(dmgOps(m).some((o) => hitsOf(o) >= 2), `${w} multi has a hits count of 2 or more`);
    if (m.kind === 'attack') t.ok(dmgOps(m).every((o) => hitsOf(o) === 1), `${w} attack is a single hit per target`);
    if (m.kind === 'heavy') t.ok(dmgOps(m).some((o) => hitsOf(o) === 1), `${w} heavy is a single big hit`);
    if (m.kind === 'defend') t.ok(ops.indexOf('block') >= 0 && ops.indexOf('dmg') < 0, `${w} defend blocks and deals no damage`);
    if (m.kind === 'summon') t.ok(ops.indexOf('summon') >= 0 && ops.indexOf('dmg') < 0, `${w} summon summons and deals no damage`);
    if (m.kind === 'debuff') t.ok(ops.indexOf('dmg') < 0 && ops.some((o) => ['status', 'removeStatus', 'add'].indexOf(o) >= 0), `${w} debuff deals no damage`);
    if (m.kind === 'buff') t.ok(ops.indexOf('dmg') < 0 && ops.indexOf('status') >= 0, `${w} buff deals no damage`);
    t.ok(m.kind !== 'none' && m.kind !== 'special' && m.kind !== 'flee', `${w} uses a plain intent kind`);
  }));
  // the chapter mixes intent kinds: every non-minion roster line shows at least two different kinds
  ids.filter((id) => E(id).tier !== 'minion').forEach((id) => t.ok(new Set(movesOf(E(id)).map((m) => m.kind)).size >= 2, `${id} mixes at least two intent kinds`));
  t.ok(new Set(ids.flatMap((id) => movesOf(E(id)).map((m) => m.kind))).size >= 7, 'the chapter uses at least seven of the intent kinds');
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. coverage
// ---------------------------------------------------------------------------------------------------------------------
const fieldEnemies = ids.filter((id) => E(id).tier !== 'minion');
const has = (id, f) => opsOfEnemy(E(id)).some(f);
t.test('CONTENT_SPEC 4.3 mechanic coverage, measured independently of DATA.audit', () => {
  const back = fieldEnemies.filter((id) => has(id, (o) => o.op === 'dmg' && (o.tgt === 'back' || o.tgt === 'both')));
  t.ok(back.length >= 4, `at least 4 enemies strike the back row or both heroes (${back.join(', ')})`);
  const debuffers = fieldEnemies.filter((id) => has(id, (o) => o.op === 'status' && onHeroes(o) && DATA.isDebuff(o.s)));
  t.ok(debuffers.length >= 5, `at least 5 enemies debuff heroes (${debuffers.join(', ')})`);
  const summoners = ids.filter((id) => isSummoner(E(id)));
  t.ok(summoners.length >= 3 && summoners.indexOf(boss) >= 0, `summoners: ${summoners.join(', ')}`);
  t.ok(fieldEnemies.filter((id) => has(id, (o) => o.op === 'status' && (o.s === 'thorns' || o.s === 'plating') && (o.tgt === undefined || o.tgt === 'self'))).length >= 4, 'at least 4 enemies grow Thorns or Plating');
  const multi = fieldEnemies.filter((id) => movesOf(E(id)).some((m) => m.kind === 'multi' || dmgOps(m).some((o) => hitsOf(o) >= 2)));
  t.ok(multi.length >= 5, `at least 5 multi-hitters (${multi.join(', ')})`);
  const junk = ids.filter((id) => has(id, (o) => o.op === 'add'));
  t.ok(junk.length >= 8, `at least 8 enemies add junk cards (${junk.join(', ')})`);
  const used = new Set(ids.flatMap((id) => opsOfEnemy(E(id)).filter((o) => o.op === 'add').map((o) => o.card)));
  STATUS_CARDS.forEach((c) => t.ok(used.has(c), `the chapter uses the status card ${c}`));
  t.ok([...used].every((c) => STATUS_CARDS.indexOf(c) >= 0), 'enemies only add the fixed status cards');
  t.ok(ids.filter((id) => has(id, (o) => o.op === 'removeStatus' && (o.tgt === 'both' || o.tgt === 'front' || o.tgt === 'back'))).length >= 3, 'at least 3 enemies erase hero statuses (buffs or resources)');
  t.ok(ids.filter((id) => movesOf(E(id)).some((m) => m.kind === 'heavy')).length >= 7, 'at least 7 enemies have a telegraphed heavy hit');
  // every enemy tier has at least one Stun or Bind source and one thing that punishes waiting
  t.ok(has('thunder_crow', (o) => o.op === 'status' && o.s === 'stun') && has('black_bar_inquisitor', (o) => o.op === 'status' && o.s === 'stun') && has('black_bar_inquisitor', (o) => o.op === 'status' && o.s === 'bind'), 'Stun comes from a normal and an elite, Bind from an elite');
  elites.forEach((id) => { const e = E(id); t.ok((e.ai.rules && e.ai.rules.length) || (e.phases && e.phases.length), `${id} has a rules entry or a phase`); });
});

t.test('every roster role is shown by the moves (one assertion group per enemy)', () => {
  const mv = (id, m) => E(id).moves[m];
  const dm = (id, m) => dmgOps(mv(id, m));
  // storm_drone: jabs in threes, lightning, static
  t.ok(dm('storm_drone', 'jab').some((o) => o.hits === 3 && o.el === 'lightning' && o.tgt === 'front') && mv('storm_drone', 'jab').kind === 'multi', 'storm_drone jabs three times with lightning');
  t.ok(dm('storm_drone', 'arc').some((o) => o.tgt === 'both') && flat(mv('storm_drone', 'arc').fx).some((o) => o.op === 'add' && o.card === 'status_static'), 'storm_drone arcs across both heroes and adds Static');
  t.ok(E('storm_drone').ai.rules.some((r) => r.do === 'overclock' && r.once && r.if.hpLt), 'storm_drone overclocks once when hurt');
  // komainu_guardian: plating, thorns in the stance only, a crushing pounce
  t.ok(flat(E('komainu_guardian').start).some((o) => o.s === 'plating') && flat(mv('komainu_guardian', 'stance').fx).some((o) => o.s === 'thorns') && flat(mv('komainu_guardian', 'pounce').fx).some((o) => o.op === 'removeStatus' && o.s === 'thorns'), 'komainu_guardian: Plating always, Thorns while braced, dropped by the pounce');
  t.eq(mv('komainu_guardian', 'pounce').kind, 'heavy', 'komainu_guardian pounce is a telegraphed heavy hit');
  // redaction_knight: hits hard and adds redacted cards
  t.ok(hitMax(mv('redaction_knight', 'cleave')) >= 14 && flat(mv('redaction_knight', 'strike').fx).some((o) => o.op === 'add' && o.card === 'status_redacted'), 'redaction_knight hits hard and adds redacted cards');
  t.ok(E('redaction_knight').hooks.some((h) => h.on === 'onDeath' && flat(h.fx).some((o) => o.card === 'status_redacted')), 'redaction_knight leaves one last black bar when it dies');
  // void_scribe: erases buffs, adds blots, reads Might
  t.ok(flat(mv('void_scribe', 'erase').fx).some((o) => o.op === 'removeStatus' && o.s === 'buffs' && o.tgt === 'both') && flat(mv('void_scribe', 'erase').fx).some((o) => o.card === 'status_blot'), 'void_scribe erases buffs on both heroes and adds blots');
  t.ok(E('void_scribe').ai.rules.some((r) => r.do === 'erase' && r.if.heroStatus && r.if.heroStatus.s === 'might'), 'void_scribe erases early when it sees Might');
  // blank_soldier: fights in ranks
  t.ok(dm('blank_soldier', 'march').some((o) => o.n.per === 'enemies' && o.n.mul >= 2), 'blank_soldier hits harder with every living enemy');
  t.ok(valueOf(dm('blank_soldier', 'march')[0].n, { crowd: 1 }) < valueOf(dm('blank_soldier', 'march')[0].n, { crowd: 3 }) - 4, 'blank_soldier is clearly weaker alone than in a crowd');
  t.ok(flat(mv('blank_soldier', 'wall').fx).some((o) => o.op === 'block' && o.tgt === 'allEnemies'), 'blank_soldier raises a wall for the whole line');
  // sky_serpent: multi-hit on the back row
  t.ok(dm('sky_serpent', 'fang').some((o) => o.hits === 3 && o.tgt === 'back'), 'sky_serpent bites the back row three times');
  t.ok(flat(mv('sky_serpent', 'tailwind').fx).some((o) => o.s === 'dodge' && o.n >= 2), 'sky_serpent slips away with Dodge');
  // eraser_wraith: rubs out Block and resource stacks
  t.ok(dm('eraser_wraith', 'rub').some((o) => o.pierce === true && o.n.per === 'block' && o.n.who === 'target'), 'eraser_wraith rubs through Block and reads it');
  t.deep(flat(mv('eraser_wraith', 'wipe').fx).filter((o) => o.op === 'removeStatus').map((o) => o.s).sort(), ['bloom', 'charge', 'sumi', 'ward'], 'eraser_wraith erases all four hero resources');
  t.eq(E('eraser_wraith').ai.rules.filter((r) => r.do === 'wipe' && r.if.heroStatus && r.if.heroStatus.gte >= 3).length, 4, 'eraser_wraith wipes when a hero hoards 3 or more of any resource');
  // thunder_crow: pecks the back row, dives for a Stun
  t.ok(dm('thunder_crow', 'peck').some((o) => o.tgt === 'back' && o.hits >= 3) && flat(mv('thunder_crow', 'dive').fx).some((o) => o.op === 'status' && o.s === 'stun' && o.tgt === 'front') && mv('thunder_crow', 'dive').kind === 'heavy', 'thunder_crow pecks the back row and dives for a Stun');
  // paper_golem: slow, heavy, Plating that feeds the slam
  t.ok(flat(E('paper_golem').start).some((o) => o.s === 'plating') && dm('paper_golem', 'slam').some((o) => o.n.per === 'status' && o.n.s === 'plating' && o.n.who === 'self'), 'paper_golem slams with its own Plating');
  t.ok(E('paper_golem').hooks.some((h) => h.on === 'onHurt' && flat(h.fx).some((o) => o.s === 'plating' && o.n < 0)), 'paper_golem tears when hit');
  // margin_imp: calls typo sprites and adds wilt
  t.ok(flat(mv('margin_imp', 'call').fx).some((o) => o.op === 'summon' && o.enemy === 'typo_sprite') && flat(mv('margin_imp', 'doodle').fx).some((o) => o.card === 'status_wilt'), 'margin_imp calls Typo Sprites and adds wilt cards');
  // censor_golem: redacted cards, plating, one huge stamp
  t.ok(flat(E('censor_golem').start).some((o) => o.s === 'plating') && has('censor_golem', (o) => o.op === 'add' && o.card === 'status_redacted') && mv('censor_golem', 'stamp').kind === 'heavy' && hitMax(mv('censor_golem', 'stamp')) >= 26, 'censor_golem: plating, redacted cards, one huge stamp');
  t.ok(flat(mv('censor_golem', 'stamp').fx).some((o) => o.s === 'vulnerable') && mv('censor_golem', 'raise').kind === 'defend', 'censor_golem: the stamp leaves Vulnerable and the turn before it is a quiet raise');
  // storm_whelp: lightning across the whole party, multi-strikes, a Charge clock
  t.ok(dm('storm_whelp', 'clap').some((o) => o.tgt === 'both' && o.el === 'lightning' && o.n.per === 'status' && o.n.s === 'charge') && dm('storm_whelp', 'breath').some((o) => o.tgt === 'both') && dm('storm_whelp', 'claws').some((o) => o.hits === 3), 'storm_whelp: lightning on both heroes, multi-strikes, a Thunderclap that reads Charge');
  t.ok(E('storm_whelp').hooks.some((h) => h.on === 'onHurt' && h.limit === 1 && flat(h.fx).some((o) => o.s === 'charge')), 'storm_whelp gains Charge every round it is hurt');
  // black_bar_inquisitor: stun, bind, a finisher against a low hero
  t.ok(has('black_bar_inquisitor', (o) => o.s === 'stun') && has('black_bar_inquisitor', (o) => o.s === 'bind') && flat(mv('black_bar_inquisitor', 'chains').fx).some((o) => o.card === 'status_tangle'), 'black_bar_inquisitor stuns, binds and hands the player a tangle card');
  t.ok(dm('black_bar_inquisitor', 'verdict').some((o) => o.tgt === 'lowest' && o.n.per === 'missingHp') && E('black_bar_inquisitor').ai.rules.some((r) => r.do === 'verdict' && r.if.heroHpLt), 'black_bar_inquisitor finishes a low hero');
  t.ok(dm('black_bar_inquisitor', 'hunt').some((o) => o.tgt === 'lowest' && o.hits >= 2), 'black_bar_inquisitor hunts the weakest hero with a multi-hit');
  // minions
  t.ok(flat(mv('blank_page', 'drift').fx).some((o) => o.op === 'block') && flat(mv('blank_page', 'wrap').fx).some((o) => o.s === 'frail'), 'blank_page gains Block, then wraps a hero in Frail');
  t.ok(flat(mv('spark_mote', 'zap').fx).some((o) => o.op === 'flee') && E('spark_mote').hooks.some((h) => h.on === 'onDeath'), 'spark_mote zaps once and bursts (and stings if popped)');
  t.ok(flat(mv('typo_sprite', 'misspell').fx).some((o) => o.card === 'status_wilt'), 'typo_sprite adds a wilt card');
});

t.test('elites: one signature mechanic each, distinct from each other, with a rules entry or a phase', () => {
  const sig = {
    censor_golem: 'a telegraphed stamp countdown (quiet raise, then DENIED) that a Stun cancels, with redacted cards',
    storm_whelp: 'a Charge clock that Thunderclap spends on both heroes',
    black_bar_inquisitor: 'Bind then Stun then a Verdict on the weakest hero',
  };
  elites.forEach((id) => t.ok(!!sig[id], `${id} has a documented signature: ${sig[id]}`));
  t.ok(has('censor_golem', (o) => o.op === 'dmg' && o.tgt === 'front') && !has('censor_golem', (o) => o.op === 'summon'), 'the censor golem is a solo wall');
  t.ok(has('storm_whelp', (o) => o.op === 'summon') && !has('black_bar_inquisitor', (o) => o.op === 'summon'), 'only the whelp of the elites calls minions');
  const kinds = elites.map((id) => new Set(movesOf(E(id)).map((m) => m.kind)));
  t.ok(kinds.every((k) => k.has('heavy')), 'each elite has a telegraphed heavy move');
  t.ok(E('censor_golem').phases[0].at === 0.5 && E('storm_whelp').phases[0].at === 0.5, 'the golem and the whelp change at half HP');
  t.ok(E('censor_golem').phases[0].ai.open[0] === 'stamp', 'the golem stamps the moment it is hurt to half HP');
});

t.test('the boss is a spectacle: open, rules, two transitions with say and real stat swings, summons, a signature move', () => {
  const e = E(boss);
  t.ok(e.ai.open && e.ai.open.length >= 1 && e.ai.rules && e.ai.rules.length >= 1, 'the boss uses open and rules');
  t.eq(e.phases.length, 2, 'three forms = two phases entries');
  t.deep(e.phases.map((p) => p.at), [0.66, 0.33], 'the transitions are at 0.66 and 0.33');
  e.phases.forEach((p, i) => {
    t.ok(p.say.length >= 15, `phase ${i + 1} has a say line`);
    t.ok(p.ai && p.ai.open && p.ai.open.length >= 1 && p.ai.rules && p.ai.rules.length >= 1, `phase ${i + 1} replaces the whole ai with an opener and rules`);
  });
  // real stat swings: form 2 gains Plating, Might and Block; form 3 drops the Plating, gains Might and cleanses
  const p1 = flat(e.phases[0].fx), p2 = flat(e.phases[1].fx);
  t.ok(p1.some((o) => o.op === 'status' && o.s === 'plating' && o.n >= 6) && p1.some((o) => o.s === 'might') && p1.some((o) => o.op === 'block'), 'the Eraser arrives armoured: Plating, Might and Block');
  t.ok(p2.some((o) => o.op === 'removeStatus' && o.s === 'plating') && p2.some((o) => o.s === 'might') && p2.some((o) => o.op === 'removeStatus' && o.s === 'weak') && p2.some((o) => o.op === 'removeStatus' && o.s === 'vulnerable'), 'the Blank Page drops the armour, gains Might and sheds Weak and Vulnerable');
  t.ok([p1, p2].every((ops) => !ops.some((o) => o.op === 'removeStatus' && (o.s === 'debuffs' || o.s === 'poison' || o.s === 'burn'))), 'a transition never wipes Poison or Burn (poison decks are not punished twice per fight)');
  // summons in every form, each with its own minion
  const sumOf = (ai) => [].concat(...['open', 'seq'].map((k) => ai[k] || []), (ai.rules || []).map((r) => r.do)).filter((m) => flat(e.moves[m].fx).some((o) => o.op === 'summon')).map((m) => flat(e.moves[m].fx).find((o) => o.op === 'summon').enemy);
  t.deep(allAis(e).map((ai) => [...new Set(sumOf(ai))]), [['blank_page'], ['typo_sprite'], ['spark_mote']], 'each form calls its own helpers: pages, typo sprites, spark motes');
  // the signature moves exist and read live state
  t.ok(dmgOps(e.moves.unwrite).some((o) => o.tgt === 'both' && o.n.per === 'enemies'), 'Unwrite hits both heroes and grows with every living enemy');
  t.ok(dmgOps(e.moves.rub).some((o) => o.pierce && o.n.per === 'block'), 'Rub Through pierces and reads Block');
  t.ok(flat(e.moves.clean.fx).some((o) => o.s === 'buffs') && ['bloom', 'sumi', 'ward', 'charge'].every((s) => flat(e.moves.clean.fx).some((o) => o.s === s)), 'Clean Slate erases every buff and every resource');
  t.ok(flat(e.moves.proofread.fx).some((o) => o.s === 'vulnerable' && o.tgt === 'front') && dmgOps(e.moves.pen).some((o) => o.hits === 3 && o.tgt === 'front'), 'Proofread makes the front hero Vulnerable for the three-hit Red Pen');
  t.ok(allAis(e)[0].seq.indexOf('proofread') + 1 === allAis(e)[0].seq.indexOf('pen'), 'the Red Pen follows the Proofread');
  t.ok(allAis(e)[2].open[0] === 'unwrite', 'the last form opens with its signature, telegraphed the moment it appears');
  t.ok(allAis(e)[1].open[0] === 'clean', 'the Eraser opens by wiping the slate, telegraphed the moment it appears');
  t.deep(e.immune, ['stun'], 'the boss lists its Stun immunity');
  t.ok(allAis(e)[2].rules.some((r) => r.do === 'last' && r.once && r.if.hpLt <= 0.15), 'a once-only last stand below 15 percent');
  t.ok(allAis(e)[2].seq.indexOf('unwrite') >= 1 && allAis(e)[2].seq[0] !== 'unwrite', 'Unwrite recurs in the last form, but never straight after the opener');
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. AI and encounters
// ---------------------------------------------------------------------------------------------------------------------
t.test('every move of every enemy is reachable, and no rule is shadowed', () => {
  ids.forEach((id) => {
    const e = E(id);
    const usedAll = new Set();
    allAis(e).forEach((ai, k) => {
      const r = reach(ai);
      r.used.forEach((m) => usedAll.add(m));
      (ai.rules || []).forEach((rule, i) => t.ok(r.ruleFires[i], `${id} ai#${k} rule ${i} (${rule.do}) can fire`));
    });
    Object.keys(e.moves).forEach((m) => t.ok(usedAll.has(m), `${id}.${m} is reachable`));
  });
});

t.test('AI shape: phases descend, weighted lists are sane, once rules are unique, openers exist', () => {
  ids.forEach((id) => {
    const e = E(id);
    (e.phases || []).forEach((p, i, a) => { t.ok(p.at > 0 && p.at < 1, `${id} phase ${i} at`); if (i > 0) t.ok(p.at < a[i - 1].at, `${id} phases descend`); });
    allAis(e).forEach((ai) => {
      t.ok(Array.isArray(ai.seq) !== Array.isArray(ai.weighted), `${id}: exactly one of seq and weighted`);
      if (ai.weighted) { t.ok(ai.weighted.length >= 2 && ai.weighted.every((x) => x[1] > 0), `${id} weighted entries are positive`); t.ok(ai.noRepeat >= 1 && ai.noRepeat <= 2, `${id} noRepeat is set`); }
      if (ai.seq) t.ok(ai.seq.length >= 1 && ai.seq.length <= 4, `${id} seq is short enough to learn (${ai.seq.length})`);
      const onces = (ai.rules || []).filter((r) => r.once).map((r) => r.do);
      t.eq(new Set(onces).size, onces.length, `${id} once rules are unique`);
      (ai.rules || []).forEach((r) => t.ok(Object.keys(r.if).length >= 1, `${id} rule ${r.do} has a condition`));
    });
    if (e.tier === 'minion') t.ok(!e.phases && !isSummoner(e), `${id} minions are simple: no phases, no summons`);
  });
  // a rule can never name the opener twice in a row by accident: the AI object of a phase never repeats the base opener
  t.ok(E('storm_whelp').ai.open[0] === 'gather' && E('storm_whelp').phases[0].ai.open[0] === 'clap', 'the whelp gathers once, and at half HP spends what it has stored');
});

t.test('summon cap: no summoner ever has more than 2 living summons (gated rules, openers, groups)', () => {
  ids.filter((id) => isSummoner(E(id))).forEach((id) => {
    const e = E(id);
    allAis(e).forEach((ai, k) => {
      const summonMoves = Object.keys(e.moves).filter((m) => flat(e.moves[m].fx).some((o) => o.op === 'summon'));
      const nOf = (m) => flat(e.moves[m].fx).filter((o) => o.op === 'summon').reduce((s, o) => s + (o.n || 1), 0);
      // openers may summon up to 2 in total (the group pre-seeds nothing next to them, checked below)
      const openN = (ai.open || []).filter((m) => summonMoves.indexOf(m) >= 0).reduce((s, m) => s + nOf(m), 0);
      t.ok(openN <= 2, `${id} ai#${k}: openers summon at most 2 (${openN})`);
      // a summon is never a plain seq or weighted entry: it would ignore the cap
      t.ok((ai.seq || []).concat((ai.weighted || []).map((x) => x[0])).every((m) => summonMoves.indexOf(m) < 0), `${id} ai#${k}: no summon in seq or weighted`);
      // every rule that summons is gated by minions {lt}
      (ai.rules || []).filter((r) => summonMoves.indexOf(r.do) >= 0).forEach((r) => {
        t.ok(r.if.minions && r.if.minions.lt >= 1, `${id} ai#${k} rule ${r.do} is gated by minions`);
        t.ok(r.if.minions.lt + nOf(r.do) - 1 <= 2, `${id} ai#${k} rule ${r.do}: gate lt ${r.if.minions.lt} plus ${nOf(r.do)} summoned never passes 2`);
      });
    });
  });
  // groups: never two summoners, and pre-seeded minions plus an opener that summons never pass 2
  allGroups.forEach((g) => {
    const es = groupEnemies(g);
    t.ok(es.filter(isSummoner).length <= 1, `${g.id} pairs at most one summoner`);
    const seeded = es.filter((x) => x.tier === 'minion').length;
    es.filter(isSummoner).forEach((s) => {
      const openN = (s.ai.open || []).reduce((n, m) => n + flat(s.moves[m].fx).filter((o) => o.op === 'summon').reduce((k, o) => k + (o.n || 1), 0), 0);
      t.ok(seeded + openN <= 2, `${g.id}: ${seeded} pre-seeded minions plus an opener of ${openN} stays at 2 or fewer`);
    });
  });
});

t.test('encounter pools: sizes, min spread, weights, unique ids, real enemies, lane order', () => {
  t.ok(groups.normal.length >= 12 && groups.normal.length <= 24, `normal groups: ${groups.normal.length} (at least 12)`);
  t.eq(groups.elite.length, 3, 'exactly 3 elite groups');
  t.eq(DATA.encounters[CH].boss, boss, 'the boss encounter is the Editor');
  const idsSeen = allGroups.map((g) => g.id);
  t.eq(new Set(idsSeen).size, idsSeen.length, 'group ids are unique');
  idsSeen.forEach((id) => t.ok(/^ch3_[a-z0-9_]+$/.test(id), `${id} is a ch3_ snake case id`));
  t.ok(groups.normal.filter((g) => g.min <= 0.1).length >= 3, 'at least 3 normal groups at min <= 0.1');
  t.ok(groups.normal.filter((g) => g.min >= 0.6).length >= 4, 'at least 4 normal groups at min >= 0.6');
  t.ok(Math.max(...groups.normal.map((g) => g.min)) >= 0.75 && Math.min(...groups.normal.map((g) => g.min)) === 0, 'min values spread from 0 to at least 0.75');
  const mins = groups.normal.map((g) => g.min);
  t.ok(new Set(mins).size >= 12, `at least 12 distinct min values (${new Set(mins).size})`);
  allGroups.forEach((g) => {
    t.ok(g.w >= 1 && g.w <= 4 && Number.isInteger(g.w), `${g.id} weight ${g.w} is 1..4`);
    t.ok(g.min >= 0 && g.min <= 0.8, `${g.id} min ${g.min} is 0..0.8`);
    t.ok(g.enemies.length >= 1 && g.enemies.length <= 4, `${g.id} lists 1 to 4 enemies`);
    g.enemies.forEach((id) => t.ok(!!E(id) && E(id).chapter === CH && E(id).tier !== 'boss', `${g.id} enemy ${id} is a real chapter 3 enemy`));
    const sizes = groupEnemies(g).map((e) => ({ s: 0, m: 1, l: 2, xl: 3 }[e.size]));
    t.ok(sizes.every((s, i) => i === 0 || s >= sizes[i - 1]), `${g.id} lists the smallest first (tall sprites stand at the back)`);
    if (g.enemies.length === 4) t.ok(g.min >= 0.6, `${g.id}: four-enemy groups are late page groups`);
    if (g.enemies.length === 3) t.ok(g.min >= 0.3, `${g.id}: three-enemy groups are not first-page groups`);
  });
  groups.normal.forEach((g) => t.ok(g.enemies.some((id) => E(id).tier === 'normal'), `${g.id} has at least one normal enemy`));
  groups.elite.forEach((g) => t.eq(g.enemies.filter((id) => E(id).tier === 'elite').length, 1, `${g.id} has exactly one elite`));
  t.deep(groups.elite.map((g) => g.enemies.find((id) => E(id).tier === 'elite')).sort(), elites.slice().sort(), 'each elite is in exactly one elite group');
  t.ok(groups.elite.every((g) => g.enemies.every((id) => E(id).tier === 'elite' || E(id).tier === 'minion')), 'elite groups only add minions');
  t.ok(Math.min(...groups.elite.map((g) => g.min)) === 0 && Math.max(...groups.elite.map((g) => g.min)) >= 0.3, 'elite mins are spread');
  t.eq(DATA.eligibleGroups(CH, 'normal', 0).length, groups.normal.filter((g) => g.min === 0).length, 'eligibleGroups honours min');
});

t.test('every normal enemy appears in enough groups; big groups are gated to the late page; authored synergies are in the pool', () => {
  normals.forEach((id) => t.ok(groups.normal.filter((g) => g.enemies.indexOf(id) >= 0).length >= 2, `${id} appears in at least 2 normal groups`));
  minions.forEach((id) => t.ok(allGroups.some((g) => g.enemies.indexOf(id) >= 0) || ids.some((o) => opsOfEnemy(E(o)).some((x) => x.op === 'summon' && x.enemy === id)), `${id} is placed or summoned`));
  const has2 = (a, b) => groups.normal.some((g) => g.enemies.indexOf(a) >= 0 && g.enemies.indexOf(b) >= 0);
  t.ok(has2('void_scribe', 'redaction_knight'), 'the scribe strips the buffs the knight then punishes');
  t.ok(has2('thunder_crow', 'sky_serpent'), 'the crow stuns while the serpent shreds the back row');
  t.ok(has2('eraser_wraith', 'paper_golem') && has2('eraser_wraith', 'komainu_guardian'), 'the wraith rubs out Block against the two armoured enemies');
  t.ok(has2('storm_drone', 'thunder_crow'), 'a storm flock');
  t.ok(groups.normal.some((g) => g.enemies.filter((id) => id === 'blank_soldier').length >= 3), 'a full rank of soldiers exists');
  t.ok(groups.normal.some((g) => g.enemies.indexOf('margin_imp') >= 0 && g.enemies.length === 2), 'the imp is met early in a pair');
});

t.test('group budgets: the audit average and an effective average stay inside the chapter 3 rails', () => {
  const [nLo, nHi] = G.budget[CH].normal, [eLo, eHi] = G.budget[CH].elite;
  const audit = (g) => groupEnemies(g).filter((e) => e.tier !== 'minion').reduce((s, e) => s + auditAvg(e), 0);
  const eff = (g) => groupEnemies(g).filter((e) => e.tier !== 'minion').reduce((s, e) => s + effAvg(e, g.enemies.length), 0);
  groups.normal.forEach((g) => {
    t.ok(audit(g) <= nHi, `${g.id} audit average ${audit(g).toFixed(1)} <= ${nHi}`);
    t.ok(eff(g) <= nHi + 8, `${g.id} effective average ${eff(g).toFixed(1)} <= ${nHi + 8} (both counted twice, ranks and Block read live)`);
  });
  groups.elite.forEach((g) => {
    t.ok(audit(g) <= eHi, `${g.id} audit average ${audit(g).toFixed(1)} <= ${eHi}`);
    t.ok(eff(g) <= eHi + 8, `${g.id} effective average ${eff(g).toFixed(1)} <= ${eHi + 8}`);
  });
  // the chapter as a whole sits in the lower half of the budget: real fights measure much less than the arithmetic (Block, deaths, minions)
  t.ok(mean(groups.normal, eff) >= nLo * 0.55 && mean(groups.normal, eff) <= (nLo + nHi) / 2 + 4, `normal groups average ${mean(groups.normal, eff).toFixed(1)} effective (rail ${nLo} to ${nHi})`);
  t.ok(mean(groups.elite, eff) >= eLo * 0.5 && mean(groups.elite, eff) <= eHi, `elites average ${mean(groups.elite, eff).toFixed(1)} effective (rail ${eLo} to ${eHi})`);
  // and difficulty ramps with min: late groups deal more than early groups
  const early = groups.normal.filter((g) => g.min <= 0.25), late = groups.normal.filter((g) => g.min >= 0.6);
  t.ok(mean(late, eff) > mean(early, eff) + 3, `late groups (${mean(late, eff).toFixed(1)}) deal more than early groups (${mean(early, eff).toFixed(1)})`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. engine: real COMBAT fights (COMBAT.simulate with the default greedy bot) against synthetic decks
// ---------------------------------------------------------------------------------------------------------------------
const PARTY_HP = [92, 76];                       // chapter 3 max HP of hanae and kuro: base 76 and 60 plus 8 for each of the two chapters cleared
let deckFor = null;
if (HAVE_ENGINE && typeof COMBAT !== 'undefined') {
  const card = (id, hero, type, cost, fx, upfx, slot) => DATA.add('cards', { [id]: { id, name: id, hero, type, rarity: 'common', cost, fx, up: { fx: upfx }, kw: [], slots: [slot || (type === 'attack' ? 'red' : 'blue')], art: { m: 'slash', c: 'rose' } } });
  const d = (n, tgt, hits) => Object.assign({ op: 'dmg', n, tgt: tgt || 'enemy' }, hits ? { hits } : {});
  const B = (n) => ({ op: 'block', n });
  card('hanae_zz_slash', 'hanae', 'attack', 1, [d(7)], [d(10)]);
  card('hanae_zz_flurry', 'hanae', 'attack', 1, [d(3, 'enemy', 3)], [d(4, 'enemy', 3)]);
  card('hanae_zz_heavy', 'hanae', 'attack', 2, [d(14)], [d(18)]);
  card('hanae_zz_whirl', 'hanae', 'attack', 2, [d(7, 'all')], [d(10, 'all')]);
  card('hanae_zz_rare', 'hanae', 'attack', 3, [d(26)], [d(34)]);
  card('hanae_zz_parry', 'hanae', 'skill', 1, [B(7)], [B(10)]);
  card('hanae_zz_guard', 'hanae', 'skill', 2, [B(13)], [B(17)]);
  card('hanae_zz_expose', 'hanae', 'skill', 0, [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'enemy' }], [{ op: 'status', s: 'vulnerable', n: 2, tgt: 'enemy' }]);
  card('hanae_zz_focus', 'hanae', 'skill', 1, [{ op: 'status', s: 'might', n: 2, tgt: 'self' }], [{ op: 'status', s: 'might', n: 3, tgt: 'self' }]);
  card('hanae_zz_stun', 'hanae', 'skill', 1, [{ op: 'status', s: 'stun', n: 1, tgt: 'enemy' }], [{ op: 'status', s: 'stun', n: 1, tgt: 'enemy' }]);
  card('kuro_zz_bolt', 'kuro', 'attack', 1, [d(7)], [d(10)]);
  card('kuro_zz_wave', 'kuro', 'attack', 2, [d(7, 'all')], [d(10, 'all')]);
  card('kuro_zz_rare', 'kuro', 'attack', 3, [d(12, 'all')], [d(16, 'all')]);
  card('kuro_zz_ward', 'kuro', 'skill', 1, [B(7)], [B(10)]);
  card('kuro_zz_venom', 'kuro', 'skill', 1, [{ op: 'status', s: 'poison', n: 5, tgt: 'enemy' }], [{ op: 'status', s: 'poison', n: 7, tgt: 'enemy' }]);
  card('kuro_zz_insight', 'kuro', 'skill', 0, [{ op: 'draw', n: 1 }], [{ op: 'draw', n: 2 }]);
  ['suzu', 'raiga'].forEach((h) => { card(h + '_zz_hit', h, 'attack', 1, [d(8)], [d(11)]); card(h + '_zz_wave', h, 'attack', 2, [d(7, 'all')], [d(10, 'all')]); card(h + '_zz_guard', h, 'skill', 1, [B(8)], [B(11)]); });
  // the six junk cards enemies add, exactly as CONTENT_SPEC section 2 defines them (data_cards_shared.js is not loaded here)
  DATA.add('cards', {
    status_blot: { id: 'status_blot', name: 'Blot', hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable', 'ethereal'], fx: [], art: { m: 'void' } },
    status_tangle: { id: 'status_tangle', name: 'Tangle', hero: 'status', type: 'status', rarity: 'token', cost: 1, kw: ['exhaust'], fx: [{ op: 'removeStatus', s: 'bind', tgt: 'both' }], art: { m: 'web' } },
    status_scorch: { id: 'status_scorch', name: 'Scorch', hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable', 'ethereal'], fx: [], hand: { turnEnd: [{ op: 'hurt', n: 2, tgt: 'self' }] }, art: { m: 'fire' } },
    status_redacted: { id: 'status_redacted', name: 'Redacted', hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'sigil' } },
    status_static: { id: 'status_static', name: 'Static', hero: 'status', type: 'status', rarity: 'token', cost: 0, kw: ['exhaust'], fx: [{ op: 'hurt', n: 2, tgt: 'self' }, { op: 'draw', n: 1 }], art: { m: 'lightning' } },
    status_wilt: { id: 'status_wilt', name: 'Wilt', hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable'], fx: [], hand: { drawn: [{ op: 'energy', n: -1 }] }, art: { m: 'void' } },
    curse_zz: { id: 'curse_zz', name: 'Curse', hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'skull' } },
  });
  // gems: the growth of a deck is upgrades and gems, exactly as in a real run (red +damage on attacks, blue +Block on skills)
  const gem = (id, color, tier, mod) => ({ id, name: id, color, tier, mod, art: { cut: 'round' } });
  DATA.add('gems', { zz_ruby1: gem('zz_ruby1', 'red', 1, { dmg: 2 }), zz_ruby2: gem('zz_ruby2', 'red', 2, { dmg: 3 }), zz_ruby3: gem('zz_ruby3', 'red', 3, { dmg: 4 }),
    zz_sap1: gem('zz_sap1', 'blue', 1, { block: 2 }), zz_sap2: gem('zz_sap2', 'blue', 2, { block: 3 }), zz_sap3: gem('zz_sap3', 'blue', 3, { block: 4 }) });
  const BASE = ['hanae_zz_slash', 'hanae_zz_slash', 'hanae_zz_slash', 'hanae_zz_heavy', 'hanae_zz_heavy', 'hanae_zz_whirl', 'hanae_zz_parry', 'hanae_zz_parry', 'hanae_zz_guard', 'hanae_zz_expose',
    'kuro_zz_bolt', 'kuro_zz_bolt', 'kuro_zz_bolt', 'kuro_zz_wave', 'kuro_zz_ward', 'kuro_zz_ward', 'kuro_zz_venom', 'kuro_zz_insight'];
  const EXTRA = {
    early: ['hanae_zz_flurry', 'kuro_zz_venom'],
    mid: ['hanae_zz_flurry', 'kuro_zz_venom', 'hanae_zz_rare', 'hanae_zz_focus'],
    late: ['hanae_zz_flurry', 'hanae_zz_flurry', 'hanae_zz_flurry', 'kuro_zz_venom', 'hanae_zz_rare', 'hanae_zz_focus', 'hanae_zz_focus', 'kuro_zz_rare', 'kuro_zz_bolt'],
  };
  const UPFRAC = { early: 0.4, mid: 0.65, late: 0.95 }, GEMFRAC = { early: 0.3, mid: 0.5, late: 0.75 }, GEMTIER = { early: 1, mid: 2, late: 3 };
  // early = the deck you walk into chapter 3 with, mid = a page later, late = a deck that has cut its gems and found its rares,
  // boss = the late deck plus a boss relic that grants +1 Energy and pays for it with a curse in the deck
  deckFor = (level) => {
    const base = level === 'boss' ? 'late' : level;
    const list = BASE.concat(EXTRA[base]);
    const upN = Math.round(list.length * UPFRAC[base]), gemN = Math.round(list.length * GEMFRAC[base]);
    const deck = list.map((id, i) => {
      const slot = DATA.cards[id].slots[0];
      const g = (i * 5 + 1) % list.length < gemN ? (slot === 'red' ? 'zz_ruby' : 'zz_sap') + GEMTIER[base] : null;
      return { uid: i + 1, id, up: (i * 7 + 3) % list.length < upN ? 1 : 0, gems: [g] };
    });
    if (level === 'boss') deck.push({ uid: 99, id: 'curse_zz', up: 0, gems: [] });
    return deck;
  };
  DATA.add('enemies', { zz_dummy: { id: 'zz_dummy', name: 'Dummy', chapter: CH, tier: 'normal', size: 'm', hp: [900, 900], moves: { idle: { name: 'idle', kind: 'defend', fx: [{ op: 'block', n: 1, tgt: 'self' }] } }, ai: { seq: ['idle'] }, art: { id: 'zz_dummy' }, lore: 'x', tags: ['construct'] } });
}
const levelOf = (min) => (min < 0.3 ? 'early' : min < 0.6 ? 'mid' : 'late');
const tierOf = (g) => (g.enemies.some((id) => E(id).tier === 'elite') ? 'elite' : 'normal');
const fightTier = (list) => (list.some((id) => E(id).tier === 'boss') ? 'boss' : list.some((id) => E(id).tier === 'elite') ? 'elite' : 'normal');
const lvlOfGroup = (g) => (tierOf(g) === 'elite' ? 'mid' : levelOf(g.min));
const party = () => [{ id: 'hanae', hp: PARTY_HP[0], maxHp: PARTY_HP[0] }, { id: 'kuro', hp: PARTY_HP[1], maxHp: PARTY_HP[1] }];
const modsOf = (level) => DATA.foldMods(level === 'boss' ? [{ energy: 1 }] : []);
const mk = (enemyIds, level, tier, seed, extra) => Object.assign({ heroes: party(), frontIdx: 0, deck: deckFor(level), enemies: enemyIds, tier, chapter: CH, seed, mods: modsOf(level), relics: [], gold: 0, maxTurns: 50 }, extra || {});
function engineFight(enemyIds, seed, level, policy, extra) {
  const s = COMBAT.simulate(mk(enemyIds, level, fightTier(enemyIds), seed, extra), policy);
  const left = s.heroes.reduce((a, h) => a + Math.max(0, h.hp), 0);
  return { result: s.result, turns: s.turns, capped: s.capped, hpLost: PARTY_HP[0] + PARTY_HP[1] - left, downs: s.stats.heroDowns, dealt: s.stats.damageDealt, s };
}
const eMany = (enemyIds, level, n = 30, policy, extra) => { const out = []; for (let i = 1; i <= n; i++) out.push(engineFight(enemyIds, U.hash('e3', enemyIds.join(','), i) % 100000, level, policy, extra)); return out; };
const winRate = (rs) => rs.filter((r) => r.result === 'win').length / rs.length;
const acts = (r) => r.s.C.events.filter((e) => e.type === 'enemy_act');

// scenarios: a party that cannot be hurt and a deck of one card, so the test decides exactly what happens and when
const BIG = () => [{ id: 'hanae', hp: 900, maxHp: 900 }, { id: 'kuro', hp: 900, maxHp: 900 }];
const cardsOf = (id, n) => Array.from({ length: n }, (_, i) => ({ uid: i + 1, id, up: 0, gems: [null] }));
const IDLE_DECK = () => [{ uid: 1, id: 'kuro_zz_insight', up: 0, gems: [null] }];
function scenario(enemyIds, extra) {
  const C = COMBAT.create(Object.assign({ heroes: BIG(), frontIdx: 0, deck: cardsOf('hanae_zz_slash', 12), enemies: enemyIds, tier: fightTier(enemyIds), chapter: CH, seed: 7, mods: DATA.foldMods([]), relics: [], gold: 0 }, extra || {}));
  C.start();
  return C;
}
const unit = (C, def) => C.enemies.find((e) => e.def === def && !e.down);
const slash = (C, target) => { const c = C.hand.find((x) => x.id === 'hanae_zz_slash'); return c ? C.play(c.uid, target.id) : []; };
const step = (C, n = 1) => { for (let i = 0; i < n && C.phase !== 'over'; i++) C.endTurn(); };
const evsSince = (C, from, type) => C.events.slice(from).filter((e) => e.type === type);
// drop a unit to just above a phase line, then land a slash: the engine crosses the line by itself
const cross = (C, u, frac) => { u.hp = Math.floor(u.maxHp * frac) + 1; u.block = 0; const before = C.events.length; slash(C, u); return C.events.slice(before); };
// kill every living minion with a slash each (their HP is set to 1 first), so a summoner's gate opens
const cull = (C) => C.enemies.filter((e) => !e.down && e.tier === 'minion').forEach((m) => { m.hp = 1; m.block = 0; slash(C, m); });

if (HAVE_ENGINE && TRACE) {
  const [list, lv] = TRACE.split(':');
  const en = list.split(',');
  const r = engineFight(en, 3, lv || (en.some((id) => id.indexOf('boss') === 0) ? 'boss' : 'mid'));
  let line = [];
  r.s.C.events.forEach((e) => {
    if (e.type === 'turn_start' && e.who === 'player') { if (line.length) console.log(line.join(' | ')); line = [`T${e.turn}`]; }
    if (e.type === 'play' && e.card.id.indexOf('status_') === 0) line.push(`PLAY ${e.card.id}`);
    if (e.type === 'enemy_act') line.push(`${e.enemy} ${e.move}`);
    if (e.type === 'enemy_phase') line.push(`PHASE ${e.index} "${e.say}"`);
    if (e.type === 'summon') line.push(`+${e.enemy.id}`);
    if (e.type === 'death') line.push(`x${e.unit.id}`);
    if (e.type === 'hit' && e.dst.kind === 'hero') line.push(`${e.dst.id}-${e.amount}${e.blocked ? '(b' + e.blocked + ')' : ''}`);
    if (e.type === 'thorns' && e.dst.kind === 'hero') line.push(`thorns-${e.amount}`);
    if (e.type === 'status' && e.dst.kind === 'hero' && e.delta > 0 && ['bind', 'stun', 'weak', 'frail', 'vulnerable'].indexOf(e.s) >= 0) line.push(`${e.dst.id}:${e.s}${e.value}`);
  });
  console.log(line.join(' | '));
  console.log(`result ${r.result} turns ${r.turns} hp lost ${r.hpLost}`);
}

if (HAVE_ENGINE && REPORT) {
  const row = (label, rs) => console.log(`${label.padEnd(34)} turns ${mean(rs, (r) => r.turns).toFixed(1).padStart(5)}  hpLost ${mean(rs, (r) => r.hpLost).toFixed(0).padStart(4)}  dealt/turn ${mean(rs, (r) => r.dealt / r.turns).toFixed(1).padStart(5)}  downs ${mean(rs, (r) => r.downs).toFixed(2)}  wins ${(winRate(rs) * 100).toFixed(0).padStart(3)}%`);
  console.log('=== ENGINE (greedy bot, synthetic decks) ===');
  console.log('--- normal groups (deck level by min: early < 0.3 <= mid < 0.6 <= late) ---');
  groups.normal.forEach((g) => row(`${g.id} (${g.min}) ${lvlOfGroup(g)}`, eMany(g.enemies, lvlOfGroup(g), 40)));
  console.log('--- elite groups (mid deck) ---');
  groups.elite.forEach((g) => row(g.id, eMany(g.enemies, 'mid', 40)));
  console.log('--- boss ---');
  ['mid', 'late', 'boss'].forEach((lv) => row(`boss with the ${lv} deck`, eMany([boss], lv, 60)));
}

const skipNote = () => { console.log('note: engine sims skipped, combat.js and data_text.js are not written yet'); t.ok(true, 'engine not present, the static checks above stand in'); };

t.test('engine: the synthetic decks have the power ladder every band below assumes (a training dummy that never hits back)', () => {
  if (!HAVE_ENGINE) return skipNote();
  const dps = (level) => {
    const out = [];
    for (let i = 1; i <= 24; i++) {
      const C = COMBAT.create(mk(['zz_dummy'], level, 'normal', i * 17));
      C.start();
      for (let turn = 0; turn < 6 && C.phase !== 'over'; turn++) {
        let guard = 0;
        while (C.phase === 'player' && guard++ < 40) { const a = COMBAT.greedyPolicy(C); if (!a || a.type === 'end') break; COMBAT.applyAction(C, a); }
        C.endTurn();
      }
      out.push(C.stats.damageDealt / 6);
    }
    return mean(out, (x) => x);
  };
  const d = { early: dps('early'), mid: dps('mid'), late: dps('late'), boss: dps('boss') };
  if (REPORT) console.log('dummy damage per turn', JSON.stringify(d, (k, v) => (typeof v === 'number' ? +v.toFixed(1) : v)));
  t.ok(d.early >= 31 && d.early <= 42, `early deck ${d.early.toFixed(1)} damage per turn (31..42)`);
  t.ok(d.mid >= 38 && d.mid <= 50, `mid deck ${d.mid.toFixed(1)} (38..50)`);
  t.ok(d.late >= 46 && d.late <= 60, `late deck ${d.late.toFixed(1)} (46..60)`);
  t.ok(d.boss >= d.late + 4, `the boss relic deck ${d.boss.toFixed(1)} out-damages the late deck (${d.late.toFixed(1)})`);
  t.ok(d.early < d.mid && d.mid < d.late, 'the ladder climbs');
  t.deep(deckFor('boss').filter((c) => c.id === 'curse_zz').length, 1, 'the boss deck pays for its relic with one curse');
  t.eq(modsOf('boss').energy, 4, 'the boss relic gives 4 Energy');
  t.eq(modsOf('late').energy, 3, 'other levels play with 3 Energy');
});

t.test('engine: units and intents are sound: HP ranges, intent kinds, targets and text for every move of every enemy', () => {
  if (!HAVE_ENGINE) return skipNote();
  ids.forEach((id) => {
    const C = COMBAT.create(mk([id], 'mid', fightTier([id]), 5));
    C.start();
    const u = C.enemies[0];
    t.ok(u.hp >= E(id).hp[0] && u.hp <= E(id).hp[1] && u.hp === u.maxHp, `${id} rolls HP inside its range (${u.hp})`);
    t.eq(u.lane, 4, `${id} stands alone in lane 4`);
    Object.keys(E(id).moves).forEach((m) => {
      u._move = m;
      const it = C.intent(u);
      const w = `${id}.${m}`;
      t.ok(it && typeof it.text === 'string' && it.text.length > 0, `${w} has intent text`);
      t.eq(it.kind, E(id).moves[m].kind, `${w} intent kind is the move kind`);
      t.eq(it.name, E(id).moves[m].name, `${w} intent name`);
      const ds = dmgOps(E(id).moves[m]);
      if (ds.length === 1) {
        t.ok(it.dmg >= 1 && it.hits === hitsOf(ds[0]), `${w} shows ${it.dmg} x${it.hits}`);
        const want = ds[0].tgt === 'back' ? ['kuro'] : ds[0].tgt === 'both' ? ['hanae', 'kuro'] : ds[0].tgt === 'random' ? 'random' : ds[0].tgt === 'lowest' ? ['kuro'] : ['hanae'];
        t.deep(it.tgt, want, `${w} says who it hits (${ds[0].tgt || 'front'})`);
      }
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'summon')) t.ok(it.summons.length >= 1, `${w} intent lists its summons`);
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'add')) t.ok(it.adds.length >= 1, `${w} intent lists the cards it adds`);
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'status' && onHeroes(o))) t.ok(it.statuses.some((s) => DATA.isDebuff(s.s)), `${w} intent lists the debuffs`);
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'removeStatus' && o.tgt !== 'self')) t.ok(it.removes.length >= 1, `${w} intent lists what it erases`);
    });
  });
  // every living enemy always has a well formed intent, round after round, in the biggest groups
  [['blank_page', 'spark_mote', 'thunder_crow', 'sky_serpent'], ['blank_page', 'blank_page', 'eraser_wraith', 'redaction_knight'], ['blank_soldier', 'margin_imp', 'void_scribe']].forEach((list) => {
    const C = COMBAT.create(mk(list, 'late', 'normal', 8));
    C.start();
    for (let i = 0; i < 6 && C.phase !== 'over'; i++) {
      C.enemies.filter((e) => !e.down).forEach((e) => t.ok(e.intent && L.intents.indexOf(e.intent.kind) >= 0 && e.intent.text.length > 0, `${e.id} has an intent on turn ${C.turn}`));
      C.endTurn();
    }
  });
});

t.test('engine: every fight ends with a win or a loss, never a stall', () => {
  if (!HAVE_ENGINE) return skipNote();
  allGroups.forEach((g) => eMany(g.enemies, lvlOfGroup(g), 8).forEach((r) => t.ok((r.result === 'win' || r.result === 'lose') && !r.capped, `${g.id} finishes (${r.result})`)));
  eMany([boss], 'boss', 10).forEach((r) => t.ok((r.result === 'win' || r.result === 'lose') && !r.capped, 'boss finishes'));
  eMany([boss], 'early', 6).forEach((r) => t.ok(r.result === 'win' || r.result === 'lose', 'a weak deck still reaches a result against the boss'));
});

const normStats = HAVE_ENGINE ? groups.normal.map((g) => ({ g, rs: eMany(g.enemies, lvlOfGroup(g), 30) })) : [];
const eliteStats = HAVE_ENGINE ? groups.elite.map((g) => ({ g, rs: eMany(g.enemies, 'mid', 30) })) : [];
const bossStats = HAVE_ENGINE ? { boss: eMany([boss], 'boss', 100), late: eMany([boss], 'late', 80), mid: eMany([boss], 'mid', 80) } : null;

t.test('engine: bands hold in real fights (turns, HP lost, wins) with decks that grow through the chapter', () => {
  if (!HAVE_ENGINE) return skipNote();
  const avgTurns = mean(normStats, (x) => mean(x.rs, (r) => r.turns));
  t.ok(avgTurns >= 3.2 && avgTurns <= 5.4, `normal groups average ${avgTurns.toFixed(2)} turns (3.2..5.4)`);
  normStats.forEach((x) => {
    const turns = mean(x.rs, (r) => r.turns), lost = mean(x.rs, (r) => r.hpLost), lv = lvlOfGroup(x.g);
    t.ok(turns >= 2 && turns <= 6.6, `${x.g.id} lasts ${turns.toFixed(1)} turns (2..6.6)`);
    t.ok(winRate(x.rs) >= 0.93, `${x.g.id} is winnable (${(winRate(x.rs) * 100).toFixed(0)} percent)`);
    t.ok(lost <= { early: 55, mid: 75, late: 95 }[lv], `${x.g.id} costs ${lost.toFixed(0)} HP on average at the ${lv} level`);
    if (x.g.enemies.length >= 2) t.ok(turns >= 3.4, `${x.g.id} is a real fight of at least 3.4 turns`);
  });
  const avgLost = mean(normStats, (x) => mean(x.rs, (r) => r.hpLost));
  if (REPORT) console.log(`summary: normal groups ${avgTurns.toFixed(2)} turns and ${avgLost.toFixed(0)} HP; elites ${mean(eliteStats, (x) => mean(x.rs, (r) => r.turns)).toFixed(2)} turns and ${mean(eliteStats, (x) => mean(x.rs, (r) => r.hpLost)).toFixed(0)} HP; boss deck ${mean(bossStats.boss, (r) => r.turns).toFixed(1)} turns, ${(winRate(bossStats.boss) * 100).toFixed(0)} percent wins`);
  t.ok(avgLost >= 25 && avgLost <= 55, `a normal group costs ${avgLost.toFixed(0)} HP on average (25..55 of ${PARTY_HP[0] + PARTY_HP[1]})`);
  const early = normStats.filter((x) => x.g.min <= 0.25), late = normStats.filter((x) => x.g.min >= 0.6);
  t.ok(mean(late, (x) => mean(x.rs, (r) => r.hpLost)) > mean(early, (x) => mean(x.rs, (r) => r.hpLost)) + 12, 'late groups cost clearly more than early ones');
  eliteStats.forEach((x) => {
    const turns = mean(x.rs, (r) => r.turns), lost = mean(x.rs, (r) => r.hpLost);
    t.ok(turns >= 5 && turns <= 8, `${x.g.id} lasts ${turns.toFixed(1)} turns (5..8)`);
    t.ok(winRate(x.rs) >= 0.9, `${x.g.id} is winnable`);
    t.ok(lost >= 40 && lost <= 100, `${x.g.id} costs ${lost.toFixed(0)} HP (40..100)`);
  });
  const avgElite = mean(eliteStats, (x) => mean(x.rs, (r) => r.turns));
  t.ok(avgElite >= 5.5 && avgElite <= 7.4, `elites average ${avgElite.toFixed(2)} turns (5.5..7.4)`);
  t.ok(mean(eliteStats, (x) => mean(x.rs, (r) => r.hpLost)) > avgLost, 'elites cost more HP than the average normal group');
  const b = bossStats.boss;
  const bt = mean(b, (r) => r.turns), bl = mean(b, (r) => r.hpLost);
  t.ok(bt >= 9.5 && bt <= 13.5, `the boss lasts ${bt.toFixed(1)} turns against the boss deck (9.5..13.5)`);
  t.ok(winRate(b) >= 0.6 && winRate(b) <= 0.95, `a boss-run deck beats the boss ${(winRate(b) * 100).toFixed(0)} percent of the time (60..95)`);
  t.ok(bl >= 90 && bl <= 160, `the boss costs ${bl.toFixed(0)} HP (90..160)`);
  t.ok(bl > mean(eliteStats, (x) => mean(x.rs, (r) => r.hpLost)), 'the boss costs more HP than an elite');
  t.ok(winRate(bossStats.late) < winRate(b) && winRate(bossStats.late) >= 0.1, `the late deck without the relic fares worse but can win (${(winRate(bossStats.late) * 100).toFixed(0)} percent)`);
  t.ok(winRate(bossStats.mid) <= 0.3 && winRate(bossStats.mid) < winRate(bossStats.late), `a mid-chapter deck cannot walk through the boss (${(winRate(bossStats.mid) * 100).toFixed(0)} percent)`);
});

// every move fired by the engine, gathered from real fights, scenarios and drivers; a move nobody ever sees is dead content
const seen = {};
const scan = (events) => events.forEach((e) => { if (e.type === 'enemy_act') { const def = e.enemy.split('#')[0]; (seen[def] = seen[def] || new Set()).add(e.move); } });
function idleRun(enemyIds, turns, seed) {
  const C = COMBAT.create(Object.assign({ heroes: BIG(), frontIdx: 0, deck: IDLE_DECK(), enemies: enemyIds, tier: fightTier(enemyIds), chapter: CH, seed, mods: DATA.foldMods([]), relics: [], gold: 0 }));
  C.start();
  for (let i = 0; i < turns && C.phase !== 'over'; i++) C.endTurn();
  return C;
}
// walk one enemy through its whole life: HP drops on a plan, phases are crossed with a real hit, minions are culled so gates open
function driveEnemy(def, turns = 14) {
  const C = scenario([def]);
  const plan = [1, 1, 0.9, 0.78, 0.7, 0.55, 0.45, 0.38, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05];
  for (let i = 0; i < turns && C.phase !== 'over'; i++) {
    const u = unit(C, def);
    if (!u) break;
    const frac = plan[Math.min(i, plan.length - 1)];
    (E(def).phases || []).forEach((p, k) => { if (frac < p.at && u.phase === k) cross(C, u, p.at - 0.002); });
    if (u.hp > Math.floor(u.maxHp * frac)) u.hp = Math.max(1, Math.floor(u.maxHp * frac));
    if (i % 2 === 1) cull(C);
    C.endTurn();
  }
  return C;
}
function driveBoss() {
  const C = scenario([boss]);
  const b = C.enemies[0];
  step(C, 3);                                             // handout, proofread, pen
  b.hp = Math.floor(b.maxHp * 0.7);                       // above the 0.66 line, below 0.8: the footnote rule is armed
  for (let i = 0; i < 7; i++) { cull(C); step(C); }       // strike, footnote, margin (own turn 5 with no pages)
  cross(C, b, 0.66);                                      // the Eraser: clean first
  for (let i = 0; i < 8; i++) { cull(C); step(C); }       // rub, swipe, smudge and a typo sprite call at own turn 4 or 8
  cross(C, b, 0.33);                                      // the Blank Page: unwrite first
  for (let i = 0; i < 3; i++) { cull(C); step(C); }
  cull(C); step(C, 2);                                    // tear, gape, the recurring unwrite
  b.hp = Math.floor(b.maxHp * 0.1); cull(C); step(C, 3);  // the last word
  for (let i = 0; i < 4 && C.phase !== 'over'; i++) step(C);
  return C;
}

t.test('engine: every move fires in real fights, drivers and rule scenarios, so nothing in the roster is dead content', () => {
  if (!HAVE_ENGINE) return skipNote();
  allGroups.forEach((g) => { eMany(g.enemies, lvlOfGroup(g), 12).forEach((r) => scan(r.s.C.events)); scan(idleRun(g.enemies, 14, 3).events); });
  scan(driveBoss().events);
  eMany([boss], 'boss', 20).forEach((r) => scan(r.s.C.events));
  ids.filter((id) => id !== boss).forEach((id) => scan(driveEnemy(id).events));
  // rule-driven moves that need a special state: resource hoarding, a low hero
  ['bloom', 'sumi', 'ward', 'charge'].forEach((s, i) => { const C = scenario(['eraser_wraith'], { seed: 30 + i }); C.heroes[i % 2].st[s] = 3; step(C, 2); scan(C.events); });
  { const C = scenario(['black_bar_inquisitor']); C.heroes[0].hp = 40; step(C, 4); scan(C.events); }
  { const C = scenario(['void_scribe']); C.heroes[0].st.might = 2; step(C, 3); scan(C.events); }
  ids.forEach((id) => Object.keys(E(id).moves).forEach((m) => t.ok(seen[id] && seen[id].has(m), `${id}.${m} was executed by the real engine`)));
});

t.test('engine: every enemy shows its signature move in real fights often enough to be learned', () => {
  if (!HAVE_ENGINE) return skipNote();
  const SIG = { storm_drone: 'jab', komainu_guardian: 'pounce', redaction_knight: 'strike', void_scribe: 'erase', blank_soldier: 'march', sky_serpent: 'fang', eraser_wraith: 'rub', thunder_crow: 'dive', paper_golem: 'slam', margin_imp: 'doodle', censor_golem: 'stamp', storm_whelp: 'clap', black_bar_inquisitor: 'gag' };
  const tot = {};
  allGroups.forEach((g) => eMany(g.enemies, lvlOfGroup(g), 24).forEach((r) => {
    const s = new Set(acts(r).map((e) => e.move + '@' + e.enemy.split('#')[0]));
    g.enemies.filter((v, k, a) => a.indexOf(v) === k && SIG[v]).forEach((def) => { const x = (tot[def] = tot[def] || { n: 0, hit: 0 }); x.n++; if (s.has(SIG[def] + '@' + def)) x.hit++; });
  }));
  Object.keys(SIG).forEach((def) => { const rate = tot[def].hit / tot[def].n; t.ok(rate >= (E(def).tier === 'elite' ? 0.85 : 0.6), `${def} shows ${SIG[def]} in ${(rate * 100).toFixed(0)} percent of its fights`); });
  // and the boss shows its whole signature set in most fights against a deck that can win
  const bs = bossStats.boss;
  ['handout', 'proofread', 'pen', 'clean', 'rub', 'unwrite'].forEach((m) => t.ok(bs.filter((r) => acts(r).some((e) => e.move === m)).length / bs.length >= 0.75, `the boss uses ${m} in most fights`));
  ['swipe', 'tear', 'seep'].forEach((m) => t.ok(bs.filter((r) => acts(r).some((e) => e.move === m)).length / bs.length >= 0.35, `the boss uses ${m} in a good share of fights`));
  ['smudge', 'last', 'typos'].forEach((m) => t.ok(bs.filter((r) => acts(r).some((e) => e.move === m)).length / bs.length >= 0.15, `the boss uses ${m} in some fights`));
  t.ok(bs.filter((r) => acts(r).some((e) => e.move === 'unwrite')).length / bs.length >= 0.9, 'Unwrite, the signature, lands in nearly every boss fight');
});

// ---------------------------------------------------------------------------------------------------------------------
// scenarios: every designed piece of counter-play, on the real engine
// ---------------------------------------------------------------------------------------------------------------------
t.test('engine: komainu_guardian is only thorny while braced, and the pounce drops the Thorns', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['komainu_guardian']);
  const k = C.enemies[0];
  t.eq(k.intent.move, 'stance', 'it opens braced');
  t.eq(k.st.thorns || 0, 0, 'turn 1: no Thorns yet');
  let from = C.events.length;
  slash(C, k);
  t.eq(evsSince(C, from, 'thorns').length, 0, 'hitting it before the stance costs nothing');
  step(C);                                                   // stance
  t.eq(k.st.thorns, 5, 'the stance raises Thorns 5');
  t.ok(k.block >= 12, 'and Block');
  t.eq(k.intent.move, 'pounce', 'the pounce is telegraphed next');
  t.eq(k.intent.kind, 'heavy', 'as a heavy hit');
  t.deep(k.intent.tgt, ['hanae'], 'at the front hero');
  from = C.events.length;
  slash(C, k); slash(C, k);
  const th = evsSince(C, from, 'thorns');
  t.ok(th.length >= 1 && th.every((e) => e.amount === 5 && e.dst.id === 'hanae'), 'hitting the braced komainu hurts the attacker for 5 each time');
  step(C);                                                   // pounce
  t.eq(k.st.thorns || 0, 0, 'the lunge sheds the Thorns');
  t.eq(k.intent.move, 'claw', 'then a plain claw');
  from = C.events.length;
  slash(C, k);
  t.eq(evsSince(C, from, 'thorns').length, 0, 'the turn after the pounce is the free window');
  const pounceHits = C.events.filter((e) => e.type === 'hit' && e.dst.kind === 'hero' && e.raw === 19);
  t.ok(pounceHits.length === 1, 'the pounce hit for 19');
  // the roar comes at low HP and preempts the seq once
  const C2 = scenario(['komainu_guardian']);
  const k2 = C2.enemies[0];
  k2.hp = Math.floor(k2.maxHp * 0.35);
  step(C2);
  t.eq(k2.intent.move, 'roar', 'below 40 percent it roars');
  step(C2);
  t.ok(C2.heroes.every((h) => h.st.weak >= 1) && k2.st.might === 1, 'the roar weakens both heroes and gives it Might 1');
  t.ok(k2.intent.move !== 'roar', 'once only');
});

t.test('engine: eraser_wraith rubs through Block and reads it, and erases hoarded resource stacks', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['eraser_wraith']);
  const w = C.enemies[0];
  w._move = 'rub';
  const dmgAt = (block) => { C.front().block = block; return C.intent(w).dmg; };
  t.eq(dmgAt(0), 9, 'Rub Through with no Block: 9');
  t.eq(dmgAt(12), 15, 'with 12 Block: 15');
  t.eq(dmgAt(30), 18, 'capped at 18');
  t.ok(dmgAt(20) > dmgAt(4), 'stacking Block makes it worse');
  C.front().block = 12;
  const before = C.events.length;
  step(C);
  const hit = evsSince(C, before, 'hit').find((e) => e.dst.id === 'hanae');
  t.ok(hit && hit.pierce === true && hit.blocked === 0 && hit.amount === 15, 'the piercing hit ignores the Block and takes the HP anyway');
  // Weak brings the number down, as it does for any attack
  const C2 = scenario(['eraser_wraith']);
  const w2 = C2.enemies[0]; w2._move = 'rub'; C2.front().block = 12;
  const plain = C2.intent(w2).dmg;
  w2.st.weak = 1;
  t.ok(C2.intent(w2).dmg < plain, 'Weak on the wraith shrinks Rub Through');
  // hoarding: 3 or more of any resource makes the next action the wipe; below 3 it does not
  ['bloom', 'sumi', 'ward', 'charge'].forEach((s, i) => {
    const D = scenario(['eraser_wraith'], { seed: 40 + i });
    const wr = D.enemies[0];
    D.heroes[i % 2].st[s] = 2;
    step(D);
    t.ok(wr.intent.move !== 'wipe', `${s} 2 does not draw the wipe`);
    const D2 = scenario(['eraser_wraith'], { seed: 50 + i });
    D2.heroes[i % 2].st[s] = 3; D2.heroes[(i + 1) % 2].st.might = 2;
    step(D2);
    const w3 = D2.enemies[0];
    t.eq(w3.intent.move, 'wipe', `${s} 3 draws the wipe`);
    t.eq(w3.intent.kind, 'debuff', `${s}: the wipe is a debuff intent`);
    t.ok(w3.intent.removes.length === 4, `${s}: the intent lists what it erases`);
    step(D2);
    t.ok(!D2.heroes[i % 2].st[s], `${s} is gone after the wipe`);
    t.eq(D2.heroes[(i + 1) % 2].st.might, 2, 'Might is not a resource: the wipe leaves it alone');
    t.ok(w3.intent.move !== 'wipe', 'and it does not repeat once the stacks are gone');
  });
});

t.test('engine: void_scribe erases every buff, adds blots, and reads Might', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['void_scribe']);
  const s = C.enemies[0];
  t.eq(s.intent.move, 'erase', 'it opens by erasing the margin, telegraphed on turn 1');
  s._move = 'ink';                                           // let the first action be the ink, so the rule (not the sequence) has to choose the erase
  C.heroes[0].st.might = 3; C.heroes[1].st.thorns = 2; C.heroes[1].st.dodge = 1; C.heroes[0].st.bloom = 2;
  step(C);
  t.eq(s.intent.move, 'erase', 'a hero with Might 2 or more draws the erase early');
  t.eq(s.intent.kind, 'debuff', 'shown as a debuff');
  t.ok(s.intent.removes.some((r) => r.s === 'buffs' && r.to === 'both'), 'the intent says it removes buffs from both heroes');
  const blotsBefore = [...C.draw, ...C.discard, ...C.hand].filter((c) => c.id === 'status_blot').length;
  step(C);
  t.ok(!C.heroes[0].st.might && !C.heroes[1].st.thorns && !C.heroes[1].st.dodge, 'every buff is gone');
  t.eq(C.heroes[0].st.bloom, 2, 'a resource stack is not a buff and stays');
  const blotsAfter = [...C.draw, ...C.discard, ...C.hand, ...C.exhaust].filter((c) => c.id === 'status_blot').length;
  t.ok(blotsAfter >= blotsBefore + 2, `it added blot cards (${blotsBefore} to ${blotsAfter})`);
  t.eq(s.intent.move, 'ink', 'and with the Might gone it goes back to its sequence (a rule-chosen erase does not advance the cursor)');
  // without Might it follows its sequence: erase, ink, blot out
  const C2 = scenario(['void_scribe']);
  const order = [];
  for (let i = 0; i < 3; i++) { order.push(C2.enemies[0].intent.move); step(C2); }
  t.deep(order, ['erase', 'ink', 'blot'], 'sequence erase, ink, blot out');
});

t.test('engine: blank_soldier hits harder with every living enemy, and the wall covers the whole line', () => {
  if (!HAVE_ENGINE) return skipNote();
  const dmgFor = (list) => { const C = scenario(list); const s = C.enemies.find((e) => e.def === 'blank_soldier'); s._move = 'march'; return C.intent(s).dmg; };
  t.deep([dmgFor(['blank_soldier']), dmgFor(['blank_soldier', 'blank_soldier']), dmgFor(['blank_soldier', 'blank_soldier', 'blank_soldier']), dmgFor(['blank_soldier', 'blank_soldier', 'blank_soldier', 'blank_page'])], [7, 10, 12, 12], 'Rank Strike is 7 alone, 10 in a pair, 12 in a rank (capped)');
  const C = scenario(['blank_soldier', 'blank_soldier', 'blank_soldier']);
  const s0 = C.enemies[0];
  s0._move = 'march';
  t.eq(C.intent(s0).dmg, 12, 'a rank of three');
  C.enemies[1].hp = 1; C.enemies[1].block = 0; slash(C, C.enemies[1]);
  t.eq(C.intent(s0).dmg, 10, 'break one soldier and the rest weaken (intents update live)');
  const D = scenario(['blank_soldier', 'void_scribe', 'blank_soldier']);
  D.enemies.forEach((e) => { e._move = e.def === 'blank_soldier' ? 'wall' : e._move; });
  step(D);
  t.ok(D.enemies.every((e) => e.block >= 8), 'Shield Wall gives Block to every enemy in the line, allies included');
});

t.test('engine: thunder_crow and sky_serpent go for the back row; the dive Stuns and swapping chooses who takes it', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['thunder_crow']);
  const c = C.enemies[0];
  t.eq(c.intent.move, 'dive', 'it dives first, telegraphed on turn 1');
  t.eq(c.intent.kind, 'heavy', 'as a heavy hit');
  t.deep(c.intent.tgt, ['hanae'], 'at the front hero');
  t.ok(c.intent.statuses.some((s) => s.s === 'stun'), 'and it says Stun');
  t.ok(C.canSwap().ok && C.canSwap().cost === 0, 'a free swap is available');
  C.swap();
  t.deep(C.intent(c).tgt, ['kuro'], 'swap and the dive is aimed at the other hero (intents follow the rows, read live with C.intent)');
  step(C);
  t.eq(C.heroes[1].st.stun, 1, 'the newly fronted hero is the one that is stunned');
  t.ok(!C.heroes[0].st.stun, 'the other hero is free to act');
  t.eq(C.heroes[1].hp, 900 - 18, 'the dive hit for 18');
  t.eq(c.intent.move, 'peck', 'then it pecks');
  t.deep(c.intent.tgt, ['hanae'], 'the back row (the hero who was swapped out)');
  t.eq(c.intent.hits, 3, 'three times');
  step(C);
  t.eq(C.heroes[0].hp, 900 - 12, 'the back hero took 3 x 4');
  t.eq(c.intent.move, 'peck', 'twice');
  // the serpent's fangs are a back row triple; Taunt would redirect them, Block on the back hero soaks them
  const S = scenario(['sky_serpent'], { seed: 11 });
  const sp = S.enemies[0];
  sp._move = 'fang';
  const it = S.intent(sp);
  t.deep([it.hits, it.dmg, it.tgt], [3, 6, ['kuro']], 'Gale Fangs: 3 x 6 at the back hero');
  S.heroes[1].st.taunt = 2;
  t.deep(S.intent(sp).tgt, ['kuro'], 'with the back hero taunting it still lands on them');
  S.heroes[0].st.taunt = 2; S.heroes[1].st.taunt = 0;
  const tt = S.intent(sp);
  t.deep(tt.tgt, ['hanae'], 'a taunting front hero takes the fangs instead of the back hero');
  // tailwind: Dodge 2 eats two hits of a multi
  const T = scenario(['sky_serpent'], { seed: 12 });
  const tp = T.enemies[0];
  tp._move = 'tailwind';
  step(T);
  t.eq(tp.st.dodge, 2, 'Tailwind gives Dodge 2');
  const from = T.events.length;
  slash(T, tp);
  t.eq(evsSince(T, from, 'dodge').length, 1, 'the first hit is dodged');
  slash(T, tp); slash(T, tp);
  t.eq(tp.st.dodge || 0, 0, 'two hits pop it');
});

t.test('engine: paper_golem slams with its Plating and tears when hit', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['paper_golem']);
  const g = C.enemies[0];
  t.eq(g.st.plating, 6, 'it starts with Plating 6');
  t.eq(g.intent.move, 'fold', 'it folds first');
  slash(C, g); slash(C, g);
  t.eq(g.st.plating, 5, 'the first hit that hurts tears one Plating off, once per round');
  step(C);                                                   // fold: +3 Plating, Block
  t.eq(g.st.plating, 8, 'Fold Up adds Plating');
  g._move = 'slam';
  t.eq(C.intent(g).dmg, 22, 'Origami Slam reads the Plating: 14 + 8');
  g.st.plating = 30;
  t.eq(C.intent(g).dmg, 25, 'capped at 25');
  t.eq(C.intent(g).kind, 'heavy', 'shown as heavy');
});

t.test('engine: margin_imp calls sprites, and the sprites add wilt cards that really cost Energy', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['margin_imp']);
  const imp = C.enemies[0];
  t.eq(imp.intent.move, 'call', 'it opens by calling a friend');
  step(C);
  const sprite = unit(C, 'typo_sprite');
  t.ok(!!sprite && sprite.lane === 3, 'a typo sprite arrives in the next free lane');
  step(C);                                                   // the sprite's first action: misspell (adds wilt); the imp: doodle (also adds wilt)
  const wilts = [...C.draw, ...C.discard, ...C.hand].filter((c) => c.id === 'status_wilt').length;
  t.ok(wilts >= 2, `wilt cards entered the deck (${wilts})`);
  // a drawn wilt costs 1 Energy (the spec's status_wilt), checked through the real draw
  const D = scenario(['typo_sprite']);
  D.draw.unshift({ uid: 900, id: 'status_wilt', up: 0, gems: [] });
  step(D);
  t.eq(D.energy, D.maxEnergy - 1, 'drawing a wilt at the start of a turn costs 1 Energy');
  // the second call comes once, at half HP, and only while fewer than 2 minions live
  const E2 = scenario(['margin_imp']);
  const i2 = E2.enemies[0];
  step(E2, 2);
  cross(E2, i2, 0.45);
  cull(E2);
  step(E2);
  const calls = E2.events.filter((e) => e.type === 'enemy_act' && e.move === 'call').length;
  t.ok(calls <= 2, `the imp calls at most twice in a fight (${calls})`);
  const F = scenario(['margin_imp']);
  const i3 = F.enemies[0];
  step(F);                                                   // opener call: one sprite
  cross(F, i3, 0.45);                                        // half HP: a second call is armed
  step(F);                                                   // rolls the call
  t.eq(i3.intent.move, 'call', 'below half HP it calls again');
  step(F);
  t.eq(F.events.filter((e) => e.type === 'enemy_act' && e.move === 'call').length, 2, 'the half HP call happens');
  step(F, 2);
  t.ok(F.enemies.filter((e) => !e.down && e.tier === 'minion').length <= 2, 'never more than 2 sprites alive');
});

t.test('engine: censor_golem raises the stamp, DENIED lands hard, and a Stun on the stamp turn cancels it', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['censor_golem'], { deck: cardsOf('hanae_zz_stun', 12) });
  const g = C.enemies[0];
  const seq = [];
  for (let i = 0; i < 3; i++) { seq.push(g.intent.move); step(C); }
  t.deep(seq, ['smack', 'censor', 'raise'], 'smack, redaction stamp, the quiet raise');
  t.eq(g.intent.move, 'stamp', 'turn 4: the stamp');
  t.eq(g.intent.kind, 'heavy', 'a heavy hit');
  t.eq(g.intent.dmg, 26, 'for 26');
  t.ok(g.intent.statuses.some((s) => s.s === 'vulnerable'), 'and it leaves Vulnerable');
  const redacted = [...C.draw, ...C.discard, ...C.hand].filter((c) => c.id === 'status_redacted').length;
  t.ok(redacted >= 3, `three turns of redaction put cards in the deck (${redacted})`);
  const stun = C.hand.find((c) => c.id === 'hanae_zz_stun');
  const from = C.events.length;
  C.play(stun.uid, g.id);
  t.ok(C.intent(g).stunned === true, 'a Stun on the stamp turn shows Stunned');
  const hpBefore = C.heroes[0].hp;
  step(C);
  t.ok(evsSince(C, from, 'skip').length === 1 && !C.events.slice(from).some((e) => e.type === 'enemy_act' && e.move === 'stamp'), 'the stamp is skipped and lost');
  t.eq(C.heroes[0].hp, hpBefore, 'nobody was hurt that round');
  t.ok(!g.st.stun, 'the Stun is spent');
  const again = C.hand.find((c) => c.id === 'hanae_zz_stun');
  const from2 = C.events.length;
  C.play(again.uid, g.id);
  t.ok(evsSince(C, from2, 'immune').length === 1, 'an elite shrugs off a second Stun straight away');
  // at half HP it stamps at once, telegraphed
  const D = scenario(['censor_golem']);
  const dg = D.enemies[0];
  const ev = cross(D, dg, 0.5);
  const ph = ev.find((e) => e.type === 'enemy_phase');
  t.ok(ph && ph.index === 1 && ph.say === E('censor_golem').phases[0].say, 'the phase fires with its say line');
  t.eq(dg.intent.move, 'stamp', 'and the stamp is telegraphed immediately');
  t.eq(dg.st.might, 1, 'with Might 1');
  t.ok(dg.block >= 12, 'and Block 12');
});

t.test('engine: storm_whelp keeps a Charge clock, Thunderclap reads it on both heroes and spends it', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['storm_whelp']);
  const w = C.enemies[0];
  t.eq(w.intent.move, 'gather', 'it opens by gathering');
  slash(C, w); slash(C, w);
  t.eq(w.st.charge, 1, 'each round it is hurt adds one Charge (once per round)');
  step(C);
  t.eq(w.st.charge, 4, 'Gather the Storm adds 3');
  t.ok(w.block >= 10, 'and Block');
  t.eq(w.intent.move, 'claws', 'then the claws');
  w._move = 'clap';
  const it = C.intent(w);
  t.deep([it.dmg, it.hits, it.tgt, it.kind], [16, 1, ['hanae', 'kuro'], 'heavy'], 'Thunderclap with 4 Charge: 16 on each hero');
  w.st.charge = 9;
  t.eq(C.intent(w).dmg, 18, 'capped at 18');
  w.st.charge = 4;
  const from = C.events.length;
  step(C);
  const hits = evsSince(C, from, 'hit').filter((e) => e.dst.kind === 'hero' && e.raw === 16);
  t.deep(hits.map((e) => e.dst.id).sort(), ['hanae', 'kuro'], 'both heroes were hit for 16');
  t.ok(!w.st.charge, 'the clap spends the Charge');
  // sparks come only through the gated call
  const S = scenario(['spark_mote', 'storm_whelp']);
  const wh = unit(S, 'storm_whelp');
  const sequence = [];
  for (let i = 0; i < 6 && S.phase !== 'over'; i++) { sequence.push(wh.intent.move); step(S); }
  t.eq(sequence[0], 'gather', 'the pre-seeded spark does not change the opener');
  t.ok(sequence.indexOf('call') === 3, `the call comes on its own turn 4 (${sequence.join(', ')})`);
  t.ok(S.enemies.filter((e) => e.def === 'spark_mote' && !e.down).length <= 2, 'never more than 2 sparks');
  // half HP: the phase gives Charge and Might, and keeps the clock going
  const H = scenario(['storm_whelp']);
  const hw = H.enemies[0];
  const ev = cross(H, hw, 0.5);
  t.ok(ev.some((e) => e.type === 'enemy_phase' && e.say === E('storm_whelp').phases[0].say), 'the sky goes white: a say line');
  t.ok(hw.st.charge >= 3 && hw.st.might === 1, 'the phase gives Charge and Might');
});

t.test('engine: black_bar_inquisitor chains, gags and finishes: cut the chain, swap the victim, keep the weak hero above 40 percent', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario(['black_bar_inquisitor']);
  const q = C.enemies[0];
  t.eq(q.intent.move, 'chains', 'it opens with the chains');
  step(C);
  t.eq(C.heroes[0].st.bind, 1, 'the front hero is bound');
  t.ok(C.hand.some((c) => c.id === 'status_tangle'), 'and the cure was put on top of the draw pile: it is in the next hand');
  t.eq(q.intent.move, 'gag', 'the gag is next');
  t.ok(q.intent.statuses.some((s) => s.s === 'stun') && q.intent.hits === 1, 'a hit plus a Stun');
  t.deep(q.intent.tgt, ['hanae'], 'at the front hero');
  t.eq(C.canSwap().reason, 'bind', 'Bind stops the swap');
  const tangle = C.hand.find((c) => c.id === 'status_tangle');
  t.ok(!!tangle, 'the tangle card is in hand on turn 2');
  C.play(tangle.uid);
  t.ok(!C.heroes[0].st.bind, 'the tangle card cuts the Bind');
  t.ok(C.canSwap().ok, 'and the swap is open again');
  C.swap();
  t.deep(C.intent(q).tgt, ['kuro'], 'the gag now lands on the other hero');
  step(C);
  t.eq(C.heroes[1].st.stun, 1, 'the swapped-in hero takes the Stun');
  t.ok(!C.heroes[0].st.stun, 'the bound hero is spared');
  // the finisher: only against a hero below 40 percent, only on even turns, always the weakest hero
  const D = scenario(['black_bar_inquisitor']);
  const d = D.enemies[0];
  D.heroes[0].hp = 100;                                      // 11 percent of 900
  step(D);
  t.eq(d.intent.move, 'verdict', 'a low hero on an even turn draws the verdict');
  t.eq(d.intent.kind, 'heavy', 'heavy');
  t.deep(d.intent.tgt, ['hanae'], 'at the weakest hero');
  t.eq(d.intent.dmg, 30, 'for 14 plus a quarter of the missing HP, capped at 30');
  const F = scenario(['black_bar_inquisitor']);
  step(F);
  t.ok(F.enemies[0].intent.move !== 'verdict', 'nobody is low: no verdict');
  F.heroes[1].hp = 100;
  step(F);
  t.ok(F.enemies[0].intent.move !== 'verdict', 'odd turn: the verdict waits for an even one');
  step(F);
  t.eq(F.enemies[0].intent.move, 'verdict', 'even turn, a low hero (the back one): verdict');
  t.deep(F.enemies[0].intent.tgt, ['kuro'], 'the weakest hero is hit whatever row it stands in');
  // Taunt on the other hero redirects lowest-targeting (the attack rules of DESIGN 4.2)
  F.heroes[0].st.taunt = 2;
  t.deep(F.intent(F.enemies[0]).tgt, ['hanae'], 'a taunting hero draws the verdict');
  // the hunt: two hits at the weakest hero
  const info = (() => { const X = scenario(['black_bar_inquisitor']); X.heroes[1].hp = 50; const u = X.enemies[0]; u._move = 'hunt'; return X.intent(u); })();
  t.deep([info.hits, info.dmg, info.tgt], [2, 9, ['kuro']], 'Hunt the Weak: 2 x 9 at the lowest hero');
});

t.test('engine: the minions do exactly what their lore says', () => {
  if (!HAVE_ENGINE) return skipNote();
  // blank_page: drift (Block), wrap (Frail on the front hero), a paper cut
  const P = scenario(['blank_page']);
  const pg = P.enemies[0];
  const order = [];
  for (let i = 0; i < 3; i++) { order.push(pg.intent.move); step(P); if (i === 0) t.eq(pg.block, 9, 'Drift gives 9 Block'); if (i === 1) t.eq(P.heroes[0].st.frail, 1, 'Wrap Around frails the front hero'); }
  t.deep(order, ['drift', 'wrap', 'cut'], 'drift, wrap, cut');
  t.ok(P.heroes[0].hp === 900 - 5, 'the paper cut is 5');
  // frail really shrinks the Block the party gains (the spec: 25 percent less from cards)
  const F = scenario(['blank_page'], { deck: cardsOf('kuro_zz_ward', 12) });
  F.heroes[1].st.frail = 1;
  const ward = F.hand.find((c) => c.id === 'kuro_zz_ward');
  F.play(ward.uid);
  t.eq(F.heroes[1].block, Math.floor(7 * 0.75), 'Frail cuts the Block a card gives by a quarter');
  // spark_mote: one zap, then it bursts (leaves), and stings for 4 if popped first
  const S = scenario(['spark_mote', 'blank_page']);
  const sm = unit(S, 'spark_mote');
  t.deep([sm.intent.move, sm.intent.dmg, sm.intent.tgt], ['zap', 9, ['hanae']], 'it will zap the front hero for 9');
  step(S);
  t.ok(sm.down && sm.fled, 'after the zap it is gone (it fled, not died)');
  t.eq(S.stats.kills.filter((k) => k.def === 'spark_mote').length, 0, 'a burst spark is not a kill');
  t.eq(S.heroes[0].hp, 900 - 9, 'the zap hit for 9');
  const S2 = scenario(['spark_mote', 'blank_page']);
  const sm2 = unit(S2, 'spark_mote');
  sm2.hp = 1; sm2.block = 0;
  const from = S2.events.length;
  slash(S2, sm2);
  t.ok(sm2.down && !sm2.fled, 'popped: it died');
  const sting = evsSince(S2, from, 'hit').find((e) => e.dst.id === 'hanae');
  t.ok(sting && sting.raw === 4, 'and stung the front hero for 4');
  // typo_sprite: misspell, poke
  const T = scenario(['typo_sprite']);
  const order2 = [];
  for (let i = 0; i < 2; i++) { order2.push(T.enemies[0].intent.move); step(T); }
  t.deep(order2, ['misspell', 'poke'], 'misspell, poke');
  t.ok([...T.draw, ...T.discard, ...T.hand].some((c) => c.id === 'status_wilt'), 'the misspell put a wilt card in the deck');
  t.eq(T.heroes[0].hp, 900 - 5, 'the poke is 5');
});

t.test('engine: the small chapter 3 rules: knight leaves a last bar, drone overclocks, knight blacks out, redaction and static cards', () => {
  if (!HAVE_ENGINE) return skipNote();
  const K = scenario(['redaction_knight']);
  const kn = K.enemies[0];
  t.eq(kn.intent.move, 'strike', 'Strikethrough first');
  step(K);
  t.ok([...K.draw, ...K.discard, ...K.hand].filter((c) => c.id === 'status_redacted').length === 1, 'a redacted card entered the deck');
  kn.hp = Math.floor(kn.maxHp * 0.45);
  step(K);
  t.eq(kn.intent.move, 'blackout', 'below half HP the bars close');
  t.eq(kn.intent.kind, 'defend', 'shown as a defend');
  step(K);
  t.ok(kn.block >= 14 && kn.st.plating === 3, 'Blackout gives 14 Block and Plating 3');
  kn.hp = 1; kn.block = 0;
  const before = [...K.draw, ...K.discard, ...K.hand].filter((c) => c.id === 'status_redacted').length;
  slash(K, kn);
  const after = [...K.draw, ...K.discard, ...K.hand].filter((c) => c.id === 'status_redacted').length;
  t.eq(after, before + 1, 'dying leaves one last redacted card (in the discard pile)');
  // the redacted card is dead weight: unplayable, and it stays until the fight ends
  const rc = [...K.draw, ...K.discard, ...K.hand].find((c) => c.id === 'status_redacted');
  t.eq(DATA.cards[rc.id].kw.indexOf('unplayable') >= 0, true, 'redacted is unplayable');
  // storm_drone: jabs in threes, arc adds Static, overclock once below half HP
  const D = scenario(['storm_drone'], { seed: 21 });
  const dr = D.enemies[0];
  dr.hp = Math.floor(dr.maxHp * 0.4);
  step(D);
  t.eq(dr.intent.move, 'overclock', 'below half HP it overclocks');
  step(D);
  t.eq(dr.st.might, 1, 'Might 1');
  const seenMoves = [];
  for (let i = 0; i < 12 && D.phase !== 'over'; i++) { seenMoves.push(dr.intent.move); step(D); }
  t.ok(seenMoves.indexOf('overclock') < 0, 'once only');
  dr._move = 'jab';
  const it = D.intent(dr);
  t.deep([it.hits, it.dmg], [3, 7], 'with Might 1 the jabs are 3 x 7');
  const A = scenario(['storm_drone']);
  const ad = A.enemies[0]; ad._move = 'arc';
  t.deep(A.intent(ad).tgt, ['hanae', 'kuro'], 'Arc Flash is aimed at both heroes');
  step(A);
  t.ok([...A.draw, ...A.discard, ...A.hand].some((c) => c.id === 'status_static'), 'and adds a Static card');
  t.ok(A.heroes[0].hp === 900 - 6 && A.heroes[1].hp === 900 - 6, 'for 6 each');
  // storm_whelp: Storm Breath hits both heroes and adds a Scorch card
  const J = scenario(['storm_whelp']);
  const jw = J.enemies[0];
  jw._move = 'breath';
  const jf = J.events.length;
  step(J);
  t.deep(evsSince(J, jf, 'hit').filter((e) => e.dst.kind === 'hero').map((e) => [e.dst.id, e.raw]).sort(), [['hanae', 9], ['kuro', 9]], 'Storm Breath hits both heroes for 9');
  t.ok([...J.draw, ...J.discard, ...J.hand].some((c) => c.id === 'status_scorch'), 'and adds a Scorch card');
});

t.test('engine: the Editor, form by form: Proofread then Red Pen (swap the Vulnerable hero out), Clean Slate, Rub Through, Unwrite', () => {
  if (!HAVE_ENGINE) return skipNote();
  const C = scenario([boss]);
  const b = C.enemies[0];
  t.eq(b.lane, 4, 'the boss stands alone in lane 4');
  t.eq(b.intent.move, 'handout', 'it opens by handing out notes');
  step(C);
  const pages = C.enemies.filter((e) => e.def === 'blank_page' && !e.down);
  t.deep(pages.map((p) => p.lane).sort(), [2, 3], 'two blank pages take the lanes next to it');
  t.eq(b.intent.move, 'proofread', 'Proofread is next');
  t.eq(b.intent.kind, 'attack', 'an attack that also marks the front hero');
  step(C);
  t.eq(C.heroes[0].st.vulnerable, 1, 'the front hero is Vulnerable for exactly the next enemy phase');
  t.eq(b.intent.move, 'pen', 'the Red Pen follows');
  t.eq(b.intent.kind, 'multi', 'a multi');
  const marked = C.intent(b);
  t.deep([marked.hits, marked.dmg, marked.tgt], [3, 13, ['hanae']], 'three hits of 13 on the Vulnerable hero');
  C.swap();
  const spared = C.intent(b);
  t.deep([spared.hits, spared.dmg, spared.tgt], [3, 9, ['kuro']], 'swap and the pen lands as 3 x 9 on the other hero');
  const from = C.events.length;
  step(C);
  t.eq(evsSince(C, from, 'hit').filter((e) => e.src && e.src.id === b.id && e.dst.id === 'kuro').length, 3, 'the swapped-in hero really takes the three hits');
  t.eq(C.heroes[0].hp, 900 - 12, 'the Vulnerable hero, standing safe in the back, lost only the 12 from Proofread itself');
  t.eq(b.intent.move, 'strike', 'then Strike Through');
  // stun does nothing to a boss
  { const S = scenario([boss], { deck: cardsOf('hanae_zz_stun', 12) }); const st = S.hand.find((c) => c.id === 'hanae_zz_stun'); const f = S.events.length; S.play(st.uid, S.enemies[0].id); t.eq(evsSince(S, f, 'immune').length, 1, 'the boss is immune to Stun'); }

  // form 2: the Eraser
  const C2 = scenario([boss]);
  const b2 = C2.enemies[0];
  step(C2, 2);
  b2.st.poison = 5; b2.st.burn = 4; b2.st.weak = 2; b2.st.vulnerable = 2;
  const ev1 = cross(C2, b2, 0.66);
  const ph1 = ev1.find((e) => e.type === 'enemy_phase');
  t.ok(ph1 && ph1.index === 1 && ph1.say === E(boss).phases[0].say, 'the first transition fires with its say line');
  t.eq(b2.phase, 1, 'phase field is 1 (art form 2)');
  t.eq(b2.intent.move, 'clean', 'the Eraser opens with Clean Slate, telegraphed at once');
  t.deep([b2.st.plating, b2.st.might, b2.block], [6, 1, 12], 'the Eraser arrives with Plating 6, Might 1 and Block 12');
  t.ok(!b2.st.weak && !b2.st.vulnerable, 'it shed its Weak and Vulnerable');
  t.deep([b2.st.poison, b2.st.burn], [5, 4], 'but Poison and Burn stay: the transition is not a cleanse for poison decks');
  C2.heroes[0].st.might = 3; C2.heroes[0].st.bloom = 4; C2.heroes[1].st.sumi = 2; C2.heroes[1].st.dodge = 1; C2.heroes[1].st.ward = 1; C2.heroes[0].st.charge = 2;
  t.eq(b2.intent.removes.length >= 5, true, 'the intent lists what it will erase');
  step(C2);
  t.deep(C2.heroes.map((h) => Object.keys(h.st).filter((k) => ['might', 'bloom', 'sumi', 'ward', 'charge', 'dodge'].indexOf(k) >= 0)), [[], []], 'Clean Slate strips every buff and every resource from both heroes');
  t.eq(b2.intent.move, 'rub', 'Rub Through follows');
  t.eq(b2.intent.kind, 'heavy', 'as a heavy');
  const rub = (block) => { C2.front().block = block; return C2.intent(b2).dmg; };
  t.deep([rub(0), rub(20), rub(60)], [16, 31, 33], 'Rub Through reads Block: 15 + 0.75 per Block, capped at 32 (plus Might 1)');
  C2.energy = 3; cull(C2);                                   // the pages would chip the Block before the boss acts
  C2.front().block = 20;
  const f2 = C2.events.length;
  step(C2);
  const rh = evsSince(C2, f2, 'hit').find((e) => e.src && e.src.id === b2.id && e.pierce);
  t.ok(rh && rh.blocked === 0 && rh.amount === 31, 'it pierces: 31 damage through 20 Block, and the Block stays');
  t.eq(b2.intent.move, 'swipe', 'then the swipe');

  // form 3: the Blank Page
  const C3 = scenario([boss]);
  const b3 = C3.enemies[0];
  step(C3, 1);                                               // the pages arrive; no Proofread yet, so no Vulnerable muddies the numbers
  cross(C3, b3, 0.66);
  const ev2 = cross(C3, b3, 0.33);
  const ph2 = ev2.find((e) => e.type === 'enemy_phase');
  t.ok(ph2 && ph2.index === 2 && ph2.say === E(boss).phases[1].say, 'the second transition fires with its say line');
  t.eq(b3.phase, 2, 'phase field is 2 (art form 3)');
  t.ok(!b3.st.plating, 'the armour is gone');
  t.ok(ev2.some((e) => e.type === 'add_card' && e.cards.some((c) => c.id === 'status_blot')) && ev2.some((e) => e.type === 'add_card' && e.cards.some((c) => c.id === 'status_wilt')), 'the tear opens and blot and wilt cards fall into the deck');
  t.eq(b3.st.might, 2, 'Might is 2 in the last form');
  t.eq(b3.intent.move, 'unwrite', 'the last form opens with Unwrite');
  t.eq(b3.intent.kind, 'heavy', 'a heavy');
  t.deep(b3.intent.tgt, ['hanae', 'kuro'], 'on both heroes');
  const alive = () => C3.enemies.filter((e) => !e.down).length;
  const n0 = alive();
  const d0 = C3.intent(b3).dmg;
  t.eq(d0, Math.min(17, 8 + 3 * n0) + 2, `Unwrite reads the living enemies: ${n0} alive is ${d0} per hero`);
  C3.energy = 3;
  cull(C3);
  t.ok(alive() < n0, 'the pages fall');
  const d1 = C3.intent(b3).dmg;
  t.eq(d1, Math.min(17, 8 + 3 * alive()) + 2, `kill the pages and it shrinks live: ${d1} with ${alive()} alive`);
  t.ok(d1 < d0, 'the intent number dropped in the same turn');
  // the last word comes once, below 12 percent
  b3.hp = Math.floor(b3.maxHp * 0.1);
  step(C3);
  t.eq(b3.intent.move, 'last', 'below 12 percent: the last word');
  step(C3);
  t.ok(b3.intent.move !== 'last', 'once only');
  // stat swings never leak: form 3 has no Plating gain left, form 1 never has Plating
  const C0 = scenario([boss]);
  t.ok(!C0.enemies[0].st.plating && !C0.enemies[0].st.might, 'the opening form carries no Plating and no Might');
});

t.test('engine: phases fire when HP crosses the line, in order, even when one blow crosses both', () => {
  if (!HAVE_ENGINE) return skipNote();
  // one big blow that crosses both lines of the boss: shrink the unit so 28 damage takes it from 68 percent to 22 percent
  const D = scenario([boss], { deck: cardsOf('hanae_zz_rare', 12) });
  const bd = D.enemies[0];
  bd.maxHp = 60; bd.hp = 41; bd.block = 0;
  const rare = D.hand.find((c) => c.id === 'hanae_zz_rare');
  const before = D.events.length;
  D.play(rare.uid, bd.id);
  const ph = evsSince(D, before, 'enemy_phase');
  t.deep(ph.map((e) => e.index), [1, 2], 'one blow across both lines fires both transitions, in order');
  t.deep(ph.map((e) => e.at), [0.66, 0.33], 'with their own lines');
  t.eq(bd.phase, 2, 'the unit ends in form 3');
  t.eq(bd.intent.move, 'unwrite', 'and the last form is what it telegraphs');
  t.ok(!bd.st.plating && bd.st.might === 2 && bd.block >= 12, 'the stat swings stacked in order: Plating came and went, Might 2, Block kept');
  // a blow that stops between the lines fires only the first
  const E1 = scenario([boss], { deck: cardsOf('hanae_zz_rare', 12) });
  const b1 = E1.enemies[0];
  b1.hp = Math.floor(b1.maxHp * 0.66) + 15; b1.block = 0;
  const r1 = E1.hand.find((c) => c.id === 'hanae_zz_rare');
  const before1 = E1.events.length;
  E1.play(r1.uid, b1.id);
  t.deep(evsSince(E1, before1, 'enemy_phase').map((e) => e.index), [1], 'a blow that stops between the lines fires only the first');
  t.eq(b1.phase, 1, 'form 2');
  // the whelp and the golem cross theirs at 0.5
  ['storm_whelp', 'censor_golem'].forEach((id) => {
    const S = scenario([id]);
    const u = S.enemies[0];
    const ev = cross(S, u, 0.5);
    t.ok(ev.some((e) => e.type === 'enemy_phase' && e.index === 1 && e.at === 0.5), `${id} changes at half HP`);
    t.eq(u.phase, 1, `${id} phase field is 1`);
    t.eq(u.intent.move, id === 'storm_whelp' ? 'clap' : 'stamp', `${id} telegraphs its big move the moment it changes`);
  });
  // phases never fire twice
  const P = scenario([boss]);
  const bp = P.enemies[0];
  cross(P, bp, 0.66);
  const n1 = P.events.filter((e) => e.type === 'enemy_phase').length;
  bp.hp = Math.floor(bp.maxHp * 0.6); bp.block = 0;
  slash(P, bp);
  t.eq(P.events.filter((e) => e.type === 'enemy_phase').length, n1, 'a transition fires only once');
  // downed in one blow from full: no transition fires for a corpse
  const K = scenario([boss]);
  const kb = K.enemies[0];
  kb.hp = 1; kb.block = 0;
  const kb0 = K.events.length;
  slash(K, kb);
  t.ok(kb.down && evsSince(K, kb0, 'enemy_phase').length === 0, 'a killing blow fires no phase');
});

t.test('engine: summoners never exceed 2 living minions in real fights (seeded minions counted)', () => {
  if (!HAVE_ENGINE) return skipNote();
  let worst = 0;
  const check = (enemyIds, level, n) => eMany(enemyIds, level, n).forEach((r) => {
    const live = new Set(); const serial = {};
    enemyIds.forEach((def) => { serial[def] = (serial[def] || 0) + 1; if (E(def).tier === 'minion') live.add(def + '#' + serial[def]); });
    r.s.C.events.forEach((e) => {
      if (e.type === 'summon') live.add(e.enemy.id);
      if (e.type === 'death' || e.type === 'flee') live.delete(e.unit.id);
      worst = Math.max(worst, live.size);
    });
  });
  check([boss], 'boss', 20); check([boss], 'early', 10);
  check(['spark_mote', 'storm_whelp'], 'mid', 20); check(['margin_imp', 'blank_soldier'], 'mid', 20); check(['blank_soldier', 'margin_imp', 'void_scribe'], 'late', 20);
  t.ok(worst <= 2, `no summoner ever exceeded 2 living minions (max ${worst})`);
  // and never when nobody kills them either: the drivers with no culling
  ['margin_imp', 'storm_whelp'].forEach((id) => { const C = idleRun([id], 14, 5); const alive = C.enemies.filter((e) => !e.down && e.tier === 'minion').length; t.ok(alive <= 2, `${id} left alone keeps at most 2 minions (${alive})`); });
  const B = idleRun([boss], 14, 5);
  t.ok(B.enemies.filter((e) => !e.down && e.tier === 'minion').length <= 2, 'the boss left alone keeps at most 2 minions');
  // and the encounter limit of 5 living units is never touched by any group
  allGroups.forEach((g) => { const C = idleRun(g.enemies, 14, 9); t.ok(C.enemies.filter((e) => !e.down).length <= 5, `${g.id} never has more than 5 living units`); });
});

t.test('engine: determinism, and trial mods scale the roster', () => {
  if (!HAVE_ENGINE) return skipNote();
  const a = engineFight(['blank_soldier', 'margin_imp', 'void_scribe'], 77, 'late');
  const b = engineFight(['blank_soldier', 'margin_imp', 'void_scribe'], 77, 'late');
  t.deep(a.s.C.events, b.s.C.events, 'the same seed gives the same fight, event for event');
  t.ok(JSON.stringify(engineFight([boss], 78, 'boss').s.C.events) !== JSON.stringify(engineFight([boss], 79, 'boss').s.C.events), 'a different seed gives a different fight');
  // Trial mods: enemyHp scales normals and minions, eliteHp elites, bossHp the boss, enemyDmg every hit
  const M = DATA.foldMods([{ enemyHp: 0.5, eliteHp: 0.25, bossHp: 0.1, enemyDmg: 0.5 }]);
  const base = (id) => { const C = COMBAT.create(mk([id], 'mid', fightTier([id]), 5)); C.start(); return C.enemies[0].maxHp; };
  const scaled = (id) => { const C = COMBAT.create(mk([id], 'mid', fightTier([id]), 5, { mods: M })); C.start(); return C.enemies[0].maxHp; };
  ['storm_drone', 'komainu_guardian', 'spark_mote'].forEach((id) => t.eq(scaled(id), Math.round(base(id) * 1.5), `${id} HP x1.5 from enemyHp`));
  elites.forEach((id) => t.eq(scaled(id), Math.round(base(id) * 1.25), `${id} HP x1.25 from eliteHp`));
  t.eq(scaled(boss), Math.round(base(boss) * 1.1), 'the boss HP x1.1 from bossHp');
  // damage: every hit scales by the factor and floors
  const C = COMBAT.create(mk(['redaction_knight'], 'mid', 'normal', 5, { mods: M }));
  C.start();
  C.enemies[0]._move = 'cleave';
  t.eq(C.intent(C.enemies[0]).dmg, Math.floor(15 * 1.5), 'enemyDmg scales the cleave and floors it');
});

t.test('engine: every group and the boss run cleanly against every hero pair (rows, taunt, thorns and passives never break an enemy)', () => {
  if (!HAVE_ENGINE) return skipNote();
  const HEROES = ['hanae', 'kuro', 'suzu', 'raiga'];
  const deckOf = (pair) => {
    let uid = 1; const deck = [];
    pair.forEach((h) => {
      const cards = h === 'hanae' ? ['hanae_zz_slash', 'hanae_zz_slash', 'hanae_zz_parry', 'hanae_zz_heavy', 'hanae_zz_whirl', 'hanae_zz_expose'] : h === 'kuro' ? ['kuro_zz_bolt', 'kuro_zz_bolt', 'kuro_zz_ward', 'kuro_zz_wave', 'kuro_zz_venom', 'kuro_zz_insight'] : [h + '_zz_hit', h + '_zz_hit', h + '_zz_guard', h + '_zz_wave', h + '_zz_hit', h + '_zz_guard'];
      cards.forEach((id) => deck.push({ uid: uid++, id, up: uid % 2, gems: [null] }));
    });
    return deck;
  };
  let fights = 0;
  for (let i = 0; i < HEROES.length; i++) for (let j = i + 1; j < HEROES.length; j++) {
    const pair = [HEROES[i], HEROES[j]];
    const hp = pair.map((h) => DATA.heroes[h].maxHp + 16);
    allGroups.map((g) => g.enemies).concat([[boss]]).forEach((list, k) => {
      const s = COMBAT.simulate({ heroes: pair.map((h, n) => ({ id: h, hp: hp[n], maxHp: hp[n] })), frontIdx: (i + j + k) % 2, deck: deckOf(pair), enemies: list, tier: fightTier(list), chapter: CH, seed: 300 + k, mods: DATA.foldMods([]), relics: [], gold: 0, maxTurns: 40 });
      fights++;
      t.ok(!s.capped && (s.result === 'win' || s.result === 'lose'), `${pair.join('+')} vs ${list.join(',')} ends (${s.result})`);
    });
  }
  t.ok(fights === 6 * (allGroups.length + 1), `ran ${fights} fights`);
});

t.done();
