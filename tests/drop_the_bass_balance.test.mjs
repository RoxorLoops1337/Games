// Drop the Bass: balance guard rails. A simple greedy bot plays whole stages with a given amount of permanent upgrades.
// The bot is much weaker than a person, so these bands are loose on purpose: they catch a stage that became impossible or trivial,
// not small tuning changes. The printed table is the balance report.
import assert from 'node:assert/strict';
import { Run } from '../drop_the_bass/js/sim.js';
import * as M from '../drop_the_bass/js/meta.js';
import { WORLDS } from '../drop_the_bass/js/data_core.js';

const LOAD = ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'];   // the whole drop pool, as in the game
const UP = ['amp', 'tempo', 'range', 'crit', 'critdmg', 'coin', 'deploy', 'cash', 'stagehp', 'herocd', 'heropow', 'hype', 'lucky', 'rebate', 'tipcup'];
function play(world, seed, level, encore = 0, mode = 'story', bot = 'good') {
  const p = M.newProfile(0);
  for (const id of UP) p.studio[id] = Math.min(level, 20);
  p.heroLv = { roxor: Math.min(10, 1 + Math.floor(level / 2)), jasmin: Math.min(10, 1 + Math.floor(level / 2)) };
  const s = M.computeRunSetup(p);
  const run = new Run({ world, seed, encore, loadout: LOAD, baseFx: s.baseFx, heroLv: s.heroLv, mode });
  for (let i = 0; i < 200000 && run.phase !== 'won' && run.phase !== 'lost'; i++) { run.advance(0.1); botStep(run, bot); run.drain(); if (mode === 'endless' && run.wave >= 25) break; }
  return run;
}
// 'good' merges and spends; 'nomerge' only spends (wrong choice); 'idle' never builds (wrong choice)
function botStep(run, bot) {
  if (bot === 'good') { run.autoPlayStep({ early: true }); return; }
  if (run.choice) run.pick(0);
  if (bot === 'nomerge') for (let k = 0; k < 4; k++) { if (run.coins >= run.deployCost() && run.canDeploy().ok) run.deploy(null, { onBeat: false }); else break; }
  if (run.phase === 'prep' && run.prepT > 2 && run.enemies.length === 0) run.startWave(true);
}
const rate = (world, level, encore = 0, N = 4) => { let w = 0; for (let s = 1; s <= N; s++) if (play(world, s * 7, level, encore).phase === 'won') w++; return w / N; };
const table = {};
const R = (w, l, e = 0) => { const k = w + ':' + l + ':' + e; if (!(k in table)) table[k] = rate(w, l, e); return table[k]; };

// the first stage is winnable with no upgrades; the last is not
assert.ok(R('garage', 0) >= 0.5, 'garage is winnable at the start: ' + R('garage', 0));
assert.ok(R('arena', 0) === 0, 'arena needs permanent upgrades');
// enough upgrades make every stage winnable
const need = { garage: 0, busk: 6, club: 12, festival: 14, arena: 18 };
for (const w of WORLDS) assert.ok(R(w.id, need[w.id]) >= 0.5, w.id + ' is winnable with upgrades: ' + R(w.id, need[w.id]));
// wrong choices lose: never merging, or never building, cannot clear the first stage
const wrong = (bot) => { let w = 0; for (let s = 1; s <= 4; s++) if (play('garage', s * 7, 0, 0, 'story', bot).phase === 'won') w++; return w / 4; };
assert.ok(wrong('idle') === 0, 'idle play loses'); assert.ok(wrong('nomerge') <= 0.25, 'never merging mostly loses: ' + wrong('nomerge'));
// the first stage is a fight: the good bot leaks at least a little on most seeds
let leaky = 0; for (let s = 1; s <= 4; s++) if (play('garage', s * 7, 0).leaks > 0) leaky++; assert.ok(leaky >= 3, 'garage is close, not a walk: ' + leaky + '/4 runs leaked');
// each stage is harder than the one before at the same strength
const lvl = 4; const rates = WORLDS.map((w) => R(w.id, lvl)); for (let i = 1; i < rates.length; i++) assert.ok(rates[i] <= rates[i - 1] + 0.26, 'difficulty rises with the stages at level ' + lvl + ': ' + rates.join(','));
// more upgrades never hurt much
for (const w of ['club', 'festival', 'arena']) assert.ok(R(w, 16) + 0.3 >= R(w, 4), w + ' gets easier with upgrades');
// encore is harder
assert.ok(R('club', 12, 3) <= R('club', 12, 0) + 0.01, 'encores are harder than normal');
// endless: the bot should be able to push past the story length with strong upgrades but not be immortal early
const e = play('garage', 3, 12, 0, 'endless'); assert.ok(e.wave >= 21, 'endless goes past 20 with upgrades: ' + e.wave);
const e0 = play('arena', 3, 0, 0, 'endless'); assert.ok(e0.wave < 12, 'arena endless is hard without upgrades');
console.log('balance report (bot win rate, 4 seeds): ' + Object.entries(table).map(([k, v]) => k.replace(/:/g, ' L').replace(' L0$', '') + '=' + v).join('  '));
console.log('drop_the_bass balance: ok');
