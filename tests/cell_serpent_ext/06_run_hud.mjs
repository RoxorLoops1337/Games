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

// ---- round 2: notch zones, boss bar, gold pill, encore meter, ready flash hook
{
  const { hudZone, safeUnits } = await import(join(root, 'hud.js'));
  assert.equal(hudZone({ x: 700, y: 30 }, 0), 'pause');
  assert.equal(hudZone({ x: 700, y: 100 }, 0), 'stats');
  assert.equal(hudZone({ x: 700, y: 100 }, 60), 'pause', 'zones shift with the inset');
  assert.equal(hudZone({ x: 700, y: 150 }, 60), 'stats');
  assert.equal(hudZone({ x: 300, y: 30 }, 0), '');
  assert.deepEqual(safeUnits({ cw: 390, s: 0.54, oy: 0 }), { t: 0, b: 0 }, 'no document, no inset');
  let ready = 0;
  for (const stage of [10, 12]) {
    const R = createRenderer(canvas, null, null); R.setOptions({ onReady: () => ready++ });
    const g = sim.createGame({ seed: 7, stage, meta: { rev: 1 } });
    for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 5, cd: 0 };
    g.encore = 0.4; g.combo = 6; g.lastKill = g.t; g.p.shield = 2;
    R.draw(g, { joy: { on: false } }, 1 / 30);
    for (const w of sim.WEAPONS) g.weap[w.id].cd = 3;
    R.draw(g, { joy: { on: false } }, 1 / 30);
    for (const w of sim.WEAPONS) g.weap[w.id].cd = 0;
    R.draw(g, { joy: { on: false } }, 1 / 30);
    g.encore = 1; R.draw(g, { joy: { on: false } }, 1 / 30);
    for (const sn of g.snakes) for (const q of sn.segs) if (q.i > 2) q.hp = 0;
    R.draw(g, { joy: { on: false } }, 1 / 30);
  }
  assert.ok(ready >= 1, 'sound hook fires when a long cooldown completes');
}

// ---- batch 3: bigger skill tiles with cooldown numbers, groove flash, combo tiers, progress shine
{
  const { createRenderer: mk } = await import(join(root, 'render.js'));
  const R = mk(canvas, null, null);
  const g = sim.createGame({ seed: 9, stage: 10, meta: { rev: 1 } });
  g.combo = 25; g.lastKill = g.t; g.encore = 0.5; g.progress = 0.5;
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 2.4 };
  for (const gv of [0, 4, 9, 2, 15, 20, 3]) { g.groove = gv; R.draw(g, { joy: { on: false } }, 1 / 30); }
  g.encore = 1; R.draw(g, null, 1 / 30);
  assert.ok(!readFileSync(join(root, 'hud.js'), 'utf8').includes('—'), 'no em dash in hud.js (b3)');
}
