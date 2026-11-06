// Batch 12 perf (agent b): the projectile and chain passes live in their own small functions (no boxed numbers, no rest/spread per hit),
// the text strip cache keeps the strips it uses every frame (second chance eviction) and bakes at most two per frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const ssrc = readFileSync(join(root, 'sim.js'), 'utf8'), rsrc = readFileSync(join(root, 'render.js'), 'utf8');

// ---- 1. source guards
assert.ok(/function moveBullets\(g, dt\)/.test(ssrc) && /moveBullets\(g, dt\);/.test(ssrc), 'the projectile pass is its own function');
assert.ok(!/const damageSegAs = \(src, g, \.\.\./.test(ssrc), 'damageSegAs takes fixed arguments (no rest array and spread per hit)');
assert.ok(/function chainTargets\(/.test(ssrc) && /function markWave\(/.test(ssrc), 'the chain passes are small functions');
const stepSrc = ssrc.slice(ssrc.indexOf('export function step(g, dt, input)'), ssrc.indexOf('// ---------------------------------------------------------------- bot'));
assert.ok(!/b\.hit\.includes\(s\)/.test(stepSrc) && !/eachTarget\(g, \(q, qs\)/.test(stepSrc), 'no per-bullet scan or splash closure inside step()');
assert.ok(rsrc.includes('TEXT_BAKES') && rsrc.includes('tframe - e.u < 600'), 'text strips: bake budget per frame and second chance eviction');

// ---- 2. a splash bullet still hurts the neighbours and a piercing bullet still hits each cell once
{
  const g = sim.createGame({ seed: 9, stage: 12, bot: true, skills: {} });
  const sn = g.snakes[0], s0 = sn.segs[1], s1 = sn.segs[2];
  s0.shield = false; s1.shield = false; s0.wave = s1.wave = false;
  const hp1 = s1.hp;
  const mine = { x: s0.x, y: s0.y, vx: 0, vy: 0, dmg: 1, crit: false, pierce: 0, r: 6, life: 1, hit: [], beat: false, kind: 'bubble', home: 0, splash: 400, slow: 0 }; g.bullets.push(mine);
  const before = s0.hp;
  sim.step(g, 1 / 60, { mx: 0 });
  assert.ok(s0.hp < before, 'the bullet hit its cell');
  assert.ok(s1.hp < hp1, 'splash reached the neighbour');
  assert.ok(!g.bullets.includes(mine), 'a spent bullet leaves the list');
}

// ---- 3. steady state: strips are not re-baked (measured before: 497 canvases per 900 frames at stage 50, after: about 125)
{
  const noop = () => {}, GR = { addColorStop: noop }, MT = { width: 10 };
  let made = 0;
  const mkCtx = () => { const cache = Object.create(null); return new Proxy({}, { get: (_t, k) => cache[k] || (cache[k] = k === 'measureText' ? () => MT : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => GR : noop), set: () => true }); };
  const mkCanvas = (w, h) => { made++; return { width: w, height: h, getContext: () => mkCtx() }; };
  const art = { get: () => ({ width: 100, height: 80 }), has: () => true };
  const kit = createArtDraw(mkCanvas, 2), R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx() }, art, kit);
  const g = sim.createGame({ seed: 5, stage: 50, bot: true, skills: {} });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
  g.revivesLeft = 1e9;
  let worst = 0;
  const frame = () => { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); if (g.phase === 'dead') g.phase = 'play'; const ev = g.events; for (let i = 0; i < ev.length; i++) R.onEvent(ev[i], g); ev.length = 0; const m = made; R.draw(g, { joy: { on: false, dx: 0 } }, 1 / 60); if (made - m > worst) worst = made - m; };
  for (let i = 0; i < 3000; i++) frame();
  made = 0; worst = 0;
  for (let i = 0; i < 900; i++) frame();
  assert.ok(made <= 300, `stage 50 steady state: ${made} canvases baked in 900 frames (cap 300)`);
}
console.log('35_b_perf_b12 ok');
