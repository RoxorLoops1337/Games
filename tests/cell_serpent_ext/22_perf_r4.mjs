// Perf round 4: op counts (the box is loaded, so we count canvas calls instead of timing them).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const { createBoltLayer, boltPose, paintBolt } = await import(join(root, 'bolts_fx.js'));
const noop = () => {};
let counts = {};
const mkCtx = main => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : (...a) => { if (main && typeof k === 'string') counts[k] = (counts[k] || 0) + 1; }, set: () => true });
const mkCanvas = (w, h) => ({ width: w, height: h, getContext: () => mkCtx(false) });

// 1. the bolt layer: N bolts cost one drawImage on the main canvas and no paths there
{
  const L = createBoltLayer({ makeCanvas: mkCanvas });
  const bolts = Array.from({ length: 8 }, (_, i) => ({ x: 100 + i * 60, y: 300 + i * 10, life: 0.2, seed: i }));
  const ctx = mkCtx(true); counts = {};
  const ctxP = new Proxy(ctx, {}); assert.equal(L.draw(ctxP, bolts), true, 'layer available');
  assert.equal(counts.drawImage, 1, 'one blit for all bolts');
  assert.ok(!counts.beginPath && !counts.arc && !counts.ellipse, 'no beam paths on the main canvas');
  assert.equal(L.draw(ctxP, []), true);
  const p = boltPose({ x: 10, y: 200, life: 0.28, seed: 1 }, {});
  assert.ok(p.a > 0 && p.age >= 0, 'pose is finite');
  assert.equal(createBoltLayer(null).draw(ctxP, bolts), false, 'no canvas support: caller draws directly');
  assert.equal(typeof paintBolt, 'function');
}

// 2. a stage-30 frame stays under an op budget; the boss crown and collar are baked (clips only for the live face)
{
  const kit = createArtDraw(mkCanvas, 2);
  const R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx(true) }, { get: () => ({ width: 100, height: 80 }), has: () => true }, kit);
  for (const stage of [30, 35]) {
    const g = sim.createGame({ seed: 5, stage, bot: true });
    for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
    for (let i = 0; i < 300; i++) { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); }
    g.phase = 'play'; g.groove = 12;
    const ui = { joy: { on: false, dx: 0 } };
    R.draw(g, ui, 0.016); R.draw(g, ui, 0.016);
    counts = {};
    for (let i = 0; i < 20; i++) { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); g.phase = 'play'; R.draw(g, ui, 0.016); }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) / 20;
    assert.ok(total < 3600, `stage ${stage}: ${total.toFixed(0)} canvas calls per frame (budget 3600)`);
    assert.ok((counts.clip || 0) / 20 <= 20, `stage ${stage}: ${(counts.clip || 0) / 20} clips per frame (budget 20)`);
  }
}

// 3. wiring: layout reads are deferred to the next frame, the chips are cached, the text bake quantises its size
{
  const bui = readFileSync(join(root, 'battle_ui.js'), 'utf8');
  assert.ok(/dockPend/.test(bui) && /_fitPend/.test(bui), 'dock and title measuring coalesced into one rAF');
  const main = readFileSync(join(root, 'main.js'), 'utf8');
  assert.ok(main.includes('chipsSame') && main.includes("chips.dataset.k"), 'stage chips cached');
  const rnd = readFileSync(join(root, 'render.js'), 'utf8');
  assert.ok(rnd.includes('Math.round(size * 2) / 2') && rnd.includes('createBoltLayer'), 'render wiring');
  assert.ok(!/—/.test(readFileSync(join(root, 'bolts_fx.js'), 'utf8')), 'no em dash');
}
console.log('ok 22_perf_r4');
