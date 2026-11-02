// Gameplay batch 10: Snack cell and pickup, late species traits (stage 41+), phase 2 boss twists, ring stage record skip.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { traitLabel, LATE_LABEL, LATE_CUE, TRAIT_LABEL } = await import(join(root, 'trait_ui.js'));
const tick = (g, n = 1, inp = { mx: 0 }) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, inp); };
const skinStage = (skin, min) => { let n = sim.SKINS.indexOf(skin) + 1; while (n < min || sim.isBossStage(n)) n += 10; return n; };

// ---- Snack cell: placed from SNACK_FROM on regular snakes, never earlier, no random numbers drawn
const count = (n, flag) => { const g = sim.createGame({ seed: 9, stage: n }); return g.snakes.reduce((a, sn) => a + sn.segs.filter(s => s[flag]).length, 0); };
assert.equal(count(sim.SNACK_FROM - 1, 'snack'), 0); assert.equal(count(sim.SNACK_FROM, 'snack') + count(sim.SNACK_FROM + 1, 'snack'), 2); assert.equal(count(35, 'snack'), 0, 'not on boss stages');
assert.ok(sim.CELL_KEYS.includes('snack') && sim.SNACK_FROM > 30, 'late game only: the early game is not easier');
{
  const a = sim.createGame({ seed: 4, stage: 33 }), b = sim.createGame({ seed: 4, stage: 33 }); assert.equal(a.rand(), b.rand());
  const g = sim.createGame({ seed: 9, stage: 33 }), sn = g.snakes[0], c = sn.segs.find(s => s.snack); assert.ok(c);
  g.p.x = 80; g.events.length = 0; c.hp = 0; tick(g);
  const pk = g.pickups.find(q => q.kind === 'snack'); assert.ok(pk, 'popping the Snack cell drops a snack'); assert.ok(g.events.some(e => e.t === 'snack'));
  // it does NOT fly to the duo: after 3s it is still where it fell (inside the zone), and the duo has no buff
  g.p.x = 80; tick(g, 120); assert.ok(g.pickups.includes(pk) && g.p.rage <= 0, 'a snack waits for you');
  assert.ok(Math.abs(pk.y - g.p.y) < 20, 'it falls to the duo row');
  // slide under it
  const rage0 = g.p.rage, gr0 = g.groove; g.p.x = pk.x; g.events.length = 0; tick(g);
  assert.ok(!g.pickups.includes(pk), 'eaten'); assert.ok(g.p.rage >= sim.SNACK_RAGE - 0.1 && g.p.rage > rage0, 'rage buff'); assert.ok(g.groove > gr0 && g.snacks === 1);
  assert.ok(g.events.some(e => e.t === 'snackget'));
}
{   // stale snacks expire after SNACK_LIFE
  const g = sim.createGame({ seed: 9, stage: 33 }), c = g.snakes[0].segs.find(s => s.snack); g.p.x = 40; c.x = 400; c.hp = 0; tick(g);
  const pk = g.pickups.find(q => q.kind === 'snack'); pk.x = 400; g.p.zone = { x0: 40, x1: 80 }; g.p.x = 40; g.events.length = 0;
  tick(g, Math.ceil(60 * (sim.SNACK_LIFE + 1)));
  assert.ok(!g.pickups.includes(pk), 'expired'); assert.equal(g.snacks, 0);
}
// the sprite and badge draw without gradients
{
  const { drawCellBadge, drawCellFlags } = await import(join(root, 'cellfx.js'));
  const calls = {}; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  const s = { x: 10, y: 10, snack: true }; drawCellFlags(ctx, s, 20, 1, 1, () => {}); drawCellBadge(ctx, s, 20, 1, 1, null);
  assert.ok(calls.fill > 4 && !calls.createLinearGradient && !calls.createRadialGradient);
}

// ---- Late traits (stage 41+): every species has its own name and its own twist
for (const k of sim.TRAIT_SKINS) { assert.ok(LATE_LABEL[k] && LATE_CUE[k] && LATE_LABEL[k] !== TRAIT_LABEL[k]); assert.equal(traitLabel(k, 41), LATE_LABEL[k]); assert.equal(traitLabel(k, 40), TRAIT_LABEL[k]); }
assert.ok(![...Object.values(LATE_LABEL), ...Object.values(LATE_CUE)].join('').includes(String.fromCharCode(8212)), 'no em dash');
const mk = (skin, min = 41, seed = 4) => { const n = skinStage(skin, min); const g = sim.createGame({ seed, stage: n }); assert.equal(g.snakes[0].skin, skin); assert.ok(sim.lateTrait(g, g.snakes[0]) === skin); return g; };
assert.equal(sim.lateTrait(sim.createGame({ seed: 4, stage: skinStage('love', 21) }), { skin: 'love', boss: false }), '', 'not before stage 41');
{   // love: the cells behind the face are warded after a pulse
  const g = mk('love'), sn = g.snakes[0]; sn.loveT = 0.01; tick(g, 2);
  assert.ok(sn.segs[1].warded && sn.segs[2].warded, 'sweetheart ward'); assert.ok(!sn.segs[4].warded);
  const e = []; g.events.length = 0; sn.loveT = 0.01; tick(g, 2); assert.ok(g.events.some(x => x.t === 'trait' && x.k === 'love' && x.late));
  const old = sim.createGame({ seed: 4, stage: skinStage('love', 21) }); old.snakes[0].loveT = 0.01; tick(old, 2); assert.ok(!old.snakes[0].segs[1].warded, 'stage 21 love is unchanged');
}
{   // sneezy: a half sneeze follows
  const g = mk('sneezy'), sn = g.snakes[0]; sn.snzT = 0.01; const t0 = sn.tail; tick(g, 2); const first = sn.tail - t0; g.events.length = 0;
  tick(g, Math.ceil(60 * sim.SNEEZE_AFTER) + 3); assert.ok(g.events.filter(x => x.t === 'trait' && x.late).length >= 1, 'aftershock cue'); assert.ok(first > 20);
}
{   // rust: longer stall than the old creak; sour: longer rush; grumpy: shorter surge wait; mighty: weaker slow
  const g = mk('rust'), sn = g.snakes[0]; g.t = sim.CREAK_STALL + 0.2; const seen = []; for (let i = 0; i < 2; i++) { seen.push(sn.segs[0].ps); tick(g); }
  const old = sim.createGame({ seed: 4, stage: skinStage('rust', 21) }); old.t = sim.CREAK_STALL + 0.2; const a = old.snakes[0].segs[0].ps; tick(old, 2); const b = old.snakes[0].segs[0].ps;
  const a2 = sn.segs[0].ps; tick(g, 2); assert.ok((sn.segs[0].ps - a2) < (b - a), 'late rust is still stalled where stage 21 rust already lurches');
  const s = mk('sour'), ss = s.snakes[0]; ss.segs[3].hp = 0; tick(s); assert.ok(Math.abs(ss.rushT - sim.SOUR_RUSH_L) < 0.1, 'longer rush');
  const m = mk('mighty'), ms = m.snakes[0]; ms.slow = 1; const t1 = ms.tail; tick(m, 30); const slowed = ms.tail - t1;
  const m0 = sim.createGame({ seed: 4, stage: skinStage('mighty', 21) }); m0.snakes[0].slow = 1; const u1 = m0.snakes[0].tail; tick(m0, 30);
  const per = x => x / 1; assert.ok(slowed / ms.speed > (m0.snakes[0].tail - u1) / m0.snakes[0].speed, 'iron hide: the slow barely works');
  const gr = mk('grumpy'), gs = gr.snakes[0]; gs.surge = 'go'; gs.surgeT = 0.001; tick(gr, 2); assert.ok(gs.surgeT <= (5.5 + 5) * sim.GRUMPY_LATE + 0.1, 'short fuse');
}
{   // frosty: two ice patches at once; disco: wider swing
  const g = mk('frosty'), sn = g.snakes[0]; g.t = 9 - 3 + 0.3; tick(g); assert.equal(sn.segs.filter(q => q.frost).length, 2 * sim.FROST_SIZE, 'double frost');
  const o = sim.createGame({ seed: 4, stage: skinStage('frosty', 21) }); o.t = 9 - 3 + 0.3; tick(o); assert.equal(o.snakes[0].segs.filter(q => q.frost).length, sim.FROST_SIZE);
  assert.ok(sim.DISCO_SWING_L > sim.DISCO_SWING);
}

// ---- Boss phase 2 twists
{
  const gloomCells = n => { const g = sim.createGame({ seed: 3, stage: n }), sn = g.snakes[0]; sn.p2 = true; sn.p2T = 0; g.t = 10 - 1; tick(g); return sn.segs.filter(q => q.gloom).length; };
  assert.ok(sim.isBossStage(30) && sim.bossGroup(30) === 'gloomy' && sim.bossGroup(35) === 'sleepy');
  assert.equal(gloomCells(30), 2 * sim.GLOOM_SIZE, 'eclipse: two clouds in phase 2'); assert.equal(gloomCells(20), sim.GLOOM_SIZE, 'stage 20 keeps one cloud');
  const g = sim.createGame({ seed: 3, stage: 35 }), sn = g.snakes[0]; sn.p2 = true; sn.surge = 'go'; sn.surgeT = 0.001; const t0 = sn.tail; g.events.length = 0; tick(g, 2);
  assert.ok(g.events.some(e => e.t === 'startle') && sn.napT > 0 && sn.tail - t0 >= sim.STARTLE_JOLT - 1, 'startle after the nap begins');
  const h = sim.createGame({ seed: 3, stage: 25 }); h.snakes[0].p2 = true; h.snakes[0].surge = 'go'; h.snakes[0].surgeT = 0.001; h.events.length = 0; tick(h, 2); assert.ok(!h.events.some(e => e.t === 'startle'), 'stage 25 has no startle');
}

// ---- Ring stage record skip
{
  assert.equal(sim.stageKind(24), 'ring'); assert.equal(sim.stageKind(18), 'ring');
  const run = n => { const g = sim.createGame({ seed: 3, stage: n }); const sn = g.snakes[0]; tick(g, Math.ceil(60 * (sim.RING_SKIP_EVERY + 1))); return g; };
  const g = sim.createGame({ seed: 3, stage: 24 }), sn = g.snakes[0]; assert.ok(g.ring); sn.skipT = sim.RING_SKIP_WARN + 0.01; g.events.length = 0; tick(g, 2);
  assert.ok(g.events.some(e => e.type === 'x' || (e.t === 'ringskip' && e.warn)), 'warn scratch first');
  const t0 = sn.tail; tick(g, Math.ceil(60 * sim.RING_SKIP_WARN) + 3); assert.ok(g.events.some(e => e.t === 'ringskip' && !e.warn), 'then the hop'); assert.ok(sn.tail - t0 > sim.RING_SKIP_JOLT - 1);
  assert.ok(sn.skipT > sim.RING_SKIP_EVERY - 1, 'timer reset');
  const o = sim.createGame({ seed: 3, stage: 18 }); o.snakes[0].skipT = 0.01; o.events.length = 0; tick(o, 3); assert.ok(!o.events.some(e => e.t === 'ringskip'), 'ring stage 18 has no skip');
  const l = sim.createGame({ seed: 3, stage: 7 }); l.snakes[0].skipT = 0.01; tick(l, 3); assert.ok(!l.events.some(e => e.t === 'ringskip'), 'lane stages have none');
  assert.deepEqual(sim.SNAKE_KEYS.slice(-2), ['cue', 'skipT']);
}
// sounds exist
{
  const { registerB10 } = await import(join(root, 'audio_b10.js')); const sfx = {}; registerB10(sfx, () => {}, () => {}, () => true);
  for (const k of ['snackdrop', 'snackget', 'snackgone', 'ringskip', 'startle']) assert.equal(typeof sfx[k], 'function', k);
}
console.log('32_gameplay_b10 ok');
