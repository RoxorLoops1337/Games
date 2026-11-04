// 38: the rarity of an upgrade card follows the damage per second it adds. Pure sim checks (no browser).
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { smartBot } from './balance_harness.mjs';
import { dpsNote } from '../../cell_serpent/cards_plain_b15.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const EM = String.fromCharCode(8212);

ok(sim.DPS_BANDS.length === 5 && sim.DPS_BANDS.every((b, i, a) => !i || b > a[i - 1]), 'five rising bands for six tiers');
ok([0, 0.05, 0.094, 0.1, 0.16, 0.25, 0.4, 0.5, 2].map(sim.dpsRarity).join() === '0,0,0,1,2,3,4,5,5', 'tiers by gain');

// the yardstick: attack speed with no stacks lands on the tier the roll gave it
const g0 = sim.createGame({ seed: 3, stage: 5 });
g0.dmgBy = { capsule: 10000 };   // all damage from the capsule: the yardstick
const aspd = (gain, ups = 0) => { g0.ups = { aspd: ups }; g0.val = { aspd: ups * 8 }; return { id: 'aspd', kind: 'capsule', gain }; };
[[8, 0], [12, 1], [18, 2], [26, 3], [38, 4], [55, 5]].forEach(([v, t]) => ok(sim.dpsRarity(sim.dpsGain(g0, aspd(v))) === t, `aspd +${v}% is tier ${t}`));
// diminishing returns: the same +12% is worth less on top of a lot of stacks
const lowStack = sim.dpsGain(g0, aspd(12, 0)), highStack = sim.dpsGain(g0, aspd(12, 12));
ok(highStack < lowStack, 'the same bonus adds less on a built up cell');
// a second note doubles the capsule: top tier; a fifth note barely moves it
g0.ups = { notes: 0 }; g0.val = { notes: 0 };
ok(sim.dpsRarity(sim.dpsGain(g0, { id: 'notes', kind: 'capsule', gain: 1 })) >= 4, 'the second note is a big deal');
g0.ups = { notes: 4 }; g0.val = { notes: 4 };
ok(sim.dpsRarity(sim.dpsGain(g0, { id: 'notes', kind: 'capsule', gain: 1 })) <= 3, 'the fifth note is not');
// skills do not count towards capsule only upgrades once they deal most of the damage
const gs = sim.createGame({ seed: 4, stage: 5 }); gs.ups = {}; gs.val = {};
gs.dmgBy = { capsule: 1000, swab: 9000 };
const skillHeavy = sim.dpsGain(gs, { id: 'aspd', kind: 'capsule', gain: 26 });
gs.dmgBy = { capsule: 9000, swab: 1000 };
ok(skillHeavy < sim.dpsGain(gs, { id: 'aspd', kind: 'capsule', gain: 26 }) / 3, 'capsule upgrades matter less when skills do the damage');
// cards that are not about damage have no estimate
ok(sim.dpsGain(g0, { id: 'vital', kind: 'passive', gain: 45 }) === null && sim.dpsGain(g0, { id: 'brk', kind: 'passive', gain: 25 }) === null, 'defence and utility cards have no dps');
ok(sim.dpsGain(g0, { id: 'aspd', kind: 'capsule', gain: 0 }) === null, 'no gain, no estimate');

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
        if (c.dps !== undefined) { dmg++; tiers.add(c.rarity); ok(c.rarity === sim.dpsRarity(c.dps) && c.dps >= 0 && Number.isFinite(c.dps), `${c.id}: tier ${c.rarity} matches ${c.dps}`); } else { other++; ok(c.rarity >= 0 && c.rarity <= 5, `${c.id}: a rolled tier`); }
      }
      sim.choose(g, Math.floor(pr() * g.choices.length));
    }
    g.events.length = 0;
  }
}
ok(seen > 60 && dmg > 30 && other > 5, `enough cards seen (${seen}, ${dmg} damage, ${other} other)`);
ok(tiers.size >= 3, 'several tiers show up (' + [...tiers].join() + ')');

// the card line
ok(dpsNote({ dps: 0.05 }) === 'About +5% total damage' && dpsNote({ dps: 0.047 }) === 'About +4.5% total damage' && dpsNote({ dps: 0.5 }) === 'About +50% total damage' && dpsNote({ dps: 0.004 }) === '' && dpsNote({}) === '', 'the damage line');
ok(!dpsNote({ dps: 1.234 }).includes(EM), 'no em dash');
console.log('38_dps_rarity_b15 ok', n);
