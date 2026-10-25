// Stacking Cats: a simple bot plays whole seeded runs. The game must be fair but not easy:
// the bot should get through the first nest most of the time and should always die eventually.
import assert from 'node:assert/strict';
import {
  newGame, addCat, mergeCats, mergePairs, rollCatChoices, rollSnackChoices, eatSnack, startWave, step, catMaxHp, releaseCat, moveCat, TUNE,
} from '../stacking_cats/sim.js';
import { CAT_BY_ID, CATS, SNACK_BY_ID, STARTERS, MAX_STACK, START_CATS } from '../stacking_cats/cats.js';

const QUICK = !!process.env.QUICK;
export const ROLE_SCORE = { Tank: 3, Claw: 2, Flames: 3, Electric: 3, Shotgun: 2.5 };

function catScore(g, id) {
  const d = CAT_BY_ID[id];
  const a = d.atk;
  let s = (a.dmg * 10) / a.cd * (a.t === 'cone' || a.t === 'chain' || a.t === 'lob' || a.t === 'beam' || a.t === 'storm' ? 1.6 : 1) + d.hp * 5;
  if (d.sup || d.pas) s += 8;
  if ([...g.cats, ...g.bench].some((c) => c.id === id && c.lvl < 3)) s += 40; // merge chance
  return s;
}

// A decent but not perfect player: merges, keeps tanks at the bottom, takes damage and hp snacks.
function arrange(g) {
  let guard = 0;
  while (guard++ < 10) {
    const pair = mergePairs(g)[0];
    if (!pair) break;
    mergeCats(g, pair[0], pair[1]);
  }
  while (g.cats.length < MAX_STACK && g.bench.length) moveCat(g, g.bench[0].uid, 'tower');
  g.cats.sort((a, b) => CAT_BY_ID[b.id].hp - CAT_BY_ID[a.id].hp);
}
function recruit(g) {
  const choices = rollCatChoices(g);
  const id = choices.sort((a, b) => catScore(g, b) - catScore(g, a))[0];
  let r = addCat(g, id);
  if (!r.ok) {
    const all = [...g.cats, ...g.bench].sort((a, b) => a.lvl - b.lvl || CAT_BY_ID[a.id].hp * 0 - 0);
    releaseCat(g, all[0].uid);
    r = addCat(g, id);
  }
  arrange(g);
}
const SNACK_PRI = { sushi: 5, tuna: 4, catnip: 5, pepper: 6, cola: 6, bone: 4, drumstick: 5, yarn: 3, golden: 7, megatuna: 3, milk: 3, kibble: 3, bonito: 2, icecream: 2 };
function snack(g) {
  const ch = rollSnackChoices(g).sort((a, b) => SNACK_PRI[b] - SNACK_PRI[a]);
  eatSnack(g, ch[0]);
}

export function playRun(seed, { maxWave = 80 } = {}) {
  const g = newGame({ seed, unlocked: STARTERS, events: false });
  for (let i = 0; i < START_CATS; i++) recruit(g);
  while (g.state !== 'over' && g.wave < maxWave) {
    startWave(g);
    let guard = 0;
    while (g.state !== 'clear' && g.state !== 'over' && guard++ < 30 * 600) step(g);
    if (g.state === 'over') break;
    if (g.bossWave) recruit(g);
    snack(g);
    arrange(g);
  }
  return { wave: g.wave, kills: g.run.kills, cats: g.cats.length, state: g.state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = QUICK ? 6 : 16;
  const waves = [];
  for (let s = 1; s <= N; s++) { const r = playRun(s * 7919); waves.push(r.wave); }
  waves.sort((a, b) => a - b);
  const med = waves[Math.floor(N / 2)];
  console.log('waves reached', waves.join(' '), 'median', med);
  assert.ok(med >= 8, 'too hard: median wave ' + med);
  assert.ok(med <= 40, 'too easy: median wave ' + med);
  assert.ok(waves.every((w) => w < 80), 'a run never ended: the game is endless-easy');
  assert.ok(waves.filter((w) => w >= 6).length >= N * 0.55, 'the first nest should usually fall');
  console.log('balance ok');
}
