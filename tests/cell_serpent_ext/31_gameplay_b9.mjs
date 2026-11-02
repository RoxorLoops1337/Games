// Gameplay batch 9: counter cards for rust, sour and sneezy; trait cues for grumpy, disco, sour, mighty; Metronome and Pillow cells.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { capIconURL } = await import(join(root, 'card_icons.js'));
const { drawCellFlags, drawCellBadge, setBeatPhase } = await import(join(root, 'cellfx.js'));
const skinStage = (skin, min = 22) => { let n = sim.SKINS.indexOf(skin) + 1; while (n < min || sim.isBossStage(n)) n += 10; return n; };
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, { mx: 0 }); };

// counter cards: exist, have icons, are offered only on their species stage
for (const [id, skin] of [['oil', 'rust'], ['swt', 'sour'], ['tis', 'sneezy']]) {
  const p = sim.PASSIVES.find(u => u.id === id); assert.ok(p && p.skin === skin && p.minStage >= 22 && p.vals.length >= 4 && p.vals[3] === 100, id); assert.ok(capIconURL(id), id + ' icon');
  const offered = sk => { const g = sim.createGame({ seed: 5, stage: skinStage(sk) }); g.level = 6; g.pending = 1; g.rerolls = 400; tick(g); assert.equal(g.phase, 'levelup'); const seen = new Set(); for (let i = 0; i < 150; i++) { for (const c of g.choices) seen.add(c.id); sim.reroll(g); } return seen; };
  assert.ok(offered(skin).has(id), id + ' offered on ' + skin); assert.ok(!offered('disco').has(id), id + ' not on disco');
}
// rust: the lurch is gentler (100% removes it). sneezy: the jolt vanishes at 100%.
{
  const peak = v => { const g = sim.createGame({ seed: 3, stage: skinStage('rust') }); if (v) { g.ups.oil = 1; g.val = { oil: v }; } const sn = g.snakes[0]; sn.surgeT = 1e9; let m = 0; tick(g, 10); for (let i = 0; i < 60 * 8; i++) { const a = sn.segs[0].ps; tick(g); m = Math.max(m, sn.segs[0].ps - a); } return m; };
  assert.ok(peak(0) > peak(50) && peak(50) > peak(100), 'Oil Can softens the lurch');
  const jolt = v => { const g = sim.createGame({ seed: 3, stage: skinStage('sneezy') }); if (v) { g.ups.tis = 1; g.val = { tis: v }; } const sn = g.snakes[0]; sn.snzT = 0.01; const t0 = sn.tail; tick(g, 2); return sn.tail - t0; };
  assert.ok(jolt(0) > jolt(100) + 20, 'Tissue Box shrinks the sneeze jolt');
}

// trait cues: each of the four species pushes a trait event, once per occasion
{
  const evs = (skin, ticks, prep) => { const g = sim.createGame({ seed: 4, stage: skinStage(skin, 21) }); assert.equal(g.snakes[0].skin, skin); if (prep) prep(g); const out = []; for (let i = 0; i < ticks; i++) { tick(g); for (const e of g.events) if (e.t === 'trait' && e.k === skin) out.push(e); g.events.length = 0; } return out; };
  assert.ok(evs('grumpy', 60 * 14).length >= 1, 'grumpy scowls when it surges');
  const d = evs('disco', 60 * 5).length; assert.ok(d >= 1 && d <= 4, 'disco flashes on bars, not every beat');
  assert.equal(evs('mighty', 60 * 3, g => { g.snakes[0].slow = 1; }).length, 1, 'mighty shrugs a slow once');
  const g = sim.createGame({ seed: 4, stage: skinStage('sour', 21) }), sn = g.snakes[0]; tick(g, 5); g.events.length = 0;
  sn.segs[3].hp = 0; tick(g); assert.equal(g.events.filter(e => e.t === 'trait' && e.k === 'sour').length, 1, 'sour announces the rush');
  g.events.length = 0; sn.segs[3].hp = 0; tick(g); assert.equal(g.events.filter(e => e.t === 'trait' && e.k === 'sour').length, 0, 'a pop inside the rush stays quiet');
}

// Metronome and Pillow cells: placed from their stage on regular snakes, never before
const count = (n, flag) => { const g = sim.createGame({ seed: 9, stage: n }); return g.snakes.reduce((a, sn) => a + sn.segs.filter(s => s[flag]).length, 0); };
assert.equal(count(15, 'metro'), 0); assert.equal(count(16, 'metro'), 1); assert.equal(count(20, 'metro'), 0, 'not on boss stages');
assert.equal(count(25, 'pillow'), 0); assert.equal(count(27, 'pillow'), 1); assert.equal(count(30, 'pillow'), 0);
{
  const kill = (g, flag, beat) => { const sn = g.snakes[0], c = sn.segs.find(s => s[flag]); const T = sim.beatPeriod(g); g.t = Math.floor(g.t / T) * T + (beat ? 0.01 : T / 2); const coins = g.coins; c.hp = 0; g.events.length = 0; sim.step(g, 1e-6, { mx: 0 }); return { coins: g.coins - coins, ev: g.events.filter(e => e.t === flag) }; };
  const on = kill(sim.createGame({ seed: 9, stage: 27 }), 'metro', true); assert.ok(on.ev.length === 1 && on.ev[0].hit && on.coins > 0, 'on the beat pays');
  const off = kill(sim.createGame({ seed: 9, stage: 27 }), 'metro', false); assert.ok(off.ev.length === 1 && !off.ev[0].hit, 'off the beat is a plain pop');
  const g = sim.createGame({ seed: 9, stage: 27 }), sn = g.snakes[0], ps0 = sn.segs[0].ps; const r = kill(g, 'pillow', true);
  assert.equal(r.ev.length, 1); assert.ok(sn.segs[0].ps < ps0 - sim.PILLOW_PUSH + 5, 'the snake is shoved back');
}
// drawing: strokes and fills only, no gradients
{
  const calls = {}; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  setBeatPhase(0.02);
  for (const f of ['metro', 'pillow']) { const s = { x: 10, y: 10, [f]: true }; drawCellFlags(ctx, s, 20, 1, 1, () => {}); drawCellBadge(ctx, s, 20, 1, 1, null); }
  assert.ok(calls.fill > 2 && !calls.createLinearGradient && !calls.createRadialGradient);
}
console.log('31_gameplay_b9 ok');
