// Perf round 5: op counts and allocations (the box is loaded, so we count canvas calls instead of timing them).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
let counts = {}, made = 0;
const mkCtx = main => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : (...a) => { if (main && typeof k === 'string') counts[k] = (counts[k] || 0) + 1; }, set: () => true });
const mkCanvas = (w, h) => { made++; return { width: w, height: h, getContext: () => mkCtx(false) }; };

// 1. the head body is baked once per species and blitted rotated: a head is a few clips, not ~15, at any heading
{
  const kit = createArtDraw(mkCanvas, 2);
  const ctx = mkCtx(true);
  kit.drawHead(ctx, 100, 100, 40, 0.3, { skin: 'love', t: 1 });   // warm
  const m0 = made; counts = {};
  for (let i = 0; i < 40; i++) kit.drawHead(ctx, 100, 100, 40, i * 0.31, { skin: 'love', t: 1 + i * 0.1, look: [0, 1] });
  assert.ok(made - m0 <= 2, 'turning the head creates no canvases (' + (made - m0) + ')');
  assert.ok(counts.clip / 40 <= 10, `${counts.clip / 40} clips per head (budget 10; was ~15 before the body bake)`);
  assert.ok(counts.drawImage / 40 >= 1, 'the body is one drawImage');
  const skins = Object.keys(kit.SPECIES);
  for (const s of skins) for (const boss of [false, true]) kit.drawHead(ctx, 100, 100, 40, 1, { skin: s, boss, t: 2 });
  for (const s of skins) assert.ok(kit.cache.get('headbody|' + s), 'body baked for ' + s);
  kit.drawHead(ctx, 100, 100, 40, 1, { skin: 'nope', t: 2 });   // unknown species falls back to love and must not throw
  const noCanvas = createArtDraw(null, 2); noCanvas.drawHead(ctx, 10, 10, 40, 1, { skin: 'love', t: 1 });   // no canvas support: the live body still draws
}

// 2. far skylines are capped (a 50 stage session used to hold every one of them, 1.1 MB each)
{
  const kit = createArtDraw(mkCanvas, 2);
  for (let i = 0; i < 20; i++) kit.bake('far|x|0|0|' + i, 100, 100, noop, 1);
  const far = [...kit.cache.keys()].filter(k => k.startsWith('far|'));
  assert.ok(far.length <= 6, far.length + ' far skylines held (cap 6)');
  assert.ok(far.includes('far|x|0|0|19'), 'the newest is kept');
  assert.ok(!far.includes('far|x|0|0|0'), 'the oldest was dropped');
  const a = kit.bake('far|x|0|0|19', 100, 100, noop, 1), b = kit.bake('far|x|0|0|19', 100, 100, noop, 1);
  assert.equal(a, b, 'a hit returns the same sprite');
}

// 3. steady frames: text strips and numbers are cached, no canvases are created, string keys are not rebuilt
{
  const kit = createArtDraw(mkCanvas, 2);
  const R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx(true) }, { get: () => ({ width: 100, height: 80 }), has: () => true }, kit);
  const g = sim.createGame({ seed: 5, stage: 12, bot: true });
  for (let i = 0; i < 200; i++) { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); }
  g.phase = 'play'; const ui = { joy: { on: false, dx: 0 } };
  R.draw(g, ui, 0.016); R.draw(g, ui, 0.016);
  counts = {};
  for (let i = 0; i < 20; i++) { g.phase = 'play'; R.draw(g, ui, 0.016); }
  assert.ok((counts.clip || 0) / 20 <= 14, `${(counts.clip || 0) / 20} clips per frame at stage 12 (budget 14)`);
}

// 4. wiring and no per-frame colour strings in the stage dressing
{
  const bs = readFileSync(join(root, 'bg_stage.js'), 'utf8'), bw = readFileSync(join(root, 'bg_world.js'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8'), rnd = readFileSync(join(root, 'render.js'), 'utf8');
  assert.ok(!/rgba\(\$\{/.test(bs), 'bg_stage.js builds no rgba strings per frame');
  assert.ok(!/fillStyle = `rgba\(\$\{[^`]*\$\{0\.(16|9)/.test(bw), 'fireflies use globalAlpha');
  assert.ok(main.includes('pauseN') && main.includes('ptGlow'), 'pause freeze and portrait glow cache wired');
  assert.ok(rnd.includes('textSprite') && rnd.includes('NUMS'), 'text lookup is allocation free on a hit');
  for (const f of ['art_draw.js', 'bg_stage.js', 'bg_world.js', 'render.js', 'main.js']) assert.ok(!/—/.test(readFileSync(join(root, f), 'utf8')), 'no em dash in ' + f);
}
console.log('ok 23_perf_r5');
