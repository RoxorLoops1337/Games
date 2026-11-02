// Run HUD batch 8: the chest reward flies to the chest chip, a +N chip reports the pay, cooldown tenths, baked encore fill.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
const texts = [];
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? t => texts.push(t) : noop, set: () => true });
const canvas = { width: 390, height: 844, getContext: stubCtx };
const bakes = [];
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: stubCtx }), 2);
const ob = kit.bake; kit.bake = (k, ...a) => { bakes.push(k); return ob.call(kit, k, ...a); };
const R = createRenderer(canvas, null, kit);
const g = sim.createGame({ seed: 9, stage: 12, meta: { rev: 1 } });
const draw = (dt = 1 / 30) => R.draw(g, { joy: { on: false } }, dt);
for (let i = 0; i < 6; i++) draw();
g.encore = 0.5; g.weap.swab = { lv: 2, cd: 0 };
for (let i = 0; i < 5; i++) draw();
assert.ok(bakes.some(k => /^encfill08\|0/.test(k)), 'encore fill gradient is baked');
// a chest pays 40 coins: the +N chip shows after the flight lands
g.coins += 40; R.onEvent({ t: 'chest', x: 200, y: 420, frag: 'swab' }, g);
texts.length = 0;
for (let i = 0; i < 60; i++) draw();
assert.ok(texts.includes('+40'), 'the +N coin chip appears: ' + texts.filter(t => /^\+/.test(t)).join());
// a long cooldown first, so the longest is known, then the last second counts in tenths
g.weap.swab = { lv: 2, cd: 4 }; draw(); g.weap.swab.cd = 0.6; texts.length = 0; draw();
assert.ok(texts.includes('0.6'), 'the last second counts in tenths');
// a burst of chests never throws
for (let i = 0; i < 8; i++) R.onEvent({ t: 'chest', x: 100 + i * 20, y: 400 }, g);
for (let i = 0; i < 60; i++) draw();
