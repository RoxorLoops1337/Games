// Agent 14 round 7: late species traits, Bell cell, Fan Club and Bridge cards.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const mk = (stage, seed = 3) => sim.createGame({ seed, stage });
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, { mx: 0 }); };
const evs = (g, t) => g.events.filter(e => e.t === t);
const skinStage = (skin, min) => { let n = sim.SKINS.indexOf(skin) + 1; while (n < min || sim.isBossStage(n)) n += 10; return n; };
const still = s => { s.surge = 'idle'; s.surgeT = 99; };
{   // traits are late, regular snakes only
  assert.deepEqual(sim.TRAIT_SKINS.slice().sort(), sim.SKINS.filter(k => k !== 'sleepy' && k !== 'gloomy').sort(), 'every non-boss species has a trait');
  for (const k of sim.TRAIT_SKINS) {
    const late = mk(skinStage(k, 21)), early = mk(sim.SKINS.indexOf(k) + 1);
    assert.equal(sim.traitOf(late, late.snakes[0]), k); assert.ok(early.stage < 21 && sim.traitOf(early, early.snakes[0]) === '', 'no trait before stage 21: ' + k);
  }
  const b = mk(25); assert.equal(sim.traitOf(b, b.snakes[0]), '', 'bosses keep their own behaviour');
}
{   // love heals the cells near the face
  const g = mk(skinStage('love', 21)), sn = g.snakes[0]; tick(g, 60);
  for (let i = 1; i <= 4; i++) sn.segs[i].hp = sn.segs[i].max * 0.5;
  tick(g, 60 * 9); assert.ok(sn.segs[2].hp > sn.segs[2].max * 0.55 && evs(g, 'trait').some(e => e.k === 'love'), 'heart pulse heals');
}
{   // sneezy jolts forward with a warning first
  const g = mk(skinStage('sneezy', 21)), sn = g.snakes[0]; still(sn); tick(g, 60 * 8.6);
  assert.ok(evs(g, 'trait').some(e => e.warn), 'warning'); const mid = sn.tail; g.events.length = 0; tick(g, 60);
  assert.ok(evs(g, 'trait').some(e => !e.warn)); assert.ok(sn.tail - mid > sim.SNEEZE_JOLT * 0.8, 'jolt');
}
{   // rust stalls then jerks; mighty shrugs off slowing; sour rushes; grumpy surges sooner
  const rs = skinStage('rust', 21), g = mk(rs), sn = g.snakes[0]; still(sn); g.t = 0.1;
  const a = sn.tail; tick(g, 20); const stall = sn.tail - a; g.t = 3; const b = sn.tail; tick(g, 20); assert.ok(stall < (sn.tail - b) * 0.5, 'stalls at first');
  const dist = (st, slow) => { const h = mk(st), s = h.snakes[0]; still(s); h.t = 3; if (slow) s.slow = 5; const t0 = s.tail; tick(h, 30); return s.tail - t0; };
  const sm = skinStage('mighty', 21), slowed = dist(sm, true), free = dist(sm, false); assert.ok(slowed > free * 0.7 && slowed < free * 0.85, 'mighty is slowed less: ' + (slowed / free));
  const so = skinStage('sour', 21), q = mk(so), qs = q.snakes[0]; still(qs); const pre = qs.tail; tick(q, 20); const base = qs.tail - pre;
  const q2 = mk(so), qs2 = q2.snakes[0]; still(qs2); qs2.rushT = 5; const pre2 = qs2.tail; tick(q2, 20); assert.ok(qs2.tail - pre2 > base * 1.08, 'sour rushes');
  const gr = mk(skinStage('grumpy', 21)), gs = gr.snakes[0]; gs.surge = 'go'; gs.surgeT = 0.001; tick(gr); assert.ok(gs.surgeT > 3.8 && gs.surgeT < 7.4, 'grumpy cooldown shorter: ' + gs.surgeT);
}
{   // frosty ice patch
  const g = mk(skinStage('frosty', 21)), sn = g.snakes[0]; tick(g, 60 * 5); assert.ok(!sn.segs.some(s => s.frost));
  tick(g, 60 * 2); assert.equal(sn.segs.filter(s => s.frost).length, 2); assert.ok(sn.segs.filter(s => s.frost).every(s => s.warded));
}
{   // bell cell: late, rings its neighbours, Soundcheck counts it
  assert.ok(!mk(30).snakes[0].segs.some(s => s.bell), 'no bell before 34'); assert.ok(!mk(40).snakes[0].segs.some(s => s.bell), 'no bell on bosses');
  const st = skinStage('love', 34), g = mk(st), sn = g.snakes[0], bi = sn.segs.findIndex(s => s.bell); assert.ok(bi > 0, 'stage ' + st + ' has a bell');
  const nb = sn.segs[bi + 1], h0 = nb.hp; sn.segs[bi].hp = 0; tick(g);
  assert.ok(nb.hp < h0 * 0.8 && g.dmgBy.bell > 0 && evs(g, 'bell').length === 1, 'bell hurts neighbours: ' + nb.hp / h0);
  const g2 = mk(st); g2.ups.chk = 3; g2.val = undefined; const e0 = g2.encore; g2.snakes[0].segs[bi].hp = 0; tick(g2); assert.ok(g2.encore > e0 + 0.1, 'soundcheck counts bells');
  const ring = lv => { const h = mk(st); h.ups.brg = lv; h.val = undefined; const n = h.snakes[0].segs[bi + 1], m = n.hp; h.snakes[0].segs[bi].hp = 0; tick(h); return m - n.hp; };
  assert.ok(ring(3) > ring(0) * 1.5, 'Bridge rings harder');
  const h = mk(st); h.ups.brg = 1; h.ups.fan = 1; h.val = undefined; h.groove = 0; h.snakes[0].segs[bi].hp = 0; tick(h); assert.ok(h.groove >= 3, 'Fan Club + Bridge add groove');
}
{   // cards
  for (const [id, st] of [['fan', 20], ['brg', 34]]) { const p = sim.PASSIVES.find(u => u.id === id); assert.ok(p && p.minStage === st && p.vals.length >= 4); }
  const g = mk(20); g.val = undefined; assert.equal(sim.uv(g, 'fan'), 0); g.ups.fan = 2; assert.ok(sim.uv(g, 'fan') > 0);
}
console.log('25_gameplay_r7 ok');
