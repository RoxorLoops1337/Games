// Chapter 2 roster suite (hocus_vocus/js/data_enemies_2.js): the Sunken Lantern City.
//
//   node tests/hocus_vocus_enemies_2.test.mjs                        run the suite
//   RB_ENEMIES2_REPORT=1 node tests/hocus_vocus_enemies_2.test.mjs   also print the balance tables (every group, elite and the boss)
//   RB_ENEMIES2_TRACE=boss_jorogumo node ...                        print one real fight turn by turn (comma list of enemy ids, optional :level)
//
// Layers of checking, cheapest first:
//   1. structure   the fixed roster; DATA.validate and DATA.audit are clean (errors, warnings, audit AND guide lines: zero); plain data; copy limits
//   2. bands       HP and damage per tier from the CONTENT_SPEC 4.2 table, computed from the fx ops (V caps, `both` counts twice, Might from
//                  start and phase ops); boss round totals; group budgets
//   3. coverage    every mechanic CONTENT_SPEC 4.3 asks for, plus the role each roster line promises, checked on the ops themselves
//   4. AI          every move reachable (state enumeration over every condition), no shadowed rule, summon cap gating, phases ordered,
//                  encounter pools well formed
//   5. engine      REAL COMBAT fights (COMBAT.simulate with the default greedy bot) against synthetic hero decks: every fight ends, bands
//                  hold, every move fires, phases and summons behave, the designed counter-play works (tangle cuts Bind, swapping out of
//                  Grasp, Embrace and Web read the silk on their victim), determinism, trial mods.
//
// The synthetic decks live in this file (hanae and kuro from DATA.heroes with their real rows), built from the CONTENT_SPEC 3 power guidance
// at three power levels that grow the way a chapter 2 deck grows. The suite boots WITHOUT any peer content file (cards, relics, gems, events,
// chapter 1 and 3 enemies) so nobody else's balance work can move these numbers. The two status cards enemies add (blot, tangle) are defined
// here exactly as CONTENT_SPEC section 2 says, because data_cards_shared.js is not loaded.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus enemies_2');
const REPORT = !!process.env.RB_ENEMIES2_REPORT;
const TRACE = process.env.RB_ENEMIES2_TRACE;
const CH = 2;
const HAVE_ENGINE = fs.existsSync(path.join(DIR, 'js', 'combat.js')) && fs.existsSync(path.join(DIR, 'js', 'data_text.js'));

const PEERS = ['data_cards_*', 'data_enemies_1', 'data_enemies_3', 'data_relics', 'data_gems', 'data_events', 'data_meta'];
const { DATA, U, COMBAT } = boot({ only: ['data_enemies_2'].concat(HAVE_ENGINE ? ['data_text', 'combat'] : []), skip: PEERS });
const L = DATA.LISTS, G = DATA.GUIDE;
const E = (id) => DATA.enemies[id];
const ids = DATA.enemyIds(CH);
const tierIds = (tier) => ids.filter((id) => E(id).tier === tier);
const normals = tierIds('normal'), elites = tierIds('elite'), minions = tierIds('minion'), boss = 'boss_jorogumo';
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
const groupEnemies = (g) => g.enemies.map(E);

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
// Enumerate abstract worlds and report which moves an AI object can choose, and whether each rule can fire unshadowed.
function reach(ai) {
  const rules = ai.rules || [];
  const keys = [...new Set(rules.filter((r) => r.if.heroStatus).map((r) => r.if.heroStatus.s))];
  const used = new Set(ai.open || []);
  const ruleFires = rules.map(() => false);
  let fallThrough = false;
  const combos = keys.map(() => [0, 1, 2]).reduce((acc, lv) => { const out = []; acc.forEach((a) => lv.forEach((v) => out.push(a.concat(v)))); return out; }, [[]]);
  for (let turn = 1; turn <= 16; turn++) for (const hpFrac of [1, 0.8, 0.6, 0.45, 0.3, 0.15]) for (const others of [0, 1, 2]) for (const mins of [0, 1, 2]) {
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
  t.eq(roster.length, 17, 'chapter 2 roster has 17 entries');
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
  t.eq(E(boss).title, DATA.rosterById[boss].title, 'boss title');
});

t.test('DATA.validate and DATA.audit are clean for chapter 2 (errors, warnings, audit lines, guide lines)', () => {
  const v = DATA.validate('enemies', { chapter: CH });
  t.eq(v.errors.length, 0, 'validate errors: ' + v.errors.join(' | '));
  t.eq(v.warnings.length, 0, 'validate warnings: ' + v.warnings.join(' | '));
  const a = DATA.audit('enemies', { chapter: CH });
  t.eq(a.filter((x) => x.indexOf('audit') === 0).length, 0, 'audit lines: ' + a.join(' | '));
  t.eq(a.filter((x) => x.indexOf('guide') === 0).length, 0, 'guide lines: ' + a.join(' | '));
});

t.test('content is plain data: JSON round trip, no functions, no dashes, no forbidden fields', () => {
  ids.forEach((id) => {
    const s = JSON.stringify(E(id));
    t.eq(s, JSON.stringify(JSON.parse(s)), `${id} survives a JSON round trip`);
    t.ok(!DASH.test(s), `${id} has no em or en dash`);
    t.ok(!/"text"/.test(s), `${id} has no text field`);
  });
  t.ok(!DASH.test(JSON.stringify(DATA.encounters[CH])), 'encounters have no dashes');
});

t.test('lore and copy: bestiary voice, length limits, tags, move names and barks', () => {
  ids.forEach((id) => {
    const e = E(id);
    t.ok(e.lore.length >= 60 && e.lore.length <= 260, `${id} lore length ${e.lore.length}`);
    const sentences = e.lore.split(/(?<=[.!?])\s+/).filter(Boolean);
    t.ok(sentences.length >= 1 && sentences.length <= 3, `${id} lore is 1 to 2 sentences (${sentences.length})`);
    t.ok(/[.!?]$/.test(e.lore), `${id} lore ends with punctuation`);
    t.ok(e.tags.length >= 1 && e.tags.length <= 3 && e.tags.every((x) => L.enemyTags.indexOf(x) >= 0), `${id} tags`);
    t.eq(new Set(e.tags).size, e.tags.length, `${id} tags are unique`);
    movesOf(e).forEach((m) => {
      t.ok(m.name.split(/\s+/).length <= 3, `${id}.${m.id} name is 1 to 3 words: "${m.name}"`);
      t.ok(/^[A-Z]/.test(m.name), `${id}.${m.id} name is capitalised`);
      if (m.say !== undefined) t.ok(m.say.length >= 3 && m.say.length <= 48, `${id}.${m.id} say length ${m.say.length}`);
    });
  });
  t.eq(new Set(ids.map((id) => E(id).lore)).size, ids.length, 'every lore text is unique');
  t.ok(new Set(ids.map((id) => E(id).tags.join())).size >= 8, 'tags are varied');
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. bands (CONTENT_SPEC 4.2, machine copy DATA.GUIDE)
// ---------------------------------------------------------------------------------------------------------------------
t.test('HP bands per tier, and HP spreads are real ranges; taller sprites are tougher', () => {
  ids.forEach((id) => {
    const e = E(id), g = G.hp[CH][e.tier];
    t.ok(e.hp[0] >= g[0] && e.hp[1] <= g[1], `${id} hp ${e.hp} inside ${g}`);
    t.ok(e.hp[1] > e.hp[0], `${id} hp is a range`);
    t.ok(e.hp[1] - e.hp[0] <= Math.ceil(e.hp[0] * 0.25), `${id} hp spread is not silly`);
  });
  const avg = (id) => (E(id).hp[0] + E(id).hp[1]) / 2;
  const meanHp = (list) => list.reduce((s, id) => s + avg(id), 0) / list.length;
  t.ok(meanHp(normals.filter((id) => E(id).size === 'l')) > meanHp(normals.filter((id) => E(id).size === 'm')), 'large normals have more HP than medium ones');
});

t.test('damage bands: minion, normal, elite and boss hits (V caps, both counts twice)', () => {
  const heavyN = G.heavy[CH].normal, hitN = G.hit[CH].normal, hitE = G.hit[CH].elite, hitB = G.hit[CH].boss, heavyB = G.heavy[CH].boss;
  minions.forEach((id) => movesOf(E(id)).forEach((m) => dmgOps(m).forEach((o) => t.ok(vMax(o.n) >= G.hit[CH].minion[0] - 1 && vMax(o.n) <= G.hit[CH].minion[1], `${id}.${m.id} minion hit ${vMax(o.n)} inside ${G.hit[CH].minion}`))));
  normals.forEach((id) => {
    const e = E(id);
    movesOf(e).forEach((m) => dmgOps(m).forEach((o) => {
      const h = vMax(o.n);
      if (m.kind === 'heavy') t.ok(h >= 10 && h <= heavyN[1], `${id}.${m.id} heavy hit ${h} inside 10..${heavyN[1]}`);
      else t.ok(h >= 3 && h <= hitN[1], `${id}.${m.id} hit ${h} inside 3..${hitN[1]}`);
    }));
    t.ok(Math.max(...movesOf(e).map(hitMax)) >= hitN[0] - 1, `${id} has a real hit (>= ${hitN[0] - 1})`);
  });
  elites.forEach((id) => {
    const e = E(id);
    movesOf(e).forEach((m) => dmgOps(m).forEach((o) => t.ok(vMax(o.n) <= 22, `${id}.${m.id} elite hit ${vMax(o.n)} at most 22`)));
    const big = Math.max(...movesOf(e).map(hitMax));
    t.ok(big >= hitE[0] && big <= 22, `${id} biggest hit ${big} inside ${hitE[0]}..22`);
  });
  const b = E(boss);
  movesOf(b).forEach((m) => dmgOps(m).forEach((o) => t.ok(vMax(o.n) <= heavyB[1], `${boss}.${m.id} hit ${vMax(o.n)} at most ${heavyB[1]}`)));
  movesOf(b).filter((m) => m.kind === 'heavy').forEach((m) => t.ok(hitMax(m) >= 8 && hitMax(m) <= heavyB[1], `${boss}.${m.id} heavy is heavy (${hitMax(m)})`));
  t.ok(Math.max(...movesOf(b).filter((m) => m.kind !== 'heavy').map(hitMax)) >= hitB[0] - 1, 'boss ordinary attacks reach the boss band');
  t.ok(Math.max(...movesOf(b).filter((m) => m.kind === 'heavy').map(hitMax)) >= heavyB[0], 'the boss has a heavy at the boss heavy band');
});

t.test('boss round totals: <= 30 while the disguise holds, <= 36 in the last phase (Might and both-hits included)', () => {
  const b = E(boss), p = b.phases[0];
  const mightStart = mightIn(b.start), mightLast = mightStart + mightIn(p.fx);
  const form1 = reach(b.ai).used, form2 = reach(p.ai).used;
  form1.forEach((m) => t.ok(actionMax(b.moves[m], mightStart) <= G.round[CH][0], `form 1 move ${m} totals ${actionMax(b.moves[m], mightStart)} <= ${G.round[CH][0]}`));
  form2.forEach((m) => t.ok(actionMax(b.moves[m], mightLast) <= G.round[CH][1], `form 2 move ${m} totals ${actionMax(b.moves[m], mightLast)} <= ${G.round[CH][1]}`));
  const top1 = Math.max(...[...form1].map((m) => actionMax(b.moves[m], mightStart))), top2 = Math.max(...[...form2].map((m) => actionMax(b.moves[m], mightLast)));
  t.ok(top2 > top1, `the last phase hits harder than the first (${top2} > ${top1})`);
  t.ok(top1 >= 18, 'form 1 still has a real finisher (>= 18)');
  t.ok(top2 >= 26 && top2 <= G.round[CH][1], `form 2 tops out at ${top2} (26..${G.round[CH][1]})`);
});

t.test('status magnitudes on heroes stay inside CONTENT_SPEC 4.2', () => {
  const cap = { weak: 2, vulnerable: 2, frail: 2, poison: 6, burn: 6, bind: 2, stun: 1 };
  ids.forEach((id) => opsOfEnemy(E(id)).filter((o) => o.op === 'status' && onHeroes(o) && cap[o.s]).forEach((o) => t.ok(o.n >= 1 && o.n <= cap[o.s], `${id} ${o.s} ${o.n} on heroes`)));
  const selfMag = { thorns: [3, 6], plating: [4, 7], ritual: [1, 2] };
  ids.forEach((id) => opsOfEnemy(E(id)).filter((o) => o.op === 'status' && selfMag[o.s] && (o.tgt === undefined || o.tgt === 'self' || o.tgt === 'allEnemies')).forEach((o) => t.ok(o.n >= selfMag[o.s][0] && o.n <= selfMag[o.s][1], `${id} ${o.s} ${o.n} inside ${selfMag[o.s]}`)));
  normals.forEach((id) => movesOf(E(id)).filter((m) => m.kind === 'defend').forEach((m) => flat(m.fx).filter((o) => o.op === 'block').forEach((o) => t.ok(o.n >= 6 && o.n <= 14, `${id}.${m.id} block ${o.n} inside 6..14`))));
  ids.forEach((id) => movesOf(E(id)).filter((m) => m.kind === 'heal' && E(id).tier !== 'minion').forEach((m) => flat(m.fx).filter((o) => o.op === 'heal').forEach((o) => t.ok(o.n >= 10 && o.n <= 16, `${id}.${m.id} heal ${o.n} inside 10..16`))));
});

t.test('intent kinds are honest and specific', () => {
  ids.forEach((id) => movesOf(E(id)).forEach((m) => {
    const ops = flat(m.fx), d = ops.filter((o) => o.op === 'dmg');
    const w = `${id}.${m.id}`;
    if (m.kind === 'multi') t.ok(d.some((o) => hitsOf(o) >= 2) || d.length >= 2, `${w} multi has several hits`);
    if (m.kind === 'heavy') t.ok(d.length === 1 && hitsOf(d[0]) === 1, `${w} heavy is one big hit`);
    if (m.kind === 'attack') t.ok(d.length >= 1 && d.every((o) => hitsOf(o) === 1), `${w} attack is single hits`);
    if (['debuff', 'buff', 'defend', 'summon', 'heal'].indexOf(m.kind) >= 0) t.eq(d.length, 0, `${w} ${m.kind} deals no damage`);
    if (m.kind === 'debuff') t.ok(ops.some((o) => (o.op === 'status' && onHeroes(o)) || o.op === 'add'), `${w} debuff touches the heroes`);
    if (m.kind === 'buff') t.ok(ops.some((o) => o.op === 'status' && !onHeroes(o)), `${w} buff buffs an enemy`);
    t.ok(['flee', 'none', 'special'].indexOf(m.kind) < 0, `${w} uses a plain kind`);
  }));
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. coverage
// ---------------------------------------------------------------------------------------------------------------------
const fieldEnemies = ids.filter((id) => E(id).tier !== 'minion');
const has = (id, f) => opsOfEnemy(E(id)).some(f);
t.test('CONTENT_SPEC 4.3 mechanic coverage, measured independently of DATA.audit', () => {
  const back = fieldEnemies.filter((id) => has(id, (o) => o.op === 'dmg' && (o.tgt === 'back' || o.tgt === 'both')));
  const debuff = fieldEnemies.filter((id) => has(id, (o) => o.op === 'status' && DATA.isDebuff(o.s) && onHeroes(o)));
  const summon = ids.filter((id) => has(id, (o) => o.op === 'summon'));
  const armour = fieldEnemies.filter((id) => has(id, (o) => o.op === 'status' && (o.s === 'thorns' || o.s === 'plating') && (o.tgt === undefined || o.tgt === 'self')));
  const multi = fieldEnemies.filter((id) => movesOf(E(id)).some((m) => m.kind === 'multi' && dmgOps(m).some((o) => hitsOf(o) >= 2)));
  const junk = ids.filter((id) => has(id, (o) => o.op === 'add' && STATUS_CARDS.indexOf(o.card) >= 0));
  t.ok(back.length >= 6, `back row or both-heroes strikers: ${back.length} (${back})`);
  t.ok(debuff.length >= 7, `hero debuffers: ${debuff.length} (${debuff})`);
  t.ok(summon.length >= 4, `summoners: ${summon.length} (${summon})`);
  t.ok(armour.length >= 2, `Thorns or Plating users: ${armour.length} (${armour})`);
  t.ok(multi.length >= 3, `multi-hitters: ${multi.length} (${multi})`);
  t.ok(junk.length >= 3, `junk card adders: ${junk.length} (${junk})`);
  const statuses = new Set([].concat(...ids.map((id) => opsOfEnemy(E(id)).filter((o) => o.op === 'status' && onHeroes(o)).map((o) => o.s))));
  ['weak', 'frail', 'poison', 'burn', 'bind', 'stun'].forEach((s) => t.ok(statuses.has(s), `chapter 2 applies ${s} to heroes`));
  const src = (s) => ids.filter((id) => has(id, (o) => o.op === 'status' && o.s === s && onHeroes(o)));
  t.ok(src('bind').length >= 3, `Bind sources ${src('bind')}`);
  t.ok(src('stun').length >= 3, `Stun sources ${src('stun')}`);
  t.ok(has('nure_onna', (o) => o.op === 'dmg' && o.tgt === 'back') && has('rokurokubi', (o) => o.op === 'dmg' && o.tgt === 'back'), 'two dedicated back-row enemies');
  t.ok(has('koi_spirit', (o) => o.op === 'dmg' && o.tgt === 'both') && has('umibozu', (o) => o.op === 'dmg' && o.tgt === 'both'), 'both-hero strikers exist');
  t.ok(fieldEnemies.filter((id) => has(id, (o) => o.op === 'dmg' && (o.tgt === 'front' || o.tgt === undefined))).length >= 8, 'most enemies still hit the front hero, so neither row is a safe answer');
  const clocks = ids.filter((id) => allAis(E(id)).some((ai) => (ai.rules || []).some((r) => r.if.turnEvery || r.if.turnGte)) || has(id, (o) => o.op === 'dmg' && typeof o.n === 'object' && o.n.per === 'turn') || has(id, (o) => o.op === 'status' && o.s === 'ritual'));
  t.ok(clocks.length >= 5, `enemies with a stalling clock: ${clocks.length} (${clocks})`);
});

t.test('every roster role is shown by the moves (one assertion group per enemy)', () => {
  const ops = (id) => opsOfEnemy(E(id));
  const st = (id, s, tgtOk) => ops(id).some((o) => o.op === 'status' && o.s === s && tgtOk(o));
  const heroes = (o) => onHeroes(o);
  const selfy = (o) => o.tgt === undefined || o.tgt === 'self' || o.tgt === 'allEnemies';
  // chochin: Burn, and Ritual for allies on its second beat (a real window to kill it first)
  t.ok(st('chochin', 'burn', heroes) && st('chochin', 'ritual', (o) => o.tgt === 'allEnemies'), 'chochin scorches with Burn and lights allies with Ritual');
  t.eq(E('chochin').ai.seq.indexOf('kindle'), 1, 'chochin lights on its second beat: two turns to kill it first');
  t.ok(E('chochin').immune.indexOf('burn') >= 0 && E('chochin').hooks.some((h) => h.on === 'onDeath'), 'a lantern is burn proof and spills fire when it dies');
  // karakuri: fixed combo, last strike stuns
  const kk = E('karakuri_puppet');
  t.ok(kk.ai.seq.length === 3 && kk.moves[kk.ai.seq[2]].fx.some((o) => o.op === 'status' && o.s === 'stun' && o.tgt === 'front') && kk.moves[kk.ai.seq[2]].kind === 'heavy', 'karakuri combo ends in a telegraphed front-hero Stun');
  t.ok(kk.ai.rules.some((r) => r.once && r.if.hpLt), 'a cracked karakuri overwinds once');
  // nopperabo: Weak and Frail, then hits harder per debuff
  t.ok(st('nopperabo', 'weak', heroes) && st('nopperabo', 'frail', heroes), 'nopperabo applies Weak and Frail');
  t.ok(ops('nopperabo').some((o) => o.op === 'dmg' && typeof o.n === 'object' && o.n.per === 'debuffs' && o.n.who === 'target'), 'nopperabo strikes harder while the debuffs stick');
  t.deep(E('nopperabo').ai.seq, ['stare', 'grasp', 'grasp'], 'stare once, then two grasps');
  // samurai
  const ds = E('drowned_samurai');
  t.ok(st('drowned_samurai', 'plating', selfy) && ds.moves[ds.ai.seq[1]].kind === 'defend' && ds.moves[ds.ai.seq[2]].kind === 'heavy', 'samurai: Plating, a guard turn, then the heavy cut');
  // koi
  t.ok(ops('koi_spirit').some((o) => o.op === 'heal' && ['lowestEnemy', 'allEnemies', 'otherEnemy'].indexOf(o.tgt) >= 0) && ops('koi_spirit').some((o) => o.op === 'dmg' && o.tgt === 'both'), 'koi heals allies and splashes both heroes');
  t.ok(E('koi_spirit').ai.rules.some((r) => r.do === 'mend' && r.if.allyHpLt && r.if.turnEvery), 'the koi mends every other turn when an ally is hurt');
  // tsukumogami
  t.ok(ops('tsukumogami').some((o) => o.op === 'add' && o.card === 'status_blot' && o.to === 'draw') && movesOf(E('tsukumogami')).some((m) => dmgOps(m).length), 'tsukumogami hits and shuffles blot cards into the draw pile');
  // silk weaver
  t.ok(st('silk_weaver', 'bind', heroes) && ops('silk_weaver').some((o) => o.op === 'summon' && o.enemy === 'spiderling'), 'weaver binds and calls a Spiderling');
  t.ok(ops('silk_weaver').some((o) => o.op === 'add' && o.card === 'status_tangle'), 'the weaver hands you the tangle card that cuts the silk');
  // nure-onna
  t.ok(ops('nure_onna').some((o) => o.op === 'dmg' && o.tgt === 'back') && st('nure_onna', 'poison', (o) => o.tgt === 'back'), 'nure-onna strikes the back row and poisons it');
  t.ok(movesOf(E('nure_onna')).some((m) => m.kind === 'heavy' && dmgOps(m)[0].tgt === 'front'), 'her coil is a telegraphed heavy on the FRONT hero');
  // rokurokubi
  t.ok(ops('rokurokubi').some((o) => o.op === 'dmg' && o.tgt === 'back' && hitsOf(o) === 2), 'rokurokubi hits the back row twice');
  t.ok(!ops('rokurokubi').some((o) => o.op === 'dmg' && (o.tgt === 'front' || o.tgt === undefined)), 'rokurokubi reaches over the front hero and never hits it');
  // ittan-momen
  t.ok(st('ittan_momen', 'bind', heroes) && ops('ittan_momen').some((o) => o.op === 'block' && (o.tgt === undefined || o.tgt === 'self')) && st('ittan_momen', 'dodge', selfy), 'ittan-momen wraps in Bind, gains Block and Dodge');
  // drowned general
  const dg = E('drowned_general');
  t.ok(st('drowned_general', 'ritual', selfy) && ops('drowned_general').some((o) => o.op === 'summon' && o.enemy === 'lantern_wisp'), 'general: Ritual Might and Lantern Wisps');
  t.ok(dg.phases.length === 1 && dg.phases[0].at <= 0.5 && dg.moves[dg.phases[0].ai.open[0]].kind === 'heavy', 'general answers dropping below half HP with a heavy blow at once');
  // puppet master
  const pm = ops('puppet_master');
  t.ok(pm.some((o) => o.op === 'summon' && o.enemy === 'paper_puppet') && pm.some((o) => o.op === 'heal') && pm.some((o) => o.op === 'status' && o.s === 'stun' && heroes(o)), 'puppet master calls puppets, heals them and stuns a hero');
  t.ok(pm.some((o) => o.op === 'status' && o.s === 'might' && o.tgt === 'otherEnemy'), 'puppet master pulls the strings tight on a puppet');
  // umibozu
  const um = ops('umibozu');
  t.ok(um.some((o) => o.op === 'dmg' && o.tgt === 'both') && um.some((o) => o.op === 'status' && o.s === 'stun' && heroes(o)), 'umibozu slams the whole party and stuns');
  t.ok(um.some((o) => o.op === 'dmg' && typeof o.n === 'object' && o.n.per === 'turn'), 'the tide rises: umibozu slams grow with its turn count');
  // minions
  t.ok(st('spiderling', 'poison', heroes), 'spiderling nips with Poison');
  t.ok(ops('paper_puppet').filter((o) => o.op === 'dmg').length >= 2 && E('paper_puppet').hp[1] <= 12 && ops('paper_puppet').some((o) => o.op === 'dmg' && o.tgt === 'back'), 'paper puppet is flimsy and claps the back row');
  t.ok(st('lantern_wisp', 'burn', heroes) && ops('lantern_wisp').some((o) => o.op === 'block' && o.tgt === 'otherEnemy'), 'lantern wisp burns a hero and warms a neighbour');
  t.ok(E('lantern_wisp').ai.rules.some((r) => r.if.alone) && E('lantern_wisp').immune.indexOf('burn') >= 0, 'a lone wisp just burns; a wisp is burn proof');
});

t.test('elites: one signature mechanic each, distinct from each other, with a rules entry or a phase', () => {
  elites.forEach((id) => {
    const e = E(id);
    t.ok((e.ai.rules && e.ai.rules.length) || (e.phases && e.phases.length), `${id} has rules or a phase`);
    t.ok(movesOf(e).length >= 4, `${id} has a full move set (${movesOf(e).length})`);
    t.ok(new Set(movesOf(e).map((m) => m.kind)).size >= 3, `${id} mixes intent kinds`);
    t.ok(opsOfEnemy(e).some((o) => o.op === 'status' && DATA.isDebuff(o.s) && onHeroes(o)), `${id} debuffs a hero`);
  });
  const sig = {
    drowned_general: (e) => flat(e.moves.muster.fx).some((o) => o.s === 'ritual') && e.phases.length === 1 && e.ai.rules.some((r) => r.do === 'call'),
    puppet_master: (e) => flat(e.moves.strings.fx).some((o) => o.op === 'summon') && flat(e.moves.mend.fx).some((o) => o.op === 'heal') && flat(e.moves.marionette.fx).some((o) => o.s === 'stun'),
    umibozu: (e) => flat(e.moves.slam.fx).some((o) => typeof o.n === 'object' && o.n.per === 'turn') && e.ai.rules.some((r) => r.if.turnEvery && e.moves[r.do].fx.some((o) => o.s === 'stun')),
  };
  Object.keys(sig).forEach((id) => t.ok(sig[id](E(id)), `${id} signature mechanic present`));
  t.deep(elites.filter((id) => E(id).phases && E(id).phases.length), ['drowned_general'], 'only the general has a phase entry; the other two run on rules');
});

t.test('the boss is a spectacle: open, rules, one phase with say and real stat swings, summons, a signature move', () => {
  const b = E(boss), p = b.phases[0];
  t.ok(b.ai.open.length >= 2, 'the opening is two beats');
  t.ok(b.moves[b.ai.open[0]].fx.some((o) => o.op === 'summon'), 'the opening calls the brood');
  t.ok(b.moves[b.ai.open[1]].fx.some((o) => o.op === 'status' && o.s === 'bind'), 'the second beat binds the party');
  t.ok(b.ai.rules.length >= 3 && p.ai.rules.length >= 2, 'both forms have rule-driven specials');
  t.eq(b.phases.length, 1, 'two forms means one phases entry');
  t.ok(p.at >= 0.4 && p.at <= 0.6, `the disguise drops near half HP (${p.at})`);
  t.ok(typeof p.say === 'string' && p.say.length >= 10, 'the transformation has a say line');
  const fx = flat(p.fx);
  t.ok(fx.some((o) => o.op === 'removeStatus' && o.s === 'plating' && o.tgt === 'self') && flat(b.start).some((o) => o.s === 'plating'), 'the kimono (Plating) is stripped away in form 2');
  t.ok(fx.some((o) => o.op === 'status' && o.s === 'might' && o.n >= 2), 'form 2 gains Might');
  t.deep(Object.keys(b.moves).sort(), ['brood', 'embrace', 'fan', 'frenzy', 'hatch', 'kiss', 'legs', 'snare', 'spin', 'web'], 'the boss move set');
  t.deep([...reach(b.ai).used].sort(), ['brood', 'embrace', 'fan', 'hatch', 'kiss', 'snare'], 'form 1 move set');
  t.deep([...reach(p.ai).used].sort(), ['frenzy', 'kiss', 'legs', 'spin', 'web'], 'form 2 move set (no re-summons: the Spider has no time for guests)');
  t.ok(p.ai.open.length === 1 && p.ai.open[0] === 'spin', 'form 2 opens with the Spin: the Web is one turn behind it');
  // signature: the finisher scales with the silk on the target, and the party is handed the tangle card to cut it
  ['embrace', 'web'].forEach((m) => {
    const d = flat(b.moves[m].fx).find((o) => o.op === 'dmg');
    t.ok(typeof d.n === 'object' && d.n.per === 'status' && d.n.s === 'bind' && d.n.who === 'target' && d.n.cap !== undefined, `${m} grows with Bind on its victim`);
    t.eq(b.moves[m].kind, 'heavy', `${m} is a telegraphed heavy`);
    t.ok(typeof b.moves[m].say === 'string', `${m} has a bark`);
    t.ok(vMax(d.n) > (d.n.base || 0), `${m} really scales (${d.n.base} to ${vMax(d.n)})`);
  });
  t.ok(flat(b.moves.web.fx).some((o) => o.op === 'dmg' && o.tgt === 'both'), 'the web hits both heroes');
  ['snare', 'spin'].forEach((m) => t.ok(flat(b.moves[m].fx).some((o) => o.op === 'add' && o.card === 'status_tangle' && o.to === 'draw' && o.top === true), `${m} puts a tangle card on top of the draw pile`));
  t.ok(flat(b.moves.spin.fx).some((o) => o.s === 'bind' && o.n === 2) && flat(b.moves.snare.fx).some((o) => o.s === 'bind' && o.n === 1), 'silk snare binds for one turn, spin for two');
  t.ok(b.ai.rules[0].do === 'embrace' && b.ai.rules[0].if.heroStatus.s === 'bind', 'form 1: Bind then Embrace');
  t.ok(p.ai.rules.some((r) => r.do === 'web' && r.if.heroStatus.s === 'bind' && r.if.heroStatus.gte === 2), 'form 2: Bind 2 then the Web');
  t.ok(p.ai.rules.some((r) => r.do === 'frenzy' && r.once && r.if.hpLt <= 0.25), 'form 2 has a once-only last stand');
  t.ok(b.immune.indexOf('stun') >= 0, 'boss immune to stun');
  t.ok(Object.values(b.moves).filter((m) => m.say).length >= 7, 'the boss talks');
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. AI and encounters
// ---------------------------------------------------------------------------------------------------------------------
t.test('every move of every enemy is reachable, and no rule is shadowed', () => {
  ids.forEach((id) => {
    const e = E(id);
    const used = new Set();
    allAis(e).forEach((ai, k) => {
      const r = reach(ai);
      r.used.forEach((m) => used.add(m));
      (ai.rules || []).forEach((rule, i) => t.ok(r.ruleFires[i], `${id} ai#${k} rule ${i} (${rule.do}) can fire unshadowed`));
      if (ai.seq || ai.weighted) t.ok(r.fallThrough, `${id} ai#${k} rules never starve the ${ai.seq ? 'seq' : 'weighted'} list`);
    });
    Object.keys(e.moves).forEach((m) => t.ok(used.has(m), `${id}.${m} is reachable`));
  });
});

t.test('AI shape: phases descend, weighted lists are sane, once rules are unique, openers exist', () => {
  ids.forEach((id) => {
    const e = E(id);
    (e.phases || []).forEach((p, i) => {
      t.ok(p.at > 0 && p.at < 1, `${id} phase ${i} at`);
      if (i > 0) t.ok(p.at < e.phases[i - 1].at, `${id} phases descend`);
      t.ok(typeof p.say === 'string', `${id} phase ${i} has a say`);
      t.ok(!!p.ai || !!p.fx, `${id} phase ${i} changes something`);
      if (p.ai) t.ok(JSON.stringify(p.ai) !== JSON.stringify(e.ai), `${id} phase ${i} ai differs from the base ai`);
    });
    allAis(e).forEach((ai) => {
      if (ai.weighted) {
        t.ok(ai.weighted.length >= 2 && ai.noRepeat >= 1, `${id} weighted lists have variety and noRepeat`);
        t.ok(ai.weighted.every((x) => x[1] > 0 && Number.isInteger(x[1])), `${id} weights are positive integers`);
        t.eq(new Set(ai.weighted.map((x) => x[0])).size, ai.weighted.length, `${id} weighted moves are unique`);
      }
      (ai.open || []).forEach((m) => t.ok(!!e.moves[m], `${id} open ${m} exists`));
      const onceRules = (ai.rules || []).filter((r) => r.once).map((r) => r.do);
      t.eq(new Set(onceRules).size, onceRules.length, `${id} once rules target different moves`);
    });
  });
  t.ok(ids.some((id) => E(id).ai.weighted) && ids.some((id) => E(id).ai.seq) && ids.some((id) => E(id).ai.open) && ids.some((id) => E(id).ai.rules) && ids.some((id) => E(id).phases), 'the chapter uses every AI shape');
});

t.test('summon cap: no summoner ever has more than 2 living summons (gated rules, openers, groups)', () => {
  ids.forEach((id) => {
    const e = E(id);
    allAis(e).forEach((ai) => Object.keys(e.moves).forEach((mid) => {
      const sums = flat(e.moves[mid].fx).filter((o) => o.op === 'summon');
      if (!sums.length) return;
      const k = sums.reduce((s, o) => s + (o.n || 1), 0);
      sums.forEach((o) => { t.ok(minions.indexOf(o.enemy) >= 0, `${id}.${mid} summons a chapter 2 minion (${o.enemy})`); t.ok(o.n === undefined || (o.n >= 1 && o.n <= 2), `${id}.${mid} summon n is small`); });
      const inOpen = (ai.open || []).indexOf(mid) >= 0;
      t.ok(!((ai.seq || []).indexOf(mid) >= 0 || (ai.weighted || []).some((x) => x[0] === mid)), `${id}.${mid} summon is never on the ungated cycle`);
      (ai.rules || []).filter((r) => r.do === mid).forEach((r) => t.ok(r.if.minions && r.if.minions.lt <= 3 - k, `${id} rule for ${mid} is gated minions.lt <= ${3 - k}`));
      if (inOpen) t.ok(k <= 2, `${id}.${mid} opener summons at most 2`);
    }));
  });
  allGroups.forEach((g) => {
    const members = groupEnemies(g);
    const summoners = members.filter((e) => opsOfEnemy(e).some((o) => o.op === 'summon'));
    t.ok(summoners.length <= 1, `${g.id} has at most one summoner`);
    const seeded = members.filter((e) => e.tier === 'minion').length;
    summoners.forEach((s) => {
      const opener = (s.ai.open || []).map((m) => flat(s.moves[m].fx).filter((o) => o.op === 'summon').reduce((a, o) => a + (o.n || 1), 0)).reduce((a, b) => a + b, 0);
      t.ok(seeded + opener <= 2, `${g.id}: ${seeded} seeded + ${opener} opener minions stay within 2`);
    });
    if (seeded && groups.normal.indexOf(g) >= 0) t.ok(summoners.length === 1 && g.min >= 0.75, `${g.id}: seeded minions only belong to a late normal group with a summoner`);
  });
});

t.test('encounter pools: sizes, min spread, weights, unique ids, real enemies, lane order', () => {
  t.ok(groups.normal.length >= 12, `at least 12 normal groups (${groups.normal.length})`);
  t.eq(groups.elite.length, 3, 'exactly 3 elite groups');
  t.eq(DATA.encounters[CH].boss, 'boss_jorogumo', 'the boss encounter');
  const seen = new Set();
  const size = { s: 1, m: 2, l: 3, xl: 4 };
  allGroups.forEach((g) => {
    t.ok(/^ch2_[a-z0-9_]+$/.test(g.id), `${g.id} id format`);
    t.ok(!seen.has(g.id), `${g.id} is unique`); seen.add(g.id);
    t.ok(g.w > 0 && Number.isInteger(g.w) && g.w <= 5, `${g.id} weight`);
    t.ok(g.min >= 0 && g.min <= 0.8, `${g.id} min ${g.min}`);
    t.ok(g.enemies.length >= 1 && g.enemies.length <= 4, `${g.id} size`);
    g.enemies.forEach((id) => t.ok(!!E(id) && E(id).chapter === CH && E(id).tier !== 'boss', `${g.id} member ${id}`));
    const sizes = groupEnemies(g).map((e) => size[e.size]);
    t.deep(sizes, sizes.slice().sort((a, b) => a - b), `${g.id} lists the smallest first and the tallest last`);
  });
  t.ok(groups.normal.filter((g) => g.min <= 0.1).length >= 3, 'at least 3 easy groups (min <= 0.1)');
  t.ok(groups.normal.filter((g) => g.min >= 0.6).length >= 2, 'at least 2 late groups (min >= 0.6)');
  t.eq(Math.max(...groups.normal.map((g) => g.min)), 0.8, 'the hardest group unlocks at 0.8');
  t.eq(Math.min(...groups.normal.map((g) => g.min)), 0, 'the easiest group is always eligible');
  t.ok(new Set(groups.normal.map((g) => g.min)).size >= 8, 'min values are spread over many steps');
  groups.normal.forEach((g) => t.ok(groupEnemies(g).some((e) => e.tier === 'normal') && groupEnemies(g).every((e) => e.tier !== 'elite'), `${g.id} is a normal group`));
  groups.elite.forEach((g) => t.eq(groupEnemies(g).filter((e) => e.tier === 'elite').length, 1, `${g.id} has exactly one elite`));
  t.ok(groups.elite.some((g) => g.min <= 0.1), 'an elite tile near the start always has an eligible group');
  t.deep(groups.elite.map((g) => groupEnemies(g).find((e) => e.tier === 'elite').id).sort(), elites.slice().sort(), 'each elite appears in exactly one elite group');
  for (let d = 0; d <= 100; d++) { const diff = d / 100; t.ok(DATA.eligibleGroups(CH, 'normal', diff).length >= 3 && DATA.eligibleGroups(CH, 'elite', diff).length >= 1, `groups eligible at diff ${diff}`); }
});

t.test('every normal enemy appears in enough groups; big groups are gated to the late page; authored synergies are in the pool', () => {
  const count = (id) => groups.normal.filter((g) => g.enemies.indexOf(id) >= 0).length;
  normals.forEach((id) => t.ok(count(id) >= 3, `${id} appears in ${count(id)} normal groups`));
  t.ok([1, 2, 3, 4].every((n) => groups.normal.some((g) => g.enemies.length === n)), 'groups of 1, 2, 3 and 4 exist');
  t.ok(groups.normal.filter((g) => g.enemies.length >= 3).every((g) => g.min >= 0.5), 'big groups are gated to the second half of the page');
  t.ok(groups.normal.filter((g) => g.enemies.length === 4).every((g) => g.min >= 0.75), 'four-enemy groups are gated to the late page');
  t.ok(groups.normal.filter((g) => g.min <= 0.1).every((g) => g.enemies.length <= 2), 'easy groups are small');
  const pair = (a, b) => groups.normal.some((g) => g.enemies.indexOf(a) >= 0 && g.enemies.indexOf(b) >= 0);
  t.ok(pair('chochin', 'drowned_samurai'), 'a lantern lights a samurai');
  t.ok(pair('ittan_momen', 'rokurokubi'), 'Bind pins a back-row target');
  t.ok(pair('nopperabo', 'ittan_momen'), 'Bind takes away the swap that answers the Grasp');
  t.ok(pair('koi_spirit', 'nure_onna'), 'a healer behind a back-row poisoner');
  t.ok(pair('tsukumogami', 'karakuri_puppet'), 'the theatre troupe');
  t.ok(pair('silk_weaver', 'nure_onna'), 'silk and poison, the last group of the page');
});

t.test('group budgets: the audit average stays inside the chapter 2 rails', () => {
  const B = G.budget[CH];
  const sumOf = (g) => groupEnemies(g).filter((e) => e.tier !== 'minion').reduce((s, e) => s + auditAvg(e), 0);
  groups.normal.forEach((g) => {
    const sum = sumOf(g);
    t.ok(sum <= B.normal[1], `${g.id} audit average ${sum.toFixed(1)} <= ${B.normal[1]}`);
    if (g.min >= 0.5) t.ok(sum >= 6, `${g.id} late group has real weight (${sum.toFixed(1)} >= 6)`);
  });
  groups.elite.forEach((g) => t.ok(sumOf(g) <= B.elite[1], `${g.id} audit average ${sumOf(g).toFixed(1)} <= ${B.elite[1]}`));
  normals.forEach((id) => { const a = auditAvg(E(id)); t.ok(a >= 3 && a <= 13, `${id} audit average ${a.toFixed(1)} inside 3..13`); });
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. engine: real COMBAT fights (COMBAT.simulate with the default greedy bot) against synthetic decks
// ---------------------------------------------------------------------------------------------------------------------
const PARTY_HP = [84, 68];
let deckFor = null;
if (HAVE_ENGINE && typeof COMBAT !== 'undefined') {
  const card = (id, hero, name, type, cost, fx, upfx) => DATA.add('cards', { [id]: { id, name, hero, type, rarity: 'common', cost, fx, up: { fx: upfx }, kw: [], slots: [type === 'attack' ? 'red' : 'blue'], art: { m: 'slash', c: 'rose' } } });
  const d = (n, tgt) => ({ op: 'dmg', n, tgt: tgt || 'enemy' });
  card('hanae_zz_slash', 'hanae', 'Test Slash', 'attack', 1, [d(7)], [d(9)]);
  card('hanae_zz_heavy', 'hanae', 'Test Heavy', 'attack', 2, [d(12)], [d(15)]);
  card('hanae_zz_whirl', 'hanae', 'Test Whirl', 'attack', 2, [d(6, 'all')], [d(8, 'all')]);
  card('hanae_zz_parry', 'hanae', 'Test Parry', 'skill', 1, [{ op: 'block', n: 6 }], [{ op: 'block', n: 8 }]);
  card('hanae_zz_guard', 'hanae', 'Test Guard', 'skill', 2, [{ op: 'block', n: 11 }], [{ op: 'block', n: 14 }]);
  card('hanae_zz_expose', 'hanae', 'Test Expose', 'skill', 0, [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'enemy' }], [{ op: 'status', s: 'vulnerable', n: 2, tgt: 'enemy' }]);
  card('kuro_zz_bolt', 'kuro', 'Test Bolt', 'attack', 1, [d(7)], [d(9)]);
  card('kuro_zz_wave', 'kuro', 'Test Wave', 'attack', 2, [d(6, 'all')], [d(8, 'all')]);
  card('kuro_zz_ward', 'kuro', 'Test Ward', 'skill', 1, [{ op: 'block', n: 6 }], [{ op: 'block', n: 8 }]);
  card('kuro_zz_venom', 'kuro', 'Test Venom', 'skill', 1, [{ op: 'status', s: 'poison', n: 4, tgt: 'enemy' }], [{ op: 'status', s: 'poison', n: 6, tgt: 'enemy' }]);
  card('kuro_zz_insight', 'kuro', 'Test Insight', 'skill', 0, [{ op: 'draw', n: 1 }], [{ op: 'draw', n: 2 }]);
  // the two junk cards enemies add, exactly as CONTENT_SPEC section 2 defines them (data_cards_shared.js is not loaded here)
  DATA.add('cards', {
    status_blot: { id: 'status_blot', name: 'Blot', hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable', 'ethereal'], fx: [], art: { m: 'void' } },
    status_tangle: { id: 'status_tangle', name: 'Tangle', hero: 'status', type: 'status', rarity: 'token', cost: 1, kw: ['exhaust'], fx: [{ op: 'removeStatus', s: 'bind', tgt: 'both' }], art: { m: 'web' } },
  });
  const LIST = ['hanae_zz_slash', 'hanae_zz_slash', 'hanae_zz_slash', 'hanae_zz_slash', 'hanae_zz_heavy', 'hanae_zz_heavy', 'hanae_zz_whirl', 'hanae_zz_parry', 'hanae_zz_parry', 'hanae_zz_guard', 'hanae_zz_expose',
    'kuro_zz_bolt', 'kuro_zz_bolt', 'kuro_zz_bolt', 'kuro_zz_wave', 'kuro_zz_ward', 'kuro_zz_ward', 'kuro_zz_venom', 'kuro_zz_insight'];
  const UPFRAC = { early: 0.2, mid: 0.5, late: 0.85 };
  deckFor = (level) => {
    const list = LIST.concat(level === 'late' ? ['hanae_zz_heavy', 'kuro_zz_bolt'] : []).slice(0, level === 'early' ? 17 : 99);
    const upN = Math.round(list.length * UPFRAC[level]);
    return list.map((id, i) => ({ uid: i + 1, id, up: (i * 7 + 3) % list.length < upN ? 1 : 0, gems: [null] }));
  };
}
const levelOf = (min) => (min < 0.34 ? 'early' : min < 0.67 ? 'mid' : 'late');
const tierOf = (g) => (g.enemies.some((id) => E(id).tier === 'elite') ? 'elite' : 'normal');
const fightTier = (list) => (list.some((id) => E(id).tier === 'boss') ? 'boss' : list.some((id) => E(id).tier === 'elite') ? 'elite' : 'normal');
const lvlOfGroup = (g) => (tierOf(g) === 'elite' ? 'mid' : levelOf(g.min));
const BOSS_LEVEL = 'late';
const party = () => [{ id: 'hanae', hp: PARTY_HP[0], maxHp: PARTY_HP[0] }, { id: 'kuro', hp: PARTY_HP[1], maxHp: PARTY_HP[1] }];
const mk = (enemyIds, level, tier, seed, extra) => Object.assign({ heroes: party(), frontIdx: 0, deck: deckFor(level), enemies: enemyIds, tier, chapter: CH, seed, mods: DATA.foldMods([]), relics: [], gold: 0, maxTurns: 40 }, extra || {});
function engineFight(enemyIds, seed, level, tier, policy, extra) {
  const s = COMBAT.simulate(mk(enemyIds, level, tier, seed, extra), policy);
  const left = s.heroes.reduce((a, h) => a + Math.max(0, h.hp), 0);
  return { result: s.result, turns: s.turns, capped: s.capped, hpLost: PARTY_HP[0] + PARTY_HP[1] - left, downs: s.stats.heroDowns, dealt: s.stats.damageDealt, s };
}
const eMany = (enemyIds, level, tier, n = 40, policy, extra) => { const out = []; for (let i = 1; i <= n; i++) out.push(engineFight(enemyIds, U.hash('e2', enemyIds.join(','), i) % 100000, level, tier, policy, extra)); return out; };
const winRate = (rs) => rs.filter((r) => r.result === 'win').length / rs.length;
const acts = (r) => r.s.C.events.filter((e) => e.type === 'enemy_act');
// a party that cannot be hurt and cannot hurt back: the enemies run their whole AI, so every move shows up in the log
const IDLE = () => ({ heroes: [{ id: 'hanae', hp: 900, maxHp: 900 }, { id: 'kuro', hp: 900, maxHp: 900 }], deck: [{ uid: 1, id: 'kuro_zz_insight', up: 0, gems: [null] }], maxTurns: 14 });
const idleFight = (enemyIds, seed) => engineFight(enemyIds, seed, 'mid', fightTier(enemyIds), undefined, IDLE());

// A player who knows the chapter: cuts the silk with the tangle card when a finisher that grows with Bind is coming, and swaps a
// debuffed front hero out of the way of a Grasp. Everything else is the default greedy bot.
const cutPolicy = (C) => {
  if (C.phase === 'player' && !C.pending) {
    const fin = C.enemies.some((e) => !e.down && e.intent && (e.intent.move === 'embrace' || e.intent.move === 'web'));
    const bound = C.heroes.some((h) => !h.down && h.st.bind > 0);
    const tangle = C.hand.find((c) => c.id === 'status_tangle');
    if (fin && bound && tangle && C.canPlay(tangle.uid).ok) return { type: 'play', uid: tangle.uid, target: null };
  }
  return COMBAT.greedyPolicy(C);
};
const swapPolicy = (C) => {
  if (C.phase === 'player' && !C.pending) {
    const cs = C.canSwap();
    if (cs.ok && cs.cost === 0 && C.enemies.some((e) => !e.down && e.intent && e.intent.move === 'grasp')) {
      const f = C.front(), b = C.back();
      const nd = (h) => Object.keys(h.st).filter((k) => DATA.isDebuff(k)).length;
      if (b && !b.down && nd(f) > nd(b)) return { type: 'swap' };
    }
  }
  return COMBAT.greedyPolicy(C);
};

if (HAVE_ENGINE && TRACE) {
  const [list, lv] = TRACE.split(':');
  const en = list.split(',');
  const r = engineFight(en, 3, lv || (en.some((id) => id.indexOf('boss') === 0) ? BOSS_LEVEL : 'mid'), fightTier(en));
  let line = [];
  r.s.C.events.forEach((e) => {
    if (e.type === 'turn_start' && e.who === 'player') { if (line.length) console.log(line.join(' | ')); line = [`T${e.turn}`]; }
    if (e.type === 'play' && e.card.id === 'status_tangle') line.push('PLAY tangle');
    if (e.type === 'enemy_act') line.push(`${e.enemy} ${e.move}`);
    if (e.type === 'enemy_phase') line.push(`PHASE ${e.index} "${e.say}"`);
    if (e.type === 'summon') line.push(`+${e.enemy.id}`);
    if (e.type === 'death') line.push(`x${e.unit.id}`);
    if (e.type === 'hit' && e.dst.kind === 'hero') line.push(`${e.dst.id}-${e.amount}${e.blocked ? '(b' + e.blocked + ')' : ''}`);
    if (e.type === 'status' && e.dst.kind === 'hero' && e.delta > 0 && ['bind', 'stun', 'weak', 'frail', 'poison', 'burn'].indexOf(e.s) >= 0) line.push(`${e.dst.id}:${e.s}${e.value}`);
  });
  console.log(line.join(' | '));
  console.log(`result ${r.result} turns ${r.turns} hp lost ${r.hpLost}`);
}

if (HAVE_ENGINE && REPORT) {
  const row = (label, rs) => console.log(`${label.padEnd(28)} turns ${mean(rs, (r) => r.turns).toFixed(1).padStart(5)}  hpLost ${mean(rs, (r) => r.hpLost).toFixed(0).padStart(4)}  dealt/turn ${mean(rs, (r) => r.dealt / r.turns).toFixed(1).padStart(5)}  downs ${mean(rs, (r) => r.downs).toFixed(2)}  wins ${(winRate(rs) * 100).toFixed(0).padStart(3)}%`);
  console.log('=== ENGINE (greedy bot, synthetic decks) ===');
  ['early', 'mid', 'late'].forEach((lv) => row('training dummy samurai ' + lv, eMany(['drowned_samurai'], lv, 'normal', 30)));
  console.log('--- normal groups ---');
  groups.normal.forEach((g) => row(`${g.id} (${g.min})`, eMany(g.enemies, lvlOfGroup(g), 'normal')));
  console.log('--- elite groups ---');
  groups.elite.forEach((g) => row(g.id, eMany(g.enemies, 'mid', 'elite')));
  console.log('--- boss ---');
  row('boss late', eMany([boss], BOSS_LEVEL, 'boss', 60));
  row('boss mid', eMany([boss], 'mid', 'boss', 60));
  row('boss late, cutting silk', eMany([boss], BOSS_LEVEL, 'boss', 60, cutPolicy));
  row('choir, swapping out', eMany(['nopperabo', 'nopperabo'], 'mid', 'normal', 60, swapPolicy));
  row('choir, greedy', eMany(['nopperabo', 'nopperabo'], 'mid', 'normal', 60));
}

const skipNote = () => { console.log('note: engine sims skipped, combat.js and data_text.js are not written yet'); t.ok(true, 'engine not present, the static checks above stand in'); };

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
        const want = ds[0].tgt === 'back' ? ['kuro'] : ds[0].tgt === 'both' ? ['hanae', 'kuro'] : ds[0].tgt === 'random' ? 'random' : ['hanae'];
        t.deep(it.tgt, want, `${w} says who it hits (${ds[0].tgt || 'front'})`);
      }
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'summon')) t.ok(it.summons.length >= 1, `${w} intent lists its summons`);
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'add')) t.ok(it.adds.length >= 1, `${w} intent lists the cards it adds`);
      if (flat(E(id).moves[m].fx).some((o) => o.op === 'status' && onHeroes(o))) t.ok(it.statuses.some((s) => DATA.isDebuff(s.s)), `${w} intent lists the debuffs`);
    });
  });
  // every living enemy always has a well formed intent, round after round
  const C = COMBAT.create(mk(['spiderling', 'spiderling', 'silk_weaver', 'nure_onna'], 'late', 'normal', 8));
  C.start();
  for (let i = 0; i < 6 && C.phase !== 'over'; i++) {
    C.enemies.filter((e) => !e.down).forEach((e) => t.ok(e.intent && L.intents.indexOf(e.intent.kind) >= 0 && e.intent.text.length > 0, `${e.id} has an intent on turn ${C.turn}`));
    C.endTurn();
  }
});

t.test('engine: every fight ends with a win or a loss, never a stall', () => {
  if (!HAVE_ENGINE) return skipNote();
  allGroups.forEach((g) => eMany(g.enemies, lvlOfGroup(g), tierOf(g), 10).forEach((r) => t.ok((r.result === 'win' || r.result === 'lose') && !r.capped, `${g.id} finishes (${r.result})`)));
  eMany([boss], BOSS_LEVEL, 'boss', 10).forEach((r) => t.ok((r.result === 'win' || r.result === 'lose') && !r.capped, 'boss finishes'));
  eMany([boss], 'early', 'boss', 6).forEach((r) => t.ok(r.result === 'win' || r.result === 'lose', 'a weak deck still reaches a result against the boss'));
});

t.test('engine: bands hold in real fights (turns, HP lost, wins) with decks that grow through the chapter', () => {
  if (!HAVE_ENGINE) return skipNote();
  const norm = groups.normal.map((g) => ({ g, rs: eMany(g.enemies, lvlOfGroup(g), 'normal', 30) }));
  const avgTurns = mean(norm, (x) => mean(x.rs, (r) => r.turns));
  t.ok(avgTurns >= 3.2 && avgTurns <= 5.4, `normal groups average ${avgTurns.toFixed(2)} turns (3.2..5.4)`);
  norm.forEach((x) => {
    const turns = mean(x.rs, (r) => r.turns), lost = mean(x.rs, (r) => r.hpLost);
    t.ok(turns >= 1.8 && turns <= 6.6, `${x.g.id} lasts ${turns.toFixed(1)} turns (1.8..6.6)`);
    t.ok(winRate(x.rs) >= 0.9, `${x.g.id} is winnable (${(winRate(x.rs) * 100).toFixed(0)} percent)`);
    t.ok(lost <= (x.g.min >= 0.5 ? 76 : 46), `${x.g.id} costs ${lost.toFixed(0)} HP on average`);   // balance report 1: chapter 2 normals were retuned up by about a fifth (was 66 and 42)
  });
  const avgLost = mean(norm, (x) => mean(x.rs, (r) => r.hpLost));
  t.ok(avgLost >= 8 && avgLost <= 38, `a normal group costs ${avgLost.toFixed(0)} HP on average (8..38)`);
  const early = norm.filter((x) => x.g.min <= 0.15), late = norm.filter((x) => x.g.min >= 0.5);
  t.ok(mean(late, (x) => mean(x.rs, (r) => r.hpLost)) > mean(early, (x) => mean(x.rs, (r) => r.hpLost)) + 10, 'late groups cost clearly more than early ones');
  const el = groups.elite.map((g) => ({ g, rs: eMany(g.enemies, 'mid', 'elite', 30) }));
  el.forEach((x) => {
    const turns = mean(x.rs, (r) => r.turns), lost = mean(x.rs, (r) => r.hpLost);
    t.ok(turns >= 4.5 && turns <= 9.4, `${x.g.id} lasts ${turns.toFixed(1)} turns (4.5..9.4)`);   // elites were retuned up on purpose (HP near the band top, hits about x1.3): was 8.2
    t.ok(winRate(x.rs) >= 0.9, `${x.g.id} is winnable`);
    t.ok(lost >= 25 && lost <= 100, `${x.g.id} costs ${lost.toFixed(0)} HP (25..100)`);   // these synthetic decks are far weaker than a real chapter 2 party (the balance bot measures about 18 percent of party HP per elite fight): was 72
  });
  const avgElite = mean(el, (x) => mean(x.rs, (r) => r.turns));
  t.ok(avgElite >= 5 && avgElite <= 8.8, `elites average ${avgElite.toFixed(2)} turns (5..8.8)`);
  t.ok(mean(el, (x) => mean(x.rs, (r) => r.hpLost)) > avgLost, 'elites cost more HP than the average normal group');
  const b = eMany([boss], BOSS_LEVEL, 'boss', 50);
  const bt = mean(b, (r) => r.turns), bl = mean(b, (r) => r.hpLost);
  t.ok(bt >= 8.5 && bt <= 13, `the boss lasts ${bt.toFixed(1)} turns (8.5..13)`);
  t.ok(winRate(b) >= 0.75, `a late-chapter deck beats the boss (${(winRate(b) * 100).toFixed(0)} percent)`);
  t.ok(bl >= 70 && bl <= 140, `the boss costs ${bl.toFixed(0)} HP (70..140)`);
  t.ok(bl > mean(el, (x) => mean(x.rs, (r) => r.hpLost)), 'the boss costs more HP than an elite');
  t.ok(winRate(eMany([boss], 'mid', 'boss', 30)) < winRate(b), 'a mid-chapter deck fares worse against the boss than a late one');
});

t.test('engine: every move fires in real fights, phases and summons behave', () => {
  if (!HAVE_ENGINE) return skipNote();
  const seen = {};
  const scan = (rs) => rs.forEach((r) => acts(r).forEach((e) => { const def = e.enemy.split('#')[0]; (seen[def] = seen[def] || new Set()).add(e.move); }));
  allGroups.forEach((g) => scan(eMany(g.enemies, lvlOfGroup(g), tierOf(g), 20)));
  scan(eMany([boss], BOSS_LEVEL, 'boss', 30));
  normals.concat(elites).forEach((id) => scan(eMany([id], 'early', fightTier([id]), 12)));
  ids.forEach((id) => Object.keys(E(id).moves).forEach((m) => t.ok(seen[id] && seen[id].has(m) || id === 'spiderling' || id === 'lantern_wisp', `${id}.${m} was executed by the real engine in a real fight`)));
  // minions and every AI branch that only shows when nobody kills the enemy: run the AI against a party that cannot be hurt
  const idle = {};
  for (let s = 1; s <= 8; s++) [['spiderling'], ['paper_puppet'], ['lantern_wisp', 'chochin'], ['lantern_wisp'], ['silk_weaver'], ['puppet_master'], ['drowned_general'], ['umibozu'], ['ittan_momen'], ['koi_spirit', 'chochin'], [boss]].forEach((g) => acts(idleFight(g, s)).forEach((e) => { const def = e.enemy.split('#')[0]; (idle[def] = idle[def] || new Set()).add(e.move); }));
  ids.forEach((id) => Object.keys(E(id).moves).forEach((m) => t.ok((seen[id] && seen[id].has(m)) || (idle[id] && idle[id].has(m)), `${id}.${m} fires when nobody stops it`)));
  t.ok(idle.spiderling.has('skitter') && idle.lantern_wisp.has('warm'), 'the minion support moves (skitter, warm) run when the minions live long enough');

  const bs = eMany([boss], BOSS_LEVEL, 'boss', 30);
  const phases = (r) => r.s.C.events.filter((e) => e.type === 'enemy_phase');
  t.ok(bs.every((r) => phases(r).length <= 1), 'the boss changes form at most once');
  t.ok(bs.filter((r) => phases(r).some((e) => e.index === 1 && e.say === E(boss).phases[0].say)).length / bs.length >= 0.9, 'the boss changes form in nearly every fight, with its say line');
  bs.forEach((r) => {   // form 1 moves never appear after the change and form 2 moves never before it
    let form = 1;
    r.s.C.events.forEach((e) => {
      if (e.type === 'enemy_phase') form = 2;
      if (e.type !== 'enemy_act' || e.enemy.indexOf('boss') !== 0) return;
      if (['legs', 'spin', 'web', 'frenzy'].indexOf(e.move) >= 0) t.eq(form, 2, `${e.move} only in form 2`);
      if (['fan', 'embrace'].indexOf(e.move) >= 0) t.eq(form, 1, `${e.move} only in form 1`);
    });
  });
  // living minions never exceed 2, seeded minions counted: track summon and death events
  let worst = 0;
  const check = (enemyIds, level, tier, n) => eMany(enemyIds, level, tier, n).forEach((r) => {
    const live = new Set(); const serial = {};
    enemyIds.forEach((def) => { serial[def] = (serial[def] || 0) + 1; if (E(def).tier === 'minion') live.add(def + '#' + serial[def]); });
    r.s.C.events.forEach((e) => {
      if (e.type === 'summon') live.add(e.enemy.id);
      if (e.type === 'death' || e.type === 'flee') live.delete(e.unit.id);
      worst = Math.max(worst, live.size);
    });
  });
  check([boss], BOSS_LEVEL, 'boss', 15); check([boss], 'early', 'boss', 8);
  check(['lantern_wisp', 'drowned_general'], 'mid', 'elite', 15); check(['puppet_master'], 'mid', 'elite', 15); check(['puppet_master'], 'early', 'elite', 8);
  check(['silk_weaver'], 'early', 'normal', 15); check(['spiderling', 'spiderling', 'silk_weaver', 'nure_onna'], 'late', 'normal', 15);
  t.ok(worst <= 2, `no summoner ever exceeded 2 living minions (max ${worst})`);
  // move order: the karakuri runs its combo, the samurai guards before it draws
  const kar = acts(engineFight(['karakuri_puppet'], 4, 'early', 'normal', undefined, { heroes: [{ id: 'hanae', hp: 300, maxHp: 300 }, { id: 'kuro', hp: 300, maxHp: 300 }], deck: [{ uid: 1, id: 'kuro_zz_insight', up: 0, gems: [null] }], maxTurns: 6 })).map((e) => e.move);
  t.deep(kar.slice(0, 3), ['jab', 'flurry', 'smash'], 'a karakuri nobody can hurt runs its combo in order');
  const sam = acts(engineFight(['drowned_samurai'], 4, 'early', 'normal', undefined, { heroes: [{ id: 'hanae', hp: 300, maxHp: 300 }, { id: 'kuro', hp: 300, maxHp: 300 }], deck: [{ uid: 1, id: 'kuro_zz_insight', up: 0, gems: [null] }], maxTurns: 6 })).map((e) => e.move);
  t.deep(sam.slice(0, 3), ['cut', 'stance', 'iai'], 'a samurai nobody can hurt cuts, guards, then draws');
});

t.test('engine: every enemy shows its signature move in real fights often enough to be learned', () => {
  if (!HAVE_ENGINE) return skipNote();
  const SIG = { chochin: 'kindle', karakuri_puppet: 'smash', nopperabo: 'grasp', drowned_samurai: 'iai', koi_spirit: 'mend', tsukumogami: 'crescendo', silk_weaver: 'hatch', nure_onna: 'coil', rokurokubi: 'lunge', ittan_momen: 'wrap', drowned_general: 'crest', puppet_master: 'marionette', umibozu: 'toll' };
  const tot = {};
  allGroups.forEach((g) => eMany(g.enemies, lvlOfGroup(g), tierOf(g), 24).forEach((r) => {
    const seen = new Set(acts(r).map((e) => e.move + '@' + e.enemy.split('#')[0]));
    g.enemies.filter((v, k, a) => a.indexOf(v) === k && SIG[v]).forEach((def) => { const x = (tot[def] = tot[def] || { n: 0, hit: 0 }); x.n++; if (seen.has(SIG[def] + '@' + def)) x.hit++; });
  }));
  Object.keys(SIG).forEach((def) => { const rate = tot[def].hit / tot[def].n; t.ok(rate >= (E(def).tier === 'elite' ? 0.6 : 0.2), `${def} shows ${SIG[def]} in ${(rate * 100).toFixed(0)} percent of its fights`); });
  // and the boss shows the whole show: every one of its moves appears in most fights against a deck that can win
  const bs = eMany([boss], BOSS_LEVEL, 'boss', 40);
  ['brood', 'snare', 'embrace', 'spin', 'web'].forEach((m) => t.ok(bs.filter((r) => acts(r).some((e) => e.move === m)).length / bs.length >= 0.85, `the boss uses ${m} in nearly every fight`));
  ['fan', 'kiss', 'legs', 'frenzy'].forEach((m) => t.ok(bs.filter((r) => acts(r).some((e) => e.move === m)).length / bs.length >= 0.3, `the boss uses ${m} in a good share of fights`));
});

t.test('engine: phases fire when HP crosses the line (boss form 2 stat swing and last stand, general Flood Crest)', () => {
  if (!HAVE_ENGINE) return skipNote();
  const start = (enemyIds, tier, level) => { const C = COMBAT.create(mk(enemyIds, level || 'mid', tier, 21)); C.start(); return C; };
  // drop the unit to just above the line and land a cheap attack from the hand
  const cross = (C, u, frac) => {
    u.hp = Math.floor(u.maxHp * frac) + 3;
    let atk = null;
    for (let i = 0; i < 4 && !atk; i++) { atk = C.hand.find((c) => DATA.cards[c.id] && DATA.cards[c.id].type === 'attack' && DATA.cards[c.id].cost === 1); if (!atk) C.endTurn(); }
    t.ok(!!atk, 'an attack is in hand');
    return C.play(atk.uid, u.id);
  };
  // Jorogumo: below half she drops the kimono: Plating gone, Might up, intent re-rolled at once to the Spin
  let C = start([boss], 'boss', BOSS_LEVEL);
  let u = C.enemies[0];
  t.eq(u.st.plating, 4, 'form 1 wears the kimono (Plating 4)');
  const ev = cross(C, u, 0.5);
  t.eq(u.phase, 1, 'the boss is in phase 1');
  const ph = ev.find((e) => e.type === 'enemy_phase');
  t.ok(ph && ph.say === E(boss).phases[0].say && ph.at === 0.5 && ph.index === 1, 'the enemy_phase event carries the say line');
  t.ok(!u.st.plating && u.st.might === 2, 'Plating is gone and Might is 2');
  t.eq(u.intent.move, 'spin', 'the intent is re-rolled at once to the Spin');
  C.endTurn();
  t.ok(C.heroes.every((h) => h.st.bind === 2), 'the Spin binds both heroes for two turns');
  t.eq(C.enemies[0].intent.move, 'web', 'the Web follows the Spin');
  t.eq(C.draw[0].id === 'status_tangle' || C.hand.some((c) => c.id === 'status_tangle'), true, 'and the tangle card is on top of the draw pile or already drawn');
  // the last stand: below 20 percent the frenzy is rolled, once
  C = start([boss], 'boss', BOSS_LEVEL);
  cross(C, C.enemies[0], 0.5);
  C.endTurn(); C.endTurn();
  C.enemies[0].hp = Math.floor(C.enemies[0].maxHp * 0.15);
  C.endTurn();
  t.eq(C.enemies[0].intent.move, 'frenzy', 'below 20 percent the last stand is rolled');
  C.endTurn();
  t.ok(C.phase === 'over' || C.enemies[0].intent.move !== 'frenzy', 'the frenzy is used once');
  // the general: below half he answers with the Flood Crest at once
  C = start(['lantern_wisp', 'drowned_general'], 'elite');
  u = C.enemies.find((e) => e.def === 'drowned_general');
  cross(C, u, 0.5);
  t.eq(u.phase, 1, 'the general is in phase 1');
  t.eq(u.intent.move, 'crest', 'the Flood Crest is telegraphed at once');
  t.ok(C.intent(u).dmg >= 16, `the crest reads ${C.intent(u).dmg}`);
});

t.test('engine: designed counter-play works for real (Grasp reads debuffs, stun blocks a hero, Embrace reads the silk, the tide rises)', () => {
  if (!HAVE_ENGINE) return skipNote();
  const start = (enemyIds, seed) => { const C = COMBAT.create(mk(enemyIds, 'mid', fightTier(enemyIds), seed || 9)); C.start(); return C; };
  // Nopperabo: Blank Stare, then the Grasp number rises with the debuffs on the front hero and falls back when the debuffed hero swaps out
  let C = start(['nopperabo']);
  t.eq(C.enemies[0].intent.move, 'stare', 'first beat is the stare');
  C.endTurn();
  t.eq(C.enemies[0].intent.move, 'grasp', 'then the grasp');
  t.ok(C.front().st.weak >= 1 && C.front().st.frail >= 1, 'the front hero is weakened and frail');
  const grasp = E('nopperabo').moves.grasp.fx[0].n;
  t.eq(C.intent(C.enemies[0]).dmg, grasp.base + grasp.mul * 2, 'grasp reads base plus 3 per debuff against a hero with two debuffs');
  t.ok(C.swap().length > 0, 'the free swap is available');
  t.eq(C.intent(C.enemies[0]).dmg, grasp.base, 'after swapping the debuffed hero out the grasp is back to its base');
  // Karakuri: the third beat stuns the front hero, and a stunned hero cannot play cards
  C = start(['karakuri_puppet']);
  C.endTurn(); C.endTurn();
  t.eq(C.enemies[0].intent.move, 'smash', 'the third beat is the smash');
  const stunned = C.front();
  C.endTurn();
  t.ok((stunned.st.stun || 0) >= 1, 'the smash stuns the front hero');
  const c = C.hand.find((x) => DATA.cards[x.id] && DATA.cards[x.id].hero === stunned.id);
  if (c) t.eq(C.canPlay(c.uid, C.enemies[0].id).reason, 'stunned', 'a stunned hero cannot play');
  // Nure-onna hits the BACK hero; swapping who stands in back changes who is aimed at
  C = start(['nure_onna']);
  t.deep(C.intent(C.enemies[0]).tgt, ['kuro'], 'nure-onna aims at the back hero');
  C.swap();
  t.deep(C.intent(C.enemies[0]).tgt, ['hanae'], 'after a swap the new back hero is aimed at');
  // Silk: Snare binds both heroes and puts a tangle card on top of the draw pile; Bind blocks the swap; Embrace reads the silk
  C = start([boss]);
  t.eq(C.enemies[0].intent.move, 'brood', 'the boss opens with the brood');
  t.deep(C.enemies[0].intent.summons, [{ enemy: 'spiderling', n: 2 }], 'the brood intent says what it summons');
  C.endTurn();
  t.eq(C.enemies.filter((e) => !e.down && e.tier === 'minion').length, 2, 'two spiderlings arrived');
  t.eq(C.enemies[0].intent.move, 'snare', 'then the snare');
  C.endTurn();
  t.ok(C.heroes.every((h) => h.st.bind >= 1), 'both heroes are bound');
  t.eq(C.canSwap().reason, 'bind', 'Bind blocks the swap');
  t.ok(C.hand.some((x) => x.id === 'status_tangle'), 'the tangle card, put on top of the draw pile, is in the next hand');
  t.eq(C.enemies[0].intent.move, 'embrace', 'bound heroes draw the embrace');
  const embrace = E(boss).moves.embrace.fx[0].n;
  t.eq(C.intent(C.enemies[0]).dmg, embrace.base + embrace.mul, `the embrace reads ${embrace.base + embrace.mul} on a hero bound for one turn`);
  const tangle = C.hand.find((x) => x.id === 'status_tangle');
  t.eq(C.canPlay(tangle.uid).ok, true, 'the tangle card is playable');
  C.play(tangle.uid);
  t.ok(C.heroes.every((h) => !h.st.bind), 'playing the tangle removes Bind from both heroes');
  t.eq(C.intent(C.enemies[0]).dmg, embrace.base, 'with the silk cut the embrace drops to its base');
  t.eq(C.canSwap().ok, true, 'and the party can swap again');
  // Umibozu: the slam number climbs with the turn until its cap, and the intent bubble shows it
  C = start(['umibozu']);
  const slam = E('umibozu').moves.slam.fx[0].n, um = C.enemies[0];
  const shownBy = (turn) => { um.turn = turn; um._move = 'slam'; return C.intent(um).dmg; };
  const curve = [1, 2, 3, 4, 5, 6, 7, 8, 12].map(shownBy);
  t.deep(curve, [1, 2, 3, 4, 5, 6, 7, 8, 12].map((k) => Math.min(slam.cap, slam.base + k)), `the slam reads ${curve.join(', ')} on its turns 1 to 8 and 12`);
  t.ok(curve[0] < curve[5] && curve[5] === slam.cap && curve[8] === slam.cap, 'it rises and then stops at its cap');
  t.ok(shownBy(1) * 2 >= 12, 'hitting both heroes, the first slam is already a real number');
  // Trial 0: the first hit of a fight is exactly the number on the intent
  C = start(['drowned_samurai'], 2);
  const shown = C.intent(C.enemies[0]).dmg;
  C.endTurn();
  const hit = C.events.filter((e) => e.type === 'hit' && e.dst.kind === 'hero')[0];
  t.ok(hit && hit.raw === shown, `the first hit (${hit && hit.raw}) equals the telegraphed number (${shown})`);
});

t.test('engine: knowing the chapter pays (cutting the silk, swapping out of the Grasp, killing the lantern, ending the tide early)', () => {
  if (!HAVE_ENGINE) return skipNote();
  const greedy = eMany([boss], BOSS_LEVEL, 'boss', 50), cut = eMany([boss], BOSS_LEVEL, 'boss', 50, cutPolicy);
  t.ok(mean(cut, (r) => r.hpLost) <= mean(greedy, (r) => r.hpLost) - 8, `cutting the silk saves HP against the boss (${mean(cut, (r) => r.hpLost).toFixed(0)} vs ${mean(greedy, (r) => r.hpLost).toFixed(0)})`);
  t.ok(winRate(cut) >= winRate(greedy), 'and never lowers the win rate');
  t.ok(mean(cut, (r) => r.s.C.events.filter((e) => e.type === 'play' && e.card.id === 'status_tangle').length) > 1, 'the tangle card is actually played');
  const choir = eMany(['nopperabo', 'nopperabo'], 'mid', 'normal', 50), swapped = eMany(['nopperabo', 'nopperabo'], 'mid', 'normal', 50, swapPolicy);
  t.ok(mean(swapped, (r) => r.hpLost) <= mean(choir, (r) => r.hpLost) - 3, `swapping the debuffed hero out saves HP against two faces (${mean(swapped, (r) => r.hpLost).toFixed(1)} vs ${mean(choir, (r) => r.hpLost).toFixed(1)})`);
  const lit = eMany(['chochin', 'drowned_samurai'], 'mid', 'normal', 50), dark = eMany(['drowned_samurai'], 'mid', 'normal', 50);
  t.ok(mean(lit, (r) => r.hpLost) > mean(dark, (r) => r.hpLost) + 8, 'a lantern beside the samurai makes the fight hurt more');
  const slow = eMany(['umibozu'], 'early', 'elite', 30), fast = eMany(['umibozu'], 'late', 'elite', 30);
  t.ok(mean(slow, (r) => r.hpLost / r.turns) > mean(fast, (r) => r.hpLost / r.turns), 'the tide rises: damage per turn grows the longer the fight runs');
});

t.test('engine: determinism, and trial mods scale the roster', () => {
  if (!HAVE_ENGINE) return skipNote();
  const a = engineFight([boss], 7, BOSS_LEVEL, 'boss'), b = engineFight([boss], 7, BOSS_LEVEL, 'boss');
  t.eq(JSON.stringify(a.s.C.events), JSON.stringify(b.s.C.events), 'same seed, same fight, event for event');
  const outs = new Set([1, 2, 3, 4, 5, 6].map((s) => { const r = engineFight([boss], s, BOSS_LEVEL, 'boss'); return r.turns + ':' + r.hpLost; }));
  t.ok(outs.size > 1, 'different seeds give different fights');
  // enemyHp, eliteHp, bossHp and enemyDmg (trial factors) reach every unit, minions included
  const hpOf = (enemyIds, tier, mods) => COMBAT.create(mk(enemyIds, 'mid', tier, 4, { mods: Object.assign(DATA.foldMods([]), mods) })).enemies.map((e) => [e.hp, e.def]);
  const base = hpOf(['spiderling', 'silk_weaver'], 'normal', {}), scaled = hpOf(['spiderling', 'silk_weaver'], 'normal', { enemyHp: 1.5 });
  base.forEach((x, i) => t.eq(scaled[i][0], Math.max(1, Math.round(x[0] * 1.5)), `enemyHp scales ${x[1]}`));
  t.eq(hpOf(['umibozu'], 'elite', { eliteHp: 1.25 })[0][0], Math.round(hpOf(['umibozu'], 'elite', {})[0][0] * 1.25), 'eliteHp scales the elite');
  t.eq(hpOf([boss], 'boss', { bossHp: 1.4 })[0][0], Math.round(hpOf([boss], 'boss', {})[0][0] * 1.4), 'bossHp scales the boss');
  const soft = eMany(['koi_spirit', 'nure_onna'], 'mid', 'normal', 30), hard = eMany(['koi_spirit', 'nure_onna'], 'mid', 'normal', 30, undefined, { mods: Object.assign(DATA.foldMods([]), { enemyDmg: 1.4 }) });
  t.ok(mean(hard, (r) => r.hpLost) > mean(soft, (r) => r.hpLost) * 1.2, 'enemyDmg makes the same fight cost more HP');
});

t.done();
