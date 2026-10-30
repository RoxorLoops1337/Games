// Stacking Cats: the Rat Gang's newcomers (ninja, Mama Mouse and her pups, medic, thief, spiky, frosty, rocket, ghost).
// Small seeded scenarios: a game, a few mice pushed by hand, a few steps.
import assert from 'node:assert/strict';
import {
  newGame, addCat, calcMods, startWave, step, DT, hurtEnemy, makeEnemy, killEnemy, aliveCats, catMaxHp, useSpecial, useZoomies,
  chillOf, CHILL_R, targetsInRange, thornCat, MEDIC, THIEF, W, TOWER_X,
} from '../stacking_cats/sim.js';
import { ENEMY_TYPES, COIN_SCALE, CATS } from '../stacking_cats/cats.js';
import { playRun } from './stacking_cats_balance.test.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const NEW = ['ninja', 'litter', 'pup', 'medic', 'thief', 'spiky', 'frosty', 'rocket', 'ghost'];
const FRONT = TOWER_X + 30;

// a fight with an empty queue and no mice: the scenario pushes its own
function arena({ seed = 5, cats = ['tabby', 'ember', 'sparky'], wave = 10 } = {}) {
  const g = newGame({ seed, unlocked: CATS.map((c) => c.id) });
  for (const id of cats) addCat(g, id);
  g.wave = wave - 1;
  startWave(g);
  g.state = 'fight'; g.queue = []; g.enemies = [];
  g.mods = calcMods(g);
  g.ev = [];
  return g;
}
const add = (g, type, x, o = {}) => { const e = makeEnemy(g, type, g.wave, { x, elite: o.elite }); Object.assign(e, o.set || {}); g.enemies.push(e); return e; };
const tough = { hp: 1e9, maxHp: 1e9 };
const run = (g, sec) => { for (let i = 0; i < sec / DT && g.state === 'fight'; i++) step(g, DT); };

t('data: nine newcomers with their flags, pups only come from Mama Mouse', () => {
  for (const k of NEW) { const d = ENEMY_TYPES[k]; assert.ok(d && d.name && d.hint && d.hp > 0 && d.cd > 0, k); }
  assert.equal(ENEMY_TYPES.ninja.dodge, 0.3); assert.equal(ENEMY_TYPES.litter.splits, 3); assert.equal(ENEMY_TYPES.spiky.thorns, 0.25);
  assert.equal(ENEMY_TYPES.frosty.chill, 0.18); assert.equal(ENEMY_TYPES.ghost.phase, 3.2); assert.equal(ENEMY_TYPES.rocket.range, 420);
  assert.equal(ENEMY_TYPES.pup.minWave, 999); assert.equal(ENEMY_TYPES.pup.cost, 0);
  for (const k of NEW) for (const elite of [false, true]) {   // every newcomer has a working elite version
    const g = arena(); const e = makeEnemy(g, k, 14, { elite });
    for (const f of ['hp', 'maxHp', 'dmg', 'spd', 'w', 'h', 'cd']) assert.ok(Number.isFinite(e[f]), k + ' ' + f);
    assert.equal(e.elite, elite);
  }
});

t('ninja: about 3 hits in 10 miss (with a MISS text), status ticks never miss', () => {
  const g = arena();
  const e = add(g, 'ninja', 700, { set: tough });
  let miss = 0;
  for (let i = 0; i < 1000; i++) if (hurtEnemy(g, e, 1) === 0) miss++;
  assert.ok(miss > 240 && miss < 360, 'dodged ' + miss + ' of 1000');
  assert.ok(g.ev.some((v) => v.k === 'miss'), 'a miss event for the renderer');
  for (let i = 0; i < 300; i++) assert.ok(hurtEnemy(g, e, 1, { tick: true, silent: true }) > 0, 'a tick always lands');
  const m = add(g, 'mouse', 700, { set: tough });
  for (let i = 0; i < 200; i++) assert.ok(hurtEnemy(g, m, 1) > 0, 'other mice never dodge');
});

t('Mama Mouse: three pups scamper out, count as kills once each, pay no coins, and the wave ends when all are gone', () => {
  const g = arena();
  const mama = add(g, 'litter', 700);
  const k0 = g.run.kills, c0 = g.run.coins;
  hurtEnemy(g, mama, 1e7);
  assert.ok(mama.dead);
  assert.equal(g.run.kills, k0 + 1);
  assert.equal(g.pending.length, 3);
  const qLen = g.queue.length;
  step(g, DT);
  const pups = g.enemies.filter((e) => e.type === 'pup' && !e.dead);
  assert.equal(pups.length, 3, 'three pups on the field');
  assert.equal(g.queue.length, qLen, 'pups are not queued');
  for (const p of pups) { assert.ok(Math.abs(p.x - 700) < 40); assert.ok(p.minion); }
  const c1 = g.run.coins;
  for (const p of pups) { killEnemy(g, p, true); killEnemy(g, p, true); }   // a second kill of the same pup counts nothing
  assert.equal(g.run.kills, k0 + 4);
  assert.equal(g.run.coins, c1, 'pups pay no coins');
  assert.ok(c1 > c0, 'Mama Mouse herself pays');
  run(g, 2);
  assert.equal(g.state, 'clear', 'the wave ends');
  // in a real fight the cats clear Mama and the litter and the wave still ends, every mouse counted once
  const h = arena({ wave: 8 });
  h.queue = [{ t: 0, type: 'litter', elite: false }, { t: 0.5, type: 'litter', elite: true }];
  const hk = h.run.kills;
  run(h, 120);
  assert.equal(h.state, 'clear');
  assert.equal(h.run.kills - hk, 8, 'two mothers and six pups');
  assert.equal(h.wKills, 8);
});

t('medic: patches up nearby mice by 8% every few seconds, other medics and nests only a little, never attacks', () => {
  const g = arena();
  const m = add(g, 'mouse', 640, { set: { stun: 99 } });
  m.hp = m.maxHp * 0.5;
  const md = add(g, 'medic', 700, { set: { stun: 0, cd: 0.001, ...tough } });
  const md2 = add(g, 'medic', 720, { set: { stun: 99 } }); md2.hp = md2.maxHp * 0.5;
  const far = add(g, 'mouse', 700 + MEDIC.r + 60, { set: { stun: 99 } }); far.hp = far.maxHp * 0.5;
  step(g, DT);
  assert.ok(Math.abs(m.hp - m.maxHp * (0.5 + MEDIC.pct)) < m.maxHp * 0.01, 'mouse healed by 8%: ' + (m.hp / m.maxHp));
  assert.ok(Math.abs(md2.hp - md2.maxHp * (0.5 + MEDIC.medic)) < md2.maxHp * 0.005, 'another medic only a little');
  assert.equal(far.hp, far.maxHp * 0.5, 'out of reach');
  assert.ok(g.ev.some((v) => v.k === 'medic') && g.ev.some((v) => v.k === 'ehealfx'));
  assert.ok(md.cd > 1.5, 'the heal waits about ' + ENEMY_TYPES.medic.cd + ' s');
  // alone at the stack it never bites
  const h = arena();
  const solo = add(h, 'medic', 400, { set: tough });
  const hp0 = aliveCats(h).map((c) => c.hp);
  run(h, 12);
  assert.deepEqual(aliveCats(h).map((c) => c.hp), hp0, 'a medic never hurts a cat');
  assert.ok(solo.x < 400, 'alone it does not hide out of reach (the stack strolls up to it)');
  // it stays behind the front mouse, close enough to heal it
  const k = arena();
  const lead = add(k, 'brute', 600, { set: tough });
  const doc = add(k, 'medic', 900, { set: tough });
  run(k, 10);
  assert.ok(doc.x > lead.x && doc.x - lead.x <= MEDIC.r, 'medic ' + doc.x + ' behind the front mouse ' + lead.x);
});

t('thief: steals 8% of the run coins once, runs off, drops them when caught, loses them when it escapes', () => {
  const g = arena();
  g.run.coins = 100;
  const th = add(g, 'thief', FRONT + 80, { set: tough });
  run(g, 3);
  assert.ok(th.fled, 'it reached the stack and turned around');
  assert.ok(Math.abs(th.loot - 8) < 1e-9, 'loot ' + th.loot);
  assert.ok(g.run.coins < 92.5 && g.ev.some((v) => v.k === 'steal' && Math.abs(v.v - 8) < 1e-9));
  const x0 = th.x; step(g, DT); assert.ok(th.x > x0, 'runs to the right');
  const before = g.run.coins;
  th.hp = 1; hurtEnemy(g, th, 50, { tick: true });
  assert.ok(th.dead);
  assert.ok(g.run.coins >= before + 8 - 1e-9, 'caught: the coins come back');
  assert.ok(g.ev.some((v) => v.k === 'loot'));
  // it steals only once and an escape takes the coins for good
  const h = arena();
  h.run.coins = 100;
  const t2 = add(h, 'thief', FRONT + 40, { set: tough });
  run(h, 1);
  assert.ok(t2.fled);
  const left = h.run.coins;
  t2.x = W + 55;
  for (let i = 0; i < 30 && !t2.dead; i++) step(h, DT);
  assert.ok(t2.dead, 'it got away');
  assert.ok(h.ev.some((v) => v.k === 'escape'));
  assert.equal(h.state, 'clear', 'an escaped thief ends the wave');
  assert.ok(Math.abs(h.run.coins - left - h.report.coins) < 1e-9, 'no coins back, only the wave pay');
  // the minimum share (times COIN_SCALE) and never more than the run has
  const p = arena(); p.run.coins = 10; const t3 = add(p, 'thief', FRONT + 40, { set: tough }); run(p, 1);
  assert.ok(Math.abs(t3.loot - THIEF.min * COIN_SCALE) < 1e-9, 'minimum ' + t3.loot);
  const q = arena(); q.run.coins = 0.5; const t4 = add(q, 'thief', FRONT + 40, { set: tough }); run(q, 1);
  assert.ok(Math.abs(t4.loot - 0.5) < 1e-9 && q.run.coins >= -1e-9, 'never below zero');
});

t('spiky: the cat that hits it takes a quarter back through its damage reduction, never from ticks, never a KO', () => {
  const g = arena({ cats: ['tabby', 'ember'] });
  const s = add(g, 'spiky', 700, { set: tough });
  const c = g.cats[0];
  const hp0 = c.hp;
  g.curCat = c;
  const d = hurtEnemy(g, s, 40);
  const dr = Math.min(0.8, g.mods.dr);
  assert.ok(d > 0);
  assert.ok(hp0 - c.hp > 0 && hp0 - c.hp <= d * 0.25 * (1 - dr) + 1e-6, 'thorns ' + (hp0 - c.hp) + ' of ' + d);
  assert.ok(g.ev.some((v) => v.k === 'thorns' && v.uid === c.uid));
  g.mods.dr = 0.5;
  const hp1 = c.hp; hurtEnemy(g, s, 40);
  assert.ok(hp1 - c.hp <= 40 * 0.25 * 0.5 + 1e-6, 'damage reduction counts');
  const hp2 = c.hp; hurtEnemy(g, s, 40, { tick: true });
  assert.equal(c.hp, hp2, 'ticks do not prick');
  g.curCat = null; hurtEnemy(g, s, 40); assert.equal(c.hp, hp2, 'no cat, no thorns');
  g.curCat = c; c.hp = 2; hurtEnemy(g, s, 1e6);
  assert.ok(c.hp >= 1 - 1e-9 && !c.ko, 'thorns never knock a cat out');
  assert.equal(thornCat(g, c, 50), 0, 'at 1 hp nothing more');
  g.curCat = null;
});

t('frosty: one aura near the stack slows every cat by 18%, it does not stack, far away it does nothing', () => {
  const g = arena();
  assert.equal(chillOf(g), 0);
  const f1 = add(g, 'frosty', TOWER_X + 200, { set: { stun: 99, ...tough } });
  assert.equal(chillOf(g), 0.18);
  add(g, 'frosty', TOWER_X + 220, { set: { stun: 99, ...tough } });
  assert.equal(chillOf(g), 0.18, 'two frost rats chill once');
  for (const e of g.enemies) e.x = TOWER_X + CHILL_R + 100;
  assert.equal(chillOf(g), 0);
  f1.dead = true; assert.equal(chillOf(g), 0);
  // attack timers run 18% slower: same scene with a plain mouse versus a frost rat
  const tick = (type) => {
    const h = arena({ seed: 9 });
    add(h, type, TOWER_X + 200, { set: { stun: 99, ...tough } });
    for (const c of h.cats) c.cd = 50;
    step(h, DT);
    return h.cats.map((c) => 50 - c.cd);
  };
  const plain = tick('mouse'), cold = tick('frosty');
  plain.forEach((v, i) => assert.ok(Math.abs(cold[i] / v - 0.82) < 1e-6, 'cat ' + i + ' ' + cold[i] / v));
});

t('rocket: stops far back and fires rockets that hit the top cat and half as hard the cat below', () => {
  const g = arena({ cats: ['mochi', 'tabby', 'ember'] });
  add(g, 'brute', FRONT + 40, { set: { stun: 99, ...tough } });   // a mouse at the front keeps the stack from strolling
  const r = add(g, 'rocket', FRONT + 600, { set: tough });
  run(g, 6);
  assert.ok(Math.abs(r.x - (FRONT + 420)) < 1, 'it stops at range 420: ' + r.x);
  r.cd = 0.001;
  const taken = g.cats.map((c) => c.taken);
  g.ev = [];
  step(g, DT);
  const ev = g.ev.find((v) => v.k === 'rocket');
  assert.ok(ev && Number.isFinite(ev.x2) && Number.isFinite(ev.y2) && ev.x2 < ev.x, 'a rocket from the mouse to the stack');
  const p = g.projs.find((q) => q.rocket);
  assert.ok(p, 'a rocket projectile');
  for (let i = 0; i < 120 && g.projs.includes(p) && !p.dead; i++) step(g, DT);
  const al = aliveCats(g), top = al[al.length - 1], below = al[al.length - 2], bottom = al[0];
  const d = (c) => c.taken - taken[g.cats.indexOf(c)];
  assert.ok(d(top) > 0 && d(below) > 0, 'two cats hit: ' + d(top) + ' ' + d(below));
  assert.equal(d(bottom), 0, 'the bottom cat is spared');
  const exp = (c, mul) => r.dmg * mul * (1 - Math.min(0.8, g.mods.dr));
  assert.ok(d(top) <= exp(top, 1) + 1e-6 && d(top) >= exp(top, 1) * 0.5, 'top ' + d(top));
  assert.ok(d(below) <= exp(below, 0.5) + 1e-6, 'below ' + d(below));
});

t('ghost: fades for 1.2 s every 3.2 s, takes nothing while faded, is skipped by auto aim, still walks', () => {
  const g = arena();
  const gh = add(g, 'ghost', 520, { set: { phT: 3.2 - 0.05, ...tough } });
  const m = add(g, 'mouse', 560, { set: { stun: 99, ...tough } });
  step(g, DT); step(g, DT);
  assert.equal(gh.phased, true);
  assert.equal(hurtEnemy(g, gh, 100), 0);
  assert.equal(hurtEnemy(g, gh, 100, { tick: true, silent: true }), 0, 'not even ticks');
  assert.ok(g.ev.some((v) => v.k === 'miss') && g.ev.some((v) => v.k === 'fade'));
  const tg = targetsInRange(g, 2000, g.towerX);
  assert.ok(tg.includes(m) && !tg.includes(gh), 'auto aim prefers a visible mouse');
  m.dead = true;
  assert.ok(targetsInRange(g, 2000, g.towerX).includes(gh), 'alone it can still be aimed at');
  const x0 = gh.x; step(g, DT); assert.ok(gh.x < x0, 'a faded ghost still walks');
  run(g, 1.25);
  assert.equal(gh.phased, false, 'back after 1.2 s');
  assert.ok(hurtEnemy(g, gh, 100) > 0);
  // the cycle: about 1.2 of every 4.4 seconds faded
  const h = arena(); const g2 = add(h, 'ghost', 900, { set: { phT: 0, ...tough } });
  let faded = 0, N = 0;
  for (let i = 0; i < 4.4 * 5 / DT; i++) { step(h, DT); N++; if (g2.phased) faded++; if (h.state !== 'fight') break; }
  assert.ok(Math.abs(faded / N - 1.2 / 4.4) < 0.03, 'faded share ' + faded / N);
});

t('waves: every newcomer shows up from its wave on, old mice keep coming, pups never queue', () => {
  const seen = {}, old = {};
  for (let s = 1; s <= 12; s++) {
    for (let w = 1; w <= 24; w++) {
      if (w % 5 === 0) continue;
      const g = newGame({ seed: s * 31 });
      g.wave = w - 1; startWave(g);
      for (const q of g.queue) {
        const d = ENEMY_TYPES[q.type];
        assert.ok(d.minWave <= w, q.type + ' too early at wave ' + w);
        seen[q.type] = Math.min(seen[q.type] || 99, w);
        if (w >= 16) old[q.type] = (old[q.type] || 0) + 1;
      }
    }
  }
  for (const k of NEW) if (k !== 'pup') assert.ok(seen[k] && seen[k] <= ENEMY_TYPES[k].minWave + 3, k + ' first seen at ' + seen[k]);
  assert.ok(!seen.pup, 'pups only from Mama Mouse');
  for (const k of ['mouse', 'scout', 'slinger', 'brute', 'armored', 'glider', 'bomber', 'shaman', 'dasher', 'shield', 'digger']) assert.ok(old[k] > 0, k + ' still appears late');
});

// fuzz: every type (elites too) in seeded fights with random specials and zoomies: no throw, no NaN, every wave settles
function finite(g) {
  for (const c of g.cats.concat(g.bench)) assert.ok(Number.isFinite(c.hp) && Number.isFinite(c.cd), 'cat ' + c.id);
  for (const e of g.enemies) for (const f of ['x', 'y', 'hp', 'maxHp', 'dmg', 'cd', 'loot']) assert.ok(Number.isFinite(e[f]), e.type + ' ' + f + ' ' + e[f]);
  for (const p of g.projs) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'projectile');
  assert.ok(Number.isFinite(g.run.coins) && Number.isFinite(g.run.kills) && Number.isFinite(g.zoom), 'run');
}
t('fuzz: every enemy type and its elite in seeded fights, no throw and no NaN', () => {
  const types = Object.keys(ENEMY_TYPES);
  const met = new Set();
  for (let s = 1; s <= 10; s++) {
    const g = arena({ seed: s * 101, cats: ['mochi', 'tabby', 'ember', 'sparky', 'buckshot'].slice(0, 2 + (s % 4)), wave: 6 + s * 2 });
    g.run.coins = 40;
    g.queue = types.map((type, i) => ({ t: i * 0.6, type, elite: (i + s) % 3 === 0 }));
    for (const q of g.queue) met.add(q.type);
    for (let i = 0; i < 240 / DT && g.state === 'fight'; i++) {
      step(g, DT);
      if (i % 15 === 0) {
        const r = g.rnd();
        if (r < 0.3) { const c = aliveCats(g).find((x) => x.sp >= 1); if (c) useSpecial(g, c.uid); }
        if (g.zoom >= 100 && r < 0.5) useZoomies(g);
      }
      if (i % 30 === 0) finite(g);
    }
    finite(g);
    assert.ok(g.state === 'clear' || g.state === 'over', 'seed ' + s + ' settled: ' + g.state);
  }
  for (const k of types) if (k !== 'pup') assert.ok(met.has(k), k + ' fuzzed');
  // and a few whole bot runs with the new mice in the mix
  for (const seed of [11, 23, 37]) { const r = playRun(seed, { skill: 1, maxWave: 30 }); assert.ok(Number.isFinite(r.wave) && Number.isFinite(r.coins), 'bot run ' + seed); }
});

console.log(n + ' tests passed');
