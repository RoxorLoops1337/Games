// Run HUD batch 7: baked pip rows and rings, NEW SKILL caption, danger tick on the heartbeat, chest captions, coin roll.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const { heartbeat } = await import(join(root, 'feel6.js'));
const noop = () => {};
const texts = [];
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? t => texts.push(t) : noop, set: () => true });
const canvas = { width: 390, height: 844, getContext: stubCtx };
const bakes = [];
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: stubCtx }), 2);
const ob = kit.bake; kit.bake = (k, ...a) => { bakes.push(k); return ob.call(kit, k, ...a); };
const R = createRenderer(canvas, null, kit);
R.state.numLog = texts;   // b11: numbers are drawn glyph by glyph, so the renderer reports each value it draws here
const g = sim.createGame({ seed: 7, stage: 12, meta: { rev: 1 } });
const draw = (dt = 1 / 30) => R.draw(g, { joy: { on: false } }, dt);
for (let i = 0; i < 6; i++) draw();
for (const w of ['swab', 'daggers']) g.weap[w] = { lv: 2, cd: 0 };
for (let i = 0; i < 40; i++) draw();
assert.ok(bakes.some(k => /^pips07\|2\|5/.test(k)), 'level pips are baked rows');
assert.ok(bakes.some(k => /^ring07\|/.test(k)), 'the cooldown rings are baked');
// a newly gained skill after the first second shows the caption
R.state.t += 2; g.weap.bubble = { lv: 1, cd: 0 };
texts.length = 0; draw(); draw();
assert.ok(texts.includes('NEW SKILL'), 'NEW SKILL caption');
assert.ok(texts.includes('Duckling Splash'), 'caption names the skill');
// chest caption when a mark is crossed
g.progress = 0.1; draw(); texts.length = 0; g.progress = 0.3; draw();
assert.ok(texts.includes('CHEST 1/3'), 'chest caption');
// coins roll up
g.coins = 100; draw(); R.state.t += 0.5; g.coins = 900; texts.length = 0; draw();
assert.ok(!texts.includes('900') && texts.some(t => /^\d+$/.test(t) && +t < 900 && +t >= 100), 'coin counter rolls');
texts.length = 0; for (let i = 0; i < 90; i++) { R.state.t += 0.05; draw(0.05); }
draw();
assert.ok(texts.includes('900'), 'coin counter lands on the total ' + JSON.stringify(texts.filter(t => /^\d+$/.test(t))) + ' ' + g.coins);
// danger: the tick fires on a heartbeat peak, and the sound exists
g.phase = 'play'; g.danger = 0.9; R.state.t = 0;
let ticks = 0; for (let i = 0; i < 300; i++) { R.state.t += 0.02; draw(0.02); for (const s of R.takeSounds()) if (s === 'dangertick') ticks++; }
assert.ok(ticks >= 3 && ticks <= 40, 'danger ticks ride the heartbeat: ' + ticks);
assert.ok(heartbeat(0.08 / 3, 3) > 0.9);
assert.ok(readFileSync(join(root, 'audio.js'), 'utf8').includes('dangertick:'), 'audio has dangertick');
for (const f of ['hud.js', 'feel6.js', 'audio.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);
