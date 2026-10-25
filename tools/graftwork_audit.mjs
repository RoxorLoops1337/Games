// GRAFTWORK graft power audit (reusable).
//   node tools/graftwork_audit.mjs [N=40] [--pool=starters|all] [--tier=safe|greedy|weird] [--graft=g_id] [--rows]
// For every graft and every card it can legally go on, runs N seeded 2-enemy Act-1 fights with the sim bot and compares
// turns-to-win and HP lost against the same deck with no graft (same seeds, same enemy pairs: a paired comparison).
import * as RUN from '../graftwork/engine/run.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { fight, POLICIES } from './graftwork_sim.mjs';
import { CARDS, GRAFTS, HEROES, ENEMIES } from '../graftwork/data/index.js';

export const ACT1_NORMALS = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal' && !e.summonOnly && !e.minion).map((e) => e.id);
// bands from the brief: faster-than-baseline percent per graft weight
export const BANDS = { 1: [5, 12], 2: [12, 22], 3: [20, 35] };
export const NEGLIGIBLE = 3;
export const TOO_STRONG = 35;

// One seeded fight. graftSpec = null (baseline) or { cardId, grafts: [gid...] }. extra = card ids added to the deck.
export function auditFight(hero, seed, graftSpec, extraCards = [], hook = null) {
  const run = RUN.newRun({ hero, seed });
  for (const id of extraCards) run.deck.push({ uid: RUN.nextUid(run), id, grafts: [], up: 0 });
  const pair = [run.rng.pick(ACT1_NORMALS), run.rng.pick(ACT1_NORMALS)];
  if (graftSpec) {
    const inst = run.deck.find((i) => i.id === graftSpec.cardId && i.grafts.length === 0);
    for (const gid of graftSpec.grafts) { const r = RUN.applyGraft(run, inst.uid, gid, { keepPhase: true, free: true }); if (!r.ok) return null; }
  }
  if (hook) hook(run);
  run.hp = run.maxHp;
  const hp0 = run.hp;
  run.pending = { enemies: pair, fightKind: 'normal' };
  const { res, c } = fight(run, POLICIES.careful, 30);
  return { win: res.win, turns: res.turns, hpLost: hp0 - c.player.hp, maxHpLost: 0 };
}

// legal (hero, cardId) targets for a graft
export function targetsFor(gid, pool = 'starters') {
  const out = [];
  for (const h of Object.values(HEROES)) {
    const run = RUN.newRun({ hero: h.id, seed: 'tg' });
    const seen = new Set();
    const ids = pool === 'all' ? Object.values(CARDS).filter((c) => (c.hero === h.id || c.hero === 'any') && c.type !== 'junk' && c.rarity !== 'starter').map((c) => c.id) : [];
    for (const inst of run.deck) {
      if (seen.has(inst.id)) continue; seen.add(inst.id);
      if (canGraft(inst, gid)) out.push({ hero: h.id, cardId: inst.id, extra: [] });
    }
    for (const id of ids) {
      const probe = { uid: -1, id, grafts: [], up: 0 };
      if (canGraft(probe, gid)) out.push({ hero: h.id, cardId: id, extra: [id] });
    }
  }
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function auditGraft(gid, N = 40, pool = 'starters', baseCache = new Map()) {
  const rows = [];
  for (const t of targetsFor(gid, pool)) {
    const bk = `${t.hero}|${t.extra.join(',')}`;
    if (!baseCache.has(bk)) baseCache.set(bk, Array.from({ length: N }, (_, i) => auditFight(t.hero, `au-${t.hero}-${i}`, null, t.extra)));
    const base = baseCache.get(bk);
    const withG = Array.from({ length: N }, (_, i) => auditFight(t.hero, `au-${t.hero}-${i}`, { cardId: t.cardId, grafts: [gid] }, t.extra));
    const bt = mean(base.map((r) => r.turns)), gt = mean(withG.map((r) => r.turns));
    const bh = mean(base.map((r) => r.hpLost)), gh = mean(withG.map((r) => r.hpLost));
    rows.push({ gid, hero: t.hero, cardId: t.cardId, baseTurns: bt, turns: gt, faster: (1 - gt / bt) * 100, baseHp: bh, hpLost: gh, hpBetter: bh > 0 ? (1 - gh / bh) * 100 : 0 });
  }
  return rows;
}

export function summarize(gid, rows) {
  const g = GRAFTS[gid];
  const faster = mean(rows.map((r) => r.faster)), hpBetter = mean(rows.map((r) => r.hpBetter));
  // headline power: turns faster, with HP saved counted at half weight (HP lost is the other face of the same speed)
  const power = faster * 0.6 + hpBetter * 0.4;
  return { gid, name: g.name, tier: g.tier, weight: g.weight, rarity: g.rarity, cards: rows.length, faster, hpBetter, power };
}

export function flagsFor(s) {
  const f = [];
  if (!s.cards) f.push('NOTHING (legal on no card)');
  else {
    if (s.power < 0) f.push('NEGATIVE');
    else if (s.power < NEGLIGIBLE) f.push('NEGLIGIBLE');
    if (s.power > TOO_STRONG) f.push('TOO STRONG');
    const [lo, hi] = BANDS[s.weight] || [0, 99];
    if (s.power > hi + 4) f.push('above band ' + lo + '-' + hi);
    else if (s.power >= NEGLIGIBLE && s.power < lo - 4) f.push('below band ' + lo + '-' + hi);
  }
  return f;
}

export function runAudit({ N = 40, pool = 'starters', tier = null, only = null, log = () => {} } = {}) {
  const cache = new Map();
  const out = [];
  for (const g of Object.values(GRAFTS)) {
    if (tier && g.tier !== tier) continue;
    if (only && g.id !== only) continue;
    const rows = auditGraft(g.id, N, pool, cache);
    const s = summarize(g.id, rows);
    s.rows = rows;
    out.push(s);
    log(s);
  }
  return out.sort((a, b) => b.power - a.power);
}

if (process.argv[1] && process.argv[1].endsWith('graftwork_audit.mjs')) {
  const args = process.argv.slice(2);
  const N = +args.find((a) => /^\d+$/.test(a)) || 40;
  const opt = (k) => (args.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1] || null;
  const res = runAudit({ N, pool: opt('pool') || 'starters', tier: opt('tier'), only: opt('graft') });
  console.log(`graft                 tier   w  rar        cards  faster%  hpSaved%  power  flags`);
  for (const s of res) {
    console.log(`${s.gid.padEnd(21)} ${s.tier.padEnd(6)} ${s.weight}  ${s.rarity.padEnd(9)} ${String(s.cards).padStart(5)}  ${s.faster.toFixed(1).padStart(7)}  ${s.hpBetter.toFixed(1).padStart(8)}  ${s.power.toFixed(1).padStart(5)}  ${flagsFor(s).join('; ')}`);
    if (args.includes('--rows')) for (const r of s.rows) console.log(`    ${r.hero}/${r.cardId}: turns ${r.baseTurns.toFixed(2)} -> ${r.turns.toFixed(2)} (${r.faster.toFixed(1)}%), hp ${r.baseHp.toFixed(1)} -> ${r.hpLost.toFixed(1)}`);
  }
  for (const w of [1, 2, 3]) {
    const xs = res.filter((s) => s.weight === w && s.cards);
    console.log(`weight ${w}: n=${xs.length} mean power ${mean(xs.map((s) => s.power)).toFixed(1)} (band ${BANDS[w].join('-')})`);
  }
  for (const t of ['safe', 'greedy', 'weird']) {
    const xs = res.filter((s) => s.tier === t && s.cards);
    console.log(`tier ${t}: n=${xs.length} mean power ${mean(xs.map((s) => s.power)).toFixed(1)}`);
  }
}
