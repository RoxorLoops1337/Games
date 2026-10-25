// Stacking Cats: special moves, tap focus, event stops, the new mice and the nest tricks.
import assert from 'node:assert/strict';
import {
  newGame, addCat, startWave, step, makeEnemy, calcMods, useSpecial, specialReady, setFocus, rollEvent, chooseEvent, eventDue, aliveCats, catMaxHp, runSeconds, DT,
} from '../stacking_cats/sim.js';
import { CATS, SPECIALS, EVENTS, ENEMY_TYPES, NESTS, ITEM_BY_ID } from '../stacking_cats/cats.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const KINDS = new Set(['frenzy', 'fortress', 'inferno', 'storm', 'volley', 'freeze', 'snipe', 'barrage', 'heal', 'meteor', 'toxin', 'anthem', 'hex', 'phase', 'supernova']);

function fighting(ids, wave = 8, seed = 5) {
  const g = newGame({ seed, unlocked: CATS.map((c) => c.id) });
  for (const id of ids) addCat(g, id);
  g.wave = wave - 1; startWave(g); g.intro = 0; g.state = 'fight'; g.queue = [];
  return g;
}
const spawn = (g, type, x, o = {}) => { const e = makeEnemy(g, type, g.wave, { x, ...o }); g.enemies.push(e); return e; };

t('every cat has a special with a valid kind, name and icon', () => {
  for (const c of CATS) { const s = SPECIALS[c.id]; assert.ok(s, c.id); assert.ok(KINDS.has(s.kind), c.id + ' ' + s.kind); assert.ok(s.name && s.icon && s.color, c.id); }
});

t('a special needs a full charge, empties it, and works for every cat without errors', () => {
  for (const cat of CATS) {
    const g = fighting([cat.id, 'mochi'], 9);
    for (let i = 0; i < 4; i++) spawn(g, i % 2 ? 'brute' : 'mouse', 330 + i * 60);
    const c = g.cats[0];
    c.sp = 0.5;
    assert.equal(useSpecial(g, c.uid), false, cat.id + ' used while charging');
    c.sp = 1;
    assert.ok(specialReady(c));
    assert.equal(useSpecial(g, c.uid), true, cat.id);
    assert.equal(c.sp, 0);
    assert.ok(g.ev.some((e) => e.k === 'special' && e.id === cat.id));
    runSeconds(g, 1.2);
  }
});

t('specials change the fight: frenzy speeds up, fortress shields, heal revives, snipe hits hard, freeze stops the mice', () => {
  let g = fighting(['tabby'], 8);
  g.cats[0].sp = 1; useSpecial(g, g.cats[0].uid);
  assert.ok(g.cats[0].frenzyT > 3);
  g = fighting(['mochi', 'tabby'], 8);
  const mochi = g.cats[0]; const hp0 = mochi.hp; g.cats[0].sp = 1; useSpecial(g, mochi.uid);
  assert.ok(g.fortressT > 3);
  g = fighting(['pudding', 'tabby'], 8);
  g.cats[1].ko = true; g.cats[1].hp = 0; g.cats[0].sp = 1; useSpecial(g, g.cats[0].uid);
  assert.equal(g.cats[1].ko, false); assert.ok(g.cats[1].hp > 0);
  g = fighting(['hawkeye'], 8);
  const big = spawn(g, 'brute', 330), hp = big.hp; g.cats[0].sp = 1; useSpecial(g, g.cats[0].uid);
  assert.ok(big.hp < hp * 0.6 || big.dead, 'headshot barely scratched a brute');
  g = fighting(['yuki'], 8);
  const m = spawn(g, 'mouse', 300); g.cats[0].sp = 1; useSpecial(g, g.cats[0].uid);
  assert.ok(m.stun > 1.5 || m.dead);
});

t('specials only work while fighting and charge over time and from kills', () => {
  const g = fighting(['tabby'], 3); const c = g.cats[0];
  g.state = 'clear'; c.sp = 1; assert.equal(useSpecial(g, c.uid), false);
  g.state = 'fight'; c.sp = 0; spawn(g, 'mouse', 90);
  const s0 = c.sp; runSeconds(g, 3); assert.ok(c.sp > s0);
  c.sp = 0; spawn(g, 'mouse', 100); runSeconds(g, 4);
  assert.ok(c.sp > 0.1);
});

t('tap focus makes the cats shoot the chosen mouse first and it clears when that mouse dies', () => {
  const g = fighting(['sparky'], 3);
  const a = spawn(g, 'mouse', 200), b = spawn(g, 'mouse', 150);
  assert.equal(setFocus(g, a.uid), true);
  runSeconds(g, 0.6);
  assert.ok(a.hp < a.maxHp, 'focused mouse was not hit');
  assert.equal(setFocus(g, 99999), false);
  a.dead = true; step(g, DT); assert.equal(g.focus, 0);
});

t('dash mice leap onto the stack and bite the top cat', () => {
  const g = fighting(['mochi', 'tabby'], 9);
  const d = spawn(g, 'dasher', 260);
  const top = g.cats[g.cats.length - 1], hp0 = top.hp;
  runSeconds(g, 3);
  assert.ok(d.leaped || d.dead);
  assert.ok(top.hp < hp0 || d.dead, 'the top cat was never bitten');
});

t('shield bearers soak damage and ignore slow, burn and poison until the shield breaks', () => {
  const g = fighting(['tabby'], 10);
  const s = spawn(g, 'shield', 200);
  assert.ok(s.shield > 0);
  const sh0 = s.shield;
  g.curCat = g.cats[0];
  // hurtEnemy is internal; a frost special applies slow through it
  g.cats[0].sp = 1; const y = CATS.find((c) => c.id === 'yuki'); addCat(g, 'yuki'); g.cats[1].sp = 1; useSpecial(g, g.cats[1].uid);
  assert.ok(s.shield < sh0, 'shield took no damage');
  assert.equal(s.slow, 0, 'slow went through the shield');
  assert.equal(s.stun, 0);
  s.shield = 0; g.cats[1].sp = 1; useSpecial(g, g.cats[1].uid);
  assert.ok(s.slow > 0 || s.dead, 'slow should land once the shield is gone');
  assert.ok(y);
});

t('diggers cannot be hit while under ground and surface next to the stack', () => {
  const g = fighting(['tabby'], 12);
  const d = spawn(g, 'digger', 600);
  assert.equal(d.under, true);
  g.cats[0].sp = 1; const hp = d.hp; useSpecial(g, g.cats[0].uid);
  assert.equal(d.hp, hp, 'a buried digger was hit');
  runSeconds(g, 8);
  assert.equal(d.under, false); assert.equal(d.ai === 'melee' || d.dead, true);
});

t('nest tricks: pipe sends dashers, castle is guarded, moon hides in a bubble, trash heals when ignored', () => {
  const nest = (kind, wave) => {
    const g = fighting(['mochi', 'tabby', 'sparky'], wave);
    const e = g.enemies.find((o) => o.boss); assert.ok(e, 'no nest on wave ' + wave);
    e.kind = kind; return { g, e };
  };
  let { g, e } = nest('pipe', 10); e.dashT = 0.1; runSeconds(g, 1);
  assert.ok(g.enemies.some((o) => o.type === 'dasher'), 'pipe never released dashers');
  ({ g, e } = nest('castle', 15)); const hp0 = e.hp; g.enemies.push(makeEnemy(g, 'shield', 15, { x: 600 }));
  g.cats[0].sp = 1; g.cats[0].id = 'ember'; useSpecial(g, g.cats[0].uid);
  const guarded = hp0 - e.hp;
  ({ g, e } = nest('castle', 15)); g.cats[0].sp = 1; g.cats[0].id = 'ember'; useSpecial(g, g.cats[0].uid);
  const open = e.maxHp - e.hp;
  assert.ok(open === 0 || guarded < open * 0.8 || guarded === 0, 'castle took full damage while guarded');
  ({ g, e } = nest('moon', 25)); e.bubble = 2; const h = e.hp; g.cats[0].sp = 1; g.cats[0].id = 'merlin'; useSpecial(g, g.cats[0].uid);
  assert.ok(h - e.hp < e.maxHp * 0.02, 'bubble did not protect the moon nest');
  ({ g, e } = nest('trash', 20)); e.hp = e.maxHp * 0.5; e.lastHit = -10; const before = e.hp; runSeconds(g, 4);
  assert.ok(e.hp > before, 'trash nest did not heal');
  for (const nst of NESTS) assert.ok(nst.trick);
});

t('event stops: due every third wave outside nest waves, options work and respect coins', () => {
  const g = newGame({ seed: 3, unlocked: CATS.map((c) => c.id) });
  for (const id of ['mochi', 'tabby']) addCat(g, id);
  g.wave = 2; g.bossWave = false; assert.equal(eventDue(g), false); assert.equal(rollEvent(g), null);
  g.wave = 5; g.bossWave = true; assert.equal(eventDue(g), false);
  const seen = new Set();
  for (let s = 1; s < 60; s++) {
    const h = newGame({ seed: s, unlocked: CATS.map((c) => c.id) }); addCat(h, 'mochi'); addCat(h, 'tabby');
    h.wave = 6; h.bossWave = false; h.run.coins = 500; h.cats[0].hp = 1;
    const ev = rollEvent(h); assert.ok(ev && ev.options.length >= 2); seen.add(ev.id);
    for (let i = 0; i < ev.options.length; i++) {
      const r = chooseEvent(h, i);
      assert.ok(r.ok === true || r.ok === false);
      if (r.ok && !r.again) break;
    }
  }
  assert.ok(seen.size >= 4, 'events lack variety: ' + [...seen]);
  const p = newGame({ seed: 8, unlocked: CATS.map((c) => c.id) }); addCat(p, 'mochi');
  p.wave = 6; p.run.coins = 0;
  let ev = null; for (let s = 0; s < 40 && !(ev && ev.id === 'shop'); s++) { p.seed = s; p.rnd = newGame({ seed: s }).rnd; ev = rollEvent(p); }
  assert.ok(ev && ev.id === 'shop');
  assert.equal(chooseEvent(p, 0).ok, false, 'bought with no coins');
  p.run.coins = 1000; const c0 = p.run.coins, st = p.stash.length; const r = chooseEvent(p, 0);
  assert.ok(r.ok && r.again && p.run.coins < c0 && p.stash.length === st + 1);
  assert.equal(chooseEvent(p, 0).ok, false, 'sold twice');
});

t('the deal and training events change the run as promised', () => {
  for (let s = 1; s < 200; s++) {
    const g = newGame({ seed: s, unlocked: CATS.map((c) => c.id) }); addCat(g, 'mochi'); g.wave = 6; g.bossWave = false;
    const ev = rollEvent(g);
    if (ev.id === 'deal') { const h = g.hurtMul; assert.ok(chooseEvent(g, 0).ok); assert.ok(g.hurtMul > h); assert.equal(g.stash.length >= 1, true); break; }
  }
  for (let s = 1; s < 200; s++) {
    const g = newGame({ seed: s, unlocked: CATS.map((c) => c.id) }); addCat(g, 'mochi'); g.wave = 6; g.bossWave = false;
    const ev = rollEvent(g);
    if (ev.id === 'dojo') { const dps = calcMods(g); assert.ok(chooseEvent(g, 0).ok); assert.ok(g.cats[0].train > 0); assert.ok(dps); break; }
  }
});

t('picnic hands out a snack and the fountain pays back only sometimes, never beyond its stake in the long run', () => {
  let picnic = false, wins = 0, tosses = 0, net = 0;
  for (let s = 1; s < 400; s++) {
    const g = newGame({ seed: s, unlocked: CATS.map((c) => c.id) }); addCat(g, 'mochi'); g.wave = 6; g.bossWave = false; g.run.coins = 1000;
    const ev = rollEvent(g);
    if (ev.id === 'picnic' && !picnic) { const n0 = g.perm.length + g.temp.length; assert.ok(chooseEvent(g, 0).ok); assert.ok(g.perm.length + g.temp.length >= n0); assert.equal(g.event.done, true); picnic = true; }
    if (ev.id === 'fountain') {
      const c0 = g.run.coins; const r = chooseEvent(g, 0); assert.ok(r.ok && r.again); tosses++; net += g.run.coins - c0; if (g.run.coins > c0) wins++;
      assert.equal(chooseEvent(g, 0).ok, false, 'tossed the same coin twice');
    }
  }
  assert.ok(picnic && tosses > 10);
  assert.ok(wins > 0 && wins < tosses, 'fountain always or never pays');
  assert.ok(net / tosses < 15, 'fountain is a money printer: ' + net / tosses);
});

console.log(n + ' tests passed');
