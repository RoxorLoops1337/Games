// Run HUD (cell_serpent/hud.js): draws with many skills active against a stub context, never throws,
// and the source stays free of the em dash. Runs its asserts when imported.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const canvas = { width: 390, height: 844, getContext: stubCtx };

for (const kit of [null, createArtDraw((w, h) => ({ width: w, height: h, getContext: stubCtx }), 2)]) {
  const R = createRenderer(canvas, null, kit);
  const g = sim.createGame({ seed: 6, stage: 12, meta: { rev: 1 } });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 5, cd: 1.2 };
  g.p.shield = 3; g.p.rage = 2; g.groove = 20; g.hard = true;
  for (const prog of [0, 0.3, 0.6, 1]) { g.progress = prog; g.coins += 40; g.weap.swab.cd = prog; R.draw(g, { joy: { on: false } }, 1 / 30); }
  g.mode = 'pig'; R.draw(g, null, 1 / 30);
}
assert.ok(!readFileSync(join(root, 'hud.js'), 'utf8').includes('—'), 'no em dash in hud.js');
