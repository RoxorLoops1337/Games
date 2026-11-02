// Perf round 3: the Encore beam draws from a baked strip (no gradient on the main canvas), and the hub tab switch is deferred behind a skeleton.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
const counts = { grad: 0 };
const mkCtx = main => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => { if (main) counts.grad++; return { addColorStop: noop }; } : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const mkCanvas = (w, h) => ({ width: w, height: h, getContext: () => mkCtx(false) });
const kit = createArtDraw(mkCanvas, 2);
const R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx(true) }, { get: () => ({ width: 100, height: 80 }), has: () => true }, kit);
const run = beam => {
  const g = sim.createGame({ seed: 5, stage: 6, bot: true });
  for (let i = 0; i < 120; i++) sim.step(g, 1 / 60, sim.botInput(g));
  g.phase = 'play'; g.beam = beam ? { x: g.p.x, t: 0.4, w: 40 } : null;
  const ui = { joy: { on: false, dx: 0 } };
  R.draw(g, ui, 0.016); R.draw(g, ui, 0.016);
  counts.grad = 0; R.draw(g, ui, 0.016);
  return counts.grad;
};
const base = run(false), withBeam = run(true);
assert.ok(withBeam <= base, `beam adds ${withBeam - base} gradients per frame (want 0)`);
const main = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(/hubTabSwitch/.test(main) && /hub-skel/.test(readFileSync(join(root, 'index.html'), 'utf8')), 'tab switch is deferred behind a skeleton');
console.log('ok 21_perf_r3');
