// Stacking Cats: a simple bot plays whole seeded runs. The game must be fair but not easy:
// the bot should get through the first nest most of the time and should always die eventually.
import assert from 'node:assert/strict';
import {
  newGame, addCat, mergeCats, mergePairs, rollCatChoices, rollSnackChoices, eatSnack, startWave, step, catMaxHp, releaseCat, moveCat, TUNE,
  rollItemChoices, takeItem, equipItem, useReroll, autoSpecialPick, useSpecial, useZoomies,
} from '../stacking_cats/sim.js';
import { ITEM_BY_ID, emptyKingdom } from '../stacking_cats/cats.js';
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

const RAR = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
function loot(g) {
  const ch = rollItemChoices(g).sort((a, b) => RAR[ITEM_BY_ID[b].rarity] - RAR[ITEM_BY_ID[a].rarity]);
  takeItem(g, ch[0]);
  // put it on the strongest cat that still has a free slot (or the first cat)
  const target = g.cats.find((c) => c.items.length < (c.lvl >= 3 ? 2 : 1)) || g.cats[0];
  if (target) equipItem(g, g.stash.length - 1, target.uid);
}

// skill 1 also fires charged special moves and the zoomies the way an attentive player does (the plain bot never does, so it plays far worse than a person)
export function playRun(seed, { maxWave = 80, kingdom = null, difficulty = 'normal', skill = 0 } = {}) {
  const g = newGame({ seed, unlocked: STARTERS, events: false, kingdom, difficulty });
  for (let i = 0; i < START_CATS; i++) recruit(g);
  for (let i = 0; i < g.meta.startSnacks; i++) snack(g);
  while (g.state !== 'over' && g.wave < maxWave) {
    startWave(g);
    let guard = 0;
    while (g.state !== 'clear' && g.state !== 'over' && guard++ < 30 * 600) {
      step(g);
      if (skill && guard % 10 === 0) { const u = autoSpecialPick(g); if (u) useSpecial(g, u.uid !== undefined ? u.uid : u); if (g.zoom >= 100) useZoomies(g); }
    }
    if (g.state === 'over') break;
    for (const r of g.reward) { if (r === 'cat') recruit(g); else if (r === 'item') loot(g); else snack(g); }
    arrange(g);
  }
  return { wave: g.wave, kills: g.run.kills, cats: g.cats.length, state: g.state, coins: Math.floor(g.run.coins) };
}

export function maxedKingdom(frac = 1) {
  const k = emptyKingdom();
  for (const [id, mx] of Object.entries({ dojo: 5, beds: 5, yarn: 5, spa: 5, tower: 5, shrine: 5, vault: 5, tent: 4, stall: 3 })) k.lv[id] = Math.round(mx * frac);
  return k;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = QUICK ? 6 : 16;
  const spread = (opts) => { const w = []; for (let s = 1; s <= N; s++) w.push(playRun(s * 7919, opts).wave); return w.sort((a, b) => a - b); };
  const waves = spread({});
  const med = waves[Math.floor(N / 2)];
  console.log('waves reached', waves.join(' '), 'median', med);
  const rich = spread({ kingdom: maxedKingdom(1) }), half = spread({ kingdom: maxedKingdom(0.5) });
  console.log('half kingdom', half.join(' '), 'median', half[Math.floor(N / 2)]);
  console.log('full kingdom', rich.join(' '), 'median', rich[Math.floor(N / 2)]);
  assert.ok(half[Math.floor(N / 2)] >= med, 'a half built kingdom should not be weaker');
  assert.ok(rich[Math.floor(N / 2)] > med + 2, 'a full kingdom should clearly help');
  assert.ok(rich.every((w) => w < 80), 'even a full kingdom must be beatable');
  // difficulty: the average wave must go down from Cozy to Normal to Hard
  const mean = (opts) => { const M = QUICK ? 20 : 40; let t = 0; for (let k = 1; k <= M; k++) t += playRun(k * 104729 + 17, opts).wave; return t / M; };
  const mc = mean({ difficulty: 'cozy' }), mn = mean({ difficulty: 'normal' }), mh = mean({ difficulty: 'hard' });
  console.log('mean wave cozy', mc.toFixed(1), 'normal', mn.toFixed(1), 'hard', mh.toFixed(1));
  assert.ok(mc > mn * 1.1 && mn > mh * 1.1, 'difficulty levels should be clearly different');
  assert.ok(med >= 8, 'too hard: median wave ' + med);
  assert.ok(med <= 40, 'too easy: median wave ' + med);
  assert.ok(waves.every((w) => w < 80), 'a run never ended: the game is endless-easy');
  assert.ok(waves.filter((w) => w >= 6).length >= N * 0.55, 'the first nest should usually fall');
  // an attentive player (specials and zoomies) is the yardstick for "the first run should not get that far": most fresh saves end well before the finale at wave 30
  const NA = QUICK ? 24 : 48, att = []; for (let k = 1; k <= NA; k++) att.push(playRun(k * 7919, { skill: 1 }).wave); att.sort((a, b) => a - b);
  const am = att[Math.floor(NA / 2)], finale = att.filter((w) => w >= 30).length;
  console.log('attentive player', att.join(' '), 'median', am, 'finale reached', finale + '/' + NA);
  assert.ok(am >= 9 && am <= 22, 'a fresh save with an attentive player should end around wave 10 to 22, median ' + am);
  assert.ok(finale <= NA * 0.25, 'the wave 30 finale should be rare on a fresh save: ' + finale + '/' + NA);
  assert.ok(am >= med, 'paying attention (specials, zoomies) must help');
  console.log('balance ok');
}
