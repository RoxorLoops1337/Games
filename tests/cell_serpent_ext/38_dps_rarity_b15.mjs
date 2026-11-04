// 38: the rarity of an upgrade card follows the damage per second it adds. Pure sim checks (no browser).
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { smartBot } from './balance_harness.mjs';
import { dpsNote } from '../../cell_serpent/cards_plain_b15.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const EM = String.fromCharCode(8212);

ok(sim.DPS_BANDS.length === 5 && sim.DPS_BANDS.every((b, i, a) => !i || b > a[i - 1]), 'five rising bands for six tiers');
ok([0, 5, 9.4, 10, 16, 25, 40, 50, 200].map(sim.dpsRarity).join() === '0,0,0,1,2,3,4,5,5', 'tiers by gain');

// flat DPS: the same card is the same tier in every run and every build
const gain = (id, v, extra = {}) => ({ id, kind: 'capsule', gain: v, ...extra });
const g0 = sim.createGame({ seed: 3, stage: 5 });
[[8, 0], [12, 1], [18, 2], [26, 3], [38, 4], [55, 5]].forEach(([v, t]) => ok(sim.dpsRarity(sim.dpsGain(g0, gain('aspd', v))) === t, `Faster Tempo +${v} is tier ${t}`));
const rich = sim.createGame({ seed: 9, stage: 30 }); rich.ups = { aspd: 12, notes: 4, burst: 3 }; rich.val = { aspd: 96, notes: 4, burst: 3 }; rich.dmgBy = { capsule: 10, swab: 99999 };
for (const c of [gain('aspd', 12), gain('notes', 1), gain('cdmg', 28), gain('crit', 6), { id: 'swab', kind: 'weapon', gain: 2, lvl: 1 }]) ok(sim.dpsGain(g0, c) === sim.dpsGain(rich, c), `${c.id}: the same flat number whatever you own`);
ok(sim.dpsRarity(sim.dpsGain(g0, gain('notes', 1))) === 5 && sim.dpsRarity(sim.dpsGain(g0, gain('burst', 1))) === 5, 'an extra note or burst doubles the starting gun: top tier');
ok(sim.dpsRarity(sim.dpsGain(g0, gain('cdmg', 12))) === 1 && sim.dpsRarity(sim.dpsGain(g0, gain('cdmg', 42))) === 4, 'damage tiers match speed tiers');
ok(sim.dpsRarity(sim.dpsGain(g0, { id: 'swab', kind: 'weapon', gain: 1, lvl: 1 })) === 0 && sim.dpsRarity(sim.dpsGain(g0, { id: 'swab', kind: 'weapon', gain: 3, lvl: 1 })) === 2, 'a skill level is common, three levels are epic');
// cards that are not about damage have no number
ok(sim.dpsGain(g0, { id: 'vital', kind: 'passive', gain: 45 }) === null && sim.dpsGain(g0, { id: 'brk', kind: 'passive', gain: 25 }) === null, 'defence and utility cards have no dps');
ok(sim.dpsGain(g0, gain('aspd', 0)) === null, 'no gain, no number');

// real runs: every damage card carries its estimate and its tier is the estimate's tier; the others keep the roll
let seen = 0, dmg = 0, other = 0; const tiers = new Set();
for (const stage of [3, 8, 14, 22]) for (let seed = 1; seed <= 6; seed++) {
  const g = sim.createGame({ seed, stage, meta: { atk: 4, cdn: 3, crt: 3, vit: 2 }, skills: { swab: 2, daggers: 2, tower: 2, dragon: 2, needles: 2 } });
  const pr = sim.rng(seed * 11 + 5);
  while (g.phase !== 'dead' && g.phase !== 'won' && g.t < 300) {
    sim.step(g, 1 / 30, smartBot(g));
    if (g.phase === 'levelup') {
      for (const c of g.choices) {
        seen++;
        if (c.dps !== undefined) { dmg++; tiers.add(c.rarity); ok(c.rarity === sim.dpsRarity(c.dps) && c.dps >= 0 && Number.isFinite(c.dps), `${c.id}: tier ${c.rarity} matches ${c.dps}`); ok(c.dps === sim.dpsGain(g, c), `${c.id}: flat`); } else { other++; ok(c.rarity >= 0 && c.rarity <= 5, `${c.id}: a rolled tier`); }
      }
      sim.choose(g, Math.floor(pr() * g.choices.length));
    }
    g.events.length = 0;
  }
}
ok(seen > 60 && dmg > 30 && other > 5, `enough cards seen (${seen}, ${dmg} damage, ${other} other)`);
ok(tiers.size >= 3, 'several tiers show up (' + [...tiers].join() + ')');

// the card line
ok(dpsNote({ dps: 8 }) === 'Adds +8 DPS' && dpsNote({ dps: 11.6 }) === 'Adds +12 DPS' && dpsNote({ dps: 100 }) === 'Adds +100 DPS' && dpsNote({ dps: 0.4 }) === '' && dpsNote({}) === '', 'the DPS line');
ok(!dpsNote({ dps: 123.4 }).includes(EM), 'no em dash');
console.log('38_dps_rarity_b15 ok', n);
