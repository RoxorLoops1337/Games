// Screen feel (agent 05): title card, boss intro, slow motion, confetti, game over fade, Reduce Motion.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const stubCanvas = (w, h) => ({ width: w, height: h, getContext: stubCtx });
const canvas = { width: 390, height: 844, getContext: stubCtx };
const mk = () => createRenderer(canvas, null, createArtDraw(stubCanvas, 1));
const ui = { joy: {}, hints: false };

const R = mk();
const g = sim.createGame({ seed: 3, stage: 10 });
for (const e of g.events.splice(0)) R.onEvent(e, g);
R.draw(g, ui, 0.05);
assert.equal(R.timeScale(), 1, 'no slow motion at the start');
R.onEvent({ t: 'kill', x: 300, y: 300, r: 40, head: true, boss: true, skin: g.skin }, g);
assert.ok(R.timeScale() < 0.6, 'boss face pop slows the game down');
for (let i = 0; i < 60; i++) R.draw(g, ui, 0.02);
assert.equal(R.timeScale(), 1, 'slow motion ends by itself');
R.onEvent({ t: 'clear', n: 10, bonus: 5, boss: true }, g);
R.draw(g, ui, 0.02);
g.groove = 20; g.phase = 'dead'; R.onEvent({ t: 'dead' }, g);
for (let i = 0; i < 40; i++) R.draw(g, ui, 0.03);

const Q = mk(); Q.setOptions({ reduceMotion: true });
Q.onEvent({ t: 'kill', x: 300, y: 300, r: 40, head: true, boss: true, skin: g.skin }, g);
Q.onEvent({ t: 'stage', n: 10, boss: true, name: 'Gloomy Asp', mod: '' }, g);
Q.onEvent({ t: 'clear', n: 10, bonus: 5, boss: true }, g);
Q.draw(g, ui, 0.6);
assert.equal(Q.timeScale(), 1, 'Reduce Motion: no slow motion');
console.log('cell_serpent ext 05_screen_feel ok');
