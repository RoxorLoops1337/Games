// Batch 12 agent e: counter cards (Pocket Mirror, Chamomile Tea, Ear Muffs), boss twists 35 to 50, Shutter cell in circle stages, tether and pips helpers.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const I = await import(join(root, 'card_icons.js'));
const FX = await import(join(root, 'run_fx_b12e.js'));
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) { sim.step(g, 1 / 60, { mx: 0 }); if (g.phase === 'levelup') sim.choose(g, 0); } };
const calm = g => { g.p.rate = 1e-6; g.p.cd = 99; g.weap = {}; return g; };

// ---- counter cards exist, are icons, are offered only in the right place
for (const id of ['mir', 'tea', 'muf']) {
  const p = sim.PASSIVES.find(u => u.id === id); assert.ok(p && p.cap === 100 && p.vals.length >= 4, id);
  assert.ok(I.COUNTERS[id] && I.kindLabel({ id }) === 'COUNTER'); assert.ok(decodeURIComponent(I.capIconURL(id)).includes('<svg'));
  assert.ok(!/—/.test(p.name + p.desc + p.fmt(25)));
}
const offered = (skin, stage) => { const g = sim.createGame({ seed: 5, stage }); g.skin = skin; g.level = 6; g.pending = 1; g.rerolls = 500; sim.step(g, 1 / 60, { mx: 0 }); const seen = new Set(); for (let i = 0; i < 160; i++) { for (const c of g.choices) seen.add(c.id); sim.reroll(g); } return seen; };
assert.ok(offered('grumpy', 23).has('tea') && !offered('love', 23).has('tea'), 'tea is for grumpy');
assert.ok(offered('disco', 24).has('muf') && !offered('love', 24).has('muf'), 'muffs are for disco');
assert.ok(offered('love', 38).has('mir') && !offered('love', 35).has('mir') && !offered('love', 40).has('mir'), 'mirror card: 36+, not on boss stages');

// ---- Pocket Mirror shrinks the glance toward zero
{
  const side = v => { const g = sim.createGame({ seed: 9, stage: 38 }); if (v) { g.ups.mir = 1; g.val = { mir: v }; } return sim.mirrorSide(g); };
  assert.equal(side(0), sim.MIRROR_SIDE); assert.ok(Math.abs(side(50) - sim.MIRROR_SIDE / 2) < 1e-9); assert.equal(side(100), 0);
}
// ---- Ear Muffs flatten the disco swing (speed range over one bar)
{
  const range = v => { const g = sim.createGame({ seed: 4, stage: 26 }); if (v) { g.ups.muf = 1; g.val = { muf: v }; } const sn = g.snakes[0]; let lo = 9, hi = 0;
    for (let i = 0; i < 200; i++) { g.t += 0.01; const t0 = sn.tail; sim.step(g, 1e-9, { mx: 0 }); const d = (sn.tail - t0) / 1e-9; lo = Math.min(lo, d); hi = Math.max(hi, d); } return hi - lo; };
  assert.ok(range(0) > range(50) && range(50) > range(100) - 1e-6, 'muffs shrink the swing: ' + [range(0), range(50), range(100)]);
}

// ---- boss twists
assert.deepEqual([35, 40, 45, 50].map(sim.bossTwistOf), ['mirror', 'swing', 'quartet', 'finale']);
const boss = n => { const g = calm(sim.createGame({ seed: 3, stage: n })), sn = g.snakes[0]; sn.surgeT = 99; return { g, sn }; };
{
  const { g, sn } = boss(35); tick(g, 120); assert.ok(!sn.segs.some(s => s.mirror), 'none in phase 1'); sn.p2 = true; sn.p2T = g.t; g.events.length = 0; tick(g, 5);
  assert.equal(sn.segs.filter(s => s.mirror).length, 2, 'two mirror cells'); assert.ok(g.events.some(e => e.t === 'btwist' && e.k === 'mirror'));
}
{
  const { g, sn } = boss(50); sn.p2 = true; sn.p2T = g.t; g.events.length = 0; tick(g, 5); assert.equal(sn.segs.filter(s => s.mirror).length, 1);
  tick(g, Math.ceil(60 * sim.beatPeriod(g) * 4.3)); assert.ok(g.events.some(e => e.t === 'btwist' && e.k === 'drop'), 'the finale also drops the bass');
}
{
  const { g, sn } = boss(45); sn.p2 = true; sn.p2T = g.t; tick(g, 5); assert.equal(sn.segs.filter(s => s.quartet).length, 4, 'four linked cells');
  const q = sn.segs.filter(s => s.quartet); q[0].hp = 0; tick(g, 2); assert.ok(sn.qT > 0 || g.events.some(e => e.t === 'quartetstart'), 'popping one starts the clock');
}
{
  const sp = p2 => { const { g, sn } = boss(40); if (p2) { sn.p2 = true; sn.p2T = g.t; } let lo = 9, hi = 0; for (let i = 0; i < 200; i++) { const t0 = sn.tail; tick(g); const d = sn.tail - t0; lo = Math.min(lo, d); hi = Math.max(hi, d); } return hi - lo; };
  assert.ok(sp(true) > sp(false) * 3 + 0.01, 'the stage 40 boss sways on the beat in phase 2');
}

// ---- Shutter cell: circle stages 24+, regular snakes, shield blocks 70% when it faces the duo
const cnt = (n, f) => sim.createGame({ seed: 9, stage: n }).snakes.reduce((a, sn) => a + sn.segs.filter(s => s[f]).length, 0);
assert.ok(sim.CELL_KEYS.includes('shell') && sim.SHELL_FROM >= 24);
assert.equal(cnt(18, 'shell'), 0); assert.equal(cnt(24, 'shell'), 1); assert.equal(cnt(42, 'shell'), 2); assert.equal(cnt(30, 'shell'), 0, 'not on a boss'); assert.equal(cnt(37, 'shell'), 0, 'not in lane stages'); assert.ok(sim.createGame({ seed: 1, stage: 24 }).snakes[0].segs.every(s => Object.keys(s).length === sim.CELL_KEYS.length), 'cell keys match');
{
  const g = calm(sim.createGame({ seed: 9, stage: 24 })), sn = g.snakes[0], c = sn.segs.find(s => s.shell); c.hp = c.max = 1000; c.flash = 0;
  let shut = 0, open = 0; for (let i = 0; i < 600; i++) { g.t += 0.01; (sim.shellBlocked(g, c) ? shut++ : open++); }
  assert.ok(shut > 150 && open > shut, `blocked ${shut} / open ${open}`);
  for (let i = 0; i < 2000; i++) { g.t += 0.013; if (sim.shellBlocked(g, c)) break; }
}

// ---- helpers draw without throwing and respect side 0
{
  let strokes = 0; const ctx = new Proxy({}, { get: (t, k) => (k === 'stroke' ? () => strokes++ : () => {}), set: () => true });
  const sn = { segs: [0, 1, 2, 3].map(i => ({ i, x: 100 + i * 20, y: 300, r: 30, hp: 5, mirror: i === 2, flash: 0 })) };
  FX.drawMirrorTether(ctx, sn, 1, 0); assert.equal(strokes, 0, 'no tether when the glance is gone'); FX.drawMirrorTether(ctx, sn, 1, 0.2); assert.ok(strokes > 0);
  const st = FX.beatPipState({ t: 1, beatN: 2, beatLast: Math.round(1 / (60 / 104)) }, 60 / 104, sim.BEAT_WIN, 3); assert.equal(st.n, 2);
  assert.equal(FX.beatPipState({ t: 5, beatN: 2, beatLast: 1 }, 60 / 104, sim.BEAT_WIN, 3).n, 0, 'an old run shows no pips'); FX.drawBeatPips(ctx, 100, 100, st);
}
console.log('35_e_gameplay ok');
