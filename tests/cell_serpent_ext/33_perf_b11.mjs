// Batch 11 perf: numbers are drawn from per-glyph strips at preset sizes (a new value bakes nothing), the ring and boss wash colours are
// cached or alpha driven (no rgba string per frame), the next stage skyline and the hub icon PNGs are produced in idle time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const { warmNextFar } = await import(join(root, 'bg_far.js'));
const { warmIdle } = await import(join(root, 'icon_warm_b11.js'));
const ALL = { needles: 3, stick: 3, bubble: 3, satellite: 3, maw: 3, swab: 3, daggers: 3, tower: 3, dragon: 3 };

// ---- 1. canvases created per scene (measured before: 152, 193, 209, 162, 267 over 240 frames; after: 3, 7, 37, 44, 69)
const noop = () => {}, GR = { addColorStop: noop }, MT = { width: 10 };
let made = 0;
const mkCtx = () => { const cache = Object.create(null); return new Proxy({}, { get: (_t, k) => cache[k] || (cache[k] = k === 'measureText' ? () => MT : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => GR : noop), set: () => true }); };
const mkCanvas = (w, h) => { made++; return { width: w, height: h, getContext: () => mkCtx() }; };
const art = { get: () => ({ width: 100, height: 80 }), has: () => true };
// batch 12 (g): damage numbers use the text() ladder and glyph strips, the pop is a scale (measured 22, 34, 7); caps keep a little headroom.
for (const [name, stage, cap] of [["ring 6", 6, 40], ["lane 12", 12, 40], ["boss 45", 45, 30]]) {
  const kit = createArtDraw(mkCanvas, 2), R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx() }, art, kit);
  const g = sim.createGame({ seed: 5, stage, bot: true, skills: ALL });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
  g.revivesLeft = 1e9;
  const frame = () => { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); if (g.phase === 'dead') g.phase = 'play'; const ev = g.events; for (let i = 0; i < ev.length; i++) R.onEvent(ev[i], g); ev.length = 0; R.draw(g, { joy: { on: false, dx: 0 } }, 1 / 60); };
  for (let i = 0; i < 700; i++) frame();
  made = 0; for (let i = 0; i < 240; i++) frame();
  assert.ok(made <= cap, `${name}: ${made} canvases baked in 240 frames of play (cap ${cap})`);
}

// ---- 2. source guards
const rsrc = readFileSync(join(root, 'render.js'), 'utf8'), bsrc = readFileSync(join(root, 'bg_world.js'), 'utf8'), msrc = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(rsrc.includes('presetSize(size)') && rsrc.includes('drawNumber('), 'text() uses preset sizes and per-glyph numbers');
assert.ok(!/strokeStyle = `rgba\(\$\{hue\}/.test(bsrc), 'the ring rim and glow build no rgba string per frame');
assert.ok(!/fillStyle = `rgba\(255,24,64/.test(bsrc), 'the boss phase wash builds no rgba string per frame');
assert.ok(msrc.includes('warmIdle('), 'main.js warms the icon PNGs in idle time');

// ---- 3. warmNextFar: baked in the idle callback, once per key, never past stage 50
{
  const baked = []; const kit = { bake: (key) => { baked.push(key); return {}; } };
  const q = []; const idle = f => q.push(f);
  assert.equal(warmNextFar(kit, 6, idle), true); assert.equal(baked.length, 0, 'nothing baked until the idle callback runs');
  assert.equal(warmNextFar(kit, 6, idle), false, 'asked once per key');
  q.shift()(); assert.equal(baked.length, 1); assert.ok(baked[0].startsWith('far|'));
  assert.equal(warmNextFar(kit, 50, idle), false, 'no stage 51');
  assert.equal(warmNextFar(kit, 7, null), false, 'no idle callback available: nothing happens');
}

// ---- 4. warmIdle: one thunk per idle slice, in order, a throwing thunk does not stop the rest
{
  const out = [], q = []; const idle = f => q.push(f);
  assert.equal(warmIdle([() => out.push(1), () => { throw new Error('x'); }, () => out.push(3)], idle), 3);
  assert.equal(out.length, 0, 'deferred');
  let slices = 0; while (q.length) { q.shift()(); slices++; }
  assert.deepEqual(out, [1, 3]); assert.ok(slices >= 3);
}
console.log('33_perf_b11 ok');
