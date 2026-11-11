// School / pair / relic balance harness for GRAFTWORK (round 7).
//   node tools/graftwork_schools.mjs schools [N=100] [asc=0]      mono-school build per school x hero (best hero per school shown)
//   node tools/graftwork_schools.mjs pairs [N=60] [asc=0]         two-school builds per pair (all heroes pooled)
//   node tools/graftwork_schools.mjs relics [N=100] [asc=0] [id]  baseline strong bot vs the same bot with each relic forced at start
// A "forced" build: graft picks are restricted to the given school(s); everything else is the strong bot.
import * as RUN from '../graftwork/engine/run.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { GRAFTS, HEROES, RELICS } from '../graftwork/data/index.js';
import { SCHOOL_LIST } from '../graftwork/data/schools.js';
import { POLICIES, graftScore, playWardRun, strongFight } from './graftwork_driver.mjs';

export const SCHOOLS = SCHOOL_LIST.map((s) => s.id);

export function forcedPolicy(schools, relic) {
  const base = POLICIES.strong;
  return {
    ...base,
    fight(run, pol, mt) {
      if (relic && !run.relics.includes(relic)) RUN.addRelic(run, relic);
      return strongFight(run, pol, mt);
    },
    pickGraft(run, pol) {
      if (!schools) return base.pickGraft(run, pol);
      const offer = run.pending.offer;
      let best = null, bs = -1e9;
      for (const uid of offer.cards) {
        const inst = RUN.findInst(run, uid);
        for (const gid of offer.grafts) {
          if (!canGraft(inst, gid)) continue;
          const r = graftScore(run, inst, gid, pol);
          if (r.strain > pol.maxStrain) continue;
          const g = GRAFTS[gid];
          let s = r.s + (schools.includes(g.school) ? 5 : -4);
          if (s > bs) { bs = s; best = [uid, gid]; }
        }
      }
      return best && bs >= 1.5 ? best : null;
    },
  };
}

export function measure(hero, pol, N, asc, tag = '') {
  let w = 0, a2 = 0;
  for (let i = 0; i < N; i++) { const r = playWardRun(hero, `${tag}-${hero}-${i}`, pol, asc, { tag: 'school' }); if (r.outcome === 'won') w++; if (r.outcome === 'won' || r.act > 2) a2++; }
  return { w, a2, N };
}
const pct = (m) => `${(100 * m.w / m.N).toFixed(0)}%`;

if (process.argv[1] && process.argv[1].endsWith('graftwork_schools.mjs')) {
  const mode = process.argv[2] || 'schools', N = +process.argv[3] || 100, asc = +process.argv[4] || 0;
  if (mode === 'schools') {
    const base = {}; 
    for (const h of Object.keys(HEROES)) base[h] = measure(h, POLICIES.strong, N, asc, 'b');
    console.log('baseline  ' + Object.keys(HEROES).map((h) => `${h} ${pct(base[h])}`).join('  '));
    for (const s of SCHOOLS) {
      const row = Object.keys(HEROES).map((h) => measure(h, forcedPolicy([s]), N, asc, 'm' + s));
      const tot = row.reduce((a, m) => ({ w: a.w + m.w, N: a.N + m.N }), { w: 0, N: 0 });
      console.log(`${s.padEnd(7)} all ${pct(tot)}  ` + Object.keys(HEROES).map((h, i) => `${h} ${pct(row[i])}`).join('  '));
    }
  } else if (mode === 'pairs') {
    for (let i = 0; i < SCHOOLS.length; i++) for (let j = i + 1; j < SCHOOLS.length; j++) {
      const row = Object.keys(HEROES).map((h) => measure(h, forcedPolicy([SCHOOLS[i], SCHOOLS[j]]), N, asc, `p${i}${j}`));
      const tot = row.reduce((a, m) => ({ w: a.w + m.w, N: a.N + m.N }), { w: 0, N: 0 });
      console.log(`${(SCHOOLS[i] + '+' + SCHOOLS[j]).padEnd(14)} all ${pct(tot)}  ` + Object.keys(HEROES).map((h, k) => `${h} ${pct(row[k])}`).join('  '));
    }
  } else if (mode === 'relics') {
    const only = process.argv[5];
    const tot = (pol, tag) => Object.keys(HEROES).map((h) => measure(h, pol, N, asc, tag)).reduce((a, m) => ({ w: a.w + m.w, N: a.N + m.N }), { w: 0, N: 0 });
    const b = tot(forcedPolicy(null, null), 'r');
    console.log(`baseline ${pct(b)}`);
    for (const id of Object.keys(RELICS)) {
      if (only && id !== only) continue;
      const m = tot(forcedPolicy(null, id), 'r');
      console.log(`${id.padEnd(26)} ${RELICS[id].rarity.padEnd(9)} ${pct(m)}  d ${(100 * (m.w - b.w) / b.N).toFixed(0)}`);
    }
  }
}
