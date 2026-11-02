// Gameplay batch 11: Mirror cell, boss phase 2 twists (stages 10 to 30), Beat Run, the Bell reach fix, Snack cell visibility.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const tick = (g, n = 1, inp = { mx: 0 }) => { for (let i = 0; i < n; i++) { sim.step(g, 1 / 60, inp); if (g.phase === 'levelup') sim.choose(g, 0); } };
const calm = g => { g.p.rate = 1e-6; g.p.cd = 99; g.weap = {}; return g; };   // nothing of ours shoots in these checks

// slide the chain down until chain cell k is on screen (bullets die off screen)
const bringOn = (g, sn, k) => { for (let n = 0; n < 3000 && !(sn.segs[k].y > 160); n++) { sn.tail += 4; tick(g); } assert.ok(sn.segs[k].y > 160 && g.phase === 'play', 'cell on screen'); };
// ---- Mirror cell: late game only, regular snakes, no random numbers, one extra cell key
const count = (n, flag) => { const g = sim.createGame({ seed: 9, stage: n }); return g.snakes.reduce((a, sn) => a + sn.segs.filter(s => s[flag]).length, 0); };
assert.ok(sim.CELL_KEYS.includes('mirror') && sim.MIRROR_FROM > 30, 'late game only: the early game is not easier');
assert.equal(count(sim.MIRROR_FROM - 1, 'mirror'), 0); assert.equal(count(sim.MIRROR_FROM, 'mirror'), 1); assert.equal(count(40, 'mirror'), 0, 'not on boss stages');
{
  const a = sim.createGame({ seed: 4, stage: 38 }), b = sim.createGame({ seed: 4, stage: 38 }); assert.equal(a.rand(), b.rand());
  const g = calm(sim.createGame({ seed: 9, stage: 38 })), sn = g.snakes[0]; assert.ok(sn.segs.some(s => s.mirror));
  for (const s of sn.segs) { s.ward = false; s.warded = false; s.mirror = false; } sn.segs[6].mirror = true; const k = 6; bringOn(g, sn, k + 1);
  const c = sn.segs[k], l = sn.segs[k - 1], r = sn.segs[k + 1]; for (const q of [c, l, r]) q.hp = q.max = 1000;
  g.bullets.push({ x: c.x, y: c.y, vx: 0, vy: 0, dmg: 100, crit: false, pierce: 0, r: 6, life: 1, hit: [], beat: false, kind: 'pill', home: 0, splash: 0, slow: 0 });
  g.events.length = 0; tick(g);
  const lc = 1000 - c.hp, ll = 1000 - l.hp, lr = 1000 - r.hp;
  assert.ok(Math.abs(lc - 60) < 1 && Math.abs(ll - 20) < 1 && Math.abs(lr - 20) < 1, `60/20/20 split, got ${lc} ${ll} ${lr}`);
  assert.ok(Math.abs(lc + ll + lr - 100) < 1, 'total damage is unchanged');
  assert.ok(g.events.some(e => e.t === 'mirror' && !e.brk), 'a glance cue');
  c.hp = 0; g.events.length = 0; tick(g); assert.ok(g.events.some(e => e.t === 'mirror' && e.brk), 'the mirror shatters');
}
// a normal cell is untouched by the rule
{
  const g = calm(sim.createGame({ seed: 9, stage: 38 })), sn = g.snakes[0], k = 6; for (const s of sn.segs) { s.mirror = false; s.ward = false; } bringOn(g, sn, k + 1);
  const c = sn.segs[k], l = sn.segs[k - 1]; c.hp = c.max = l.hp = l.max = 1000; const l0 = l.hp;
  g.bullets.push({ x: c.x, y: c.y, vx: 0, vy: 0, dmg: 100, crit: false, pierce: 0, r: 6, life: 1, hit: [], beat: false, kind: 'pill', home: 0, splash: 0, slow: 0 }); tick(g);
  assert.ok(Math.abs(1000 - c.hp - 100) < 1 && l.hp === l0 || l.hp >= l0 - 1e-9, 'plain cells take the full hit');
}
// drawing: no gradients on the flags
{
  const { drawCellBadge, drawCellFlags } = await import(join(root, 'cellfx.js'));
  const calls = {}; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  const s = { x: 10, y: 10, mirror: true, snack: false }; let glows = 0; drawCellFlags(ctx, s, 20, 1, 1, () => { glows++; }); drawCellBadge(ctx, s, 20, 1, 1, null);
  assert.ok(glows === 1 && calls.stroke > 2 && calls.fill > 0 && !calls.createLinearGradient && !calls.createRadialGradient);
  const sn = { x: 10, y: 10, snack: true }; const c2 = {}; const ctx2 = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { c2[k] = (c2[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  drawCellFlags(ctx2, sn, 20, 1, 1, () => {}); assert.ok(c2.arc >= 1 && c2.stroke >= 1, 'the Snack cell wears a visible ring');
}

// ---- Bell reach fix: the bell hits the cells NEXT to it in the chain, not the ones at its birth index
{
  const g = calm(sim.createGame({ seed: 9, stage: 36 })), sn = g.snakes[0], b = sn.segs.find(s => s.bell); assert.ok(b);
  for (const s of sn.segs) { s.ward = false; s.warded = false; }
  for (let i = 1; i < 9; i++) if (sn.segs[i] !== b) sn.segs[i].hp = 0;   // pop the cells in front of it
  tick(g, 2); const k = sn.segs.indexOf(b); assert.ok(k >= 0 && k < b.i, 'the bell moved up the chain: index ' + k + ' vs born ' + b.i);
  const near = sn.segs[k + 1], far = sn.segs[b.i + 1]; near.hp = near.max = 1000; far.hp = far.max = 1000; b.hp = 0; tick(g);
  assert.ok(near.hp < 1000, 'the real neighbour is rung');
  if (far !== near && Math.abs(far.i - b.i) > 3) assert.equal(far.hp, 1000, 'a cell outside the reach is not');
}

// ---- Boss phase 2 twists, stages 10 to 30
assert.deepEqual([5, 10, 15, 20, 25, 30].map(sim.bossTwistOf), ['', 'drop', 'hold', 'regrow', 'drop', 'hold'], 'one twist per boss, none before 10 (35 and up: see 35_e_gameplay)');
const boss = (n, seed = 3) => { const g = calm(sim.createGame({ seed, stage: n })), sn = g.snakes[0]; for (const s of sn.segs) { s.ward = false; s.warded = false; } sn.surgeT = 99; return { g, sn }; };
{   // drop: a lurch on the first beat of each bar, with a warning one beat before; only in phase 2
  const { g, sn } = boss(10); tick(g, 600); assert.ok(!g.events.some(e => e.t === 'btwist'), 'phase 1 has no twist'); g.events.length = 0;
  sn.p2 = true; sn.p2T = g.t; const t0 = sn.tail; tick(g, Math.ceil(60 * sim.beatPeriod(g) * 4.2) + 2);
  const ev = g.events.filter(e => e.t === 'btwist' && e.k === 'drop'); assert.ok(ev.some(e => e.warn) && ev.some(e => !e.warn), 'warn then drop');
  const free = sn.speed * (1 - g.p.slow) * 1.0 * (sim.beatPeriod(g) * 4.2); assert.ok(sn.tail - t0 > sim.DROP_JOLT * 0.9, 'it lurched: ' + (sn.tail - t0));
}
{   // hold: three cells behind the face are warded for a moment, then not
  const { g, sn } = boss(15); sn.p2 = true; sn.p2T = g.t; g.events.length = 0; tick(g, 3);
  assert.ok(sn.segs[1].warded && sn.segs[2].warded && sn.segs[3].warded, 'hold your fire'); assert.ok(g.events.some(e => e.t === 'btwist' && e.k === 'hold'));
  tick(g, Math.ceil(60 * (sim.HOLD_TIME + 0.3))); assert.ok(!sn.segs[1].warded, 'the hold ends');
  tick(g, Math.ceil(60 * sim.HOLD_EVERY)); assert.ok(g.events.filter(e => e.t === 'btwist' && e.k === 'hold').length >= 2, 'and returns');
}
{   // regrow: the cells nearest the face heal a little every few seconds
  const { g, sn } = boss(20); sn.p2 = true; sn.p2T = g.t; const c = sn.segs[2]; c.hp = c.max * 0.5; const h0 = c.hp; g.events.length = 0;
  tick(g, Math.ceil(60 * (sim.REGROW_EVERY + 0.3))); assert.ok(g.events.some(e => e.t === 'btwist' && e.k === 'regrow'), 'cue'); assert.ok(c.hp > h0, 'the cell healed: ' + c.hp + ' vs ' + h0);
}
{   // batch 12: 35 and up have their own twists (35_e_gameplay); the early bosses never get a late one
  const { g, sn } = boss(30); sn.p2 = true; sn.p2T = g.t; tick(g, 600); assert.ok(!g.events.some(e => e.t === 'btwist' && ['mirror', 'swing', 'quartet'].includes(e.k)));
}

// ---- Beat Run: a volley inside the beat window on three beats in a row pays Groove
{
  const shotOnBeat = (g, beatIdx) => { g.t = beatIdx * sim.beatPeriod(g) - 1 / 120; g.p.cd = -1; g.p.rate = 5; tick(g); };
  const mk = n => { const g = sim.createGame({ seed: 5, stage: n }); g.weap = {}; g.groove = 0; return g; };
  const g = mk(sim.BEATRUN_FROM); g.events.length = 0;
  shotOnBeat(g, 10); shotOnBeat(g, 11); assert.ok(!g.events.some(e => e.t === 'beatrun'), 'two beats are not a run');
  const gr = g.groove; shotOnBeat(g, 12); assert.ok(g.events.some(e => e.t === 'beatrun'), 'three in a row'); assert.ok(g.groove >= gr + sim.BEATRUN_GROOVE - 1, 'groove burst');
  const g2 = mk(sim.BEATRUN_FROM); g2.events.length = 0; shotOnBeat(g2, 10); shotOnBeat(g2, 11); shotOnBeat(g2, 13); shotOnBeat(g2, 14); assert.ok(!g2.events.some(e => e.t === 'beatrun'), 'a skipped beat restarts the count');
  const g3 = mk(sim.BEATRUN_FROM - 1); g3.events.length = 0; shotOnBeat(g3, 10); shotOnBeat(g3, 11); shotOnBeat(g3, 12); assert.ok(!g3.events.some(e => e.t === 'beatrun'), 'not in the early game');
}

// ---- sources: no em dash in what this batch added, new events are routed to audio
{
  const { readFileSync } = await import('node:fs');
  const dash = String.fromCharCode(8212);
  for (const f of ['audio_b11.js', 'cellfx.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes(dash), f + ' has no em dash');
  const main = readFileSync(join(root, 'main.js'), 'utf8'); assert.ok(/'mirror'.*'beatrun'.*'btwist'/.test(main), 'events reach the audio');
}
console.log('33_gameplay_b11 ok');
