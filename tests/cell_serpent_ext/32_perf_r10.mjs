// Round 10 perf: a per-scene canvas call profile of render.js (ring, lane, boss; normal, low quality and reduced motion) with a real
// stream of kills through R.onEvent (hit juice, bell, duo life, backgrounds), enforced budgets per scene, the skill tiles no longer
// look up four baked sprites per tile per frame, and the weapon geometry helpers write into scratch objects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const ALL = { needles: 3, stick: 3, bubble: 3, satellite: 3, maw: 3, swab: 3, daggers: 3, tower: 3, dragon: 3 };

// ---- 1. per scene call counts (a stub context that counts, with cached no-op methods so the counting itself stays cheap)
const noop = () => {}, GR = { addColorStop: noop }, MT = { width: 10 };
let on = false; const calls = Object.create(null); let made = 0;
const mkCtx = main => { const cache = Object.create(null); return new Proxy({}, { get: (_t, k) => {
  if (cache[k]) return cache[k];
  let f;
  if (k === 'measureText') f = () => MT;
  else if (k === 'createLinearGradient' || k === 'createRadialGradient') f = () => { if (main && on) calls.grad = (calls.grad || 0) + 1; return GR; };
  else f = () => { if (main && on) calls[k] = (calls[k] || 0) + 1; };
  return cache[k] = f;
}, set: () => true }); };
const mkCanvas = (w, h) => { made++; return { width: w, height: h, getContext: () => mkCtx(false) }; };
const art = { get: () => ({ width: 100, height: 80 }), has: () => true };
const total = () => { let n = 0; for (const k in calls) n += calls[k]; return n; };

// measured on this base (60 s of bot play per scene): about 2400 to 2750 calls, 2.0 to 3.0 gradients (never more than 3 in a frame),
// 8 to 10.5 clips (13 at most), about 290 saves. Budgets leave room for growth but not for a regression.
const BUDGET = { calls: 3600, grad: 4, gradMax: 5, clip: 18, clipMax: 22, save: 360, made: 320 };
const SCENES = [['ring stage 6', 6, {}], ['lane stage 12', 12, {}], ['ring stage 42', 42, {}], ['boss stage 45', 45, {}], ['boss stage 50', 50, {}],
  ['boss stage 45 low quality', 45, { lowQuality: true }], ['ring stage 6 reduced motion', 6, { reduceMotion: true }]];
const report = [];
for (const [name, stage, opt] of SCENES) {
  const kit = createArtDraw(mkCanvas, 2);
  const R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx(true) }, art, kit);
  R.setOptions(opt);
  const g = sim.createGame({ seed: 5, stage, bot: true, skills: ALL });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
  g.revivesLeft = 1e9;
  const ui = { joy: { on: false, dx: 0 } };
  const frame = () => { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); if (g.phase === 'dead') g.phase = 'play'; const ev = g.events; for (let i = 0; i < ev.length; i++) R.onEvent(ev[i], g); ev.length = 0; R.draw(g, ui, 1 / 60); };
  for (let i = 0; i < 700; i++) frame();   // warm the baked caches and get a snake, kills, hits and weapons going
  for (const k in calls) delete calls[k]; made = 0; on = true;
  const N = 240; let gMax = 0, cMax = 0;
  for (let i = 0; i < N; i++) { const g0 = calls.grad || 0, c0 = calls.clip || 0; frame(); gMax = Math.max(gMax, (calls.grad || 0) - g0); cMax = Math.max(cMax, (calls.clip || 0) - c0); }
  on = false;
  const per = { calls: total() / N, grad: (calls.grad || 0) / N, clip: (calls.clip || 0) / N, save: (calls.save || 0) / N };
  report.push(`${name}: ${per.calls.toFixed(0)} calls, ${per.grad.toFixed(2)} grad (max ${gMax}), ${per.clip.toFixed(1)} clip (max ${cMax}), ${per.save.toFixed(0)} save, ${made} canvases`);
  assert.ok(per.calls > 800, name + ': the scene really drew (' + per.calls.toFixed(0) + ' calls)');
  assert.ok(per.calls <= BUDGET.calls, `${name}: ${per.calls.toFixed(0)} canvas calls per frame (budget ${BUDGET.calls})`);
  assert.ok(per.grad <= BUDGET.grad && gMax <= BUDGET.gradMax, `${name}: gradients ${per.grad.toFixed(2)} avg, ${gMax} max (budget ${BUDGET.grad} avg, ${BUDGET.gradMax} max)`);
  assert.ok(per.clip <= BUDGET.clip && cMax <= BUDGET.clipMax, `${name}: clips ${per.clip.toFixed(1)} avg, ${cMax} max (budget ${BUDGET.clip} avg, ${BUDGET.clipMax} max)`);
  assert.ok(per.save <= BUDGET.save, `${name}: ${per.save.toFixed(0)} saves per frame (budget ${BUDGET.save})`);
  assert.ok(made <= BUDGET.made, `${name}: ${made} canvases created in ${N} frames of play: score digits and new text strips (budget ${BUDGET.made})`);
}
if (process.env.PERF_PRINT) console.log(report.join('\n'));

// ---- 2. the skill tiles: four baked sprites per tile are remembered, so a steady frame asks the kit for none of them
{
  const kit = createArtDraw(mkCanvas, 2);
  const asked = []; const bake = kit.bake;
  kit.bake = (key, ...rest) => { asked.push(key); return bake(key, ...rest); };
  const R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx(true) }, art, kit);
  const g = sim.createGame({ seed: 5, stage: 12, bot: true, skills: ALL });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
  g.phase = 'play';
  const ui = { joy: { on: false, dx: 0 } };
  for (let i = 0; i < 4; i++) R.draw(g, ui, 1 / 60);
  assert.ok(asked.some(k => k.startsWith('tile06|')) && asked.some(k => k.startsWith('pips07|')), 'the tiles bake their sprites the first time');
  asked.length = 0;
  for (let i = 0; i < 30; i++) R.draw(g, ui, 1 / 60);   // the sim is frozen: levels, colours and cooldown states do not change
  const tiles = asked.filter(k => /^(tile06|ring07|lvb09|pips07)\|/.test(k));
  assert.equal(tiles.length, 0, 'steady frames look up no tile sprite through the kit: ' + tiles.slice(0, 3).join(' '));
  // a level up changes only that tile's pip row and badge, and dropping the kit's sprites rebuilds everything
  g.weap.swab.lv = 4; asked.length = 0; R.draw(g, ui, 1 / 60);
  assert.ok(asked.some(k => k.startsWith('pips07|4|')), 'a level up asks for the new pip row');
  asked.length = 0; kit.cache.clear(); R.draw(g, ui, 1 / 60);
  assert.ok(asked.some(k => k.startsWith('tile06|')) && asked.some(k => k.startsWith('ring07|')), 'after the kit drops its sprites the tiles bake again (kit.gen)');
}

// ---- 3. scratch objects: daggerPos and stickSeg fill the object they are given, with the same numbers as the allocating form
{
  const g = sim.createGame({ seed: 3, stage: 12, bot: true, skills: ALL });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 4, cd: 0 };
  for (let i = 0; i < 90; i++) sim.step(g, 1 / 60, sim.botInput(g));
  const o = { x: 0, y: 0, a: 0 }, s = { x0: 0, y0: 0, x1: 0, y1: 0, a: 0, len: 0 };
  for (let i = 0; i < 5; i++) { const a = sim.daggerPos(g, i); assert.equal(sim.daggerPos(g, i, o), o); assert.deepEqual(o, a, 'daggerPos scratch ' + i); }
  for (let k = 0; k < 2; k++) { const a = sim.stickSeg(g, k); assert.equal(sim.stickSeg(g, k, s), s); assert.deepEqual(s, a, 'stickSeg scratch ' + k); }
  const src = readFileSync(join(root, 'sim.js'), 'utf8'), rsrc = readFileSync(join(root, 'render.js'), 'utf8'), hsrc = readFileSync(join(root, 'hitjuice.js'), 'utf8');
  assert.ok(src.includes('daggerPos(g, i, DP_SCRATCH)') && src.includes('stickSeg(g, k, SG_SCRATCH)'), 'the step loops pass scratch objects');
  assert.ok(rsrc.includes('daggerPos(g, i, DP_R)') && rsrc.includes('stickSeg(g, k, SG_R)'), 'the renderer passes scratch objects');
  assert.ok(!/daggerPos\(g, i\), a = /.test(rsrc), 'the dagger trail no longer fetches an unused position three times per dagger');
  assert.ok(!/\bpointAt\(/.test(hsrc) && !/\bpointAt\(/.test(rsrc), 'the dash telegraph reads path points into scratch objects');
}
console.log('32_perf_r10 ok');
